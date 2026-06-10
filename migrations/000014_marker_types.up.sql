-- 大会ごとに任意の Marker 種別を定義できるマスタを導入。
-- 固定 enum marker_category（success/failure/note）は廃止し、種別へ完全に置き換える。
-- dev 前提: 既存 markers の category は破棄され、marker_type_id = NULL になる。

CREATE TABLE marker_types (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id uuid        NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    name          text        NOT NULL,                 -- 例: "Vゴール"
    color         text        NOT NULL DEFAULT 'blue',  -- Mantine カラーキー
    sort_order    integer     NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tournament_id, name)
);

CREATE INDEX idx_marker_types_tournament ON marker_types(tournament_id, sort_order);

-- markers: category を廃止し marker_type_id へ。種別なし（自由メモ）を許容するため nullable。
ALTER TABLE markers
    ADD COLUMN marker_type_id uuid REFERENCES marker_types(id) ON DELETE SET NULL;

CREATE INDEX idx_markers_marker_type ON markers(marker_type_id);

DROP INDEX IF EXISTS idx_markers_category;
ALTER TABLE markers DROP COLUMN category;
DROP TYPE marker_category;
