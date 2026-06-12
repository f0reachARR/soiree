// Minimal Soiree HTTP client used by the panel. We talk to the same Go API
// described in docs/api/openapi.yaml. Authentication is done by replaying the
// browser's signed session value as the `X-Soiree-Session` header (see
// internal/http/middleware/auth.go — fetch in a browser cannot set the Cookie
// header directly).

export type ApiConfig = {
  baseUrl: string;
  sessionToken: string;
};

export type Tournament = {
  id: string;
  name: string;
};

export type RunSummary = {
  id: string;
  tournamentId: string;
  sessionId: string;
  teamId: string;
  robotId: string;
  scenarioId: string;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  score: number | null;
  memo: string;
};

export type RunVideo = {
  id: string;
  runId: string;
  videoId: string;
  videoOffsetStartSec: number;
  videoOffsetEndSec: number;
  runOffsetSec: number;
  angleLabel: string;
};

export type RunDetail = RunSummary & {
  videos: RunVideo[];
};

export type PlaybackUrl = {
  url: string;
  expiresAt: string;
  kind: "hls" | "mp4" | "image";
};

type Pagination = {
  hasMore: boolean;
  nextCursor: string | null;
};

export class ApiError extends Error {
  public readonly status: number;
  public constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}${path}`;
}

async function apiFetch<T>(cfg: ApiConfig, path: string): Promise<T> {
  if (!cfg.baseUrl) {
    throw new ApiError(0, "API base URL is not configured");
  }
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (cfg.sessionToken) {
    headers["X-Soiree-Session"] = cfg.sessionToken;
  }
  let res: Response;
  try {
    res = await fetch(joinUrl(cfg.baseUrl, path), { headers, mode: "cors" });
  } catch (err) {
    throw new ApiError(0, `network error: ${(err as Error).message}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body || res.statusText);
  }
  return (await res.json()) as T;
}

export async function listTournaments(cfg: ApiConfig): Promise<Tournament[]> {
  const out: Tournament[] = [];
  let cursor: string | null = null;
  do {
    const qs = new URLSearchParams();
    qs.set("limit", "100");
    if (cursor != null) {
      qs.set("cursor", cursor);
    }
    const page: { data: Tournament[]; pagination: Pagination } = await apiFetch(
      cfg,
      `/tournaments?${qs.toString()}`,
    );
    out.push(...page.data);
    cursor = page.pagination.hasMore ? page.pagination.nextCursor : null;
  } while (cursor != null);
  return out;
}

export async function listRuns(cfg: ApiConfig, tournamentId: string): Promise<RunSummary[]> {
  const out: RunSummary[] = [];
  let cursor: string | null = null;
  do {
    const qs = new URLSearchParams();
    qs.set("tournamentId", tournamentId);
    qs.set("limit", "200");
    if (cursor != null) {
      qs.set("cursor", cursor);
    }
    const page: { data: RunSummary[]; pagination: Pagination } = await apiFetch(
      cfg,
      `/runs?${qs.toString()}`,
    );
    out.push(...page.data);
    cursor = page.pagination.hasMore ? page.pagination.nextCursor : null;
  } while (cursor != null);
  return out;
}

export async function getRun(cfg: ApiConfig, runId: string): Promise<RunDetail> {
  return await apiFetch<RunDetail>(cfg, `/runs/${encodeURIComponent(runId)}`);
}

export async function getVideoPlaybackUrl(
  cfg: ApiConfig,
  videoId: string,
): Promise<PlaybackUrl> {
  return await apiFetch<PlaybackUrl>(
    cfg,
    `/videos/${encodeURIComponent(videoId)}/playback-url`,
  );
}
