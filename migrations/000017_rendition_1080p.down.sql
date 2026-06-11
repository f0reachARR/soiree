-- down: 1080p を取り除く。既存の 1080p レンディション行があると最後の cast で失敗する。
-- Postgres は enum 値の個別削除を直接サポートしないため、型を作り直す。

ALTER TABLE video_renditions ALTER COLUMN kind TYPE text;
DROP TYPE rendition_kind;
CREATE TYPE rendition_kind AS ENUM ('original', '720p', '480p');
ALTER TABLE video_renditions
    ALTER COLUMN kind TYPE rendition_kind USING kind::rendition_kind;
