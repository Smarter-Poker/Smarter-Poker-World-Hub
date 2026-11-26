/**
 * Smarter.Poker Editorial Cleaners
 *
 * Normalizes scraped RSS headlines (fixing screaming ALL-CAPS, enforcing exact
 * poker acronym casing, preserving money tokens, and stripping em dashes) and
 * filters out competitor training/app advertorials and affiliate pitches.
 */

const SMALL_WORDS = new Set([
    'of',
    'in',
    'on',
    'at',
    'to',
    'for',
    'and',
    'or',
    'vs',
    'the',
    'a',
    'an',
]);

const POKER_ACRONYM_MAP = {
    wsopc: 'WSOPC',
    wsop: 'WSOP',
    wpt: 'WPT',
    ept: 'EPT',
    mspt: 'MSPT',
    apt: 'APT',
    hpt: 'HPT',
    rgps: 'RGPS',
    pgt: 'PGT',
    triton: 'Triton',
    nlh: 'NLH',
    plo4: 'PLO4',
    plo5: 'PLO5',
    plo6: 'PLO6',
    plo: 'PLO',
    icm: 'ICM',
    gto: 'GTO',
    ev: 'EV',
    mtt: 'MTT',
    pko: 'PKO',
    shr: 'SHR',
    poy: 'POY',
    gpi: 'GPI',
    vip: 'VIP',
    ai: 'AI',
    usa: 'USA',
    uk: 'UK',
    lapc: 'LAPC',
    lhpo: 'LHPO',
    shrpo: 'SHRPO',
    napt: 'NAPT',
    pca: 'PCA',
    tda: 'TDA',
    iii: 'III',
    ii: 'II',
    iv: 'IV',
};

const POKER_ACRONYM_RE = new RegExp(
    `\\b(${Object.keys(POKER_ACRONYM_MAP).join('|')})(s)?\\b`,
    'gi'
);

// Pluralizable acronyms where trailing "s" is natural (e.g., MTTs, PKOs, VIPs, SHRs)
const PLURAL_ACRONYMS = new Set(['mtt', 'pko', 'vip', 'shr']);

function titleCaseSegment(segment, allowSmallLower) {
    if (!segment) return segment;
    // Preserve money / numeric shorthand tokens such as $2.65M, $600, $25K, 50+
    if (/^\$?\d+(?:[.,]\d+)*(?:[kmbKMB])?[+]?$/.test(segment)) {
        return segment.replace(/^(\$\d+(?:[.,]\d+)?)([kmb])$/i, (_m, num, unit) => `${num}${unit.toUpperCase()}`);
    }
    const lower = segment.toLowerCase();
    if (allowSmallLower && SMALL_WORDS.has(lower)) {
        return lower;
    }
    return lower.replace(/[a-z]/, (ch) => ch.toUpperCase());
}

function titleCaseWord(rawToken, forceCapitalize) {
    const match = rawToken.match(/^(['"(\[]*)(.*?)([)'"\],.:;!?]*)$/);
    if (!match) return rawToken;
    const [, lead, core, trail] = match;
    if (!core) return rawToken;

    if (/^\$\d+(?:[.,]\d+)*(?:[kmb])?$/i.test(core)) {
        const fixedMoney = core.replace(/^(\$\d+(?:[.,]\d+)?)([kmb])$/i, (_m, num, unit) => `${num}${unit.toUpperCase()}`);
        return `${lead}${fixedMoney}${trail}`;
    }

    if (core.includes('-')) {
        const parts = core.split('-').map((seg, idx) => titleCaseSegment(seg, !forceCapitalize && idx > 0));
        return `${lead}${parts.join('-')}${trail}`;
    }

    return `${lead}${titleCaseSegment(core, !forceCapitalize)}${trail}`;
}

function isScreamingAllCaps(text) {
    const letters = text.match(/[A-Za-z]/g);
    if (!letters || letters.length === 0) return false;
    const wordsWithLetters = text.split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
    if (wordsWithLetters.length < 3) return false;
    const upperCount = (text.match(/[A-Z]/g) || []).length;
    return upperCount / letters.length > 0.65;
}

export function normalizeEditorialTitle(title) {
    if (title == null) return '';
    let clean = String(title)
        .replace(/\s*(?:\u2014|&mdash;|&#8212;|&#x2014;)\s*/gi, ' - ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!clean) return '';

    if (isScreamingAllCaps(clean)) {
        const tokens = clean.split(' ');
        const converted = [];
        for (let i = 0; i < tokens.length; i += 1) {
            const tok = tokens[i];
            if (tok === '-' || tok === '&') {
                converted.push(tok);
                continue;
            }
            const prev = i > 0 ? tokens[i - 1] : '';
            const forceCap = i === 0 || prev === '-' || /[:;-]$/.test(prev);
            converted.push(titleCaseWord(tok, forceCap));
        }
        clean = converted.join(' ');
    }

    // Preserve $2.65M / $25K AND bare 50m / 250k / 20k uppercase magnitude suffixes on numeric tokens
    clean = clean.replace(/\$(\d+(?:[.,]\d+)?)([kmb])\b/gi, (_m, num, unit) => `$${num}${unit.toUpperCase()}`);
    clean = clean.replace(/\b(\d+(?:[.,]\d+)?)([km])\b/gi, (_m, num, unit) => `${num}${unit.toUpperCase()}`);

    // Fix poker acronym casing across word boundaries on ALL headlines
    clean = clean.replace(POKER_ACRONYM_RE, (full, base, pluralS) => {
        const key = String(base).toLowerCase();
        const canonical = POKER_ACRONYM_MAP[key];
        if (!canonical) return full;
        if (pluralS) {
            return PLURAL_ACRONYMS.has(key) ? `${canonical}s` : full;
        }
        return canonical;
    });

    return clean;
}

const RIVAL_PRODUCT_PATTERNS = [
    /\bgto\s*lab\b/i,
    /\bgto\s*wizard\b/i,
    /\bpoker\s*coaching(?:\.com)?\b/i,
    /\bupswing\s*poker\b/i,
    /\brun\s+it\s+once\b/i,
    /\braise\s+your\s+edge\b/i,
    /\boctopi\s*poker\b/i,
    /\bclub\s*gg\b/i,
    /\bpokerrrr\s*2?\b/i,
    /\bpoker\s*bros\b/i,
    /\bclub\s*wpt(?:\s+gold)?\b/i,
    /\bglobal\s+poker\b/i,
    /\bcoin\s*poker\b/i,
    /\bphenom\s+poker\b/i,
    /\bacr\s+poker\b/i,
    /\bamericas\s+cardroom\b/i,
    /\bbet\s*rivers(?:\s+poker)?\b/i,
    /\bbet\s*mgm\s+poker\b/i,
    /\bborgata\s+online(?:\s+poker)?\b/i,
    /\bparty\s*poker\b/i,
    /\b888\s*poker\b/i,
    /\bwpt\s+global\b/i,
    /\bggpoker\s+(?:bonus|promo|giveaway|honeymoon|rakeback|fish\s+buffet)\b/i,
    /\bpokerstars\s+(?:ambassador|ambassadors|rewards|chest|bonus|festive\s+season|power\s+path)\b/i,
    /\bfestive\s+season\s+returns\s+with\b/i,
    /\bin\s+rewards\s+throughout\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
    /\bclimb\s+the\s+cash\s+game\s+ladder\b/i,
    /\bcash\s+game\s+ladder\b/i,
    /\bfor\s+a\s+share\s+of\s+\$?\d+[.,\d]*[kmb]?\s+(?:each|every)\s+(?:week|month|day)\b/i,
    /\b(?:deposit|reload|welcome)\s+bonus\b/i,
    /\brake\s+race\b/i,
    /\b(?:promo|bonus|coupon|referral)\s+code\b/i,
    /\baffiliate\b/i,
    /\bsponsored\s+(?:post|content|partner|article)\b/i,
];

const RIVAL_SOURCE_OUTLET_RE = /\b(?:pokerstars\s+blog|ggpoker\s+blog|partypoker\s+blog|888poker\s+magazine|wpt\s+global\s+blog|acr\s+poker\s+blog|coinpoker\s+blog|betrivers)\b/i;

const SUBSCRIPTION_PITCH_PATTERNS = [
    /\b\d+%\s*off\b[\s\S]*\b(subscription|pro|plan|membership|course|trainer|solver|elite|annual)\b/i,
    /\b(subscription|pro\s+plan|membership|training\s+course|poker\s+course)\b[\s\S]*\b\d+%\s*off\b/i,
    /\bsave\s+(?:up\s+to\s+)?\d+%\b[\s\S]*\b(subscription|pro|plan|membership|course|trainer|solver)\b/i,
];

const BLACK_FRIDAY_AD_RE = /\b(?:black\s+friday|cyber\s+monday)\s+(?:offer|sale|deal|discount|promo)\b[\s\S]*\b(?:save|subscription|pro\b|discount|%\s*off|membership|course|plan)\b/i;

const LIVE_TOUR_PACKAGE_RE = /\b(?:wsop|wsopc|wpt|ept|mspt|apt|hpt|rgps|pgt|triton)\b[\s\S]*\b(?:circuit|package|series|main\s+event|championship|festival|passport|seat|stop)\b/i;

const AFFILIATE_URL_RE = /[?&](?:aff|affiliate|aff_id|promo_code|bonus_code)=|\/(?:bonus-code|promo-code|black-friday-offer)\b/i;

export function isCompetitorSponsoredPost({
    title = '',
    summary = '',
    excerpt = '',
    source_url = '',
    source_name = '',
    byline = '',
} = {}) {
    const combinedText = [title, summary, excerpt]
        .map((v) => String(v || '').trim())
        .filter(Boolean)
        .join(' ');
    const url = String(source_url || '').trim();
    const outlet = `${String(source_name || '').trim()} ${String(byline || '').trim()}`.trim();

    if (!combinedText && !url && !outlet) return false;

    if (outlet && RIVAL_SOURCE_OUTLET_RE.test(outlet)) return true;

    for (const re of RIVAL_PRODUCT_PATTERNS) {
        if (re.test(combinedText)) return true;
    }

    if (AFFILIATE_URL_RE.test(url)) return true;

    for (const re of SUBSCRIPTION_PITCH_PATTERNS) {
        if (re.test(combinedText)) return true;
    }

    if (BLACK_FRIDAY_AD_RE.test(combinedText)) {
        // Distinguish real live tournament series packages (e.g. WSOP Super Circuit Punta Cana:
        // Black Friday Package Deal) from rival software/training subscription ads.
        const isLiveSeriesPkg =
            LIVE_TOUR_PACKAGE_RE.test(String(title || '')) &&
            !/\b(?:subscription|pro\s+subscription|membership|course|trainer|solver)\b/i.test(combinedText);
        if (!isLiveSeriesPkg) return true;
    }

    return false;
}
