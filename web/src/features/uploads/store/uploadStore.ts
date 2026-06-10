import { useSyncExternalStore } from "react";
import { Upload } from "tus-js-client";

import { queryClient } from "../../../app/providers";

// Default to a same-origin path so the production nginx deployment "just
// works" — vite proxies /files/ to tusd in dev (see vite.config.ts).
const TUSD_ENDPOINT =
  (import.meta.env.VITE_TUSD_ENDPOINT as string | undefined) ?? "/files/";

export type UploadItem = {
  id: string;
  fileName: string;
  size: number;
  progress: number;
  bytesUploaded: number;
  startedAt: number;
  state: "uploading" | "done" | "error" | "canceled";
  error?: string;
  upload: Upload;
};

export type UploadMeta = {
  tournamentId: string | null;
  deviceId: string | null;
  sessionId: string | null;
  uploaderId: string | null;
};

// Upload state lives in a module-level singleton — NOT in a React component —
// so it survives SPA navigation. The /videos page only kicks off uploads; the
// in-flight list and progress are owned here and surfaced globally via
// <GlobalUploadQueue>. This is the same `useSyncExternalStore` pattern as the
// currentTournament / currentUser stores.
let items: UploadItem[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

// Replace the snapshot array reference on every change so useSyncExternalStore
// re-renders; mutating in place would be skipped by its identity check.
function setItems(next: UploadItem[]) {
  items = next;
  emit();
}

function patch(id: string, p: Partial<UploadItem>) {
  setItems(items.map((it) => (it.id === id ? { ...it, ...p } : it)));
}

function buildUpload(file: File, meta: UploadMeta, id: string): Upload {
  const metadata: Record<string, string> = {
    filename: file.name,
    filetype: file.type || "application/octet-stream",
  };
  if (meta.tournamentId) metadata.tournamentId = meta.tournamentId;
  if (meta.deviceId) metadata.deviceId = meta.deviceId;
  if (meta.sessionId) metadata.sessionId = meta.sessionId;
  if (meta.uploaderId) metadata.uploaderId = meta.uploaderId;
  return new Upload(file, {
    endpoint: TUSD_ENDPOINT,
    retryDelays: [0, 1000, 3000, 5000, 10000],
    chunkSize: 8 * 1024 * 1024,
    // urlStorage default (localStorage) + removeFingerprintOnSuccess lets
    // an interrupted upload resume across page reloads.
    removeFingerprintOnSuccess: true,
    metadata,
    onError(err) {
      patch(id, { state: "error", error: err.message });
    },
    onProgress(sent, total) {
      const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
      patch(id, { progress: pct, bytesUploaded: sent });
    },
    onSuccess() {
      patch(id, { state: "done", progress: 100 });
      // The tus post-finish hook creates the Video row asynchronously; wait a
      // beat before refreshing so the new row is visible. Invalidating the
      // shared cache works regardless of which route is mounted.
      setTimeout(
        () => queryClient.invalidateQueries({ queryKey: ["videos"] }),
        800,
      );
    },
  });
}

export function startUpload(file: File, meta: UploadMeta) {
  if (file.size === 0) return;
  const id = crypto.randomUUID();
  const upload = buildUpload(file, meta, id);
  const item: UploadItem = {
    id,
    fileName: file.name,
    size: file.size,
    progress: 0,
    bytesUploaded: 0,
    startedAt: Date.now(),
    state: "uploading",
    upload,
  };
  setItems([...items, item]);
  upload.start();
}

export function startUploadMany(files: FileList | File[], meta: UploadMeta) {
  for (const f of Array.from(files)) startUpload(f, meta);
}

export function cancelUpload(id: string) {
  const target = items.find((u) => u.id === id);
  if (!target) return;
  target.upload.abort().catch(() => {});
  patch(id, { state: "canceled" });
}

export function retryUpload(id: string) {
  const target = items.find((u) => u.id === id);
  if (!target) return;
  patch(id, { state: "uploading", error: undefined, startedAt: Date.now() });
  // tus-js-client supports resume by re-running start() on the existing upload.
  target.upload.start();
}

export function clearFinished() {
  setItems(items.filter((it) => it.state === "uploading"));
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot(): UploadItem[] {
  return items;
}

const EMPTY: UploadItem[] = [];

export function useUploads(): UploadItem[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

export function hasActiveUploads(): boolean {
  return items.some((u) => u.state === "uploading");
}

export function formatRate(u: UploadItem): string {
  const elapsed = (Date.now() - u.startedAt) / 1000;
  if (elapsed <= 0 || u.bytesUploaded <= 0) return "—";
  const mbps = u.bytesUploaded / elapsed / (1024 * 1024);
  return `${mbps.toFixed(1)} MB/s`;
}

if (typeof window !== "undefined") {
  // Block accidental tab close / reload while uploads are in flight. Because
  // the store is a singleton this guard stays armed across SPA navigation —
  // the old per-route effect was torn down the moment you left /videos.
  window.addEventListener("beforeunload", (e: BeforeUnloadEvent) => {
    if (!hasActiveUploads()) return;
    e.preventDefault();
    // Older Safari still needs `returnValue` set; assign via cast to bypass
    // the deprecation hint on the typed event.
    (e as { returnValue: string }).returnValue = "";
  });

  // Resume errored uploads automatically when the browser regains network.
  // tus-js-client retries within `retryDelays`, but once exhausted the upload
  // sits in `error` until retried — fine on a blip, frustrating in a flaky
  // venue. Listening for `online` kicks the queue back to life.
  window.addEventListener("online", () => {
    for (const it of items) {
      if (it.state !== "error") continue;
      patch(it.id, { state: "uploading", error: undefined });
      it.upload.start();
    }
  });
}
