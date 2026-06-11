-- Allow sub-second time offsets. The columns stay in seconds but switch from
-- integer to double precision so fractional offsets (e.g. 1.5s) are preserved.
ALTER TABLE devices
  ALTER COLUMN default_time_offset_sec TYPE double precision;

ALTER TABLE videos
  ALTER COLUMN time_offset_sec TYPE double precision;
