package handler_test

import (
	"net/http"
	"testing"
)

type teamMarkerTypeCountResp struct {
	MarkerTypeID *string `json:"markerTypeId"`
	Name         *string `json:"name"`
	Color        *string `json:"color"`
	Count        int64   `json:"count"`
}

type teamMarkerStatsResp struct {
	TeamID string                    `json:"teamId"`
	Data   []teamMarkerTypeCountResp `json:"data"`
}

// countFor returns the aggregated count for a given marker type id (or the
// untyped bucket when id is empty).
func (s teamMarkerStatsResp) countFor(id string) int64 {
	for _, d := range s.Data {
		if id == "" {
			if d.MarkerTypeID == nil {
				return d.Count
			}
			continue
		}
		if d.MarkerTypeID != nil && *d.MarkerTypeID == id {
			return d.Count
		}
	}
	return 0
}

func TestTeamMarkerStatsAggregates(t *testing.T) {
	env := setupEnv(t)
	deps := seedRunDeps(t, env)

	vgoal := createMarkerType(t, env, deps.TournamentID, "Vゴール", "teal")
	retry := createMarkerType(t, env, deps.TournamentID, "リトライ", "red")

	var r2 runResp
	rec := env.do(t, http.MethodPost, "/runs", map[string]any{
		"sessionId":   deps.SessionID,
		"teamId":      deps.TeamID,
		"robotId":     deps.RobotID,
		"scenarioId":  deps.ScenarioID,
		"startedAt":   "2026-05-02T10:00:00Z",
		"durationSec": 90,
	}, &r2)
	mustStatus(t, rec, http.StatusCreated)

	var r1 runResp
	rec = env.do(t, http.MethodPost, "/runs", map[string]any{
		"sessionId":   deps.SessionID,
		"teamId":      deps.TeamID,
		"robotId":     deps.RobotID,
		"scenarioId":  deps.ScenarioID,
		"startedAt":   "2026-05-01T10:00:00Z",
		"durationSec": 90,
	}, &r1)
	mustStatus(t, rec, http.StatusCreated)

	// r1: 2 Vゴール + 1 untyped, r2: 1 リトライ.
	addMarker := func(runID string, typeID *string) {
		body := map[string]any{"runOffsetSec": 1}
		if typeID != nil {
			body["markerTypeId"] = *typeID
		}
		rec := env.do(t, http.MethodPost, "/runs/"+runID+"/markers", body, nil)
		mustStatus(t, rec, http.StatusCreated)
	}
	addMarker(r1.ID, &vgoal.ID)
	addMarker(r1.ID, &vgoal.ID)
	addMarker(r1.ID, nil)
	addMarker(r2.ID, &retry.ID)

	var stats teamMarkerStatsResp
	rec = env.do(t, http.MethodGet, "/teams/"+deps.TeamID+"/marker-stats", nil, &stats)
	mustStatus(t, rec, http.StatusOK)
	if got := stats.countFor(vgoal.ID); got != 2 {
		t.Errorf("Vゴール count: got %d want 2 (%+v)", got, stats.Data)
	}
	if got := stats.countFor(retry.ID); got != 1 {
		t.Errorf("リトライ count: got %d want 1 (%+v)", got, stats.Data)
	}
	if got := stats.countFor(""); got != 1 {
		t.Errorf("untyped count: got %d want 1 (%+v)", got, stats.Data)
	}
	if stats.TeamID != deps.TeamID {
		t.Errorf("teamId echo: %q vs %q", stats.TeamID, deps.TeamID)
	}
}

func TestTeamMarkerStatsEmpty(t *testing.T) {
	env := setupEnv(t)
	// Team with no runs.
	type idResp struct {
		ID string `json:"id"`
	}
	var team idResp
	rec := env.do(t, http.MethodPost, "/teams", map[string]any{"name": "Lonely"}, &team)
	mustStatus(t, rec, http.StatusCreated)

	var stats teamMarkerStatsResp
	rec = env.do(t, http.MethodGet, "/teams/"+team.ID+"/marker-stats", nil, &stats)
	mustStatus(t, rec, http.StatusOK)
	if len(stats.Data) != 0 {
		t.Errorf("expected empty data, got %+v", stats.Data)
	}
}

func TestTeamMarkerStatsTeamNotFound(t *testing.T) {
	env := setupEnv(t)
	rec := env.do(t, http.MethodGet,
		"/teams/00000000-0000-0000-0000-000000000000/marker-stats", nil, nil)
	mustStatus(t, rec, http.StatusNotFound)
}
