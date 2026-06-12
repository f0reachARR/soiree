// Pure time-mapping helpers shared between the matcher and the per-video sync
// loop. Kept dependency-free so they're trivial to reason about.

import type { Time } from "@foxglove/extension";

import type { RunSummary, RunVideo } from "./api";

export type IndexedRun = RunSummary & {
  startedAtSec: number;
  endedAtSec: number;
};

export function timeToSec(t: Time): number {
  return t.sec + t.nsec / 1e9;
}

export function isoToUnixSec(iso: string): number {
  return new Date(iso).getTime() / 1000;
}

export function indexRuns(runs: RunSummary[]): IndexedRun[] {
  return runs
    .map((r) => ({
      ...r,
      startedAtSec: isoToUnixSec(r.startedAt),
      endedAtSec: isoToUnixSec(r.endedAt),
    }))
    .sort((a, b) => a.startedAtSec - b.startedAtSec);
}

// Returns the Run whose [startedAt, endedAt] interval contains bagUnixSec, or
// undefined if none does. Runs are assumed sorted ascending by startedAtSec.
// Overlapping runs (rare) resolve to the latest-started one, which is what a
// user would expect when both are technically active.
export function findRunAtTime(
  runs: readonly IndexedRun[],
  bagUnixSec: number,
): IndexedRun | undefined {
  if (runs.length === 0) {
    return undefined;
  }
  // Binary-search for the largest index i with runs[i].startedAtSec <= bagUnixSec.
  let lo = 0;
  let hi = runs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const r = runs[mid]!;
    if (r.startedAtSec <= bagUnixSec) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  const cand = runs[lo - 1];
  if (!cand) {
    return undefined;
  }
  return bagUnixSec <= cand.endedAtSec ? cand : undefined;
}

export type VideoSyncTarget = {
  // Time inside the source video file the player should seek to.
  videoTime: number;
  // True iff videoTime falls inside [videoOffsetStartSec, videoOffsetEndSec].
  // Outside this range the player should hold its last frame and stop.
  inRange: boolean;
};

export function videoTargetForRunVideo(
  bagUnixSec: number,
  runStartedAtSec: number,
  rv: RunVideo,
): VideoSyncTarget {
  const tRun = bagUnixSec - runStartedAtSec;
  const tSegment = tRun - rv.runOffsetSec;
  const videoTime = rv.videoOffsetStartSec + tSegment;
  const inRange =
    videoTime >= rv.videoOffsetStartSec && videoTime <= rv.videoOffsetEndSec;
  return { videoTime, inRange };
}
