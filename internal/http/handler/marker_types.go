package handler

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/f0reachARR/soiree/internal/db/sqlc"
)

type MarkerTypes struct {
	Q *sqlc.Queries
}

type markerTypeDTO struct {
	ID           string    `json:"id"`
	TournamentID string    `json:"tournamentId"`
	Name         string    `json:"name"`
	Color        string    `json:"color"`
	SortOrder    int32     `json:"sortOrder"`
	CreatedAt    time.Time `json:"createdAt"`
}

func toMarkerTypeDTO(m sqlc.MarkerType) markerTypeDTO {
	return markerTypeDTO{
		ID:           uuidString(m.ID),
		TournamentID: uuidString(m.TournamentID),
		Name:         m.Name,
		Color:        m.Color,
		SortOrder:    m.SortOrder,
		CreatedAt:    m.CreatedAt.Time,
	}
}

type markerTypeListResponse struct {
	Data []markerTypeDTO `json:"data"`
}

type createMarkerTypeRequest struct {
	Name      string  `json:"name"`
	Color     *string `json:"color"`
	SortOrder *int32  `json:"sortOrder"`
}

type updateMarkerTypeRequest struct {
	Name      *string `json:"name"`
	Color     *string `json:"color"`
	SortOrder *int32  `json:"sortOrder"`
}

func (h *MarkerTypes) List(w http.ResponseWriter, r *http.Request) {
	tournamentID, err := parseUUIDParam(chi.URLParam(r, "tournamentId"))
	if err != nil {
		badRequest(w, "invalid tournamentId")
		return
	}
	if _, err := h.Q.GetTournament(r.Context(), tournamentID); err != nil {
		if isNoRows(err) {
			notFound(w, "tournament not found")
			return
		}
		internalError(w, err)
		return
	}
	rows, err := h.Q.ListMarkerTypesByTournament(r.Context(), tournamentID)
	if err != nil {
		internalError(w, err)
		return
	}
	out := make([]markerTypeDTO, len(rows))
	for i, m := range rows {
		out[i] = toMarkerTypeDTO(m)
	}
	writeJSON(w, http.StatusOK, markerTypeListResponse{Data: out})
}

func (h *MarkerTypes) Create(w http.ResponseWriter, r *http.Request) {
	tournamentID, err := parseUUIDParam(chi.URLParam(r, "tournamentId"))
	if err != nil {
		badRequest(w, "invalid tournamentId")
		return
	}
	if _, err := h.Q.GetTournament(r.Context(), tournamentID); err != nil {
		if isNoRows(err) {
			notFound(w, "tournament not found")
			return
		}
		internalError(w, err)
		return
	}
	var req createMarkerTypeRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusUnprocessableEntity, "validation", "name is required", nil)
		return
	}
	color := "blue"
	if req.Color != nil && *req.Color != "" {
		color = *req.Color
	}
	var sortOrder int32
	if req.SortOrder != nil {
		sortOrder = *req.SortOrder
	}
	m, err := h.Q.CreateMarkerType(r.Context(), sqlc.CreateMarkerTypeParams{
		TournamentID: tournamentID,
		Name:         req.Name,
		Color:        color,
		SortOrder:    sortOrder,
	})
	if err != nil {
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toMarkerTypeDTO(m))
}

func (h *MarkerTypes) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "markerTypeId"))
	if err != nil {
		badRequest(w, "invalid markerTypeId")
		return
	}
	var req updateMarkerTypeRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, err.Error())
		return
	}
	m, err := h.Q.UpdateMarkerType(r.Context(), sqlc.UpdateMarkerTypeParams{
		ID:        id,
		Name:      req.Name,
		Color:     req.Color,
		SortOrder: req.SortOrder,
	})
	if err != nil {
		if isNoRows(err) {
			notFound(w, "marker type not found")
			return
		}
		internalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toMarkerTypeDTO(m))
}

func (h *MarkerTypes) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(chi.URLParam(r, "markerTypeId"))
	if err != nil {
		badRequest(w, "invalid markerTypeId")
		return
	}
	n, err := h.Q.DeleteMarkerType(r.Context(), id)
	if err != nil {
		internalError(w, err)
		return
	}
	if n == 0 {
		notFound(w, "marker type not found")
		return
	}
	writeNoContent(w)
}
