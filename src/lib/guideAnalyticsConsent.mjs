// Only explicit, session-scoped consent may load this isolated guide SDK.
const CHOICE = 'smarter-guide-analytics';
const SAFE = new Set(['topic', 'language', 'source', 'destination', 'helpful', '$session_id', 'distinct_id', '$process_person_profile']);
export function privacyAllows(browser) {
  return !!browser && String(browser.navigator?.doNotTrack) !== '1'
    && String(browser.doNotTrack) !== '1' && browser.navigator?.globalPrivacyControl !== true;
}
export function guideConsent(browser = globalThis.window) {
  try { return privacyAllows(browser) && browser.sessionStorage.getItem(CHOICE) === 'yes'; } catch { return false; }
}
export function sanitizeGuideCapture(event) {
  if (!event || !/^business_hub_(guide_view|destination_click|feedback|goal_selected|draft_prepared)$/.test(event.event)) return null;
  return { ...event, properties: Object.fromEntries(Object.entries(event.properties || {}).filter(([key]) => SAFE.has(key))) };
}
export async function enableGuideAnalytics(browser = globalThis.window, load = () => import('posthog-js'), key = process.env.NEXT_PUBLIC_GUIDE_POSTHOG_KEY) {
  if (!privacyAllows(browser) || !key?.trim()) return false;
  try {
    browser.sessionStorage.setItem(CHOICE, 'yes');
    if (!browser.smarterGuideAnalytics) {
      const sdk = (await load()).default;
      // Consent might have been withdrawn while the package was loading.
      if (!guideConsent(browser)) return false;
      if (!browser.smarterGuideAnalytics) browser.smarterGuideAnalytics = sdk.init(key.trim(), {
        api_host: 'https://us.i.posthog.com', defaults: '2026-08-30',
        persistence: 'sessionStorage', person_profiles: 'never',
        autocapture: false, capture_pageview: false, capture_pageleave: false,
        disable_session_recording: true, disable_surveys: true,
        advanced_disable_feature_flags: true, respect_dnt: true,
        opt_out_capturing_by_default: true, before_send: sanitizeGuideCapture,
      }, 'smarter_guide');
    }
    if (!guideConsent(browser)) return false;
    browser.smarterGuideAnalytics?.opt_in_capturing({ captureEventName: false });
    browser.smarterGuideConsentGranted = browser.smarterGuideAnalytics?.has_opted_in_capturing() === true;
    return browser.smarterGuideConsentGranted;
  } catch { return false; }
}
export function disableGuideAnalytics(browser = globalThis.window) {
  try {
    browser.smarterGuideConsentGranted = false;
    browser.sessionStorage.removeItem(CHOICE);
    browser.smarterGuideAnalytics?.opt_out_capturing();
    browser.smarterGuideAnalytics?.reset();
  } catch { /* A blocked store or SDK cannot block the guide. */ }
}
