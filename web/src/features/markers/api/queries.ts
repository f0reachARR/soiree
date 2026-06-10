import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type CreateMarkerRequest,
  type CreateMarkerTypeRequest,
  type MarkerListParams,
  type UpdateMarkerRequest,
  type UpdateMarkerTypeRequest,
  markerTypesApi,
  markersApi,
} from "../../../lib/api/client";
import { queryKeys } from "../../../lib/api/queryKeys";

export const useMarkers = (
  runId: string | null | undefined,
  params: MarkerListParams = {},
) =>
  useQuery({
    queryKey: queryKeys.markers(runId ?? "", params),
    queryFn: () => markersApi.list(runId as string, { limit: 200, ...params }),
    enabled: !!runId,
  });

export const useCreateMarker = (runId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMarkerRequest) => markersApi.create(runId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["markers", runId] }),
  });
};

export const useUpdateMarker = (runId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateMarkerRequest }) =>
      markersApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["markers", runId] }),
  });
};

export const useDeleteMarker = (runId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markersApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["markers", runId] }),
  });
};

export const useMarker = (id: string | null | undefined) =>
  useQuery({
    queryKey: ["markers", "detail", id ?? ""] as const,
    queryFn: () => markersApi.get(id as string),
    enabled: !!id,
  });

// ---- Marker types (大会ごと) ----

export const useMarkerTypes = (tournamentId: string | null | undefined) =>
  useQuery({
    queryKey: queryKeys.markerTypes(tournamentId ?? ""),
    queryFn: () => markerTypesApi.list(tournamentId as string),
    enabled: !!tournamentId,
  });

export const useCreateMarkerType = (tournamentId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMarkerTypeRequest) =>
      markerTypesApi.create(tournamentId, body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.markerTypes(tournamentId) }),
  });
};

export const useUpdateMarkerType = (tournamentId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateMarkerTypeRequest }) =>
      markerTypesApi.update(id, body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.markerTypes(tournamentId) }),
  });
};

export const useDeleteMarkerType = (tournamentId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markerTypesApi.remove(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.markerTypes(tournamentId) }),
  });
};
