import type { SettingsTree, SettingsTreeAction } from "@foxglove/extension";

import type { Tournament } from "./api";

export type PanelState = {
  apiBaseUrl: string;
  tournamentId: string;
  sessionToken: string;
};

export const DEFAULT_STATE: PanelState = {
  apiBaseUrl: "http://localhost:8080/api",
  tournamentId: "",
  sessionToken: "",
};

export function loadInitialState(initial: unknown): PanelState {
  const obj = (initial as Partial<PanelState> | undefined) ?? {};
  return {
    apiBaseUrl: typeof obj.apiBaseUrl === "string" ? obj.apiBaseUrl : DEFAULT_STATE.apiBaseUrl,
    tournamentId:
      typeof obj.tournamentId === "string" ? obj.tournamentId : DEFAULT_STATE.tournamentId,
    sessionToken:
      typeof obj.sessionToken === "string" ? obj.sessionToken : DEFAULT_STATE.sessionToken,
  };
}

export function buildSettings(
  state: PanelState,
  tournaments: Tournament[],
  actionHandler: (action: SettingsTreeAction) => void,
): SettingsTree {
  const tournamentOptions = [
    { label: "(select tournament)", value: "" },
    ...tournaments.map((t) => ({ label: t.name, value: t.id })),
  ];

  return {
    nodes: {
      connection: {
        label: "Connection",
        defaultExpansionState: "expanded",
        fields: {
          apiBaseUrl: {
            label: "Soiree API base URL",
            input: "string",
            value: state.apiBaseUrl,
            placeholder: "http://localhost:8080/api",
            help: "Root of the Soiree API. Include the /api prefix that the SPA uses.",
          },
          sessionToken: {
            label: "Session cookie value",
            input: "string",
            value: state.sessionToken,
            help: "Paste the value of the `soiree_session` cookie from your browser. Sent as the X-Soiree-Session header.",
          },
        },
      },
      scope: {
        label: "Scope",
        defaultExpansionState: "expanded",
        fields: {
          tournamentId: {
            label: "Tournament",
            input: "select",
            value: state.tournamentId,
            options: tournamentOptions,
            help: "Runs from this tournament are scanned for matches against the bag's current time.",
          },
        },
      },
    },
    actionHandler,
  };
}

// Applies a `update` action emitted by the settings editor to PanelState.
// Returns the next state (the caller may use Object.is to skip no-ops).
export function applySettingsUpdate(
  state: PanelState,
  action: SettingsTreeAction,
): PanelState {
  if (action.action !== "update") {
    return state;
  }
  const { path, value } = action.payload;
  const leaf = path[path.length - 1];
  if (leaf === "apiBaseUrl" && typeof value === "string") {
    return { ...state, apiBaseUrl: value };
  }
  if (leaf === "sessionToken" && typeof value === "string") {
    return { ...state, sessionToken: value };
  }
  if (leaf === "tournamentId" && typeof value === "string") {
    return { ...state, tournamentId: value };
  }
  return state;
}
