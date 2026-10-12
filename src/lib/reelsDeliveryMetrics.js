import { dataSaverEnabled, REELS_MOBILE_BUDGETS } from './reelsDeliveryContract.mjs';

let sessionEventCount = 0;

export async function recordReelsDeliveryMetric({ surface, feedMode, startupMs, swipeMs, stallMs, stallCount, kind = 'startup', observedSince = 0, dataSaver, playbackType = 'unknown', video } = {}) {
  if (typeof window === 'undefined') return;
  if (sessionEventCount >= REELS_MOBILE_BUDGETS.maxTelemetryEventsPerSession) return;
  sessionEventCount += 1;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const quality = video?.getVideoPlaybackQuality?.();
  const memory = performance?.memory?.usedJSHeapSize;
  const transferred = observableTransferredBytes(performance.getEntriesByType?.('resource') || [], video?.currentSrc, observedSince);
  // Battery access is optional and can remain pending indefinitely on devices.
  const batteryLevel = null;
  const body = {
    surface,
    event_kind: ['startup', 'swipe', 'summary'].includes(kind) ? kind : 'startup',
    swipe_ms: finiteMeasurement(swipeMs),
    stall_ms: finiteMeasurement(stallMs),
    stall_count: finiteMeasurement(stallCount),
    transfer_observable: transferred !== null,
    data_budget_exceeded: transferred === null ? null : transferred > 6_000_000,
    feed_mode: feedMode,
    viewport_width: window.innerWidth,
    startup_ms: finiteMeasurement(startupMs),
    dropped_frames: quality?.droppedVideoFrames ?? video?.webkitDroppedFrameCount ?? null,
    decoded_frames: quality?.totalVideoFrames ?? video?.webkitDecodedFrameCount ?? null,
    memory_mb: Number.isFinite(memory) ? Math.round(memory / 10485.76) / 100 : null,
    transferred_kb: Number.isFinite(transferred) ? Math.round(transferred / 10.24) / 100 : null,
    battery_level: batteryLevel,
    data_saver: dataSaverEnabled({ connection, persisted: dataSaver }),
    playback_type: playbackType,
  };
  void fetch('/api/reels/delivery-metrics', {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {});
}


export function finiteMeasurement(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

/** Cross-origin zero timing sizes are unknown, not free video delivery. */
export function observableTransferredBytes(entries, mediaUrl, since = 0) {
  if (!mediaUrl) return null;
  const media = entries.filter(entry => entry.name === mediaUrl && entry.startTime >= since);
  if (!media.length || media.some(entry => !(entry.transferSize > 0 || entry.decodedBodySize > 0))) return null;
  return media.reduce((sum, entry) => sum + entry.transferSize, 0);
}

/** Event-owned measurements; no polling, retries or playback commands. */
export function createReelsPlaybackMeasurement({ now = () => performance.now(), onMetric = () => {} } = {}) {
  let active = null;
  let stalledAt = null;
  const elapsed = start => Math.max(0, now() - start);
  const finishStall = () => {
    if (active && stalledAt !== null) {
      active.stallMs += elapsed(stalledAt);
      stalledAt = null;
    }
  };
  return {
    select({ reelId, playbackType = 'unknown', transition = false } = {}) {
      active = { reelId, playbackType, selectedAt: now(), observedSince: now(), transition, startupMs: null, swipeMs: null, stallMs: 0, stallCount: 0, started: false };
      stalledAt = null;
    },
    playing(reelId) {
      if (!active || active.reelId !== reelId) return;
      finishStall();
      if (active.started) return;
      active.started = true;
      active.startupMs = elapsed(active.selectedAt);
      if (active.transition) active.swipeMs = active.startupMs;
      onMetric({ ...active, kind: active.transition ? 'swipe' : 'startup' });
    },
    waiting(reelId) {
      if (!active || active.reelId !== reelId || !active.started || stalledAt !== null) return;
      stalledAt = now();
      active.stallCount++;
    },
    pause(reelId) {
      if (!active || active.reelId !== reelId) return;
      finishStall();
    },
    finish(reelId) {
      if (!active || active.reelId !== reelId) return null;
      finishStall();
      const result = { ...active, kind: 'summary', observedMs: elapsed(active.selectedAt), startupBudgetExceeded: active.startupMs === null ? null : active.startupMs > REELS_MOBILE_BUDGETS.startupMs };
      active = null;
      onMetric(result);
      return result;
    },
  };
}
