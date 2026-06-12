package handler_test

import (
	"net/http"
	"testing"
	"time"
)

type markerTypeRefResp struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

type markerResp struct {
	ID           string             `json:"id"`
	RunID        string             `json:"runId"`
	AuthorID     *string            `json:"authorId"`
	RunOffsetSec float64            `json:"runOffsetSec"`
	Label        string             `json:"label"`
	MarkerTypeID *string            `json:"markerTypeId"`
	MarkerType   *markerTypeRefResp `json:"markerType"`
	CreatedAt    time.Time          `json:"createdAt"`
}

type markerListResp struct {
	Data       []markerResp `json:"data"`
	Pagination struct {
		HasMore    bool    `json:"hasMore"`
		NextCursor *string `json:"nextCursor"`
	} `json:"pagination"`
}

type markerTypeResp struct {
	ID           string `json:"id"`
	TournamentID string `json:"tournamentId"`
	Name         string `json:"name"`
	Color        string `json:"color"`
	SortOrder    int32  `json:"sortOrder"`
}

// createBasicRun seeds a run and an author user, returning their ids plus the
// tournament the run lives under (needed to create marker types).
func createBasicRun(t *testing.T, env *testEnv) (runID, userID, tournamentID string) {
	t.Helper()
	deps := seedRunDeps(t, env)

	// create user to satisfy author FK via X-User-Id
	var user userResp
	rec := env.do(t, http.MethodPost, "/users", map[string]any{"name": "Author"}, &user)
	mustStatus(t, rec, http.StatusCreated)

	var run runResp
	rec = env.do(t, http.MethodPost, "/runs", map[string]any{
		"sessionId":   deps.SessionID,
		"teamId":      deps.TeamID,
		"robotId":     deps.RobotID,
		"scenarioId":  deps.ScenarioID,
		"startedAt":   "2026-05-01T10:00:00Z",
		"durationSec": 90,
	}, &run)
	mustStatus(t, rec, http.StatusCreated)
	return run.ID, user.ID, deps.TournamentID
}

func createMarkerType(t *testing.T, env *testEnv, tournamentID, name, color string) markerTypeResp {
	t.Helper()
	var mt markerTypeResp
	rec := env.do(t, http.MethodPost, "/tournaments/"+tournamentID+"/marker-types",
		map[string]any{"name": name, "color": color}, &mt)
	mustStatus(t, rec, http.StatusCreated)
	return mt
}

func TestMarkerCRUDAndTypeFilter(t *testing.T) {
	env := setupEnv(t)
	runID, userID, tournamentID := createBasicRun(t, env)

	vgoal := createMarkerType(t, env, tournamentID, "Vゴール", "teal")
	retry := createMarkerType(t, env, tournamentID, "リトライ", "red")

	// Create with type + label, authored via X-User-Id
	var m1 markerResp
	rec := env.doWithHeaders(t, http.MethodPost, "/runs/"+runID+"/markers",
		map[string]any{"runOffsetSec": 5, "label": "脱輪", "markerTypeId": retry.ID}, &m1,
		map[string]string{"X-User-Id": userID})
	mustStatus(t, rec, http.StatusCreated)
	if m1.MarkerTypeID == nil || *m1.MarkerTypeID != retry.ID || m1.Label != "脱輪" || m1.RunOffsetSec != 5 {
		t.Errorf("create: %+v", m1)
	}
	if m1.MarkerType == nil || m1.MarkerType.Name != "リトライ" || m1.MarkerType.Color != "red" {
		t.Errorf("expected expanded markerType, got %+v", m1.MarkerType)
	}
	if m1.AuthorID == nil || *m1.AuthorID != userID {
		t.Errorf("expected authorId=%s got %v", userID, m1.AuthorID)
	}

	// Create without a type → markerTypeId null (free-form note)
	var m2 markerResp
	rec = env.do(t, http.MethodPost, "/runs/"+runID+"/markers",
		map[string]any{"runOffsetSec": 30}, &m2)
	mustStatus(t, rec, http.StatusCreated)
	if m2.MarkerTypeID != nil || m2.MarkerType != nil {
		t.Errorf("expected no type, got %+v / %+v", m2.MarkerTypeID, m2.MarkerType)
	}

	// Create a Vゴール marker
	var m3 markerResp
	rec = env.do(t, http.MethodPost, "/runs/"+runID+"/markers",
		map[string]any{"runOffsetSec": 70, "markerTypeId": vgoal.ID}, &m3)
	mustStatus(t, rec, http.StatusCreated)

	// List all — should be ordered by run_offset_sec asc
	var all markerListResp
	rec = env.do(t, http.MethodGet, "/runs/"+runID+"/markers", nil, &all)
	mustStatus(t, rec, http.StatusOK)
	if len(all.Data) != 3 {
		t.Fatalf("expected 3 markers, got %d", len(all.Data))
	}
	if all.Data[0].RunOffsetSec != 5 || all.Data[2].RunOffsetSec != 70 {
		t.Errorf("ordering: %+v", all.Data)
	}

	// Filter by markerTypeIds=retry,vgoal
	var filtered markerListResp
	rec = env.do(t, http.MethodGet, "/runs/"+runID+"/markers?markerTypeIds="+retry.ID+","+vgoal.ID, nil, &filtered)
	mustStatus(t, rec, http.StatusOK)
	if len(filtered.Data) != 2 {
		t.Errorf("filter: %+v", filtered.Data)
	}

	// Update label + type
	var updated markerResp
	rec = env.do(t, http.MethodPatch, "/markers/"+m1.ID,
		map[string]any{"label": "完璧", "markerTypeId": vgoal.ID}, &updated)
	mustStatus(t, rec, http.StatusOK)
	if updated.Label != "完璧" || updated.MarkerTypeID == nil || *updated.MarkerTypeID != vgoal.ID {
		t.Errorf("update: %+v", updated)
	}

	// Clear the type with explicit null
	rec = env.do(t, http.MethodPatch, "/markers/"+m1.ID,
		map[string]any{"markerTypeId": nil}, &updated)
	mustStatus(t, rec, http.StatusOK)
	if updated.MarkerTypeID != nil {
		t.Errorf("expected cleared type, got %v", updated.MarkerTypeID)
	}

	// Delete + 404 afterwards
	rec = env.do(t, http.MethodDelete, "/markers/"+m2.ID, nil, nil)
	mustStatus(t, rec, http.StatusNoContent)
	rec = env.do(t, http.MethodPatch, "/markers/"+m2.ID, map[string]any{"label": "x"}, nil)
	mustStatus(t, rec, http.StatusNotFound)
}

func TestMarkerTypeDeletionKeepsMarkers(t *testing.T) {
	env := setupEnv(t)
	runID, _, tournamentID := createBasicRun(t, env)
	mt := createMarkerType(t, env, tournamentID, "Vゴール", "teal")

	var m markerResp
	rec := env.do(t, http.MethodPost, "/runs/"+runID+"/markers",
		map[string]any{"runOffsetSec": 5, "markerTypeId": mt.ID}, &m)
	mustStatus(t, rec, http.StatusCreated)

	rec = env.do(t, http.MethodDelete, "/marker-types/"+mt.ID, nil, nil)
	mustStatus(t, rec, http.StatusNoContent)

	// Marker survives, now untyped (ON DELETE SET NULL).
	var got markerResp
	rec = env.do(t, http.MethodGet, "/markers/"+m.ID, nil, &got)
	mustStatus(t, rec, http.StatusOK)
	if got.MarkerTypeID != nil || got.MarkerType != nil {
		t.Errorf("expected untyped marker after type delete, got %+v", got)
	}
}

// TestMarkerFractionalOffsetAndCursor verifies sub-second marker positions
// survive the round-trip and that cursor pagination (keyed on run_offset_sec,
// now double precision) keeps fractional ordering across pages.
func TestMarkerFractionalOffsetAndCursor(t *testing.T) {
	env := setupEnv(t)
	runID, _, _ := createBasicRun(t, env)

	offsets := []float64{5.25, 5.5, 12.75}
	for _, off := range offsets {
		var m markerResp
		rec := env.do(t, http.MethodPost, "/runs/"+runID+"/markers",
			map[string]any{"runOffsetSec": off}, &m)
		mustStatus(t, rec, http.StatusCreated)
		if m.RunOffsetSec != off {
			t.Fatalf("fractional offset round-trip: sent %v got %v", off, m.RunOffsetSec)
		}
	}

	// Page size 1 forces the cursor (offset|uuid) to encode/decode fractional
	// offsets; the three markers must come back in fractional order.
	var seen []float64
	cursor := ""
	for range offsets {
		var page markerListResp
		url := "/runs/" + runID + "/markers?limit=1"
		if cursor != "" {
			url += "&cursor=" + cursor
		}
		rec := env.do(t, http.MethodGet, url, nil, &page)
		mustStatus(t, rec, http.StatusOK)
		if len(page.Data) != 1 {
			t.Fatalf("expected 1 marker per page, got %d", len(page.Data))
		}
		seen = append(seen, page.Data[0].RunOffsetSec)
		if page.Pagination.NextCursor == nil {
			break
		}
		cursor = *page.Pagination.NextCursor
	}
	if len(seen) != 3 || seen[0] != 5.25 || seen[1] != 5.5 || seen[2] != 12.75 {
		t.Errorf("fractional cursor pagination order: %v", seen)
	}
}

func TestMarkerCreateValidatesRun(t *testing.T) {
	env := setupEnv(t)
	rec := env.do(t, http.MethodPost,
		"/runs/00000000-0000-0000-0000-000000000000/markers",
		map[string]any{"runOffsetSec": 1}, nil)
	mustStatus(t, rec, http.StatusNotFound)
}

func TestMarkerCreateRejectsUnknownType(t *testing.T) {
	env := setupEnv(t)
	runID, _, _ := createBasicRun(t, env)
	rec := env.do(t, http.MethodPost, "/runs/"+runID+"/markers",
		map[string]any{"runOffsetSec": 1, "markerTypeId": "00000000-0000-0000-0000-000000000000"}, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("expected 422, got %d", rec.Code)
	}
}

func TestMarkerCreateRejectsForeignTournamentType(t *testing.T) {
	env := setupEnv(t)
	runID, _, _ := createBasicRun(t, env)
	// A marker type under a *different* tournament must be rejected.
	otherTour := env.createTournament(t, "Other")
	otherType := createMarkerType(t, env, otherTour, "別大会", "blue")
	rec := env.do(t, http.MethodPost, "/runs/"+runID+"/markers",
		map[string]any{"runOffsetSec": 1, "markerTypeId": otherType.ID}, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("expected 422, got %d", rec.Code)
	}
}

func TestMarkerCreateRejectsNegativeOffset(t *testing.T) {
	env := setupEnv(t)
	runID, _, _ := createBasicRun(t, env)
	rec := env.do(t, http.MethodPost, "/runs/"+runID+"/markers",
		map[string]any{"runOffsetSec": -1}, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("expected 422, got %d", rec.Code)
	}
}
