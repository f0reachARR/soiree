import {
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  TextInput,
} from "@mantine/core";
import { useForm } from "@tanstack/react-form";

import type { MarkerType } from "../../../lib/api/client";

export type MarkerPayload = {
  runOffsetSec: number;
  label: string;
  markerTypeId: string | null;
};

export function MarkerEditModal({
  mode,
  initial,
  markerTypes,
  durationSec,
  onClose,
  onSubmit,
  saving,
}: {
  mode: "create" | "edit";
  initial: MarkerPayload;
  markerTypes: MarkerType[];
  durationSec: number;
  onClose: () => void;
  onSubmit: (body: MarkerPayload) => void;
  saving: boolean;
}) {
  const form = useForm({
    defaultValues: initial,
    onSubmit: ({ value }) => {
      onSubmit({
        runOffsetSec: Math.max(0, value.runOffsetSec),
        label: value.label,
        markerTypeId: value.markerTypeId,
      });
    },
  });

  return (
    <Modal
      opened
      onClose={onClose}
      title={mode === "create" ? "Marker 追加" : "Marker 編集"}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <Stack>
          <form.Field name="runOffsetSec">
            {(field) => (
              <NumberInput
                label="位置 (秒、Run 開始から)"
                description="小数可"
                value={field.state.value}
                min={0}
                max={durationSec > 0 ? durationSec : undefined}
                step={0.1}
                decimalScale={2}
                onChange={(v) =>
                  field.handleChange(typeof v === "number" ? v : 0)
                }
              />
            )}
          </form.Field>
          <form.Field name="markerTypeId">
            {(field) => (
              <Select
                label="種別"
                placeholder="種別なし"
                clearable
                data={markerTypes.map((t) => ({
                  value: t.id,
                  label: t.name,
                }))}
                value={field.state.value}
                onChange={(v) => field.handleChange(v)}
              />
            )}
          </form.Field>
          <form.Field name="label">
            {(field) => (
              <TextInput
                label="Label"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.currentTarget.value)}
                placeholder="例: 脱輪 / 完璧"
              />
            )}
          </form.Field>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              キャンセル
            </Button>
            <Button type="submit" loading={saving}>
              {mode === "create" ? "追加" : "保存"}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
