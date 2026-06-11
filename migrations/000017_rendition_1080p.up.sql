-- 4K 等の高解像度ソース向けに 1080p レンディションを追加する。
-- enum 値の並びは finalize の解像度ソートとは無関係だが、論理的な並びに揃えて
-- '720p' の前に挿入する。

ALTER TYPE rendition_kind ADD VALUE IF NOT EXISTS '1080p' BEFORE '720p';
