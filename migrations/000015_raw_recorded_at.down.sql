-- Re-bake the device's default offset into recorded_at, restoring the legacy
-- storage convention where recorded_at = raw - device.default_time_offset_sec.
UPDATE videos v
SET recorded_at = v.recorded_at - make_interval(secs => d.default_time_offset_sec)
FROM devices d
WHERE v.device_id = d.id
  AND v.recorded_at IS NOT NULL
  AND d.default_time_offset_sec <> 0;
