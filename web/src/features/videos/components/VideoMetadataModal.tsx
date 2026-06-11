import {
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { useMemo, useState } from "react";

import type { Video } from "../../../lib/api/client";
import { formatDateTimeFull } from "../../../lib/time";
import { useDevices } from "../../devices/api/queries";
import { useUpdateVideo } from "../api/queries";

type Props = {
  video: Video;
  onClose: () => void;
};

export function VideoMetadataModal({ video, onClose }: Props) {
  const devices = useDevices();
  const update = useUpdateVideo();
  const [recordedAt, setRecordedAt] = useState<Date | null>(
    video.recordedAt ? new Date(video.recordedAt) : null,
  );
  const [deviceId, setDeviceId] = useState<string | null>(video.deviceId ?? null);
  const [timeOffsetSec, setTimeOffsetSec] = useState<number>(video.timeOffsetSec);

  // Effective time = recorded_at - (device default offset + per-video offset).
  // Shown live so the offset's effect is visible before saving.
  const deviceDefaultOffsetSec = useMemo(() => {
    if (!deviceId) return 0;
    const d = (devices.data?.data ?? []).find((x) => x.id === deviceId);
    return d?.defaultTimeOffsetSec ?? 0;
  }, [devices.data, deviceId]);
  const effectiveRecordedAt = useMemo(() => {
    if (!recordedAt) return null;
    return new Date(
      recordedAt.getTime() - (deviceDefaultOffsetSec + timeOffsetSec) * 1000,
    );
  }, [recordedAt, deviceDefaultOffsetSec, timeOffsetSec]);

  const submit = () => {
    update.mutate(
      {
        id: video.id,
        body: {
          recordedAt: recordedAt ? recordedAt.toISOString() : null,
          deviceId: deviceId,
          timeOffsetSec,
        },
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal opened onClose={onClose} title="動画メタデータ編集" size="md">
      <Stack>
        <DateTimePicker
          label="Recorded At"
          value={recordedAt}
          onChange={(v) => setRecordedAt(v ? new Date(v) : null)}
          clearable
        />
        <Select
          label="Device"
          data={(devices.data?.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
          value={deviceId}
          onChange={setDeviceId}
          clearable
        />
        <NumberInput
          label="Time Offset (秒)"
          description="recorded_at に対する個別補正。Device default に追加される"
          value={timeOffsetSec}
          onChange={(v) => setTimeOffsetSec(typeof v === "number" ? v : 0)}
        />
        <Text size="xs" c="dimmed">
          補正後の実時刻:{" "}
          {effectiveRecordedAt ? formatDateTimeFull(effectiveRecordedAt) : "—"}
          {deviceDefaultOffsetSec !== 0 &&
            ` (Device default ${deviceDefaultOffsetSec}s + 個別 ${timeOffsetSec}s)`}
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={submit} loading={update.isPending}>
            保存
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
