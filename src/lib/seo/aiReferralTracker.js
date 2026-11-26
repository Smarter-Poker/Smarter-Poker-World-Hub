/**
 * First-Party AI Answer-Engine Referral & GEO Attribution Tracker
 *
 * Detects inbound human landings referred by AI answer engines (ChatGPT,
 * Perplexity, Claude, Copilot, Gemini, Grok, Meta AI, You.com, Phind, Kagi,
 * DeepSeek, Mistral) via document.referrer or explicit AI utm_source.
 *
 * Privacy & performance guarantees:
 * - Zero cookies, zero PII, zero extra third-party scripts, zero CLS.
 * - Respects navigator.doNotTrack === '1'.
 * - Deduplicated once per browser session via sessionStorage.
 * - Reports to both existing first-party PostHog wrapper and
 *   /api/seo/referral-stats (category=ai_referral_visits).
 */

import { capture } from '../analytics.js';

const SESSION_KEY = 'sp:ai-referral-recorded';

export const AI_REFERRER_PATTERNS = Object.freeze([
  { engine: 'chatgpt', hosts: ['chatgpt.com', 'chat.openai.com'], utmAliases: ['chatgpt', 'chatgpt.com', 'openai'] },
  { engine: 'perplexity', hosts: ['perplexity.ai', 'labs.perplexity.ai'], utmAliases: ['perplexity', 'perplexity.ai'] },
  { engine: 'claude', hosts: ['claude.ai'], utmAliases: ['claude', 'claude.ai', 'anthropic'] },
  { engine: 'copilot', hosts: ['copilot.microsoft.com', 'edgeservices.bing.com'], utmAliases: ['copilot', 'copilot.microsoft.com'] },
  { engine: 'gemini', hosts: ['gemini.google.com', 'bard.google.com', 'aistudio.google.com'], utmAliases: ['gemini', 'gemini.google.com'] },
  { engine: 'grok', hosts: ['grok.com', 'x.ai'], utmAliases: ['grok', 'grok.com', 'xai'] },
  { engine: 'meta_ai', hosts: ['meta.ai'], utmAliases: ['meta.ai', 'meta-ai', 'meta_ai'] },
  { engine: 'you', hosts: ['you.com'], utmAliases: ['you.com', 'youcom'] },
  { engine: 'phind', hosts: ['phind.com'], utmAliases: ['phind', 'phind.com'] },
  { engine: 'kagi', hosts: ['kagi.com'], utmAliases: ['kagi', 'kagi.com'] },
  { engine: 'deepseek', hosts: ['chat.deepseek.com', 'deepseek.com'], utmAliases: ['deepseek', 'deepseek.com'] },
  { engine: 'mistral', hosts: ['chat.mistral.ai', 'mistral.ai'], utmAliases: ['mistral', 'mistral.ai'] },
]);

export function parseReferrerHost(referrer) {
  if (!referrer || typeof referrer !== 'string') return '';
  try {
    const parsed = new URL(referrer.trim());
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function detectAiReferral({ referrer = '', search = '' } = {}) {
  const host = parseReferrerHost(referrer);
  if (host) {
    for (const rule of AI_REFERRER_PATTERNS) {
      if (rule.hosts.some((h) => host === h || host.endsWith(`.${h}`))) {
        return {
          engine: rule.engine,
          referrerHost: host,
          signal: 'referrer',
          utmSource: null,
        };
      }
    }
  }

  let utmSource = '';
  try {
    const params = new URLSearchParams(String(search || ''));
    utmSource = String(params.get('utm_source') || '').trim().toLowerCase().replace(/^www\./, '');
  } catch {
    utmSource = '';
  }

  if (utmSource) {
    for (const rule of AI_REFERRER_PATTERNS) {
      if (rule.utmAliases.includes(utmSource)) {
        return {
          engine: rule.engine,
          referrerHost: host || null,
          signal: 'utm_source',
          utmSource,
        };
      }
    }
  }

  return null;
}

export function classifyLandingSurface(pathname = '/') {
  const path = String(pathname || '/').split('?')[0];
  if (path === '/') return 'home';
  if (path.startsWith('/tools')) return 'tools';
  if (path.startsWith('/learn')) return 'learn';
  if (path.startsWith('/research')) return 'research';
  if (path.startsWith('/poker-rooms')) return 'poker-rooms';
  if (path.startsWith('/compare')) return 'compare';
  if (path.startsWith('/rules') || path.startsWith('/games')) return 'rules-games';
  if (path.startsWith('/hub/venues') || path.startsWith('/hub/poker-near-me')) return 'venues';
  if (path.startsWith('/hub/poker-series') || path.startsWith('/hub/series') || path.startsWith('/hub/poker-tours') || path.startsWith('/hub/tours')) return 'tournaments';
  if (path.startsWith('/hub/video-library')) return 'videos';
  if (path.startsWith('/hub/home-games')) return 'home-games';
  return 'other';
}

export function recordAiReferralVisit() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  try {
    if (navigator?.doNotTrack === '1' || window?.doNotTrack === '1') return null;
  } catch {
    // Ignore DNT access errors
  }

  try {
    if (window.sessionStorage?.getItem(SESSION_KEY)) return null;
  } catch {
    // Private browsing or blocked storage
  }

  const detected = detectAiReferral({
    referrer: document.referrer || '',
    search: window.location?.search || '',
  });
  if (!detected) return null;

  const landingPath = String(window.location?.pathname || '/').slice(0, 120);
  const surface = classifyLandingSurface(landingPath);

  try {
    window.sessionStorage?.setItem(SESSION_KEY, detected.engine);
  } catch {
    // Ignore storage quota errors
  }

  try {
    capture('ai_referral_landing', {
      ai_engine: detected.engine,
      referrer_host: detected.referrerHost || '',
      detection_signal: detected.signal,
      utm_source: detected.utmSource || '',
      landing_path: landingPath,
      landing_surface: surface,
    });
  } catch {
    // Never break page hydration
  }

  try {
    if (typeof fetch === 'function') {
      const qs = new URLSearchParams({
        event: 'record',
        category: 'ai_referral_visits',
        item: `${detected.engine}:${surface}`,
        source: detected.signal,
        engine: detected.engine,
      });
      fetch(`/api/seo/referral-stats?${qs.toString()}`, {
        method: 'POST',
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Never break page hydration
  }

  return {
    ...detected,
    landingPath,
    surface,
  };
}
