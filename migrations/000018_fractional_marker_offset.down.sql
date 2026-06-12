-- Revert to integer seconds, rounding any fractional positions to the nearest
-- whole second.
ALTER TABLE markers
  ALTER COLUMN run_offset_sec TYPE integer USING round(run_offset_sec);
