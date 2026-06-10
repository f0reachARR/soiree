import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  ColorSwatch,
  Group,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useState } from "react";

import { ApiError, type MarkerType } from "../../../lib/api/client";
import {
  useCreateMarkerType,
  useDeleteMarkerType,
  useMarkerTypes,
  useUpdateMarkerType,
} from "../api/queries";

type Props = { tournamentId: string };

// Mantine の標準カラーキー。Badge / Chip / Button の color に直接渡せる。
const COLOR_OPTIONS = [
  "blue",
  "teal",
  "green",
  "lime",
  "yellow",
  "orange",
  "red",
  "pink",
  "grape",
  "violet",
  "indigo",
  "cyan",
  "gray",
];

function swatch(color: string) {
  return `var(--mantine-color-${color}-6)`;
}

const colorSelectData = COLOR_OPTIONS.map((c) => ({ value: c, label: c }));

export function MarkerTypesEditor({ tournamentId }: Props) {
  const list = useMarkerTypes(tournamentId);
  const create = useCreateMarkerType(tournamentId);
  const update = useUpdateMarkerType(tournamentId);
  const remove = useDeleteMarkerType(tournamentId);

  const [name, setName] = useState("");
  const [color, setColor] = useState<string>("blue");

  const types = list.data?.data ?? [];

  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { name: trimmed, color, sortOrder: types.length },
      {
        onSuccess: () => {
          setName("");
          setColor("blue");
        },
      },
    );
  };

  const move = (index: number, dir: -1 | 1) => {
    const a = types[index];
    const b = types[index + dir];
    if (!a || !b) return;
    update.mutate({ id: a.id, body: { sortOrder: b.sortOrder } });
    update.mutate({ id: b.id, body: { sortOrder: a.sortOrder } });
  };

  const err = create.error ?? update.error ?? remove.error;

  return (
    <Stack gap="xs">
      <Group gap="xs">
        <Title order={4}>Marker 種別</Title>
        <Badge variant="light">{types.length} 件</Badge>
      </Group>
      <Text size="xs" c="dimmed">
        この大会の Run に付けられる Marker の種別（例「Vゴール」「リトライ」）。
      </Text>
      {err && (
        <Alert color="red">
          {err instanceof ApiError ? err.body.message : (err as Error).message}
        </Alert>
      )}

      <Table withRowBorders={false}>
        <Table.Tbody>
          {types.map((t, i) => (
            <MarkerTypeRow
              key={t.id}
              type={t}
              isFirst={i === 0}
              isLast={i === types.length - 1}
              onMoveUp={() => move(i, -1)}
              onMoveDown={() => move(i, 1)}
              onSave={(body) => update.mutate({ id: t.id, body })}
              onDelete={() => {
                if (confirm(`種別「${t.name}」を削除しますか？`))
                  remove.mutate(t.id);
              }}
              saving={update.isPending}
              deleting={remove.isPending}
            />
          ))}
          {types.length === 0 && !list.isLoading && (
            <Table.Tr>
              <Table.Td>
                <Text size="sm" c="dimmed">
                  種別がまだありません。
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Group align="flex-end" gap="xs">
        <TextInput
          label="新しい種別"
          placeholder="例: Vゴール"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <Select
          label="色"
          data={colorSelectData}
          value={color}
          onChange={(v) => setColor(v ?? "blue")}
          w={120}
          leftSection={<ColorSwatch color={swatch(color)} size={14} />}
        />
        <Button onClick={add} loading={create.isPending} disabled={!name.trim()}>
          追加
        </Button>
      </Group>
    </Stack>
  );
}

function MarkerTypeRow({
  type,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onSave,
  onDelete,
  saving,
  deleting,
}: {
  type: MarkerType;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSave: (body: { name?: string; color?: string }) => void;
  onDelete: () => void;
  saving: boolean;
  deleting: boolean;
}) {
  const [name, setName] = useState(type.name);
  const [color, setColor] = useState(type.color);
  const dirty = name.trim() !== type.name || color !== type.color;

  return (
    <Table.Tr>
      <Table.Td w={56}>
        <Stack gap={0}>
          <ActionIcon
            size="sm"
            variant="subtle"
            disabled={isFirst}
            onClick={onMoveUp}
            aria-label="上へ"
          >
            ▲
          </ActionIcon>
          <ActionIcon
            size="sm"
            variant="subtle"
            disabled={isLast}
            onClick={onMoveDown}
            aria-label="下へ"
          >
            ▼
          </ActionIcon>
        </Stack>
      </Table.Td>
      <Table.Td>
        <TextInput
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />
      </Table.Td>
      <Table.Td w={130}>
        <Select
          data={colorSelectData}
          value={color}
          onChange={(v) => setColor(v ?? type.color)}
          leftSection={<ColorSwatch color={swatch(color)} size={14} />}
          comboboxProps={{ withinPortal: true }}
        />
      </Table.Td>
      <Table.Td w={120}>
        <Group gap={4} justify="flex-end">
          <Button
            size="compact-xs"
            disabled={!dirty || !name.trim()}
            loading={saving}
            onClick={() => onSave({ name: name.trim(), color })}
          >
            保存
          </Button>
          <ActionIcon
            variant="subtle"
            color="red"
            loading={deleting}
            onClick={onDelete}
            aria-label="削除"
          >
            🗑️
          </ActionIcon>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}
