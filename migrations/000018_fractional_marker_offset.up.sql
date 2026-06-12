-- Allow sub-second marker positions. run_offset_sec stays in seconds but
-- switches from integer to double precision so fractional offsets (e.g. 12.5s)
-- are preserved.
ALTER TABLE markers
  ALTER COLUMN run_offset_sec TYPE double precision;
