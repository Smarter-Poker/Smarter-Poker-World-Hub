/**
 * Lightweight, zero-bloat SEO conversion funnel telemetry helper.
 *
 * Uses active window.posthog when already initialized, or falls back to a tiny
 * non-blocking navigator.sendBeacon call to PostHog's capture endpoint so
 * conversion clicks (which immediately navigate to OAuth or /auth/signup) are
 * never dropped mid-redirect and never pull 190KB of SDK JS into SEO pages.
 */

const POSTHOG_CAPTURE_URL = 'https://us.i.posthog.com/capture/';
const SESSION_ID_KEY = 'sp_seo_funnel_sid_v1';

function getSessionDistinctId() {
  if (typeof window === 'undefined') return 'anon';
  try {
    let sid = window.sessionStorage.getItem(SESSION_ID_KEY);
    if (!sid) {
      sid = `seo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem(SESSION_ID_KEY, sid);
    }
    return sid;
  } catch (_) {
    return 'seo_anon';
  }
}

export function trackSeoFunnelEvent(event, properties = {}) {
  if (typeof window === 'undefined') return;
  try {
    if (window.navigator?.doNotTrack === '1' || window.doNotTrack === '1') return;
    const payloadProps = {
      ...properties,
      $current_url: window.location?.href || '',
      $pathname: window.location?.pathname || '',
      $referrer: typeof document !== 'undefined' ? document.referrer || '' : '',
    };

    if (window.posthog && typeof window.posthog.capture === 'function') {
      window.posthog.capture(event, payloadProps);
      return;
    }

    const key = (process.env.NEXT_PUBLIC_POSTHOG_KEY || process.env.NEXT_PUBLIC_GUIDE_POSTHOG_KEY || '').trim();
    if (!key) return;

    const body = JSON.stringify({
      api_key: key,
      event,
      distinct_id: getSessionDistinctId(),
      properties: payloadProps,
    });

    if (typeof window.navigator?.sendBeacon === 'function') {
      window.navigator.sendBeacon(
        POSTHOG_CAPTURE_URL,
        new Blob([body], { type: 'application/json' }),
      );
    }
  } catch (_) {
    /* telemetry must never disrupt user conversion flow */
  }
}
