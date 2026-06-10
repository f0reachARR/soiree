import {
  Badge,
  Card,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useNavigate } from "@tanstack/react-router";

import type { Run, TeamMarkerStats } from "../../../lib/api/client";
import { useRuns } from "../../runs/api/queries";
import { useTeam, useTeamMarkerStats } from "../../teams/api/queries";

export function TeamPanel({
  teamId,
  role,
}: {
  teamId: string;
  role: "A" | "B";
}) {
  const team = useTeam(teamId);
  const stats = useTeamMarkerStats(teamId);
  const runs = useRuns({ teamId, limit: 5 });

  return (
    <Card withBorder>
      <Stack gap="sm">
        <Group justify="space-between">
          <Group gap="sm">
            <Badge
              variant="filled"
              color={role === "A" ? "blue" : "red"}
              size="lg"
            >
              Team {role}
            </Badge>
            <Title order={4}>{team.data?.name ?? "…"}</Title>
            {team.data?.isOwn && <Badge color="grape">自チーム</Badge>}
          </Group>
        </Group>

        <MarkerStatsRow stats={stats.data} />

        <Stack gap={4}>
          <Text size="sm" fw={500}>
            直近の Run
          </Text>
          <RecentRuns runs={runs.data?.data ?? []} loading={runs.isLoading} />
        </Stack>
      </Stack>
    </Card>
  );
}

function MarkerStatsRow({ stats }: { stats?: TeamMarkerStats }) {
  const data = stats?.data ?? [];
  const total = data.reduce((sum, d) => sum + d.count, 0);
  if (data.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Marker はまだありません
      </Text>
    );
  }
  return (
    <Group>
      {data.map((d) => (
        <Stat
          key={d.markerTypeId ?? "none"}
          label={d.name ?? "種別なし"}
          value={d.count}
          color={d.color ?? "gray"}
        />
      ))}
      <Stat label="合計" value={total} />
    </Group>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <Stack gap={0} align="center" mih={50} miw={64}>
      <Text fw={700} size="lg" c={color}>
        {value}
      </Text>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
    </Stack>
  );
}

function RecentRuns({ runs, loading }: { runs: Run[]; loading: boolean }) {
  const navigate = useNavigate();
  if (loading) {
    return <Loader size="sm" />;
  }
  if (runs.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        Run の記録がありません
      </Text>
    );
  }
  return (
    <Table>
      <Table.Tbody>
        {runs.map((r) => (
          <Table.Tr
            key={r.id}
            style={{ cursor: "pointer" }}
            onClick={() =>
              navigate({ to: "/runs/$runId", params: { runId: r.id } })
            }
          >
            <Table.Td>
              <Text size="xs" ff="monospace">
                {new Date(r.startedAt).toLocaleString()}
              </Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm">{r.score ?? "—"}</Text>
            </Table.Td>
            <Table.Td>
              <Text size="xs" lineClamp={1} maw={200}>
                {r.memo || (
                  <Text component="span" c="dimmed" size="xs">
                    (空)
                  </Text>
                )}
              </Text>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
