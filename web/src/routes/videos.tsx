import { Button, FileButton, Group, Select, Stack, Text } from "@mantine/core";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { ResourcePage } from "../components/layout/ResourcePage";
import { useCurrentTournamentId } from "../stores/currentTournament";
import { useCurrentUserId } from "../stores/currentUser";
import { useDevices } from "../features/devices/api/queries";
import { useSessions } from "../features/sessions/api/queries";
import { useVideos } from "../features/videos/api/queries";
import {
  startUpload,
  startUploadMany,
  type UploadMeta,
} from "../features/uploads/store/uploadStore";
import { UploadDropzone } from "../features/uploads/components/UploadDropzone";
import { MobileCaptureButton } from "../features/uploads/components/MobileCaptureButton";
import { VideoList } from "../features/videos/components/VideoList";
import { selectOverlapping } from "../features/videos/lib/overlap";

type Search = {
  sessionId?: string;
  deviceId?: string;
};

export const Route = createFileRoute("/videos")({
  component: VideosPage,
  // Persist the list filters in the URL so they survive reloads and can be
  // shared/bookmarked.
  validateSearch: (s: Record<string, unknown>): Search => ({
    sessionId: typeof s.sessionId === "string" ? s.sessionId : undefined,
    deviceId: typeof s.deviceId === "string" ? s.deviceId : undefined,
  }),
});

function VideosPage() {
  // The single Session select serves a dual role: it tags new uploads, and
  // it filters the list. The latter is what makes "選択した動画から Run を作成"
  // safe — a Run is per-Session, so we require the filter to be set before
  // letting the user build one. Otherwise the selection could span sessions
  // and the server would reject it.
  const { sessionId = null, deviceId = null } = Route.useSearch();
  const videos = useVideos(sessionId ? { sessionId } : {});
  const devices = useDevices();
  const sessions = useSessions();
  const currentUserId = useCurrentUserId();
  const currentTournamentId = useCurrentTournamentId();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Uploads are owned by a module-level store so progress survives SPA
  // navigation and is shown globally (see GlobalUploadQueue). Meta is captured
  // at call time, so the latest Session/Device selection is always used.
  const uploadMeta = (): UploadMeta => ({
    tournamentId: currentTournamentId,
    deviceId,
    sessionId,
    uploaderId: currentUserId,
  });

  const list = videos.data?.data ?? [];
  const devicesList = devices.data?.data ?? [];

  return (
    <ResourcePage
      title="動画"
      description="ブラウザから tusd 経由でアップロード。完了後に Video レコードが自動作成されます。"
      isLoading={videos.isLoading}
      error={videos.error}
      onRetry={() => videos.refetch()}
      actions={
        <Group>
          <Select
            placeholder="Session (絞り込み + アップロード先)"
            data={(sessions.data?.data ?? []).map((s) => ({
              value: s.id,
              label: s.name,
            }))}
            value={sessionId}
            onChange={(v) => {
              navigate({
                to: "/videos",
                search: (prev) => ({ ...prev, sessionId: v ?? undefined }),
              });
              // Selection across Sessions is meaningless for Run creation,
              // so clear it whenever the filter changes.
              setSelected(new Set());
            }}
            clearable
            searchable
            w={260}
            size="sm"
          />
          <Select
            placeholder="Device"
            data={devicesList.map((d) => ({ value: d.id, label: d.name }))}
            value={deviceId}
            onChange={(v) =>
              navigate({
                to: "/videos",
                search: (prev) => ({ ...prev, deviceId: v ?? undefined }),
              })
            }
            clearable
            w={200}
            size="sm"
          />
          <FileButton
            onChange={(files) => files && startUploadMany(files, uploadMeta())}
            accept="video/*"
            multiple
          >
            {(props) => <Button {...props}>＋ 動画を選択</Button>}
          </FileButton>
          <MobileCaptureButton
            onPicked={(file) => startUpload(file, uploadMeta())}
          />
        </Group>
      }
    >
      <Stack>
        <UploadDropzone
          onFiles={(files) => startUploadMany(files, uploadMeta())}
        />

        {selected.size > 0 && (
          <Group
            justify="space-between"
            px="sm"
            py="xs"
            bg="var(--mantine-color-blue-light)"
          >
            <Text size="sm">
              {selected.size} 件選択中
              {!sessionId && " — Session で絞り込んでから Run を作成できます"}
            </Text>
            <Group gap="xs">
              <Button
                size="xs"
                variant="light"
                onClick={() => setSelected(selectOverlapping(selected, list))}
                title="選択中の動画と撮影時間帯が重なる動画をまとめて選択します"
              >
                ⇆ 範囲が重複する動画を選択
              </Button>
              <Button
                size="xs"
                variant="filled"
                onClick={() =>
                  sessionId &&
                  navigate({
                    to: "/runs/new-from-videos",
                    search: {
                      sessionId,
                      videoIds: [...selected].join(","),
                    },
                  })
                }
                disabled={!sessionId}
                title={
                  sessionId
                    ? undefined
                    : "Run は単一の Session に紐づくため、まず Session で絞り込んでください"
                }
              >
                🎬 選択した動画から Run を作成
              </Button>
              <Button
                size="xs"
                variant="default"
                onClick={() => setSelected(new Set())}
              >
                選択解除
              </Button>
            </Group>
          </Group>
        )}

        <VideoList
          videos={list}
          selected={selected}
          onSelectedChange={setSelected}
        />
      </Stack>
    </ResourcePage>
  );
}
