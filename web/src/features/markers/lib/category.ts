import type { Marker, MarkerTypeRef } from "../../../lib/api/client";

// 種別なしマーカーのフォールバック表示。
export const NO_MARKER_TYPE_COLOR = "gray";
export const NO_MARKER_TYPE_LABEL = "種別なし";

export function markerColor(
  type: MarkerTypeRef | null | undefined,
): string {
  return type?.color || NO_MARKER_TYPE_COLOR;
}

export function markerTypeName(
  type: MarkerTypeRef | null | undefined,
): string {
  return type?.name || NO_MARKER_TYPE_LABEL;
}

// Marker から表示用の色/名前を解決する。
export function markerDisplayColor(marker: Marker): string {
  return markerColor(marker.markerType ?? undefined);
}

export function markerDisplayName(marker: Marker): string {
  return markerTypeName(marker.markerType ?? undefined);
}
