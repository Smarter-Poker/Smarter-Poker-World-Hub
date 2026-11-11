// Guide interactions describe intent and feedback, never completed onboarding.
// Use only an existing, explicitly consented SDK. This module loads no SDK.
export const BUSINESS_HUB_GUIDE_VALUES = Object.freeze({
  stage: Object.freeze(['guide_view', 'destination_click', 'feedback']),
  topic: Object.freeze(['training', 'poker_near_me', 'bankroll', 'clubs', 'venues', 'account', 'chips_payments']),
  language: Object.freeze(['en', 'es']),
  source: Object.freeze(['business_hub', 'help', 'direct']),
  destination: Object.freeze(['training', 'poker_near_me', 'bankroll', 'club_arena', 'commander', 'venue_onboarding', 'signup', 'login', 'support']),
});

export function buildBusinessHubGuideEvent(stage, properties = {}) {
  if (!BUSINESS_HUB_GUIDE_VALUES.stage.includes(stage) || !properties || typeof properties !== 'object') return null;
  const safe = {};
  for (const key of ['topic', 'language', 'source']) {
    if (BUSINESS_HUB_GUIDE_VALUES[key].includes(properties[key])) safe[key] = properties[key];
  }
  if (stage === 'destination_click') {
    if (!BUSINESS_HUB_GUIDE_VALUES.destination.includes(properties.destination)) return null;
    safe.destination = properties.destination;
  }
  if (stage === 'feedback') {
    if (typeof properties.helpful !== 'boolean') return null;
    safe.helpful = properties.helpful;
  }
  return { event: `business_hub_${stage}`, properties: safe };
}

/** True means the existing SDK accepted the call, not confirmed delivery. */
export function captureBusinessHubGuideEvent(stage, properties = {}, browser = globalThis.window) {
  try {
    const sdk = browser?.posthog;
    if (!sdk || Array.isArray(sdk) || typeof sdk.capture !== 'function') return false;
    if (String(browser.navigator?.doNotTrack) === '1' || String(browser.doNotTrack) === '1' || browser.navigator?.globalPrivacyControl === true) return false;
    if (typeof sdk.has_opted_in_capturing !== 'function' || sdk.has_opted_in_capturing() !== true) return false;
    if (typeof sdk.has_opted_out_capturing !== 'function' || sdk.has_opted_out_capturing() !== false) return false;
    const payload = buildBusinessHubGuideEvent(stage, properties);
    if (!payload) return false;

    // Session-only attribution can accompany existing subsequent product events.
    // Registration failure must not block the underlying link or feedback UI.
    if (typeof sdk.register_for_session === 'function') {
      const attribution = {};
      for (const key of ['topic', 'language', 'source']) {
        if (payload.properties[key]) attribution[`business_hub_guide_${key}`] = payload.properties[key];
      }
      if (Object.keys(attribution).length) {
        try { sdk.register_for_session(attribution); } catch { /* Best-effort attribution. */ }
      }
    }
    sdk.capture(payload.event, payload.properties);
    return true;
  } catch {
    return false;
  }
}
