import { PanelExtensionContext, SettingsTreeAction } from "@foxglove/extension";
import {
  ReactElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";

import { VideoCell } from "./VideoCell";
import {
  ApiConfig,
  ApiError,
  PlaybackUrl,
  RunDetail,
  Tournament,
  getRun,
  getVideoPlaybackUrl,
  listRuns,
  listTournaments,
} from "./api";
import { PanelState, applySettingsUpdate, buildSettings, loadInitialState } from "./settings";
import { IndexedRun, findRunAtTime, indexRuns, timeToSec, videoTargetForRunVideo } from "./sync";

// Bag is considered playing if it advanced within this wall-clock window.
const BAG_PLAY_WINDOW_MS = 250;

function cfgOf(state: PanelState): ApiConfig {
  return { baseUrl: state.apiBaseUrl, sessionToken: state.sessionToken };
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      return "Unauthorized (401). Re-paste the session cookie from your browser.";
    }
    if (err.status === 0) {
      return `Cannot reach API: ${err.message}. Check the base URL and that the server allows this origin (CORS).`;
    }
    return `API error ${err.status}: ${err.message}`;
  }
  return (err as Error).message;
}

type GridMode = "single" | "main-side" | "two-up" | "quad";

function gridTemplateFor(mode: GridMode): string {
  switch (mode) {
    case "single":
      return "1fr / 1fr";
    case "main-side":
      return "1fr / 3fr 1fr";
    case "two-up":
      return "1fr / 1fr 1fr";
    case "quad":
      return "1fr 1fr / 1fr 1fr";
  }
}

function gridModeFor({ count, hasMain }: { count: number; hasMain: boolean }): GridMode {
  if (count <= 1) {
    return "single";
  }
  if (hasMain) {
    return "main-side";
  }
  if (count === 2) {
    return "two-up";
  }
  return "quad";
}

function SoireePlayerPanel({ context }: { context: PanelExtensionContext }): ReactElement {
  const [state, setStateRaw] = useState<PanelState>(() => loadInitialState(context.initialState));
  const stateRef = useRef(state);
  stateRef.current = state;
  const setState = useCallback(
    (next: PanelState) => {
      setStateRaw(next);
      context.saveState(next);
    },
    [context],
  );

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [runs, setRuns] = useState<IndexedRun[]>([]);
  const [activeRun, setActiveRun] = useState<RunDetail | undefined>(undefined);
  const [playbackUrls, setPlaybackUrls] = useState<Map<string, PlaybackUrl>>(new Map());
  const [mainVideoId, setMainVideoId] = useState<string | undefined>(undefined);
  const [errMsg, setErrMsg] = useState<string | undefined>(undefined);
  const [warnMsg, setWarnMsg] = useState<string | undefined>(undefined);

  const [bagTimeSec, setBagTimeSec] = useState<number | undefined>(undefined);
  const [bagPlaying, setBagPlaying] = useState(false);
  const lastBagRef = useRef<{ bag: number; wall: number }>({ bag: Number.NaN, wall: 0 });

  const [renderDone, setRenderDone] = useState<(() => void) | undefined>();

  // Foxglove plumbing — watch the bag's current time.
  useLayoutEffect(() => {
    context.onRender = (renderState, done) => {
      setRenderDone(() => done);
      if (renderState.currentTime) {
        const next = timeToSec(renderState.currentTime);
        const prev = lastBagRef.current.bag;
        const wallNow = performance.now();
        if (next !== prev && !Number.isNaN(prev)) {
          setBagPlaying(true);
        }
        if (next !== prev) {
          lastBagRef.current = { bag: next, wall: wallNow };
        }
        setBagTimeSec(next);
      } else {
        setBagTimeSec(undefined);
      }
    };
    context.watch("currentTime");
  }, [context]);

  useEffect(() => {
    renderDone?.();
  }, [renderDone]);

  // If the bag hasn't ticked recently, treat it as paused so the videos hold
  // their frame. Foxglove doesn't fire onRender while paused, so we need a
  // separate timer.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (performance.now() - lastBagRef.current.wall > BAG_PLAY_WINDOW_MS) {
        setBagPlaying((cur) => (cur ? false : cur));
      }
    }, 120);
    return () => {
      window.clearInterval(id);
    };
  }, []);

  // Settings editor — rebuild whenever the inputs change.
  useEffect(() => {
    const handler = (action: SettingsTreeAction) => {
      setState(applySettingsUpdate(stateRef.current, action));
    };
    context.updatePanelSettingsEditor(buildSettings(state, tournaments, handler));
  }, [state, tournaments, context, setState]);

  // Load tournaments whenever auth changes.
  const { apiBaseUrl, sessionToken, tournamentId } = state;
  useEffect(() => {
    if (!apiBaseUrl || !sessionToken) {
      setTournaments([]);
      return undefined;
    }
    let cancelled = false;
    listTournaments({ baseUrl: apiBaseUrl, sessionToken })
      .then((ts) => {
        if (!cancelled) {
          setTournaments(ts);
          setErrMsg(undefined);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setErrMsg(`Tournaments: ${describeError(err)}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, sessionToken]);

  // Load and time-index runs whenever the chosen tournament changes.
  useEffect(() => {
    if (!tournamentId || !apiBaseUrl || !sessionToken) {
      setRuns([]);
      return undefined;
    }
    let cancelled = false;
    listRuns({ baseUrl: apiBaseUrl, sessionToken }, tournamentId)
      .then((rs) => {
        if (!cancelled) {
          setRuns(indexRuns(rs));
          setErrMsg(undefined);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setErrMsg(`Runs: ${describeError(err)}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, sessionToken, tournamentId]);

  const matchedRun = useMemo(() => {
    if (bagTimeSec == undefined) {
      return undefined;
    }
    return findRunAtTime(runs, bagTimeSec);
  }, [runs, bagTimeSec]);

  // Fetch the matched Run's detail (videos[]). Memoize by id so we don't
  // refetch on every bag tick.
  const matchedRunId = matchedRun?.id;
  useEffect(() => {
    if (!matchedRunId) {
      setActiveRun(undefined);
      return undefined;
    }
    let cancelled = false;
    getRun(cfgOf(stateRef.current), matchedRunId)
      .then((r) => {
        if (!cancelled) {
          setActiveRun(r);
          setMainVideoId(undefined);
          setWarnMsg(undefined);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setErrMsg(`Run ${matchedRunId}: ${describeError(err)}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [matchedRunId]);

  // Fetch playback URLs for each RunVideo. We refetch in bulk whenever the
  // run changes; per-video failures don't block the others.
  useEffect(() => {
    if (!activeRun) {
      setPlaybackUrls(new Map());
      return undefined;
    }
    let cancelled = false;
    const next = new Map<string, PlaybackUrl>();
    const skipped: string[] = [];
    void Promise.all(
      activeRun.videos.map(async (rv) => {
        try {
          const url = await getVideoPlaybackUrl(cfgOf(stateRef.current), rv.videoId);
          next.set(rv.videoId, url);
        } catch (err: unknown) {
          skipped.push(`${rv.angleLabel || rv.videoId}: ${describeError(err)}`);
        }
      }),
    ).then(() => {
      if (!cancelled) {
        setPlaybackUrls(next);
        setWarnMsg(skipped.length > 0 ? `Skipped ${skipped.length} angle(s)` : undefined);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeRun]);

  // --- Render ---

  const orderedVideos = useMemo(() => {
    const all = activeRun?.videos ?? [];
    if (!mainVideoId) {
      return all;
    }
    const main = all.find((v) => v.videoId === mainVideoId);
    if (!main) {
      return all;
    }
    const rest = all.filter((v) => v.videoId !== mainVideoId);
    return [main, ...rest];
  }, [activeRun, mainVideoId]);

  const grid = gridTemplateFor(
    gridModeFor({ count: orderedVideos.length, hasMain: mainVideoId != undefined }),
  );
  const hasVideos = orderedVideos.length > 0;

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#111",
        color: "#eee",
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      <HeaderBar
        state={state}
        runs={runs}
        matchedRun={matchedRun}
        activeRun={activeRun}
        bagTimeSec={bagTimeSec}
        bagPlaying={bagPlaying}
      />
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        {hasVideos ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              gridTemplate: grid,
              gap: 4,
              padding: 4,
            }}
          >
            {orderedVideos.map((rv) => {
              const playback = playbackUrls.get(rv.videoId);
              const target =
                activeRun && bagTimeSec != undefined
                  ? videoTargetForRunVideo(
                      bagTimeSec,
                      new Date(activeRun.startedAt).getTime() / 1000,
                      rv,
                    )
                  : undefined;
              return (
                <VideoCell
                  key={rv.id}
                  runVideo={rv}
                  playback={playback}
                  target={target}
                  bagPlaying={bagPlaying}
                  isMain={mainVideoId === rv.videoId}
                  onPromote={() => {
                    setMainVideoId((cur) => (cur === rv.videoId ? undefined : rv.videoId));
                  }}
                />
              );
            })}
          </div>
        ) : (
          <EmptyState
            apiConfigured={!!state.apiBaseUrl && !!state.sessionToken}
            tournamentSelected={!!state.tournamentId}
            runCount={runs.length}
            bagTimeSec={bagTimeSec}
          />
        )}
      </div>
      {(errMsg ?? warnMsg) != undefined && (
        <div
          style={{
            padding: "6px 10px",
            fontSize: 12,
            background: errMsg ? "#5c1e1e" : "#5c4a1e",
            color: "#fff",
            borderTop: "1px solid #333",
          }}
        >
          {errMsg ?? warnMsg}
        </div>
      )}
    </div>
  );
}

function HeaderBar({
  state,
  runs,
  matchedRun,
  activeRun,
  bagTimeSec,
  bagPlaying,
}: {
  state: PanelState;
  runs: IndexedRun[];
  matchedRun: IndexedRun | undefined;
  activeRun: RunDetail | undefined;
  bagTimeSec: number | undefined;
  bagPlaying: boolean;
}): ReactElement {
  const bagIso = bagTimeSec != undefined ? new Date(bagTimeSec * 1000).toISOString() : "—";
  const runLabel = matchedRun
    ? `${new Date(matchedRun.startedAt).toLocaleString()} (${matchedRun.durationSec}s)`
    : runs.length === 0
      ? state.tournamentId
        ? "no runs in tournament"
        : "select a tournament"
      : "no run at this time";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "8px 12px",
        background: "#1a1a1a",
        borderBottom: "1px solid #333",
        fontSize: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: 4,
            background: bagPlaying ? "#51cf66" : "#868e96",
          }}
        />
        <span style={{ color: "#aaa" }}>bag</span>
        <code style={{ color: "#eee" }}>{bagIso}</code>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: "#aaa" }}>run</span>
        <span style={{ color: matchedRun ? "#fff" : "#868e96" }}>{runLabel}</span>
      </div>
      {activeRun?.score != null && (
        <div style={{ color: "#aaa" }}>
          score <span style={{ color: "#fff" }}>{activeRun.score}</span>
        </div>
      )}
      {activeRun?.memo && (
        <div
          style={{
            color: "#bbb",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 360,
          }}
          title={activeRun.memo}
        >
          {activeRun.memo}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  apiConfigured,
  tournamentSelected,
  runCount,
  bagTimeSec,
}: {
  apiConfigured: boolean;
  tournamentSelected: boolean;
  runCount: number;
  bagTimeSec: number | undefined;
}): ReactElement {
  let message: string;
  if (!apiConfigured) {
    message = "Open the panel settings and enter the Soiree API base URL + session cookie value.";
  } else if (!tournamentSelected) {
    message = "Choose a tournament in the panel settings.";
  } else if (runCount === 0) {
    message = "This tournament has no runs.";
  } else if (bagTimeSec == undefined) {
    message = "Waiting for a bag with a current time.";
  } else {
    message = "No run overlaps the bag's current time.";
  }
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        textAlign: "center",
        color: "#868e96",
        fontSize: 13,
      }}
    >
      {message}
    </div>
  );
}

export function initSoireePlayerPanel(context: PanelExtensionContext): () => void {
  const root = createRoot(context.panelElement);
  root.render(<SoireePlayerPanel context={context} />);
  return () => {
    root.unmount();
  };
}
