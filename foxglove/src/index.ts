import { ExtensionContext } from "@foxglove/extension";

import { initSoireePlayerPanel } from "./SoireePlayerPanel";

export function activate(extensionContext: ExtensionContext): void {
  extensionContext.registerPanel({
    name: "soiree-player",
    initPanel: initSoireePlayerPanel,
  });
}
