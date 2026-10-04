import { dataSaverEnabled, REELS_MOBILE_BUDGETS } from './reelsDeliveryContract.mjs';

let sessionEventCount = 0;

export async function recordReelsDeliveryMetric({ surface, feedMode, startupMs, playbackType = 'unknown', video } = {}) {
  if (typeof window === 'undefined') return;
  if (sessionEventCount >= REELS_MOBILE_BUDGETS.maxTelemetryEventsPerSession) return;
  sessionEventCount += 1;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const quality = video?.getVideoPlaybackQuality?.();
  const memory = performance?.memory?.usedJSHeapSize;
  const transferred = performance.getEntriesByType?.('resource')
    ?.filter((entry) => /(?:\/api\/reels\/feed|youtube|video)/i.test(entry.name || ''))
    .reduce((sum, entry) => sum + (Number(entry.transferSize) || 0), 0);
  let batteryLevel = null;
  try { batteryLevel = (await navigator.getBattery?.())?.level ?? null; } catch (_) { /* unsupported */ }
  const body = {
    surface,
    feed_mode: feedMode,
    viewport_width: window.innerWidth,
    startup_ms: Math.max(0, Math.round(Number(startupMs) || 0)),
    dropped_frames: quality?.droppedVideoFrames ?? video?.webkitDroppedFrameCount ?? null,
    decoded_frames: quality?.totalVideoFrames ?? video?.webkitDecodedFrameCount ?? null,
    memory_mb: Number.isFinite(memory) ? Math.round(memory / 10485.76) / 100 : null,
    transferred_kb: Number.isFinite(transferred) ? Math.round(transferred / 10.24) / 100 : null,
    battery_level: batteryLevel,
    data_saver: dataSaverEnabled({ connection }),
    playback_type: playbackType,
  };
  void fetch('/api/reels/delivery-metrics', {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {});
}
