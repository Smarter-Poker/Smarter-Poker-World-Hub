/**
 * Presentation helpers for Phase 4 Personal Assistant surfaces. Pure and dependency-free.
 *
 *  - describeTableVerification(raw)  -> the ONE badge a leak may show about live-play proof.
 *    "Verified Fixed Live" is reachable only from status === 'confirmed_fixed_at_tables'.
 *    Drill mastery alone (status 'not_mastered', 'mastered_in_drills_still_leaking', anything
 *    else) never produces a fixed claim.
 *  - buildTableVerificationIndex(snapshot) -> Map(leakId -> raw tableVerification) read from every
 *    place the coaching snapshot may carry it (leaks, priorities, training plan modules).
 *  - buildHandReviewShareUrl(...)    -> safe read-only /share/hand?view=review link. Hole cards are
 *    included ONLY when explicitly requested; villain names are never put in the URL.
 */

export const DEFAULT_REQUIRED_LIVE_HANDS = 8;

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Mistake rates are already percentages (0-100) in the coaching snapshot; show a whole percent. */
export function toPercent(value) {
  const n = finite(value);
  if (n === null || n < 0 || n > 100) return null;
  return Math.round(n);
}

function pick(raw, ...keys) {
  for (const key of keys) {
    const n = finite(raw?.[key]);
    if (n !== null) return n;
  }
  return null;
}

/**
 * @returns {null | { kind: 'verified'|'awaiting'|'relapsed', tone: 'success'|'warn'|'danger',
 *                    label: string, delta: string|null, sampleCount: number|null, requiredCount: number }}
 */
export function describeTableVerification(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const status = String(raw.status || '');
  const required = pick(raw, 'requiredSampleCount', 'requiredHands') ?? DEFAULT_REQUIRED_LIVE_HANDS;
  const remaining = pick(raw, 'handsRemaining');
  let sample = pick(raw, 'postSampleCount', 'postBaselineSamples');
  if (sample === null && remaining !== null) sample = Math.max(0, required - remaining);

  const pre = toPercent(pick(raw, 'preMistakeRate', 'preBaselineErrorRate'));
  const post = toPercent(pick(raw, 'postMistakeRate', 'postBaselineErrorRate'));
  const delta = pre !== null && post !== null ? `Mistakes ${pre}% \u2192 ${post}%` : null;

  if (status === 'confirmed_fixed_at_tables') {
    return { kind: 'verified', tone: 'success', label: 'Verified Fixed Live', delta, sampleCount: sample, requiredCount: required };
  }
  if (status === 'awaiting_live_hands') {
    const shown = Math.max(0, Math.min(required, Math.floor(sample ?? 0)));
    return {
      kind: 'awaiting',
      tone: 'warn',
      label: `${shown}/${required} Live Hands To Verify`,
      delta: null,
      sampleCount: shown,
      requiredCount: required,
    };
  }
  if (status === 'relapsed_at_tables') {
    return { kind: 'relapsed', tone: 'danger', label: 'Leaking Again Live', delta, sampleCount: sample, requiredCount: required };
  }
  return null;
}

function indexVerification(map, id, verification) {
  if (id === null || id === undefined || id === '') return;
  if (!verification || typeof verification !== 'object' || !verification.status) return;
  const key = String(id);
  if (!map.has(key)) map.set(key, verification);
}

export function buildTableVerificationIndex(snapshot) {
  const map = new Map();
  if (!snapshot || typeof snapshot !== 'object') return map;
  const lists = [
    [snapshot.leaks, ['id', 'leakId']],
    [snapshot.priorities, ['id', 'leakId']],
    [snapshot.trainingPlan?.modules, ['leakId', 'id']],
  ];
  for (const [list, idKeys] of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      for (const key of idKeys) indexVerification(map, item?.[key], item?.tableVerification);
    }
  }
  return map;
}

const CARD = /^(?:10|[2-9TJQKA])[shdc]$/i;

function cleanCards(cards) {
  const list = Array.isArray(cards)
    ? cards
    : typeof cards === 'string' ? cards.match(/(?:10|[2-9TJQKA])[shdc]/gi) || [] : [];
  const out = [];
  for (const card of list) {
    const text = String(card?.rank ? `${card.rank}${String(card.suit || '')[0] || ''}` : card || '').trim();
    if (!CARD.test(text)) continue;
    const rank = text.slice(0, -1).toUpperCase().replace('10', 'T');
    const suit = text.slice(-1).toLowerCase();
    const normalized = `${rank}${suit}`;
    if (!out.includes(normalized)) out.push(normalized);
  }
  return out;
}

function cleanText(value, max = 60) {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Build a read-only review link. Never includes an internal hand id, a user id, villain names, or
 * hole cards unless includeHoleCards is explicitly true.
 */
export function buildHandReviewShareUrl({
  origin = '',
  street = null,
  position = null,
  board = null,
  heroCards = null,
  stakes = null,
  formatLabel = null,
  title = null,
  anonymize = true,
  includeHoleCards = false,
} = {}) {
  const params = new URLSearchParams();
  params.set('view', 'review');
  params.set('anon', anonymize ? '1' : '0');
  const safeStreet = cleanText(street, 12).toLowerCase();
  if (['preflop', 'flop', 'turn', 'river'].includes(safeStreet)) params.set('street', safeStreet);
  const safePosition = cleanText(position, 8).toUpperCase();
  if (safePosition) params.set('position', safePosition);
  const boardCards = cleanCards(board).slice(0, 5);
  if (boardCards.length > 0) params.set('board', boardCards.join(','));
  if (includeHoleCards === true) {
    const hero = cleanCards(heroCards).slice(0, 2);
    if (hero.length === 2) params.set('hero', hero.join(','));
  }
  const safeStakes = cleanText(stakes, 24);
  if (safeStakes) params.set('stakes', safeStakes);
  const safeFormat = cleanText(formatLabel, 24);
  if (safeFormat) params.set('venue', safeFormat);
  const safeTitle = cleanText(title, 60);
  if (safeTitle) params.set('hand', safeTitle);
  const base = String(origin || '').replace(/\/+$/, '');
  return `${base}/share/hand?${params.toString()}`;
}

function titleWords(value) {
  return String(value ?? '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/**
 * Ranked coverage-gap demand rows (unpriced decisions grouped by format/street/position/stack/reason).
 * Accepts either a bare array or { rows | gaps | top, totalUnpriced }. Never invents rows or totals.
 * @returns {{ rows: Array, total: number|null }}
 */
export function normalizeCoverageGapsRanked(value, fallbackTotal = null) {
  const list = Array.isArray(value)
    ? value
    : Array.isArray(value?.rows) ? value.rows
      : Array.isArray(value?.gaps) ? value.gaps
        : Array.isArray(value?.top) ? value.top : [];
  const rows = [];
  for (const item of list) {
    const count = finite(item?.count ?? item?.frequency ?? item?.unpricedCount);
    if (!item || count === null || count <= 0) continue;
    rows.push({
      format: titleWords(item.format) || 'Unknown Format',
      street: String(item.street || '').toUpperCase() || 'Unknown Street',
      position: item.position || item.heroPosition ? String(item.position || item.heroPosition).toUpperCase() : null,
      stackBucket: item.stackBucket && String(item.stackBucket) !== 'unknown' ? String(item.stackBucket) : null,
      reason: item.reason ? titleWords(item.reason) : null,
      count,
      hintLabel: item.coverageHint?.label ? String(item.coverageHint.label) : null,
      hintTier: item.coverageHint?.tier ? String(item.coverageHint.tier) : null,
      studyGuidance: item.coverageHint?.tier && item.coverageHint.tier !== 'solver_verified' && item.coverageHint.tier !== 'unsupported' && item.coverageHint?.studyGuidance
        ? String(item.coverageHint.studyGuidance).slice(0, 160)
        : null,
    });
    if (rows.length >= 10) break;
  }
  const total = finite(value?.totalUnpriced ?? value?.total ?? value?.totalUnpricedCount) ?? finite(fallbackTotal);
  return { rows, total };
}

/**
 * Coaching funnel counts: Audited -> Drilled -> Mastered -> Verified Live. A missing input stays
 * null ("Not Available"); it is never shown as zero.
 * @returns {null | Array<{ key: string, label: string, value: number|null }>}
 */
export function normalizeFunnelMetrics(value) {
  if (!value || typeof value !== 'object') return null;
  const steps = [
    ['auditedHands', 'Audited'],
    ['drilledLeaks', 'Drilled'],
    ['masteredLeaks', 'Mastered'],
    ['verifiedFixedLive', 'Verified Live'],
  ].map(([key, label]) => ({ key, label, value: finite(value[key]) }));
  return steps.every((step) => step.value === null) ? null : steps;
}
