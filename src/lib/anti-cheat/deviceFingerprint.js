/**
 * 🔒 DEVICE FINGERPRINT — Lightweight client-side fingerprinting
 * ═══════════════════════════════════════════════════════════════
 * 
 * Generates a stable device fingerprint hash from browser properties.
 * No external dependencies — uses canvas, WebGL, and browser attributes.
 * 
 * NOT a privacy tracker — used solely for anti-cheat multi-accounting
 * detection within Club Arena poker tables.
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * Generate a device fingerprint hash.
 * @returns {Promise<string>} Hex hash string
 */
export async function getDeviceFingerprint() {
  if (typeof window === 'undefined') return null;

  try {
    const components = [
      getScreenFingerprint(),
      getTimezoneFingerprint(),
      getCanvasFingerprint(),
      getWebGLFingerprint(),
      getAudioFingerprint(),
      getBrowserFingerprint(),
    ];

    const raw = components.filter(Boolean).join('|||');
    return await hashString(raw);
  } catch (err) {
    console.warn('[Fingerprint] Error:', err.message);
    return null;
  }
}

/**
 * Get GPS coordinates (with user permission).
 * Returns null if geolocation unavailable or denied.
 * @param {number} [timeoutMs=5000] - Max time to wait for GPS
 * @returns {Promise<{lat: number, lng: number} | null>}
 */
export function getGPSLocation(timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (!navigator?.geolocation) return resolve(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      }),
      () => resolve(null), // Permission denied or error
      { timeout: timeoutMs, enableHighAccuracy: false, maximumAge: 300000 }
    );
  });
}

// ─── Component generators ───────────────────────────────────

function getScreenFingerprint() {
  const s = window.screen;
  return `${s.width}x${s.height}x${s.colorDepth}|${s.availWidth}x${s.availHeight}|${window.devicePixelRatio}`;
}

function getTimezoneFingerprint() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone + '|' + new Date().getTimezoneOffset();
  } catch {
    return String(new Date().getTimezoneOffset());
  }
}

function getCanvasFingerprint() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Draw text with specific styling
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('SmarterPoker🃏', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('AntiCheat', 4, 35);

    return canvas.toDataURL().slice(-50); // Last 50 chars are unique enough
  } catch {
    return null;
  }
}

function getWebGLFingerprint() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return null;

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : '';
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';

    return `${vendor}|${renderer}`;
  } catch {
    return null;
  }
}

function getAudioFingerprint() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    return `${ctx.sampleRate}|${ctx.destination.maxChannelCount}`;
  } catch {
    return null;
  }
}

function getBrowserFingerprint() {
  const nav = navigator;
  return [
    nav.language,
    nav.languages?.join(','),
    nav.hardwareConcurrency,
    nav.maxTouchPoints,
    nav.platform,
    nav.userAgent?.length, // Just length, not full UA
  ].join('|');
}

// ─── Hash utility ───────────────────────────────────────────

async function hashString(str) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback: simple hash
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}
