/**
 * ════════════════════════════════════════════════════════════════════════
 *  CLIPBOARD UTIL (phase 41 / bug-hunt-zero)
 *  Reliable copy-to-clipboard with fallback for non-secure contexts.
 * ════════════════════════════════════════════════════════════════════════
 *
 * Why this exists:
 *   navigator.clipboard.writeText is HTTPS-only and rejects in:
 *     (a) non-secure contexts (iframes, plain-http, http://<IP>)
 *     (b) when the user hasn't granted clipboard permission
 *     (c) when document is not focused
 *   The naive "fire it and set copied=true" pattern lies to the user: they
 *   see "Copied!" while their clipboard holds whatever was in it before.
 *   This util awaits the promise, falls back to execCommand('copy'), and
 *   returns a Promise<boolean> so callers can show real feedback.
 *
 *   Returns true on success, false on total failure (both paths exhausted).
 *   Caller should toast/alert the actual value on failure so the user can
 *   copy manually.
 */
export async function safeCopyToClipboard(text) {
  if (text == null) return false;
  const str = String(text);
  // Primary path: async clipboard API.
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(str);
      return true;
    }
  } catch (_err) {
    // Permission denied / not focused / not secure context — try fallback.
  }
  // Fallback: execCommand('copy') via off-screen textarea. Deprecated but
  // widely supported and works in non-secure contexts where the async
  // clipboard API doesn't.
  try {
    if (typeof document === 'undefined') return false;
    const ta = document.createElement('textarea');
    ta.value = str;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok = false;
    try { ok = document.execCommand && document.execCommand('copy'); } catch (_e2) { ok = false; }
    document.body.removeChild(ta);
    return !!ok;
  } catch (_err) {
    return false;
  }
}

export default safeCopyToClipboard;
