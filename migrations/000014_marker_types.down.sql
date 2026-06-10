-- down は形だけ用意。category の値は戻らない。

CREATE TYPE marker_category AS ENUM ('success', 'failure', 'note');

ALTER TABLE markers
    ADD COLUMN category marker_category NOT NULL DEFAULT 'note';
CREATE INDEX idx_markers_category ON markers(category);

DROP INDEX IF EXISTS idx_markers_marker_type;
ALTER TABLE markers DROP COLUMN marker_type_id;

DROP TABLE IF EXISTS marker_types;
