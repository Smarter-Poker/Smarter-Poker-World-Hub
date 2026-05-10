/**
 * mediaStreamSingleton — One MediaStream per page session, reused across mounts.
 *
 * Bug 2: "user should only have to enable the microphone and camera one time
 * on mobile and not asked every single time."
 *
 * Root cause: GoLiveModal called getUserMedia() on every open and stopped all
 * tracks on every close. On iOS Safari, even when the OS-level permission is
 * granted, repeatedly stopping tracks and re-acquiring within rapid succession
 * (modal close → reopen) causes the in-page permission UI to re-engage on
 * some iOS versions. The clean fix: cache the MediaStream at module scope,
 * never stop its tracks on component unmount — only on full page navigation
 * away from the streaming surface.
 *
 * API:
 *   acquireMediaStream(opts) → Promise<MediaStream>
 *     Returns the cached stream if its tracks are live; otherwise requests
 *     a fresh stream via getUserMedia. Performs a navigator.permissions
 *     pre-check so we know whether to expect a user prompt.
 *
 *   releaseMediaStream({ force }) → void
 *     Default (force=false): no-op. Component unmount should call this; we
 *     intentionally keep the stream alive so a re-mount within the same
 *     session is silent.
 *     Force=true: stops all tracks and clears the cache. Call this on full
 *     navigation away from the streaming surface (route change, logout) or
 *     when the user explicitly ends their session.
 *
 *   getCachedMediaStream() → MediaStream | null
 *     Synchronous accessor — useful when binding to a <video> element on
 *     mount before await resolves.
 *
 *   getPermissionStatus() → Promise<'granted'|'prompt'|'denied'|'unknown'>
 *     Lets UI show "tap allow when prompted" only when actually expected.
 *
 * Hot-reload safety: in dev, module re-evaluation drops the cache (expected).
 * In production, this module is loaded once per page session.
 */

let cachedStream = null;
let inFlightRequest = null;

/**
 * Returns true if every track on the stream is still live (not ended/muted-by-OS).
 * If any track has ended (e.g. user revoked permission via Safari Settings while
 * the page was backgrounded), the cached stream is unusable and must be replaced.
 */
function streamIsHealthy(stream) {
  if (!stream) return false;
  const tracks = stream.getTracks();
  if (tracks.length === 0) return false;
  return tracks.every((t) => t.readyState === 'live');
}

/**
 * Pre-check via the Permissions API. Returns 'unknown' on browsers that don't
 * implement it (some older Safaris, Firefox for some permissions). Callers
 * use this to decide whether to show "Allow camera and mic when prompted"
 * copy or to skip straight to the spinner.
 */
export async function getPermissionStatus() {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
      return 'unknown';
    }
    // Camera and microphone are queried separately; we surface the worst case.
    const results = await Promise.all([
      navigator.permissions.query({ name: 'camera' }).catch(() => null),
      navigator.permissions.query({ name: 'microphone' }).catch(() => null),
    ]);
    const states = results.filter(Boolean).map((r) => r.state);
    if (states.length === 0) return 'unknown';
    if (states.includes('denied')) return 'denied';
    if (states.includes('prompt')) return 'prompt';
    if (states.every((s) => s === 'granted')) return 'granted';
    return 'unknown';
  } catch (_) {
    return 'unknown';
  }
}

/**
 * Acquire the shared MediaStream. Reuses the cached instance when possible.
 *
 * @param {object} opts
 * @param {MediaStreamConstraints} [opts.constraints] override constraints
 * @returns {Promise<MediaStream>}
 */
export async function acquireMediaStream(opts = {}) {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('getUserMedia is not available in this browser');
  }

  // Reuse cached stream when its tracks are still live
  if (streamIsHealthy(cachedStream)) {
    return cachedStream;
  }

  // Coalesce concurrent calls (e.g. two components requesting on first mount)
  if (inFlightRequest) {
    return inFlightRequest;
  }

  // BUG-FIX-LIVE2-1a: front camera not launching on first mount.
  // facingMode: 'user' is a SOFT preference — on iOS Safari with previously
  // granted permission, the OS sometimes returns the BACK camera anyway.
  // User had to manually flip-then-flip-back to force the front camera.
  // Fix: try facingMode: { exact: 'user' } first (hard constraint that
  // explicitly demands the front camera). If the device rejects 'exact'
  // — some older Safaris error on it — fall back to soft preference.
  //
  // Also dropped width/height constraints. Previously asking for ideal
  // 720x1280 caused devices with native 1080×1920+ sensors to capture at
  // 720p, then CSS objectFit:cover scaled it UP to fill the viewport —
  // the "super zoomed in" symptom. Letting the device pick its native
  // resolution gives a sharper image at the actual aspect.
  const tryAcquireWithFacingMode = async (mode) => {
    const constraints = {
      video: { facingMode: mode },
      audio: true,
    };
    return navigator.mediaDevices.getUserMedia(constraints);
  };

  inFlightRequest = (async () => {
    try {
      let stream;
      try {
        // First try EXACT front camera (hard constraint)
        stream = await tryAcquireWithFacingMode({ exact: 'user' });
      } catch (exactErr) {
        // Fall back to soft preference if exact fails (older Safari, etc.)
        if (opts.constraints) {
          stream = await navigator.mediaDevices.getUserMedia(opts.constraints);
        } else {
          stream = await tryAcquireWithFacingMode('user');
        }
      }
      cachedStream = stream;
      // If a track ends asynchronously (user revokes permission while backgrounded),
      // drop our cache so the next acquire re-requests cleanly.
      stream.getTracks().forEach((t) => {
        t.addEventListener('ended', () => {
          if (cachedStream === stream) cachedStream = null;
        });
      });
      return stream;
    } finally {
      inFlightRequest = null;
    }
  })();

  return inFlightRequest;
}

/**
 * Release the shared MediaStream.
 *
 * Important: by default this is a NO-OP. Component-level cleanup (modal
 * close, view unmount) should call it without arguments — it preserves the
 * cached stream so re-entry doesn't re-prompt.
 *
 * Pass { force: true } only when you genuinely want to release the camera
 * and mic — e.g. on logout, full route change away from the streaming
 * surface, or an explicit "end session" action.
 */
export function releaseMediaStream({ force = false } = {}) {
  if (!force) return;
  if (cachedStream) {
    cachedStream.getTracks().forEach((t) => {
      try { t.stop(); } catch (_) {}
    });
    cachedStream = null;
  }
}

/**
 * Synchronous accessor. Returns the cached stream without triggering any
 * permission flow. Returns null if no cached stream is available.
 */
export function getCachedMediaStream() {
  return streamIsHealthy(cachedStream) ? cachedStream : null;
}

/**
 * Mute or unmute a category of tracks without stopping them. Useful for the
 * "mute" toggle during live broadcast so we don't lose the mic permission
 * grant when the user temporarily silences themselves.
 */
export function setTrackEnabled(kind, enabled) {
  if (!cachedStream) return;
  cachedStream.getTracks()
    .filter((t) => t.kind === kind)
    .forEach((t) => { t.enabled = enabled; });
}
