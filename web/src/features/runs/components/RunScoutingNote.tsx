import { Alert, Badge, Group, Stack, Text, Title } from "@mantine/core";

import { ApiError, type Run } from "../../../lib/api/client";
import { useScoutingNoteByTeam } from "../../scouting-notes/api/queries";
import { ScoutingEditor } from "../../scouting-notes/components/ScoutingEditor";
import { useTeam } from "../../teams/api/queries";

// Shows the scouting note for this Run's own team. ScoutingNotes are keyed by
// (tournamentId, teamId), so a Run maps to exactly one note via its teamId.
export function RunScoutingNote({ run }: { run: Run }) {
  const team = useTeam(run.teamId);
  const note = useScoutingNoteByTeam(run.tournamentId, run.teamId);

  return (
    <Stack gap="sm" mt="lg">
      <Title order={4}>スカウティングノート</Title>
      <Group gap="xs">
        <Badge>{team.data?.name ?? "チーム"}</Badge>
        {note.data && (
          <Text size="xs" c="dimmed">
            更新: {new Date(note.data.updatedAt).toLocaleString()}
          </Text>
        )}
      </Group>
      {note.data ? (
        <ScoutingEditor noteId={note.data.id} />
      ) : note.isLoading ? (
        <Text size="sm" c="dimmed">
          読み込み中…
        </Text>
      ) : note.error ? (
        <Alert color="red">
          {note.error instanceof ApiError
            ? note.error.body.message
            : String(note.error)}
        </Alert>
      ) : null}
    </Stack>
  );
}
