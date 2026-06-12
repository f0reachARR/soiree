import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Chip,
  Group,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";

import type { Marker } from "../../../lib/api/client";
import {
  useCreateMarker,
  useDeleteMarker,
  useMarkerTypes,
  useMarkers,
  useUpdateMarker,
} from "../../markers/api/queries";
import { MarkerEditModal } from "../../markers/components/MarkerEditModal";
import { MarkerTimelineBar } from "../../markers/components/MarkerTimelineBar";
import { markerDisplayColor, markerDisplayName } from "../../markers/lib/category";
import { formatTime } from "../lib/format";

export function MarkersSection({
  runId,
  tournamentId,
  currentSec,
  durationSec,
  onSeek,
}: {
  runId: string;
  tournamentId: string;
  currentSec: number;
  durationSec: number;
  onSeek: (sec: number) => void;
}) {
  const [filter, setFilter] = useState<string[]>([]);
  const list = useMarkers(
    runId,
    filter.length > 0 ? { markerTypeIds: filter } : {},
  );
  const markerTypes = useMarkerTypes(tournamentId);
  const types = markerTypes.data?.data ?? [];
  const createMarker = useCreateMarker(runId);
  const updateMarker = useUpdateMarker(runId);
  const deleteMarker = useDeleteMarker(runId);

  const [addOpen, { open: openAdd, close: closeAdd }] = useDisclosure(false);
  const [editing, setEditing] = useState<Marker | null>(null);

  const quickAdd = (markerTypeId: string) => {
    createMarker.mutate({
      runOffsetSec: currentSec,
      label: "",
      markerTypeId,
    });
  };

  const markers = list.data?.data ?? [];

  return (
    <Stack gap="xs">
      <Group justify="space-between" mt="md">
        <Title order={4}>Markers ({markers.length})</Title>
        <Group gap="xs">
          {types.length > 0 && (
            <Chip.Group multiple value={filter} onChange={(v) => setFilter(v)}>
              <Group gap={4}>
                {types.map((t) => (
                  <Chip key={t.id} value={t.id} size="xs" color={t.color}>
                    {t.name}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
          )}
          <Button
            size="xs"
            variant="default"
            onClick={openAdd}
            disabled={durationSec === 0}
          >
            ＋ 詳細追加
          </Button>
        </Group>
      </Group>

      <Card withBorder p="sm">
        <Stack gap="xs">
          <Text size="xs" c="dimmed">
            現在時刻 {formatTime(currentSec)} に追加:
          </Text>
          {types.length === 0 ? (
            <Text size="xs" c="dimmed">
              この大会には Marker 種別が未登録です。大会編集画面で追加してください。
            </Text>
          ) : (
            <Group gap="xs">
              {types.map((t) => (
                <Button
                  key={t.id}
                  size="xs"
                  variant="light"
                  color={t.color}
                  loading={createMarker.isPending}
                  disabled={durationSec === 0}
                  onClick={() => quickAdd(t.id)}
                >
                  {t.name}
                </Button>
              ))}
            </Group>
          )}
        </Stack>
      </Card>

      <MarkerTimelineBar
        markers={markers}
        durationSec={durationSec}
        onSeek={onSeek}
        formatTime={formatTime}
      />

      <Table striped withRowBorders={false}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ width: 80 }}>Time</Table.Th>
            <Table.Th style={{ width: 100 }}>種別</Table.Th>
            <Table.Th>Label</Table.Th>
            <Table.Th style={{ width: 110 }}></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {markers.map((m) => (
            <Table.Tr key={m.id}>
              <Table.Td>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  onClick={() => onSeek(m.runOffsetSec)}
                >
                  {formatTime(m.runOffsetSec)}
                </Button>
              </Table.Td>
              <Table.Td>
                <Badge color={markerDisplayColor(m)} variant="light">
                  {markerDisplayName(m)}
                </Badge>
              </Table.Td>
              <Table.Td>
                <Text size="sm">
                  {m.label || (
                    <Text component="span" c="dimmed" size="xs">
                      （無し）
                    </Text>
                  )}
                </Text>
              </Table.Td>
              <Table.Td>
                <Group gap={4} justify="flex-end">
                  <ActionIcon
                    variant="subtle"
                    onClick={() => setEditing(m)}
                    aria-label="編集"
                  >
                    ✏️
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    loading={deleteMarker.isPending}
                    onClick={() => {
                      if (confirm("Marker を削除しますか？"))
                        deleteMarker.mutate(m.id);
                    }}
                    aria-label="削除"
                  >
                    🗑️
                  </ActionIcon>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
          {markers.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text c="dimmed" ta="center" py="md" size="sm">
                  Marker がありません
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      {addOpen && (
        <MarkerEditModal
          mode="create"
          markerTypes={types}
          initial={{
            runOffsetSec: currentSec,
            label: "",
            markerTypeId: null,
          }}
          durationSec={durationSec}
          onClose={closeAdd}
          onSubmit={(body) => {
            createMarker.mutate(body, { onSuccess: closeAdd });
          }}
          saving={createMarker.isPending}
        />
      )}

      {editing && (
        <MarkerEditModal
          mode="edit"
          markerTypes={types}
          initial={{
            runOffsetSec: editing.runOffsetSec,
            label: editing.label,
            markerTypeId: editing.markerTypeId,
          }}
          durationSec={durationSec}
          onClose={() => setEditing(null)}
          onSubmit={(body) =>
            updateMarker.mutate(
              { id: editing.id, body },
              { onSuccess: () => setEditing(null) },
            )
          }
          saving={updateMarker.isPending}
        />
      )}
    </Stack>
  );
}
