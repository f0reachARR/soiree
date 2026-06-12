// Frame-stepping (コマ送り) step sizes for keyboard seeking. We don't have the
// real per-video fps, so a fixed 1/30s feels like a single frame on most
// footage. Holding Shift jumps a coarse whole second for quick scanning.
export const FRAME_STEP_SEC = 1 / 30;
export const COARSE_STEP_SEC = 1;
