import type { Video } from "../../../lib/api/client";

type Range = { start: number; end: number };

// A video's time range is [effectiveRecordedAt, effectiveRecordedAt +
// durationSec], using the offset-corrected time so clock-skewed cameras still
// line up. Videos without an effectiveRecordedAt have no known position on the
// timeline, so they can't participate in overlap matching.
function rangeOf(v: Video): Range | null {
  if (!v.effectiveRecordedAt) return null;
  const start = new Date(v.effectiveRecordedAt).getTime();
  if (Number.isNaN(start)) return null;
  const end = start + (v.durationSec ?? 0) * 1000;
  return { start, end };
}

function overlaps(a: Range, b: Range): boolean {
  // Half-open comparison: touching endpoints (a.end === b.start) don't count
  // as an overlap.
  return a.start < b.end && b.start < a.end;
}

// Given the currently-selected video ids, returns a new selection that also
// includes every video whose time range overlaps any selected video's range.
// The original selection is always preserved.
export function selectOverlapping(
  selectedIds: Set<string>,
  videos: Video[],
): Set<string> {
  const selectedRanges = videos
    .filter((v) => selectedIds.has(v.id))
    .map(rangeOf)
    .filter((r): r is Range => r !== null);

  if (selectedRanges.length === 0) return new Set(selectedIds);

  const next = new Set(selectedIds);
  for (const v of videos) {
    if (next.has(v.id)) continue;
    const r = rangeOf(v);
    if (r && selectedRanges.some((sr) => overlaps(sr, r))) {
      next.add(v.id);
    }
  }
  return next;
}
