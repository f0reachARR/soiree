-- name: ListMarkerTypesByTournament :many
SELECT *
FROM marker_types
WHERE tournament_id = $1
ORDER BY sort_order ASC, name ASC;

-- name: GetMarkerType :one
SELECT * FROM marker_types WHERE id = $1;

-- name: CreateMarkerType :one
INSERT INTO marker_types (tournament_id, name, color, sort_order)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: UpdateMarkerType :one
UPDATE marker_types
SET
  name       = COALESCE(sqlc.narg('name'), name),
  color      = COALESCE(sqlc.narg('color'), color),
  sort_order = COALESCE(sqlc.narg('sort_order'), sort_order)
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteMarkerType :execrows
DELETE FROM marker_types WHERE id = $1;
