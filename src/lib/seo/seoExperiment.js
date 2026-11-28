/**
 * Zero-dependency SEO CRO experiment bucketing & AI search referral welcome helper.
 *
 * Strictly zero imports so _app.js-reachable conversion surfaces never pull in
 * src/lib/analytics.js or heavy SDK bundles.
 *
 * House style: Title Case UI strings, zero em dashes, zero en dashes.
 */

export const SEO_OFFER_EXPERIMENT_KEY = 'sp_seo_exp_v1';
export const AI_WELCOME_SESSION_KEY = 'sp_ai_welcome_v1';
export const SEO_OFFER_VARIANTS = Object.freeze(['control-gto', 'welcome-vip-500']);

export const AI_WELCOME_ENGINES = Object.freeze([
  {
    engine: 'chatgpt',
    label: 'ChatGPT',
    hosts: ['chatgpt.com', 'chat.openai.com'],
    utmAliases: ['chatgpt', 'chatgpt.com', 'openai'],
  },
  {
    engine: 'perplexity',
    label: 'Perplexity',
    hosts: ['perplexity.ai', 'labs.perplexity.ai'],
    utmAliases: ['perplexity', 'perplexity.ai'],
  },
  {
    engine: 'claude',
    label: 'Claude',
    hosts: ['claude.ai'],
    utmAliases: ['claude', 'claude.ai', 'anthropic'],
  },
  {
    engine: 'gemini',
    label: 'Gemini',
    hosts: ['gemini.google.com', 'bard.google.com', 'aistudio.google.com'],
    utmAliases: ['gemini', 'gemini.google.com'],
  },
]);

function isValidVariant(value) {
  return value === 'control-gto' || value === 'welcome-vip-500';
}

function getEngineByKey(engineKey) {
  const normalized = String(engineKey || '').trim().toLowerCase();
  return AI_WELCOME_ENGINES.find((item) => item.engine === normalized) || null;
}

function buildAiWelcomePayload(rule, signal) {
  return {
    engine: rule.engine,
    label: rule.label,
    signal,
    eyebrow: `Welcome From ${rule.label} - Run Live GTO Solvers Free`,
    barCopy: `From ${rule.label}? Run Live GTO Solvers & Save Ranges Free`,
  };
}

function parseReferrerHost(referrer) {
  if (!referrer || typeof referrer !== 'string') return '';
  try {
    const parsed = new URL(referrer.trim());
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch (_) {
    return '';
  }
}

/**
 * Pure detector for ChatGPT, Perplexity, Claude, and Gemini referrals via
 * referrer hostname or explicit utm_source query parameter.
 */
export function detectAiWelcomeEngine({ referrer = '', search = '' } = {}) {
  const host = parseReferrerHost(referrer);
  if (host) {
    for (const rule of AI_WELCOME_ENGINES) {
      if (rule.hosts.some((h) => host === h || host.endsWith(`.${h}`))) {
        return buildAiWelcomePayload(rule, 'referrer');
      }
    }
  }

  let utmSource = '';
  try {
    const params = new URLSearchParams(String(search || ''));
    utmSource = String(params.get('utm_source') || '')
      .trim()
      .toLowerCase()
      .replace(/^www\./, '');
  } catch (_) {
    utmSource = '';
  }

  if (utmSource) {
    for (const rule of AI_WELCOME_ENGINES) {
      if (rule.utmAliases.includes(utmSource)) {
        return buildAiWelcomePayload(rule, 'utm_source');
      }
    }
  }

  return null;
}

/**
 * Deterministic per-session A/B bucket between 'control-gto' and 'welcome-vip-500'.
 * Persists in sessionStorage under sp_seo_exp_v1 so every conversion surface in the
 * same session renders a consistent offer framing and reports identical telemetry.
 */
export function getSeoOfferExperiment(options = {}) {
  const storage =
    options?.storage ||
    (typeof window !== 'undefined' ? window.sessionStorage : null);
  const search =
    typeof options?.search === 'string'
      ? options.search
      : typeof window !== 'undefined'
        ? window.location?.search || ''
        : '';

  if (search) {
    try {
      const forced = String(new URLSearchParams(search).get('sp_exp') || '').trim();
      if (isValidVariant(forced)) {
        try {
          storage?.setItem(SEO_OFFER_EXPERIMENT_KEY, forced);
        } catch (_) {
          /* ignore storage quota/privacy mode */
        }
        return forced;
      }
    } catch (_) {
      /* ignore malformed search */
    }
  }

  if (storage) {
    try {
      const existing = storage.getItem(SEO_OFFER_EXPERIMENT_KEY);
      if (isValidVariant(existing)) return existing;
    } catch (_) {
      /* ignore storage restrictions */
    }
  }

  if (typeof window === 'undefined' && !options?.storage && typeof options?.randomFn !== 'function') {
    return 'control-gto';
  }

  let chosen = 'control-gto';
  try {
    const rand = typeof options?.randomFn === 'function' ? options.randomFn() : Math.random();
    chosen = rand < 0.5 ? 'control-gto' : 'welcome-vip-500';
  } catch (_) {
    chosen = 'control-gto';
  }

  if (storage) {
    try {
      storage.setItem(SEO_OFFER_EXPERIMENT_KEY, chosen);
    } catch (_) {
      /* ignore storage restrictions */
    }
  }

  return chosen;
}

/**
 * Returns tailored AI welcome context when the visitor arrived from ChatGPT,
 * Perplexity, Claude, or Gemini (persisted per session across page navigation).
 */
export function getAiWelcomeContext(options) {
  if (options && (typeof options.referrer === 'string' || typeof options.search === 'string')) {
    return detectAiWelcomeEngine(options);
  }

  if (typeof window === 'undefined') return null;

  const detected = detectAiWelcomeEngine({
    referrer: typeof document !== 'undefined' ? document.referrer || '' : '',
    search: window.location?.search || '',
  });

  if (detected) {
    try {
      window.sessionStorage?.setItem(AI_WELCOME_SESSION_KEY, detected.engine);
    } catch (_) {
      /* ignore storage restrictions */
    }
    return detected;
  }

  try {
    const cachedEngine =
      window.sessionStorage?.getItem(AI_WELCOME_SESSION_KEY) ||
      window.sessionStorage?.getItem('sp:ai-referral-recorded') ||
      '';
    const rule = getEngineByKey(cachedEngine);
    if (rule) {
      return buildAiWelcomePayload(rule, 'session');
    }
  } catch (_) {
    /* ignore storage restrictions */
  }

  return null;
}
