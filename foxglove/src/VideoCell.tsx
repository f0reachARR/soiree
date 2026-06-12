import Hls from "hls.js";
import { ReactElement, useEffect, useRef } from "react";

import type { PlaybackUrl, RunVideo } from "./api";
import type { VideoSyncTarget } from "./sync";

type Props = {
  runVideo: RunVideo;
  playback?: PlaybackUrl;
  // Session cookie value replayed as X-Soiree-Session on every HLS XHR. The
  // master playlist and variant segments live behind the same auth wall as the
  // REST API, but hls.js builds its own XHRs and won't inherit ours.
  sessionToken: string;
  target?: VideoSyncTarget;
  // True when we believe the Foxglove timeline is currently advancing.
  bagPlaying: boolean;
  isMain: boolean;
  onPromote: () => void;
};

// Hard re-seek above this; below this we let the video play naturally and
// catch up via small playbackRate adjustments. 0.5s is generous enough that
// HLS segment-aligned seeks aren't constantly thrashing.
const HARD_SEEK_THRESHOLD_SEC = 0.5;

// Below this drift we only nudge via playbackRate so the picture doesn't
// jump on every render.
const RATE_NUDGE_THRESHOLD_SEC = 0.08;

export function VideoCell({
  runVideo,
  playback,
  sessionToken,
  target,
  bagPlaying,
  isMain,
  onPromote,
}: Props): ReactElement {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Attach (re-attach) the source whenever the playback URL changes.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playback) {
      return undefined;
    }
    if (playback.kind === "hls") {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          xhrSetup: (xhr) => {
            if (sessionToken) {
              xhr.setRequestHeader("X-Soiree-Session", sessionToken);
            }
          },
        });
        hls.loadSource(playback.url);
        hls.attachMedia(video);
        hlsRef.current = hls;
        return () => {
          hls.destroy();
          hlsRef.current = null;
        };
      }
      // Safari / native HLS fallback. Native HLS can't carry custom headers,
      // so this path will only work if the proxy accepts a cookie of the same
      // origin or the user is in a Foxglove build where the panel iframe
      // shares cookies with the Soiree app.
      video.src = playback.url;
      return () => {
        video.removeAttribute("src");
        video.load();
      };
    }
    // MP4 fallback: the API returns a presigned S3 URL, so no auth header
    // is needed on the playback URL itself.
    video.src = playback.url;
    return () => {
      video.removeAttribute("src");
      video.load();
    };
  }, [playback, sessionToken]);

  // Sync video position with the bag's current time. We deliberately run this
  // on every render — props change at the Foxglove render cadence — instead of
  // installing a private RAF loop.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !target) {
      return;
    }
    if (!target.inRange) {
      if (!video.paused) {
        video.pause();
      }
      if (video.playbackRate !== 1) {
        video.playbackRate = 1;
      }
      return;
    }
    const drift = video.currentTime - target.videoTime;
    if (Math.abs(drift) > HARD_SEEK_THRESHOLD_SEC) {
      video.currentTime = target.videoTime;
      video.playbackRate = 1;
    } else if (bagPlaying && Math.abs(drift) > RATE_NUDGE_THRESHOLD_SEC) {
      // drift > 0 → video is ahead, slow it down a touch.
      video.playbackRate = drift > 0 ? 0.9 : 1.1;
    } else if (video.playbackRate !== 1) {
      video.playbackRate = 1;
    }
    if (bagPlaying) {
      if (video.paused) {
        void video.play().catch(() => {
          // Autoplay can fail until the panel has user gesture; ignore — the
          // next render will retry.
        });
      }
    } else if (!video.paused) {
      video.pause();
    }
  });

  const label = runVideo.angleLabel.trim() || "(no angle)";
  const outOfRange = target ? !target.inRange : false;

  return (
    <div
      onClick={onPromote}
      style={{
        position: "relative",
        background: "#000",
        cursor: "pointer",
        outline: isMain ? "2px solid #4dabf7" : "1px solid #333",
        outlineOffset: -1,
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          background: "#000",
          display: "block",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 6,
          bottom: 6,
          padding: "2px 6px",
          fontSize: 11,
          background: "rgba(0,0,0,0.6)",
          color: "#fff",
          borderRadius: 3,
          pointerEvents: "none",
        }}
      >
        {label}
      </div>
      {outOfRange && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.55)",
            color: "#aaa",
            fontSize: 12,
            pointerEvents: "none",
          }}
        >
          out of range
        </div>
      )}
    </div>
  );
}
