-- Revert to integer seconds, rounding any fractional offsets to the nearest
-- whole second.
ALTER TABLE videos
  ALTER COLUMN time_offset_sec TYPE integer USING round(time_offset_sec);

ALTER TABLE devices
  ALTER COLUMN default_time_offset_sec TYPE integer USING round(default_time_offset_sec);
