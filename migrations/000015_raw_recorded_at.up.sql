-- Time-offset model change: videos.recorded_at now stores the RAW recording
-- timestamp as extracted by ffprobe (or entered by hand). Time offsets are no
-- longer baked into recorded_at; instead the effective real-world time is
-- computed at read time as recorded_at - (device.default_time_offset_sec +
-- video.time_offset_sec).
--
-- The old probe path SUBTRACTED the device's default offset before storing
-- recorded_at. Reverse that here so existing rows hold the raw value again.
-- This is only exact if a device's offset has not changed since its videos
-- were probed; that is the best we can recover and is correct going forward.
UPDATE videos v
SET recorded_at = v.recorded_at + make_interval(secs => d.default_time_offset_sec)
FROM devices d
WHERE v.device_id = d.id
  AND v.recorded_at IS NOT NULL
  AND d.default_time_offset_sec <> 0;
