package worker

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"

	"github.com/f0reachARR/soiree/internal/db/sqlc"
)

// PlanHLSArgs is the payload for video.hls.plan jobs.
type PlanHLSArgs struct {
	VideoID string `json:"videoId"`
}

func (PlanHLSArgs) Kind() string { return "video.hls.plan" }

func (PlanHLSArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue: QueueDefault,
		UniqueOpts: river.UniqueOpts{
			ByArgs:   true,
			ByPeriod: 24 * time.Hour,
		},
	}
}

// PlanHLSWorker decides which renditions to produce for a video, creates the
// video_renditions rows, and enqueues one encode_variant job per rendition.
type PlanHLSWorker struct {
	river.WorkerDefaults[PlanHLSArgs]
	Q       *sqlc.Queries
	Manager *Manager
}

// renditionSpec describes a target rendition. Bitrates are pre-baked here so
// the encode worker doesn't need to know about codec tuning.
type renditionSpec struct {
	kind         sqlc.RenditionKind
	height       int32 // target height; width follows the source aspect
	videoBitrate string
	audioBitrate string
	bandwidthBps int32 // advertised in master playlist (video + audio)
}

var renditionsAscending = []renditionSpec{
	{kind: sqlc.RenditionKind480p, height: 480, videoBitrate: "1200k", audioBitrate: "128k", bandwidthBps: 1_400_000},
	{kind: sqlc.RenditionKind720p, height: 720, videoBitrate: "2500k", audioBitrate: "128k", bandwidthBps: 2_800_000},
	{kind: sqlc.RenditionKind1080p, height: 1080, videoBitrate: "4500k", audioBitrate: "128k", bandwidthBps: 5_000_000},
}

func (w *PlanHLSWorker) Work(ctx context.Context, job *river.Job[PlanHLSArgs]) error {
	id, err := uuid.Parse(job.Args.VideoID)
	if err != nil {
		return fmt.Errorf("invalid videoId: %w", err)
	}
	pgID := pgtype.UUID{Bytes: id, Valid: true}

	v, err := w.Q.GetVideo(ctx, pgID)
	if err != nil {
		return fmt.Errorf("get video: %w", err)
	}
	if v.SourceWidth == nil || v.SourceHeight == nil {
		return errors.New("source dimensions not yet set; probe must run first")
	}

	srcH := *v.SourceHeight
	srcW := *v.SourceWidth

	// Build the rendition ladder, capped at 1080p. Sources taller than 1080p
	// are downscaled to the standard 1080p tier (no full-resolution variant).
	// Sources at or below 1080p keep their native resolution as a single top
	// variant, labeled "original".
	capH := srcH
	if capH > 1080 {
		capH = 1080
	}

	var specs []renditionSpec
	// Standard downscale tiers strictly below the capped source height.
	for _, s := range renditionsAscending {
		if s.height < capH {
			specs = append(specs, s)
		}
	}
	// Top variant at the capped height.
	if srcH >= 1080 {
		// renditionsAscending is sorted ascending, so the last entry is the
		// 1080p cap tier.
		specs = append(specs, renditionsAscending[len(renditionsAscending)-1])
	} else {
		// Native source resolution (below 1080p), kept as the "original" variant.
		specs = append(specs, renditionSpec{
			kind:         sqlc.RenditionKindOriginal,
			height:       srcH,
			bandwidthBps: estimateOriginalBandwidth(srcW, srcH),
		})
	}

	if _, err := w.Q.UpdateVideoHLSStatus(ctx, sqlc.UpdateVideoHLSStatusParams{
		ID:        pgID,
		HLSStatus: sqlc.HlsStatusEncoding,
	}); err != nil {
		return fmt.Errorf("set hls_status=encoding: %w", err)
	}

	for _, s := range specs {
		width, height := dimensionsFor(s, srcW, srcH)
		bw := s.bandwidthBps
		playlistKey := fmt.Sprintf("hls/%s/%s/playlist.m3u8", v.ID.String(), string(s.kind))

		// We always re-encode. `-c copy` passthrough is intentionally disabled:
		// it produced fragile playlists for some source codecs/profiles.
		rend, err := w.Q.InsertRendition(ctx, sqlc.InsertRenditionParams{
			VideoID:      pgID,
			Kind:         s.kind,
			Passthrough:  false,
			Width:        width,
			Height:       height,
			BandwidthBps: &bw,
			PlaylistKey:  playlistKey,
		})
		if err != nil {
			return fmt.Errorf("insert rendition %s: %w", s.kind, err)
		}
		if err := w.Manager.EnqueueEncodeVariant(ctx, v.ID.String(), rend.ID.String()); err != nil {
			return fmt.Errorf("enqueue encode_variant %s: %w", s.kind, err)
		}
		slog.Info("hls rendition planned", "videoId", v.ID.String(), "kind", s.kind, "passthrough", rend.Passthrough, "width", width, "height", height)
	}
	return nil
}

func dimensionsFor(spec renditionSpec, srcW, srcH int32) (w, h int32) {
	// keep aspect ratio: width = round_even(srcW * targetH / srcH)
	if srcH == 0 {
		return srcW, spec.height
	}
	w64 := int64(srcW) * int64(spec.height) / int64(srcH)
	if w64%2 == 1 {
		w64++
	}
	return int32(w64), spec.height
}

// estimateOriginalBandwidth is a rough cap used in the master playlist
// BANDWIDTH attribute for the native-resolution "original" variant, which is
// always at or below 1080p. We don't know the source's actual encoded bitrate
// without re-probing, so this tracks the height-based encode target.
func estimateOriginalBandwidth(w, h int32) int32 {
	pixels := int64(w) * int64(h)
	switch {
	case pixels >= 1280*720:
		return 3_500_000
	case pixels >= 854*480:
		return 1_800_000
	default:
		return 1_100_000
	}
}
