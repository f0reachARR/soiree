package handler

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/f0reachARR/soiree/internal/auth"
	"github.com/f0reachARR/soiree/internal/db/sqlc"
	"github.com/f0reachARR/soiree/internal/realtime"
)

type Markers struct {
	Q   *sqlc.Queries
	Hub *realtime.Hub
}

type markerEvent struct {
	Type   string    `json:"type"` // "marker.created" | "marker.updated" | "marker.deleted"
	RunID  string    `json:"runId"`
	Marker markerDTO `json:"marker"`
}

type markerDeleteEvent struct {
	Type     string `json:"type"`
	RunID    string `json:"runId"`
	MarkerID string `json:"markerId"`
}

func (h *Markers) publish(runID string, payload any) {
	if h.Hub == nil {
		return
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		slog.Warn("marker event marshal failed", "error", err)
		return
	}
	h.Hub.Publish("run:"+runID, raw)
}

type markerTypeRef struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

type markerDTO struct {
	ID           string         `json:"id"`
	RunID        string         `json:"runId"`
	AuthorID     *string        `json:"authorId"`
	RunOffsetSec int32          `json:"runOffsetSec"`
	Label        string         `json:"label"`
	MarkerTypeID *string        `json:"markerTypeId"`
	MarkerType   *markerTypeRef `json:"markerType"`
	CreatedAt    time.Time      `json:"createdAt"`
}

// markerDTOFrom builds the DTO from the joined fields shared by GetMarkerRow
// and ListMarkersByRunRow. typeName/typeColor are nil when the marker has no
// type (LEFT JOIN miss).
func markerDTOFrom(id, runID, authorID, typeID pgtype.UUID, runOffset int32, label string, createdAt time.Time, typeName, typeColor *string) markerDTO {
	var author *string
	if authorID.Valid {
		s := uuidString(authorID)
		author = &s
	}
	dto := markerDTO{
		ID:           uuidString(id),
		RunID:        uuidString(runID),
		AuthorID:     author,
		RunOffsetSec: runOffset,
		Label:        label,
		CreatedAt:    createdAt,
	}
	if typeID.Valid {
		s := uuidString(typeID)
		dto.MarkerTypeID = &s
		if typeName != nil && typeColor != nil {
			dto.MarkerType = &markerTypeRef{ID: s, Name: *typeName, Color: *typeColor}
		}
	}
	return dto
}

func getMarkerRowToDTO(m sqlc.GetMarkerRow) markerDTO {
	return markerDTOFrom(m.ID, m.RunID, m.AuthorID, m.MarkerTypeID, m.RunOffsetSec, m.Label, m.CreatedAt.Time, m.MarkerTypeName, m.MarkerTypeColor)
}

func listMarkerRowToDTO(m sqlc.ListMarkersByRunRow) markerDTO {
	return markerDTOFrom(m.ID, m.RunID, m.AuthorID, m.MarkerTypeID, m.RunOffsetSec, m.Label, m.CreatedAt.Time, m.MarkerTypeName, m.MarkerTypeColor)
}

type markerListResponse struct {
	Data       []markerDTO `json:"data"`
	Pagination pageOut     `json:"pagination"`
}

type createMarkerRequest struct {
	RunOffsetSec int32   `json:"runOffsetSec"`
	Label        string  `json:"label"`
	MarkerTypeID *string `json:"markerTypeId"`
}

type updateMarkerRequest struct {
	RunOffsetSec *int32           `json:"runOffsetSec"`
	Label        *string          `json:"label"`
	MarkerTypeID Optional[string] `json:"markerTypeId"`
}

// markerCursor encodes "<offset>|<uuid>" as base64 — markers are ordered by
// (run_offset_sec, id), not (created_at, id) like the other resources.
func encodeMarkerCursor(offset int32, id pgtype.UUID) string {
	raw := fmt.Sprintf("%d|%s", offset, uuidString(id))
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func decodeMarkerCursor(s string) (*int32, pgtype.UUID, error) {
	if s == "" {
		return nil, pgtype.UUID{}, nil
	}
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return nil, pgtype.UUID{}, fmt.Errorf("invalid cursor: %w", err)
	}
	parts := strings.SplitN(string(b), "|", 2)
	if len(parts) != 2 {
		return nil, pgtype.UUID{}, errors.New("invalid cursor format")
	}
	n, err := strconv.ParseInt(parts[0], 10, 32)
	if err != nil {
		return nil, pgtype.UUID{}, fmt.Errorf("invalid cursor offset: %w", err)
	}
	off := int32(n)
	id, err := parseUUIDParam(parts[1])
	if err != nil {
		return nil, pgtype.UUID{}, fmt.Errorf("invalid cursor id: %w", err)
	}
	return &off, id, nil
}

// resolveMarkerType validates that the given marker type id exists and belongs
// to the run's tournament. Returns a NULL UUID when raw is nil/empty.
func (h *Markers) resolveMarkerType(ctx context.Context, raw *string, tournamentID pgtype.UUID) (pgtype.UUID, error) {
	if raw == nil || *raw == "" {
		return pgtype.UUID{}, nil
	}
	id, err := parseUUIDParam(*raw)
	if err != nil {
		return pgtype.UUID{}, fmt.Errorf("invalid markerTypeId")
	}
	mt, err := h.Q.GetMarkerType(ctx, id)
	if err != nil {
		if isNoRows(err) {
			return pgtype.UUID{}, fmt.Errorf("marker type not found")
		}
		return pgtype.UUID{}, err
	}
	if mt.TournamentID != tournamentID {
		return pgtype.UUID{}, fmt.Errorf("marker type belongs to a different tournament")
	}
	return id, nil
}

func currentAuthorID(r *http.Request) pgtype.UUID {
	return auth.UserIDFromContext(r.Context())
}

func (h *Markers) List(w http.ResponseWriter, r *http.Request) {
	runID, err := parseUUIDParam(chi.URLParam(r, "runId"))
	if err != nil {
		badRequest(w, "invalid runId")
		return
	}
	if _, err := h.Q.GetRun(r.Context(), runID); err != nil {
		if isNoRows(err) {
			notFound(w, "run not found")
			return
		}
		internalError(w, err)
		return
	}
	limit, err := limitFromQuery(r)
	if err != nil {
		badRequest(w, err.Error())
		return
	}
	cursorOff, cursorID, err := decodeMarkerCursor(r.URL.Query().Get("cursor"))
	if err != nil {
		badRequest(w, err.Error())
		return
	}
	var typeIDs []pgtype.UUID
	if raw := r.URL.Query().Get("markerTypeIds"); raw != "" {
		for _, c := range strings.Split(raw, ",") {
			c = strings.TrimSpace(c)
			if c == "" {
				continue
			}
			id, err := parseUUIDParam(c)
			if err != nil {
				badRequest(w, "invalid markerTypeId")
				return
			}
			typeIDs = append(typeIDs, id)
		}
	}
	rows, err := h.Q.ListMarkersByRun(r.Context(), sqlc.ListMarkersByRunParams{
		Limit:           limit + 1,
		RunID:           runID,
		CursorRunOffset: cursorOff,
		CursorID:        cursorID,
		MarkerTypeIds:   typeIDs,
	})
	if err != nil {
		internalError(w, err)
		return
	}
	page, pg := paginate(rows, limit, func(m sqlc.ListMarkersByRunRow) string {
		return encodeMarkerCursor(m.RunOffsetSec, m.ID)
	})
	out := make([]markerDTO, len(page))
	for i, m := range page {
		out[i] = listMarkerRowToDTO(m)
	}
	writeJSON(w, http.StatusOK, markerListResponse{Data: out, Pagination: pg})
}

func (h *Markers) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "markerId"))
	if err != nil {
		badRequest(w, "invalid markerId")
		return
	}
	m, err := h.Q.GetMarker(r.Context(), id)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "marker not found")
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, getMarkerRowToDTO(m))
}

func (h *Markers) Create(w http.ResponseWriter, r *http.Request) {
	runID, err := parseUUIDParam(chi.URLParam(r, "runId"))
	if err != nil {
		badRequest(w, "invalid runId")
		return
	}
	run, err := h.Q.GetRun(r.Context(), runID)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "run not found")
			return
		}
		internalError(w, err)
		return
	}
	var req createMarkerRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	if req.RunOffsetSec < 0 {
		writeError(w, http.StatusUnprocessableEntity, "validation", "runOffsetSec must be >= 0", nil)
		return
	}
	typeID, err := h.resolveMarkerType(r.Context(), req.MarkerTypeID, run.TournamentID)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", err.Error(), nil)
		return
	}
	created, err := h.Q.CreateMarker(r.Context(), sqlc.CreateMarkerParams{
		RunID:        runID,
		AuthorID:     currentAuthorID(r),
		RunOffsetSec: req.RunOffsetSec,
		Label:        req.Label,
		MarkerTypeID: typeID,
	})
	if err != nil {
		internalError(w, err)
		return
	}
	// Re-read through GetMarker so the response carries the joined type ref.
	m, err := h.Q.GetMarker(r.Context(), created.ID)
	if err != nil {
		internalError(w, err)
		return
	}
	dto := getMarkerRowToDTO(m)
	h.publish(uuidString(runID), markerEvent{Type: "marker.created", RunID: uuidString(runID), Marker: dto})
	writeJSON(w, http.StatusCreated, dto)
}

func (h *Markers) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "markerId"))
	if err != nil {
		badRequest(w, "invalid markerId")
		return
	}
	var req updateMarkerRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	if req.RunOffsetSec != nil && *req.RunOffsetSec < 0 {
		writeError(w, http.StatusUnprocessableEntity, "validation", "runOffsetSec must be >= 0", nil)
		return
	}
	params := sqlc.UpdateMarkerParams{ID: id, RunOffsetSec: req.RunOffsetSec, Label: req.Label}
	if req.MarkerTypeID.Set {
		existing, err := h.Q.GetMarker(r.Context(), id)
		if err != nil {
			if isNoRows(err) {
				notFound(w, "marker not found")
				return
			}
			internalError(w, err)
			return
		}
		run, err := h.Q.GetRun(r.Context(), existing.RunID)
		if err != nil {
			internalError(w, err)
			return
		}
		params.SetMarkerType = true
		if !req.MarkerTypeID.Null {
			typeID, err := h.resolveMarkerType(r.Context(), &req.MarkerTypeID.Value, run.TournamentID)
			if err != nil {
				writeError(w, http.StatusUnprocessableEntity, "validation", err.Error(), nil)
				return
			}
			params.MarkerTypeID = typeID
		}
	}
	if _, err := h.Q.UpdateMarker(r.Context(), params); err != nil {
		if isNoRows(err) {
			notFound(w, "marker not found")
			return
		}
		internalError(w, err)
		return
	}
	m, err := h.Q.GetMarker(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	dto := getMarkerRowToDTO(m)
	h.publish(dto.RunID, markerEvent{Type: "marker.updated", RunID: dto.RunID, Marker: dto})
	writeJSON(w, http.StatusOK, dto)
}

func (h *Markers) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "markerId"))
	if err != nil {
		badRequest(w, "invalid markerId")
		return
	}
	// Read first so we know which run to publish on.
	existing, err := h.Q.GetMarker(r.Context(), id)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "marker not found")
			return
		}
		internalError(w, err)
		return
	}
	n, err := h.Q.DeleteMarker(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	if n == 0 {
		notFound(w, "marker not found")
		return
	}
	runID := uuidString(existing.RunID)
	h.publish(runID, markerDeleteEvent{Type: "marker.deleted", RunID: runID, MarkerID: uuidString(id)})
	writeNoContent(w)
}
