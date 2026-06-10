import {
  ActionIcon,
  Button,
  Group,
  Paper,
  ScrollArea,
  Text,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useState } from "react";

import {
  cancelUpload,
  clearFinished,
  retryUpload,
  useUploads,
} from "../store/uploadStore";
import { UploadQueue } from "./UploadQueue";

// Floating, route-independent view of the upload queue. The store is a
// singleton (see uploadStore), so uploads started on /videos stay visible no
// matter where the user navigates within the SPA.
export function GlobalUploadQueue() {
  const uploads = useUploads();
  const [collapsed, setCollapsed] = useState(false);
  const theme = useMantineTheme();
  // Clear the mobile bottom tab bar (height 56) so the panel doesn't cover it.
  const isMobile =
    useMediaQuery(`(max-width: ${theme.breakpoints.sm})`, false, {
      getInitialValueInEffect: true,
    }) ?? false;

  if (uploads.length === 0) return null;

  const active = uploads.filter((u) => u.state === "uploading").length;

  return (
    <Paper
      withBorder
      shadow="md"
      radius="md"
      p="sm"
      style={{
        position: "fixed",
        right: 16,
        bottom: isMobile ? 72 : 16,
        zIndex: 200,
        width: "min(440px, calc(100vw - 32px))",
      }}
    >
      <Group justify="space-between" wrap="nowrap" mb={collapsed ? 0 : "xs"}>
        <Text size="sm" fw={600}>
          アップロード状況 ({uploads.length}
          {active > 0 ? ` · ${active} 件進行中` : ""})
        </Text>
        <Group gap={4} wrap="nowrap">
          <Button size="compact-xs" variant="subtle" onClick={clearFinished}>
            完了/失敗をクリア
          </Button>
          <ActionIcon
            size="sm"
            variant="subtle"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "展開" : "折りたたむ"}
          >
            {collapsed ? "▲" : "▼"}
          </ActionIcon>
        </Group>
      </Group>
      {!collapsed && (
        <ScrollArea.Autosize mah={300}>
          <UploadQueue
            uploads={uploads}
            onCancel={cancelUpload}
            onRetry={retryUpload}
          />
        </ScrollArea.Autosize>
      )}
    </Paper>
  );
}
