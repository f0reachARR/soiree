package middleware_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/f0reachARR/soiree/internal/auth"
	"github.com/f0reachARR/soiree/internal/db/sqlc"
	appmid "github.com/f0reachARR/soiree/internal/http/middleware"
	"github.com/f0reachARR/soiree/internal/testutil/pgtest"
)

// TestLoadUser_AcceptsHeaderAndCookie covers the new X-Soiree-Session header
// path added for the Foxglove panel — browser-side `fetch` cannot set the
// Cookie header, so a separate header carries the same signed value.
func TestLoadUser_AcceptsHeaderAndCookie(t *testing.T) {
	pool := pgtest.Setup(t)
	q := sqlc.New(pool)

	user, err := q.CreateUser(context.Background(), sqlc.CreateUserParams{Name: "header-auth"})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	var userIDStr string
	if err := pool.QueryRow(context.Background(), `SELECT $1::uuid::text`, user.ID).Scan(&userIDStr); err != nil {
		t.Fatalf("format user id: %v", err)
	}

	signer, err := auth.NewSigner("test-secret-1234567890")
	if err != nil {
		t.Fatalf("new signer: %v", err)
	}
	now := time.Now()
	token := signer.EncodeSession(auth.Session{
		UserID:    userIDStr,
		IssuedAt:  now,
		ExpiresAt: now.Add(24 * time.Hour),
	})

	probe := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if auth.UserFromContext(r.Context()) == nil {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.WriteHeader(http.StatusOK)
	})
	handler := appmid.LoadUser(appmid.AuthDeps{Q: q, Signer: signer})(
		appmid.RequireAuth()(probe),
	)

	type tc struct {
		name       string
		setHeaders func(r *http.Request)
		wantStatus int
	}
	cases := []tc{
		{
			name: "cookie",
			setHeaders: func(r *http.Request) {
				r.AddCookie(&http.Cookie{Name: auth.SessionCookieName, Value: token})
			},
			wantStatus: http.StatusOK,
		},
		{
			name: "x-soiree-session header",
			setHeaders: func(r *http.Request) {
				r.Header.Set(appmid.SessionHeaderName, token)
			},
			wantStatus: http.StatusOK,
		},
		{
			name:       "no credentials",
			setHeaders: func(_ *http.Request) {},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name: "garbage header",
			setHeaders: func(r *http.Request) {
				r.Header.Set(appmid.SessionHeaderName, "not-a-valid-token")
			},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name: "cookie wins over header",
			setHeaders: func(r *http.Request) {
				r.AddCookie(&http.Cookie{Name: auth.SessionCookieName, Value: token})
				r.Header.Set(appmid.SessionHeaderName, "garbage")
			},
			wantStatus: http.StatusOK,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/probe", nil)
			c.setHeaders(req)
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			if rec.Code != c.wantStatus {
				t.Fatalf("status: got %d want %d", rec.Code, c.wantStatus)
			}
		})
	}
}
