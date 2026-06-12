-- name: CreateMarker :one
INSERT INTO markers (run_id, author_id, run_offset_sec, label, marker_type_id)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetMarker :one
SELECT
  m.*,
  mt.name  AS marker_type_name,
  mt.color AS marker_type_color
FROM markers m
LEFT JOIN marker_types mt ON mt.id = m.marker_type_id
WHERE m.id = $1;

-- name: ListMarkersByRun :many
SELECT
  m.*,
  mt.name  AS marker_type_name,
  mt.color AS marker_type_color
FROM markers m
LEFT JOIN marker_types mt ON mt.id = m.marker_type_id
WHERE m.run_id = sqlc.arg('run_id')
  AND (sqlc.narg('cursor_run_offset')::double precision IS NULL
       OR (m.run_offset_sec, m.id) > (sqlc.narg('cursor_run_offset')::double precision, sqlc.narg('cursor_id')::uuid))
  AND (COALESCE(array_length(sqlc.narg('marker_type_ids')::uuid[], 1), 0) = 0
       OR m.marker_type_id = ANY(sqlc.narg('marker_type_ids')::uuid[]))
ORDER BY m.run_offset_sec ASC, m.id ASC
LIMIT $1;

-- name: UpdateMarker :one
UPDATE markers
SET
  run_offset_sec = COALESCE(sqlc.narg('run_offset_sec'), run_offset_sec),
  label          = COALESCE(sqlc.narg('label'), label),
  marker_type_id = CASE WHEN sqlc.arg('set_marker_type')::bool
                        THEN sqlc.narg('marker_type_id')::uuid
                        ELSE marker_type_id END
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteMarker :execrows
DELETE FROM markers WHERE id = $1;

-- name: CountMarkersByTeamAndType :many
SELECT
  m.marker_type_id,
  mt.name  AS marker_type_name,
  mt.color AS marker_type_color,
  COUNT(*) AS count
FROM markers m
JOIN runs r ON r.id = m.run_id
LEFT JOIN marker_types mt ON mt.id = m.marker_type_id
WHERE r.team_id = $1
GROUP BY m.marker_type_id, mt.name, mt.color;
