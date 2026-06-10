import { ActionIcon, Group, Progress, Stack, Text } from "@mantine/core";

import { formatRate, type UploadItem } from "../store/uploadStore";

// Renders just the per-file progress rows. The surrounding chrome (title,
// collapse, clear button) is owned by the container — see GlobalUploadQueue.
export function UploadQueue({
  uploads,
  onCancel,
  onRetry,
}: {
  uploads: UploadItem[];
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  if (uploads.length === 0) return null;
  return (
    <Stack gap="xs">
      {uploads.map((u) => (
        <Group key={u.id} gap="md" wrap="nowrap">
          <Text size="sm" flex={1} truncate>
            {u.fileName}
          </Text>
          <Text size="xs" c="dimmed" miw={80} ta="right">
            {(u.size / (1024 * 1024)).toFixed(1)} MB
          </Text>
          <Progress
            value={u.progress}
            color={
              u.state === "error"
                ? "red"
                : u.state === "canceled"
                  ? "gray"
                  : u.state === "done"
                    ? "green"
                    : "blue"
            }
            miw={200}
            size="sm"
            flex={1}
          />
          <Text size="xs" w={130} ta="right">
            {u.state === "uploading" && `${u.progress}% · ${formatRate(u)}`}
            {u.state === "done" && "完了"}
            {u.state === "canceled" && "中止"}
            {u.state === "error" && (u.error ?? "失敗")}
          </Text>
          <Group gap={4} w={70} justify="flex-end">
            {u.state === "uploading" && (
              <ActionIcon
                size="sm"
                variant="subtle"
                color="red"
                onClick={() => onCancel(u.id)}
                aria-label="中止"
              >
                ✕
              </ActionIcon>
            )}
            {(u.state === "error" || u.state === "canceled") && (
              <ActionIcon
                size="sm"
                variant="subtle"
                onClick={() => onRetry(u.id)}
                aria-label="再試行"
              >
                ↻
              </ActionIcon>
            )}
          </Group>
        </Group>
      ))}
    </Stack>
  );
}
