package handler_test

import (
	"net/http"
	"testing"
)

type markerTypeListResp struct {
	Data []markerTypeResp `json:"data"`
}

func TestMarkerTypeCRUD(t *testing.T) {
	env := setupEnv(t)
	tournamentID := env.createTournament(t, "T")

	// Create
	var created markerTypeResp
	rec := env.do(t, http.MethodPost, "/tournaments/"+tournamentID+"/marker-types",
		map[string]any{"name": "Vゴール", "color": "teal", "sortOrder": 1}, &created)
	mustStatus(t, rec, http.StatusCreated)
	if created.Name != "Vゴール" || created.Color != "teal" || created.TournamentID != tournamentID {
		t.Errorf("create: %+v", created)
	}

	// Create with default color
	var dflt markerTypeResp
	rec = env.do(t, http.MethodPost, "/tournaments/"+tournamentID+"/marker-types",
		map[string]any{"name": "リトライ"}, &dflt)
	mustStatus(t, rec, http.StatusCreated)
	if dflt.Color != "blue" {
		t.Errorf("default color: got %q want blue", dflt.Color)
	}

	// Missing name → 422
	rec = env.do(t, http.MethodPost, "/tournaments/"+tournamentID+"/marker-types",
		map[string]any{"color": "red"}, nil)
	mustStatus(t, rec, http.StatusUnprocessableEntity)

	// List
	var list markerTypeListResp
	rec = env.do(t, http.MethodGet, "/tournaments/"+tournamentID+"/marker-types", nil, &list)
	mustStatus(t, rec, http.StatusOK)
	if len(list.Data) != 2 {
		t.Fatalf("list: expected 2, got %d", len(list.Data))
	}

	// Update name + color
	var updated markerTypeResp
	rec = env.do(t, http.MethodPatch, "/marker-types/"+created.ID,
		map[string]any{"name": "Vゴール!", "color": "green"}, &updated)
	mustStatus(t, rec, http.StatusOK)
	if updated.Name != "Vゴール!" || updated.Color != "green" {
		t.Errorf("update: %+v", updated)
	}

	// Delete
	rec = env.do(t, http.MethodDelete, "/marker-types/"+created.ID, nil, nil)
	mustStatus(t, rec, http.StatusNoContent)
	rec = env.do(t, http.MethodPatch, "/marker-types/"+created.ID, map[string]any{"name": "x"}, nil)
	mustStatus(t, rec, http.StatusNotFound)
}

func TestMarkerTypeListTournamentNotFound(t *testing.T) {
	env := setupEnv(t)
	rec := env.do(t, http.MethodGet,
		"/tournaments/00000000-0000-0000-0000-000000000000/marker-types", nil, nil)
	mustStatus(t, rec, http.StatusNotFound)
}
