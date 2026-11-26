import {
  leakToDrill,
  leakToTrainingGame,
  resolveSkillMatchedDrillGame,
  resolutionProgress,
  RETIRE_AFTER_STRONG,
} from '../sandbox/leakReview.js';
import {
  CA_HAND_FACTS_DETECTORS,
  CA_HAND_FACTS_RULE_VERSION,
  classifyStackBucket,
  summarizeSolverCoverageGaps,
} from './caHandFactsAnalyzer.mjs';
import { COVERAGE_TIERS, describeCoverageTier } from './mttShortStackCharts.mjs';
import {
  DETECTOR_RULE_VERSION,
  EVIDENCE_BASIS,
  LEAK_PATTERNS,
  PATTERN_STAT_KEYS,
  buildLeakTakeaway,
  classifyEvidenceBasis,
  generateLeakFix,
} from './leakRecord.js';
import {
  SOLVER_EVIDENCE_RULE_VERSION,
  qualifySolverDecisionSample,
} from '../training/solverDecisionEvidence.js';

const DAY_MS = 86_400_000;

/** Post-baseline solver-graded live decisions required before a fix is judged. */
export const MIN_LIVE_VERIFY_HANDS = 8;
/** Post-baseline mistake rate (%) at or below which a drilled leak counts as fixed. */
export const LIVE_FIX_MAX_MISTAKE_RATE = 15;
const COVERAGE_GAP_LIMIT = 10;
const SESSION_RECAP_HANDS = 2;
const SESSION_WINDOW_LEAD_MS = 5 * 60_000;
const SESSION_WINDOW_TAIL_MS = 2 * 60_000;

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function count(value) {
  return Math.max(0, Math.round(finite(value) || 0));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function iso(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function title(value, fallback = 'Poker Decision') {
  const clean = String(value || fallback).replace(/[_-]+/g, ' ').trim();
  return clean.replace(/\b\w/g, letter => letter.toUpperCase());
}

function leakId(leak) {
  return String(leak?.id ?? leak?.leak_id ?? leak?.leakId ?? '').trim();
}

function leakSamples(leak) {
  return count(leak?.totalSamples ?? leak?.total_samples ?? leak?._sample_count ?? leak?.occurrenceCount ?? leak?.occurrence_count);
}

function leakMistakes(leak) {
  return count(leak?.mistakeCount ?? leak?.mistake_count ?? leak?._mistake_count ?? leak?.occurrenceCount ?? leak?.occurrence_count);
}

function measuredLoss(leak) {
  if (leak?.evLossMeasured !== true && leak?.ev_loss_measured !== true) return null;
  const value = finite(leak?.evLossBB ?? leak?.avg_ev_loss_bb ?? leak?.ev_loss);
  return value === null ? null : Math.abs(value);
}

function leakStatus(leak) {
  return String(leak?.status || (leak?.is_active === false ? 'resolved' : 'emerging')).toLowerCase();
}

function slug(value, fallback) {
  const normalized = String(value || fallback).trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return (normalized || fallback).slice(0, 42);
}

function decisionLeakType(row) {
  const scope = slug(row?.evidence_scope, 'club_arena');
  return [
    'solver', scope, slug(row?.game_id, 'training'), slug(row?.street, 'all_streets'),
    slug(row?.hero_position, 'all_positions'), slug(row?.spot_type, 'general'),
  ].join('_').slice(0, 180);
}

/**
 * Deduplicate leaks by durable leak identifier or leakType so interrupted or
 * retried syncs never inflate priority lists or snapshot counts.
 */
export function dedupeLeaks(leaks = []) {
  if (!Array.isArray(leaks)) return [];
  const seen = new Map();
  const anonymous = [];
  for (const leak of leaks) {
    if (!leak || typeof leak !== 'object') continue;
    const key = leakId(leak) || String(leak?.leakType || leak?.leak_type || '').trim();
    if (!key) {
      anonymous.push(leak);
      continue;
    }
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, leak);
    } else if (leakSamples(leak) > leakSamples(existing)) {
      seen.set(key, leak);
    }
  }
  return [...seen.values(), ...anonymous];
}

/**
 * Deduplicate review records by leak_id and deduplicate history entries within
 * each review record by timestamp + score.
 */
export function dedupeReviews(reviews = []) {
  if (!Array.isArray(reviews)) return [];
  const seen = new Map();
  const anonymous = [];
  for (const row of reviews) {
    if (!row || typeof row !== 'object') continue;
    let normalized = row;
    if (Array.isArray(row.history) && row.history.length > 1) {
      const seenHist = new Set();
      const dedupedHist = [];
      for (const item of row.history) {
        if (!item) continue;
        const hKey = `${iso(item.at) || String(item.at || '')}:${finite(item.score)}`;
        if (seenHist.has(hKey)) continue;
        seenHist.add(hKey);
        dedupedHist.push(item);
      }
      if (dedupedHist.length !== row.history.length) {
        normalized = { ...row, history: dedupedHist };
      }
    }
    const key = String(normalized?.leak_id ?? normalized?.leakId ?? '').trim();
    if (!key) {
      anonymous.push(normalized);
      continue;
    }
    if (!seen.has(key)) {
      seen.set(key, normalized);
    }
  }
  return [...seen.values(), ...anonymous];
}

/**
 * Deduplicate decision rows when a durable unique key (`id`, `decision_key`, or
 * `attempt_id + question_id`) is present. Rows without a unique decision key
 * (such as synthetic hand-level test fixtures) are preserved untouched.
 */
export function dedupeDecisions(decisions = []) {
  if (!Array.isArray(decisions)) return [];
  const seen = new Set();
  const out = [];
  for (const row of decisions) {
    if (!row || typeof row !== 'object') continue;
    let key = null;
    if (row.id !== undefined && row.id !== null && String(row.id).trim() !== '') {
      key = `id:${String(row.id).trim()}`;
    } else if (row.decision_key !== undefined && row.decision_key !== null && String(row.decision_key).trim() !== '') {
      key = `dk:${String(row.hand_external_id ?? row.handExternalId ?? '').trim()}:${String(row.decision_key).trim()}:${String(row.evidence_scope ?? row.evidenceScope ?? '').trim()}`;
    } else if (
      row.attempt_id !== undefined && row.attempt_id !== null && String(row.attempt_id).trim() !== ''
      && row.question_id !== undefined && row.question_id !== null && String(row.question_id).trim() !== ''
    ) {
      key = `aq:${String(row.attempt_id).trim()}:${String(row.question_id).trim()}`;
    }
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(row);
  }
  return out;
}

function resolveLeakRuleVersion(leak) {
  if (leak?.ruleVersion || leak?.rule_version) {
    return String(leak.ruleVersion || leak.rule_version);
  }
  const source = String(leak?.sourceSystem || leak?.source_system || '').toLowerCase();
  const lType = String(leak?.leakType || leak?.leak_type || '').toLowerCase();
  if (source.includes('ca_hand_facts') || lType.endsWith('_facts')) {
    return CA_HAND_FACTS_RULE_VERSION;
  }
  if (lType.startsWith('solver_') || source.includes('solver')) {
    return SOLVER_EVIDENCE_RULE_VERSION;
  }
  return DETECTOR_RULE_VERSION;
}

function resolveLeakEvidenceBasis(leak, relatedDecisions = []) {
  const explicit = leak?.evidenceBasis || leak?.evidence_basis;
  if (explicit && Object.values(EVIDENCE_BASIS).includes(explicit)) {
    return explicit;
  }
  const decisionList = Array.isArray(relatedDecisions) ? relatedDecisions : [];
  const hasChartDecision = decisionList.some(
    row => row?.solver_verified === true && /chart|push_fold|icm/i.test(String(row?.solver_source || '')),
  );
  if (hasChartDecision) return EVIDENCE_BASIS.CHART;
  const hasExactSolverDecision = decisionList.some(row => row?.solver_verified === true);
  if (hasExactSolverDecision && (String(leak?.leakType || leak?.leak_type || '').startsWith('solver_') || measuredLoss(leak) !== null)) {
    return EVIDENCE_BASIS.EXACT_SOLVER_MATCH;
  }
  return classifyEvidenceBasis(leak);
}

function hashText(input) {
  let forward = 2166136261;
  let reverse = 3339675911;
  for (let index = 0; index < input.length; index += 1) {
    forward ^= input.charCodeAt(index);
    forward = Math.imul(forward, 16777619);
    reverse ^= input.charCodeAt(input.length - index - 1);
    reverse = Math.imul(reverse, 2246822519);
  }
  return `${(forward >>> 0).toString(16).padStart(8, '0')}${(reverse >>> 0).toString(16).padStart(8, '0')}`;
}

function canonicalRows(rows) {
  return rows.map(row => JSON.stringify(row)).sort();
}

export function evidenceFingerprint({ leaks = [], decisions = [], reviews = [], rejected = {} } = {}) {
  const uniqueLeaks = dedupeLeaks(leaks);
  const uniqueDecisions = dedupeDecisions(decisions);
  const uniqueReviews = dedupeReviews(reviews);
  const leakRows = canonicalRows(uniqueLeaks.map(leak => [
    leakId(leak), leakStatus(leak), leakSamples(leak), leakMistakes(leak), measuredLoss(leak),
    iso(leak?.firstDetected || leak?.first_detected_at || leak?.created_at),
    iso(leak?.resolvedAt || leak?.resolved_at),
    finite(leak?.currentFrequency ?? leak?.current_frequency),
    finite(leak?.optimalFrequency ?? leak?.optimal_frequency),
  ]));
  const decisionRows = canonicalRows(uniqueDecisions.map(row => [
    String(row?.hand_external_id || ''), String(row?.decision_key || ''), String(row?.question_id || ''), String(row?.evidence_scope || ''),
    String(row?.game_id || ''), String(row?.street || ''), String(row?.hero_position || ''),
    String(row?.villain_position || ''), String(row?.spot_type || ''), String(row?.hero_hand || ''),
    row?.board_cards || [], String(row?.player_action || ''), String(row?.solver_action || ''),
    finite(row?.selected_frequency), finite(row?.optimal_frequency), String(row?.classification || ''),
    finite(row?.ev_loss), row?.ev_loss_measured === true, row?.solver_verified === true,
    String(row?.solver_source || ''), count(row?.match_tier), iso(row?.audited_at),
  ]));
  const reviewRows = canonicalRows(uniqueReviews.map(row => {
    const rawOutcome = row?.last_outcome ?? row?.lastOutcome;
    const outcomeText = rawOutcome && typeof rawOutcome === 'object'
      ? JSON.stringify(rawOutcome)
      : String(rawOutcome || '');
    return [
      String(row?.leak_id ?? row?.leakId ?? ''), iso(row?.due_at ?? row?.dueAt),
      count(row?.reps), count(row?.lapses), count(row?.strong_streak ?? row?.strongStreak),
      finite(row?.interval_days ?? row?.intervalDays),
      row?.retired === true,
      finite(row?.last_score ?? row?.lastScore), outcomeText,
      iso(row?.remediation_baseline_at ?? row?.remediationBaselineAt),
      iso(row?.updated_at ?? row?.updatedAt),
      canonicalRows((Array.isArray(row?.history) ? row.history : []).map(item => [iso(item?.at), finite(item?.score)])),
    ];
  }));
  const rejectedRows = Object.entries(rejected || {})
    .map(([key, value]) => [String(key), count(value)])
    .sort((a, b) => a[0].localeCompare(b[0]));

  return `pa7e-${hashText(JSON.stringify({ leakRows, decisionRows, reviewRows, rejectedRows }))}`;
}

export function decisionCoverage(decisions = [], rejected = {}) {
  const rows = dedupeDecisions(decisions);
  const verified = rows.filter(row => row.solver_verified === true).length;
  const priced = rows.filter(row => row.ev_loss_measured === true && finite(row.ev_loss) !== null).length;
  const unpriced = rows.filter(row => row.ev_loss_measured !== true).length;
  const partiallyMatched = rows.filter(row => row.solver_verified !== true && count(row.match_tier) > 0).length;
  const sourceCounts = rows.reduce((result, row) => {
    const raw = String(row.solver_source || '').toLowerCase();
    const isLookupFailure = raw.includes('lookup-failed') || raw.includes('unpriced');
    const isSolverSource = row.solver_verified === true
      || /\b(solver|pio|pio_database|chart|deterministic_solver|local_solver|legacy_strategy_archive)\b/.test(raw)
      || raw.includes('solver');
    const isAiSource = !isLookupFailure && (/\bai\b/.test(raw) || /(?:^|[_|: -])ai(?:[_|: -]|$)/.test(raw));
    const key = isSolverSource ? 'solverEvidence'
      : isAiSource ? 'aiGuidance'
      : raw.includes('offline') ? 'offlineEstimate'
      : 'unclassified';
    result[key] += 1;
    return result;
  }, { solverEvidence: 0, aiGuidance: 0, offlineEstimate: 0, unclassified: 0 });
  const rejectedCount = Object.values(rejected || {}).reduce((sum, value) => sum + count(value), 0);
  const denominator = rows.length + rejectedCount;

  return {
    decisions: rows.length,
    verified,
    priced,
    unpriced,
    partiallyMatched,
    rejected: rejectedCount,
    verifiedPercent: denominator ? Math.round((verified / denominator) * 1000) / 10 : 0,
    pricedPercent: rows.length ? Math.round((priced / rows.length) * 1000) / 10 : 0,
    ...sourceCounts,
  };
}

export function confidenceBreakdown(leak, coverage = {}) {
  const samples = leakSamples(leak);
  const mistakes = leakMistakes(leak);
  const loss = measuredLoss(leak);
  const verifiedPercent = clamp(finite(coverage?.verifiedPercent) || 0, 0, 100);
  const evidence = loss !== null ? 34 : 8;
  const sampleScore = Math.min(36, Math.round(Math.log2(samples + 1) * 7));
  const repetition = mistakes >= 8 ? 18 : mistakes >= 4 ? 12 : mistakes >= 2 ? 6 : 0;
  const provenance = Math.round(verifiedPercent * 0.12);
  const score = clamp(evidence + sampleScore + repetition + provenance, 0, 100);
  const level = score >= 75 ? 'high' : score >= 50 ? 'medium' : 'low';
  const reasons = [
    loss !== null ? 'Measured EV Evidence Is Available' : 'EV Evidence Is Currently Unpriced',
    `${samples} Opportunities And ${mistakes} Mistakes Support This Finding`,
    verifiedPercent > 0 ? `${verifiedPercent}% Of The Audited Decision Set Is Solver Verified` : 'No Current Solver-Verified Coverage Was Counted',
  ];
  return { score, level, samples, mistakes, reasons };
}

export function rankCoachingPriorities(leaks = [], reviewRecords = [], coverage = {}, now = Date.now()) {
  const uniqueLeaks = dedupeLeaks(leaks);
  const uniqueReviews = dedupeReviews(reviewRecords);
  const reviewByLeak = new Map(uniqueReviews.map(row => [String(row.leak_id ?? row.leakId ?? ''), row]));
  return uniqueLeaks
    .filter(leak => leak && leakStatus(leak) !== 'resolved')
    .map(leak => {
      const id = leakId(leak);
      const loss = measuredLoss(leak);
      const mistakes = leakMistakes(leak);
      const samples = leakSamples(leak);
      const review = reviewByLeak.get(id) || null;
      const dueAt = iso(review?.due_at ?? review?.dueAt);
      const due = dueAt ? new Date(dueAt).getTime() <= now : false;
      const statusWeight = leakStatus(leak) === 'persistent' ? 30 : leakStatus(leak) === 'emerging' ? 20 : 10;
      const evWeight = loss === null ? 0 : Math.min(35, Math.round(loss * Math.max(1, mistakes) * 4));
      const sampleWeight = Math.min(20, Math.round(Math.log2(samples + 1) * 4));
      const dueWeight = due ? 15 : 0;
      const score = statusWeight + evWeight + sampleWeight + dueWeight;
      const confidence = confidenceBreakdown(leak, coverage);
      const drillParams = leakToDrill(leak);
      const recommendedDrill = leakToTrainingGame(leak) || resolveSkillMatchedDrillGame(leak, drillParams?.street) || leak?.recommendedDrill || leak?.recommended_drill || null;
      const evidenceBasis = resolveLeakEvidenceBasis(leak);
      const ruleVersion = resolveLeakRuleVersion(leak);
      const takeaway = leak?.takeaway || buildLeakTakeaway(leak);
      return {
        id,
        title: title(leak?.title || leak?.situationClass || leak?.situation_class || leak?.leakType || leak?.leak_type),
        category: title(leak?.leakCategory || leak?.leak_category || 'Strategy'),
        status: leakStatus(leak),
        score,
        due,
        dueAt,
        measuredEvLoss: loss,
        mistakes,
        samples,
        confidence,
        recommendedDrill,
        evidenceBasis,
        ruleVersion,
        takeaway,
        reason: loss !== null
          ? `${mistakes} Repeated Mistakes With ${loss.toFixed(2)} BB Measured Loss Per Occurrence`
          : `${mistakes} Repeated Mistakes Require Review While Solver EV Remains Unpriced`,
      };
    })
    .sort((a, b) => b.score - a.score || b.confidence.score - a.confidence.score || a.title.localeCompare(b.title));
}

export function buildEvidenceChain(leak, decisions = [], reviewRecords = [], versions = {}, examples = []) {
  const id = leakId(leak);
  const exampleList = Array.isArray(examples) ? examples : [];
  const example = exampleList[0] || null;
  const exampleExternalIds = [...new Set(exampleList.flatMap(item => {
    const snap = item?.snapshot && typeof item.snapshot === 'object' ? item.snapshot : {};
    const rawHandId = item?.handId ?? item?.hand_history_id ?? snap.hand_id ?? snap.handId ?? null;
    const ids = [
      snap.external_id, snap.externalId, snap.hand_external_id,
      rawHandId,
    ].filter(Boolean).map(String);
    if (rawHandId && !String(rawHandId).startsWith('club-arena:')) {
      ids.push(`club-arena:${rawHandId}`);
    }
    return ids;
  }))];
  const decisionRows = dedupeDecisions(decisions).filter(row => {
    const keys = [row?.leak_id, row?.leak_type, row?.spot_type, row?.game_id, decisionLeakType(row)].filter(Boolean).map(String);
    return keys.includes(id)
      || keys.includes(String(leak?.leakType || leak?.leak_type || ''))
      || exampleExternalIds.includes(String(row?.hand_external_id || ''));
  });
  const newest = [...decisionRows].sort((a, b) => String(b?.audited_at || '').localeCompare(String(a?.audited_at || '')))[0] || null;
  const review = dedupeReviews(reviewRecords).find(row => String(row?.leak_id ?? row?.leakId ?? '') === id) || null;
  const sourceHand = newest?.hand_external_id || exampleExternalIds[0] || example?.handId || null;
  return [
    { stage: 'Club Arena Hand', state: sourceHand ? 'verified' : 'unavailable', detail: sourceHand || 'No Source Hand Is Attached' },
    { stage: 'Normalized Decision', state: newest?.decision_key ? 'verified' : 'unavailable', detail: newest?.decision_key || 'No Decision Fingerprint Is Attached' },
    { stage: 'Solver Match', state: newest?.solver_verified ? 'verified' : newest ? 'unpriced' : 'unavailable', detail: newest?.solver_verified ? String(newest.solver_source || 'Certified Solver Evidence') : newest ? 'Evidence Is Preserved Without A Verified Price' : 'No Match Record Is Available' },
    { stage: 'Deterministic Grade', state: newest ? 'verified' : 'unavailable', detail: newest?.classification ? title(newest.classification) : 'No Grade Is Available' },
    { stage: 'Leak Group', state: id ? 'verified' : 'unavailable', detail: id || 'No Leak Identifier Is Available' },
    { stage: 'Corrective Review', state: review ? (review.retired ? 'mastered' : 'scheduled') : 'available', detail: review?.due_at || review?.dueAt || 'Ready To Start' },
  ].map(entry => ({ ...entry, versions: { ...versions } }));
}

export function buildProgressTimeline(leaks = [], reviewRecords = []) {
  const events = [];
  for (const leak of dedupeLeaks(leaks)) {
    const id = leakId(leak);
    const label = title(leak?.title || leak?.leakType || leak?.leak_type);
    const detected = iso(leak?.firstDetected || leak?.first_detected_at || leak?.created_at);
    if (detected) events.push({ at: detected, type: 'detected', leakId: id, title: `${label} Detected` });
    for (const point of Array.isArray(leak?.trendData || leak?.trend_data) ? (leak.trendData || leak.trend_data) : []) {
      const at = iso(point?.at || point?.date);
      if (at) events.push({ at, type: 'measured', leakId: id, title: `${label} Measured`, value: finite(point?.value) });
    }
    const resolved = iso(leak?.resolvedAt || leak?.resolved_at);
    if (resolved) events.push({ at: resolved, type: 'resolved', leakId: id, title: `${label} Confirmed Resolved` });
  }
  for (const review of dedupeReviews(reviewRecords)) {
    const id = String(review?.leak_id ?? review?.leakId ?? '');
    const history = Array.isArray(review?.history) ? review.history : [];
    for (const item of history) {
      const at = iso(item?.at);
      if (at) events.push({ at, type: 'review', leakId: id, title: 'Corrective Review Completed', score: finite(item?.score) });
    }
  }
  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100);
}

function inferFormatScope(leak, relatedDecisions) {
  const gameIds = [
    leak?.recommendedDrill,
    leak?.recommended_drill,
    ...(relatedDecisions || []).map(row => row?.game_id),
  ].filter(Boolean).map(v => String(v).toLowerCase());
  const hasMtt = gameIds.some(id => id.startsWith('mtt-') || id.includes('tournament'));
  const hasCash = gameIds.some(id => id.startsWith('cash-'));
  if (hasMtt && hasCash) return 'Cash And Tournament NLH';
  if (hasMtt) return 'Tournament NLH';
  if (hasCash) return 'Cash NLH';
  const source = String(leak?.sourceSystem || leak?.source_system || '').toLowerCase();
  if (source.includes('training')) return 'Training Solver NLH';
  return 'Club Arena NLH';
}

function decisionKeys(row) {
  return [row?.leak_id, row?.leak_type, row?.spot_type, row?.game_id, decisionLeakType(row)]
    .filter(Boolean).map(String);
}

/**
 * Index decisions by every key a leak may match them on, so per-leak lookups
 * stay O(matches) instead of rescanning the whole decision window per leak.
 */
function buildDecisionIndex(decisions) {
  const list = Array.isArray(decisions) ? decisions : [];
  const byKey = new Map();
  list.forEach((row, position) => {
    for (const key of new Set(decisionKeys(row))) {
      const bucket = byKey.get(key);
      if (bucket) bucket.push(position);
      else byKey.set(key, [position]);
    }
  });
  return { list, byKey };
}

function relatedDecisionsFor(index, ...keys) {
  const positions = new Set();
  for (const key of keys) {
    if (!key) continue;
    for (const position of index.byKey.get(String(key)) || []) positions.add(position);
  }
  return [...positions].sort((x, y) => x - y).map(position => index.list[position]);
}

function mistakeRatePercent(rows) {
  if (!rows.length) return null;
  const errors = rows.filter(row => !['best', 'correct'].includes(String(row?.classification || '').toLowerCase())).length;
  return Math.round((errors / rows.length) * 1000) / 10;
}

const CLUB_ARENA_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isClubArenaLiveDecision(row) {
  if (!row || typeof row !== 'object') return false;
  const scope = row.evidence_scope ?? row.evidenceScope ?? null;
  if (scope !== null && scope !== undefined && scope !== '') {
    if (String(scope) !== 'club_arena') return false;
  }
  const extId = String(row.hand_external_id ?? row.handExternalId ?? '').trim();
  if (extId) {
    if (!extId.startsWith('club-arena:') && !CLUB_ARENA_UUID_RE.test(extId)) {
      return false;
    }
  }
  return true;
}

function toClaimedSet(claimedReferenceIds) {
  if (!claimedReferenceIds) return new Set();
  if (claimedReferenceIds instanceof Set) return new Set([...claimedReferenceIds].filter(Boolean).map(String));
  if (Array.isArray(claimedReferenceIds)) return new Set(claimedReferenceIds.filter(Boolean).map(String));
  return new Set();
}

/**
 * Before/after live-play proof for one leak.
 *
 * Only solver-verified (graded) Club Arena decisions count: an unpriced
 * decision or non-Club-Arena upload has no live table grade, so it can neither
 * prove nor disprove a live fix. Hands are split on `remediation_baseline_at`
 * using the hand's played time when known, falling back to `audited_at`
 * (reported through `timeBasis`).
 *
 * `status`:
 *   not_mastered              drills are not finished yet
 *   awaiting_live_hands       mastered in drills, fewer than MIN_LIVE_VERIFY_HANDS live hands since
 *   confirmed_fixed_at_tables enough live hands and the post mistake rate is at/below LIVE_FIX_MAX_MISTAKE_RATE
 *   relapsed_at_tables        enough live hands but the leak is still leaking
 */
function evaluateTableVerification(rawLeak, review, relatedDecisions, mastered, claimedSet = null) {
  const firstReviewAt = Array.isArray(review?.history) && review.history.length > 0
    ? review.history.map(item => iso(item?.at)).filter(Boolean).sort()[0]
    : null;
  // Never fall back to first_detected_at as a post-drill baseline: pre-drill
  // hands played before remediation would otherwise classify as post-baseline
  // and falsely trigger relapsed_at_tables immediately upon drill mastery.
  const baselineAt = iso(
    review?.remediation_baseline_at
    ?? review?.remediationBaselineAt
    ?? rawLeak?.remediation_completed_at
    ?? rawLeak?.remediationCompletedAt
    ?? firstReviewAt,
  );
  const baselineMs = baselineAt ? new Date(baselineAt).getTime() : null;
  const playedMs = row => {
    const raw = row?.hand_played_at ?? row?.handPlayedAt ?? row?.hand_created_at ?? null;
    const parsed = raw ? new Date(raw).getTime() : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  };
  const hasExplicitNullPlayedAt = row => (
    (Object.prototype.hasOwnProperty.call(row || {}, 'hand_played_at') && row.hand_played_at === null)
    || (Object.prototype.hasOwnProperty.call(row || {}, 'handPlayedAt') && row.handPlayedAt === null)
  );
  const decisionTimeMs = row => {
    const played = playedMs(row);
    if (played !== null) return played;
    if (hasExplicitNullPlayedAt(row)) return NaN;
    return new Date(row?.audited_at ?? 0).getTime();
  };
  const selfReportedExcludedCount = (relatedDecisions || []).filter(row => row?.evidence_scope === 'self_reported_live').length;
  const eligibleDecisions = (relatedDecisions || []).filter(isClubArenaLiveDecision);
  const verified = eligibleDecisions.filter(row => row?.solver_verified === true);
  const postBaseline = baselineMs !== null
    ? verified.filter(row => {
      const ts = decisionTimeMs(row);
      return Number.isFinite(ts) && ts >= baselineMs;
    })
    : [];
  const preBaseline = baselineMs !== null
    ? verified.filter(row => {
      const ts = decisionTimeMs(row);
      return Number.isFinite(ts) && ts < baselineMs;
    })
    : [];
  const timed = [...postBaseline, ...preBaseline];
  const withPlayedTime = timed.filter(row => playedMs(row) !== null).length;
  const timeBasis = timed.length === 0 ? null
    : withPlayedTime === timed.length ? 'hand_played_at'
    : withPlayedTime === 0 ? 'audited_at' : 'mixed';

  const postRate = mistakeRatePercent(postBaseline);
  const preRate = mistakeRatePercent(preBaseline);
  const handsRemaining = Math.max(0, MIN_LIVE_VERIFY_HANDS - postBaseline.length);
  const deltaPct = postRate !== null && preRate !== null ? Math.round((postRate - preRate) * 10) / 10 : null;

  let status = 'not_mastered';
  let label = 'Training In Progress';
  if (mastered) {
    if (postBaseline.length < MIN_LIVE_VERIFY_HANDS) {
      status = 'awaiting_live_hands';
      label = `Mastered In Drills (${postBaseline.length}/${MIN_LIVE_VERIFY_HANDS} Live Verification Hands)`;
    } else if (postRate !== null && postRate <= LIVE_FIX_MAX_MISTAKE_RATE) {
      status = 'confirmed_fixed_at_tables';
      label = 'Confirmed Fixed At The Tables';
    } else {
      status = 'relapsed_at_tables';
      label = 'Mastered In Drills · Still Leaking Live';
    }
  }

  const leakIdentifier = leakId(rawLeak);
  // Read-only descriptor. No XP is ever granted (XP is banned) and no reward
  // catalog row exists for this milestone, so nothing here is awardable or
  // mutates any table: a consumer can show it, never redeem it.
  const verifiedLiveMilestone = status === 'confirmed_fixed_at_tables'
    ? {
        key: 'pa_leak_verified_fixed_at_tables',
        leakId: leakIdentifier,
        idempotencyKey: `pa-verified-live:${leakIdentifier}:${baselineAt || 'unbaselined'}`,
        baselineAt,
        postSampleCount: postBaseline.length,
        postMistakeRate: postRate,
        preMistakeRate: preRate,
        deltaPct,
        readOnly: true,
        awarded: false,
        xp: 0,
        rewardCatalogKey: null,
      }
    : null;

  const rewardClaimed = Boolean(
    verifiedLiveMilestone?.idempotencyKey
    && claimedSet
    && typeof claimedSet.has === 'function'
    && claimedSet.has(verifiedLiveMilestone.idempotencyKey),
  );

  return {
    status,
    label,
    baselineAt,
    timeBasis,
    // v2 live-proof fields
    preMistakeRate: preRate,
    postMistakeRate: postRate,
    preSampleCount: preBaseline.length,
    postSampleCount: postBaseline.length,
    requiredSampleCount: MIN_LIVE_VERIFY_HANDS,
    handsRemaining,
    deltaPct,
    verifiedLiveMilestone,
    rewardClaimed,
    selfReportedExcludedCount,
    // Back-compat aliases consumed by earlier UI/tests.
    preBaselineSamples: preBaseline.length,
    preBaselineErrorRate: preRate,
    postBaselineSamples: postBaseline.length,
    postBaselineErrorRate: postRate,
    requiredLiveSamples: MIN_LIVE_VERIFY_HANDS,
  };
}

// ── First-party coverage-gap demand telemetry ────────────────────────────────

function gapFormat(row) {
  const gameId = String(row?.game_id || '').toLowerCase();
  if (gameId.startsWith('mtt-') || gameId.includes('tournament')) return 'Tournament NLH';
  if (gameId.startsWith('cash-')) return 'Cash NLH';
  return 'Unknown Format';
}

function gapReason(row) {
  const source = String(row?.solver_source || '').toLowerCase();
  if (source.includes('lookup-failed')) return 'solver_lookup_failed';
  if (count(row?.match_tier) > 0) return 'partial_node_match';
  return 'no_exact_solver_node';
}

function isUnpricedDecision(row) {
  return row?.solver_verified === false || String(row?.classification || '').toLowerCase() === 'unpriced';
}

export function bucketStackDepth(stackDepthBb) {
  if (stackDepthBb === null || stackDepthBb === undefined || stackDepthBb === '') return 'unknown';
  const bb = Number(stackDepthBb);
  if (!Number.isFinite(bb) || bb <= 0) return 'unknown';
  if (bb <= 20) return '<=20bb';
  if (bb <= 50) return '20-50bb';
  if (bb <= 100) return '50-100bb';
  return '100bb+';
}

/**
 * Demand-ranked list of the spots the solver could not price, from the user's
 * own audited decisions only (first-party; no third-party telemetry).
 * Grouped by (format, street, position, stackBucket, reason), most frequent first.
 */
export function buildCoverageGapsRanked(decisions = [], { limit = COVERAGE_GAP_LIMIT } = {}) {
  const rows = Array.isArray(decisions) ? decisions.filter(Boolean) : [];
  const unpriced = rows.filter(isUnpricedDecision);
  const groups = new Map();
  for (const row of unpriced) {
    const format = gapFormat(row);
    const street = String(row.street || 'unknown').toLowerCase();
    const position = String(row.hero_position || 'UNKNOWN').toUpperCase();
    let stackBucket;
    if (row.stack_depth_bb !== undefined || row.stackDepthBb !== undefined) {
      stackBucket = bucketStackDepth(row.stack_depth_bb ?? row.stackDepthBb);
    } else if (row.stack_bucket !== undefined) {
      stackBucket = String(row.stack_bucket).toLowerCase();
    } else {
      stackBucket = classifyStackBucket(row.hero_effective_stack_bb ?? row.effective_stack_bb ?? null);
    }
    const reason = gapReason(row);
    const spotType = String(row.spot_type || 'general').toLowerCase();
    const key = `${format}|${street}|${position}|${stackBucket}|${reason}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.spotTypes[spotType] = (existing.spotTypes[spotType] || 0) + 1;
    } else {
      groups.set(key, { format, street, position, stackBucket, reason, count: 1, spotTypes: { [spotType]: 1 } });
    }
  }
  const total = unpriced.length;
  const gaps = [...groups.values()]
    .sort((a, b) => b.count - a.count
      || a.format.localeCompare(b.format) || a.street.localeCompare(b.street)
      || a.position.localeCompare(b.position) || a.stackBucket.localeCompare(b.stackBucket)
      || a.reason.localeCompare(b.reason))
    .slice(0, Math.max(1, limit))
    .map(group => {
      const dominantSpotType = Object.entries(group.spotTypes)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
      return {
        format: group.format,
        street: group.street,
        position: group.position,
        stackBucket: group.stackBucket,
        reason: group.reason,
        count: group.count,
        sharePercent: Math.round((group.count / total) * 1000) / 10,
        spotType: dominantSpotType,
        coverageHint: describeCoverageTier({
          format: group.format,
          street: group.street,
          stackBucket: group.stackBucket === '<=20bb' ? 'short' : group.stackBucket,
          spotType: dominantSpotType,
        }),
      };
    });
  return { gaps, totalUnpriced: total, totalDecisions: rows.length, bucketCount: groups.size };
}

/** Counts of decisions by how study guidance for them is sourced. */
export function summarizeCoverageTiers(decisions = []) {
  const summary = {
    solverVerified: 0,
    deterministicIcmModel: 0,
    deterministicHeuristicReference: 0,
    unsupported: 0,
    awaitingSolverCoverage: 0,
  };
  for (const row of Array.isArray(decisions) ? decisions : []) {
    if (!row) continue;
    if (row.solver_verified === true) { summary.solverVerified += 1; continue; }
    if (!isUnpricedDecision(row)) continue;
    let stackBucket;
    if (row.stack_depth_bb !== undefined || row.stackDepthBb !== undefined) {
      stackBucket = bucketStackDepth(row.stack_depth_bb ?? row.stackDepthBb);
    } else if (row.stack_bucket !== undefined) {
      stackBucket = String(row.stack_bucket).toLowerCase();
    } else {
      stackBucket = classifyStackBucket(row.hero_effective_stack_bb ?? row.effective_stack_bb ?? null);
    }
    const tier = describeCoverageTier({
      format: gapFormat(row),
      street: String(row.street || '').toLowerCase(),
      stackBucket: stackBucket === '<=20bb' ? 'short' : stackBucket,
      spotType: String(row.spot_type || '').toLowerCase(),
      gameId: row.game_id,
    }).tier;
    if (tier === COVERAGE_TIERS.ICM_MODEL) summary.deterministicIcmModel += 1;
    else if (tier === COVERAGE_TIERS.HEURISTIC_REFERENCE) summary.deterministicHeuristicReference += 1;
    else if (tier === COVERAGE_TIERS.UNSUPPORTED) summary.unsupported += 1;
    else summary.awaitingSolverCoverage += 1;
  }
  return summary;
}

// ── Coaching funnel ──────────────────────────────────────────────────────────

/**
 * Truthful funnel counts. A figure whose input was not supplied is `null`
 * (never a fabricated zero). `auditedHands` prefers the audit job's own scan
 * count; otherwise it is the distinct hands in the decision window, which is a
 * lower bound when that window is truncated.
 */
export function buildFunnelMetrics({ leaks, reviews, decisions, audit = null, verifiedFixedLive = null } = {}) {
  const leakList = Array.isArray(leaks) ? dedupeLeaks(leaks) : null;
  const reviewList = Array.isArray(reviews) ? dedupeReviews(reviews) : null;
  const decisionList = Array.isArray(decisions) ? dedupeDecisions(decisions) : null;
  const scanned = finite(audit?.handsScanned ?? audit?.hands_scanned);
  let auditedHands = null;
  let auditedHandsSource = null;
  if (scanned !== null && scanned > 0) {
    auditedHands = Math.round(scanned);
    auditedHandsSource = 'audit_job';
  } else if (decisionList && decisionList.length > 0) {
    auditedHands = new Set(decisionList.map(row => String(row?.hand_external_id || '')).filter(Boolean)).size;
    auditedHandsSource = 'decision_window';
  }
  const activeLeaks = leakList ? leakList.filter(leak => leak && leakStatus(leak) !== 'resolved').length : null;
  const leakIds = leakList ? new Set(leakList.map(leakId).filter(Boolean)) : null;
  const relevantReviews = reviewList
    ? reviewList.filter(row => !leakIds || leakIds.has(String(row?.leak_id ?? row?.leakId ?? '')))
    : null;
  const drilledLeaks = relevantReviews
    ? relevantReviews.filter(row => count(row?.reps) > 0 || (Array.isArray(row?.history) && row.history.length > 0)).length
    : null;
  const masteredLeaks = relevantReviews ? relevantReviews.filter(row => row?.retired === true).length : null;
  return {
    auditedHands,
    auditedHandsSource,
    activeLeaks,
    drilledLeaks,
    masteredLeaks,
    verifiedFixedLive: Number.isFinite(verifiedFixedLive) ? verifiedFixedLive : null,
  };
}

// ── Post-session recap ───────────────────────────────────────────────────────

function playedAtMs(row) {
  const raw = row?.hand_played_at ?? row?.handPlayedAt ?? row?.hand_created_at ?? null;
  const parsed = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The costliest graded mistakes from the latest COMPLETED session.
 * `sessionWindow` is `{ startMs, endMs, source }`. Without a verified window, or
 * without hand play times, nothing is invented: the list is empty and
 * `unavailableReason` says why. Only solver-verified, non-optimal decisions
 * qualify.
 */
export function selectTopLeakedHands(decisions = [], sessionWindow = null, limit = SESSION_RECAP_HANDS) {
  const startMs = finite(sessionWindow?.startMs);
  const endMs = finite(sessionWindow?.endMs);
  if (startMs === null || endMs === null) {
    return { hands: [], sessionSource: null, unavailableReason: 'no_completed_session' };
  }
  const from = startMs - SESSION_WINDOW_LEAD_MS;
  const to = endMs + SESSION_WINDOW_TAIL_MS;
  const rows = (Array.isArray(decisions) ? decisions : []).filter(row => {
    if (!isClubArenaLiveDecision(row)) return false;
    if (row?.solver_verified !== true) return false;
    if (['best', 'correct', 'unpriced', ''].includes(String(row?.classification || '').toLowerCase())) return false;
    const played = playedAtMs(row);
    return played !== null && played >= from && played <= to;
  });
  const lossOf = row => (row?.ev_loss_measured === true ? Math.abs(finite(row?.ev_loss) ?? 0) : 0);
  const byHand = new Map();
  for (const row of rows.sort((a, b) => lossOf(b) - lossOf(a) || (playedAtMs(b) - playedAtMs(a)))) {
    const id = String(row.hand_external_id || '');
    if (id && !byHand.has(id)) byHand.set(id, row);
  }
  const hands = [...byHand.values()].slice(0, Math.max(0, limit)).map(row => ({
    handId: String(row.hand_external_id || '').replace(/^club-arena:/, ''),
    street: String(row.street || '').toLowerCase() || null,
    position: row.hero_position ? String(row.hero_position).toUpperCase() : null,
    heroHand: row.hero_hand || null,
    playerAction: row.player_action || null,
    solverAction: row.solver_action || null,
    evLossBB: row.ev_loss_measured === true && finite(row.ev_loss) !== null
      ? Math.round(Math.abs(finite(row.ev_loss)) * 100) / 100
      : null,
  }));
  return {
    hands,
    sessionSource: sessionWindow?.source || null,
    unavailableReason: hands.length ? null : 'no_graded_mistakes_in_session',
  };
}

function masteryProgress(review, id) {
  return resolutionProgress(review ? {
    leakId: id,
    strongStreak: count(review?.strong_streak ?? review?.strongStreak),
    reps: count(review.reps),
    lapses: count(review.lapses),
    intervalDays: finite(review.interval_days ?? review.intervalDays) ?? 0,
    retired: review.retired === true,
    lastScore: finite(review.last_score ?? review.lastScore),
    lastReviewedAt: review.last_reviewed_at ?? review.lastReviewedAt ?? review.updated_at ?? null,
    history: Array.isArray(review.history) ? review.history : [],
  } : null);
}

function isPostflopFacingBetSpot(row, targetStreet = null) {
  const street = String(row?.street || '').toLowerCase();
  if (targetStreet ? street !== targetStreet : !['flop', 'turn', 'river'].includes(street)) return false;
  const action = String(row?.player_action || '').toLowerCase();
  const solverAction = String(row?.solver_action || '').toLowerCase();
  const spot = String(row?.spot_type || '').toLowerCase();
  if (action === 'fold' || action === 'call' || action === 'raise') return true;
  if (spot.includes('facing') || spot.includes('faces_bet') || spot.includes('defense') || spot.includes('bluff_catch') || spot.includes('cbet') || spot.includes('check_raise') || spot.includes('xr')) {
    return ['fold', 'call', 'raise', 'allin'].includes(action);
  }
  if (action === 'allin' && (solverAction === 'call' || solverAction === 'fold')) {
    return true;
  }
  return false;
}

function isPostflopInitiativeOrBarrelSpot(row, targetStreet) {
  const street = String(row?.street || '').toLowerCase();
  if (street !== targetStreet) return false;
  const action = String(row?.player_action || '').toLowerCase();
  const spot = String(row?.spot_type || '').toLowerCase();
  if (spot.includes('cbet') || spot.includes('barrel') || spot.includes('srp') || spot.includes('single_raised') || spot.includes('bets_or_checks') || spot.includes('value') || spot.includes('bluff')) {
    return ['check', 'bet', 'raise', 'allin'].includes(action);
  }
  return ['check', 'bet', 'raise', 'allin'].includes(action) && (!spot || spot === 'general' || spot === 'hand_history');
}

function isPreflopFacing3BetOrRaiseSpot(row) {
  const street = String(row?.street || '').toLowerCase();
  if (street !== 'preflop') return false;
  const action = String(row?.player_action || '').toLowerCase();
  const spot = String(row?.spot_type || '').toLowerCase();
  if (spot.includes('3bet') || spot.includes('three_bet') || spot.includes('4bet') || spot.includes('facing_raise') || spot.includes('facing_3bet')) {
    return ['fold', 'call', 'raise', 'allin'].includes(action);
  }
  return ['fold', 'call', 'raise', 'allin'].includes(action) && (!spot || spot === 'general' || spot === 'hand_history');
}

export function normalizeRuleLeakKey(rawKey) {
  return String(rawKey || '')
    .toLowerCase()
    .trim()
    .replace(/^(?:cash|mtt|tournament)_(?:(?:short|mid|deep|unknown)_)?/, '')
    .replace(/_facts$/, '');
}

export const RULE_LEAK_DECISION_MATCHERS = Object.freeze({
  river_overfold: (row) => isPostflopFacingBetSpot(row, 'river'),
  flop_cbet_too_low: (row) => isPostflopInitiativeOrBarrelSpot(row, 'flop'),
  cbet_too_rarely: (row) => isPostflopInitiativeOrBarrelSpot(row, 'flop'),
  flop_cbet_too_high: (row) => isPostflopInitiativeOrBarrelSpot(row, 'flop'),
  cbet_too_often: (row) => isPostflopInitiativeOrBarrelSpot(row, 'flop'),
  overfolding_to_cbets: (row) => isPostflopFacingBetSpot(row, 'flop'),
  check_raise_too_rare: (row) => {
    const street = String(row?.street || '').toLowerCase();
    const action = String(row?.player_action || '').toLowerCase();
    const spot = String(row?.spot_type || '').toLowerCase();
    if (!['flop', 'turn', 'river'].includes(street)) return false;
    if (spot.includes('check_raise') || spot.includes('xr') || spot.includes('facing') || spot.includes('faces_bet') || spot.includes('cbet') || spot.includes('defense')) {
      return ['check', 'call', 'raise', 'fold', 'allin'].includes(action);
    }
    return ['check', 'call', 'raise', 'fold'].includes(action);
  },
  check_raise_too_rare_facts: (row) => RULE_LEAK_DECISION_MATCHERS.check_raise_too_rare(row),
  fold_to_3bet_high: (row) => isPreflopFacing3BetOrRaiseSpot(row),
  fold_to_3bet_too_high: (row) => isPreflopFacing3BetOrRaiseSpot(row),
  overfolding_to_3bet: (row) => isPreflopFacing3BetOrRaiseSpot(row),
  three_bet_too_tight: (row) => {
    const street = String(row?.street || '').toLowerCase();
    const action = String(row?.player_action || '').toLowerCase();
    const spot = String(row?.spot_type || '').toLowerCase();
    return street === 'preflop' && (
      spot.includes('3bet') || spot.includes('three_bet') || spot.includes('facing_raise') || spot.includes('facing_open') || spot.includes('squeeze')
      || ['fold', 'call', 'raise', 'allin'].includes(action)
    );
  },
  three_bet_too_loose: (row) => RULE_LEAK_DECISION_MATCHERS.three_bet_too_tight(row),
  cold_call_too_wide: (row) => {
    const street = String(row?.street || '').toLowerCase();
    const action = String(row?.player_action || '').toLowerCase();
    const spot = String(row?.spot_type || '').toLowerCase();
    return street === 'preflop' && (
      spot.includes('cold_call') || spot.includes('facing_raise') || spot.includes('facing_open') || spot.includes('3bet')
      || ['call', 'fold', 'raise', 'allin'].includes(action)
    );
  },
  overfolding_preflop: (row) => {
    const street = String(row?.street || '').toLowerCase();
    const action = String(row?.player_action || '').toLowerCase();
    return street === 'preflop' && ['fold', 'call', 'raise', 'bet', 'allin'].includes(action);
  },
  overlimping: (row) => {
    const street = String(row?.street || '').toLowerCase();
    const action = String(row?.player_action || '').toLowerCase();
    const spot = String(row?.spot_type || '').toLowerCase();
    return street === 'preflop' && (
      spot.includes('limp') || spot.includes('open') || spot.includes('rfi')
      || ['call', 'check', 'raise', 'fold'].includes(action)
    );
  },
  vpip_too_high: (row) => {
    const street = String(row?.street || '').toLowerCase();
    const action = String(row?.player_action || '').toLowerCase();
    return street === 'preflop' && ['fold', 'call', 'raise', 'bet', 'allin'].includes(action);
  },
  pfr_too_low: (row) => {
    const street = String(row?.street || '').toLowerCase();
    const action = String(row?.player_action || '').toLowerCase();
    return street === 'preflop' && ['call', 'check', 'raise', 'fold'].includes(action);
  },
  bb_overfold: (row) => {
    const street = String(row?.street || '').toLowerCase();
    const pos = String(row?.hero_position || '').toUpperCase();
    const action = String(row?.player_action || '').toLowerCase();
    return street === 'preflop' && pos === 'BB' && ['fold', 'call', 'raise', 'allin'].includes(action);
  },
  blind_defense_too_tight: (row) => {
    const street = String(row?.street || '').toLowerCase();
    const pos = String(row?.hero_position || '').toUpperCase();
    const action = String(row?.player_action || '').toLowerCase();
    const spot = String(row?.spot_type || '').toLowerCase();
    return street === 'preflop'
      && (pos === 'BB' || pos === 'SB' || spot.includes('blind') || spot.includes('defense') || spot.includes('facing_steal'))
      && ['fold', 'call', 'raise', 'allin'].includes(action);
  },
  steal_too_rare: (row) => {
    const street = String(row?.street || '').toLowerCase();
    const pos = String(row?.hero_position || '').toUpperCase();
    const action = String(row?.player_action || '').toLowerCase();
    const spot = String(row?.spot_type || '').toLowerCase();
    return street === 'preflop'
      && (['CO', 'BTN', 'BU', 'SB'].includes(pos) || spot.includes('steal') || spot.includes('open') || spot.includes('rfi'))
      && ['fold', 'raise', 'call', 'allin'].includes(action);
  },
  squeeze_too_rare: (row) => {
    const street = String(row?.street || '').toLowerCase();
    const action = String(row?.player_action || '').toLowerCase();
    const spot = String(row?.spot_type || '').toLowerCase();
    return street === 'preflop'
      && (spot.includes('squeeze') || spot.includes('facing_raise') || spot.includes('3bet') || ['fold', 'call', 'raise', 'allin'].includes(action));
  },
  btn_too_tight: (row) => {
    const street = String(row?.street || '').toLowerCase();
    const pos = String(row?.hero_position || '').toUpperCase();
    const action = String(row?.player_action || '').toLowerCase();
    return street === 'preflop' && (pos === 'BTN' || pos === 'BU' || !pos) && ['fold', 'call', 'raise', 'allin'].includes(action);
  },
  utg_too_loose: (row) => {
    const street = String(row?.street || '').toLowerCase();
    const pos = String(row?.hero_position || '').toUpperCase();
    const action = String(row?.player_action || '').toLowerCase();
    return street === 'preflop' && (pos.startsWith('UTG') || pos === 'EP' || !pos) && ['fold', 'call', 'raise', 'allin'].includes(action);
  },
  turn_barrel_leak: (row) => {
    const street = String(row?.street || '').toLowerCase();
    const action = String(row?.player_action || '').toLowerCase();
    return street === 'turn' && ['check', 'bet', 'raise', 'fold', 'allin'].includes(action);
  },
  turn_barrel_too_rare: (row) => isPostflopInitiativeOrBarrelSpot(row, 'turn'),
  turn_barrel_too_rare_facts: (row) => isPostflopInitiativeOrBarrelSpot(row, 'turn'),
  turn_overfold: (row) => isPostflopFacingBetSpot(row, 'turn'),
  river_barrel_too_rare: (row) => isPostflopInitiativeOrBarrelSpot(row, 'river'),
  river_barrel_too_rare_facts: (row) => isPostflopInitiativeOrBarrelSpot(row, 'river'),
  lack_of_river_bluffs: (row) => isPostflopInitiativeOrBarrelSpot(row, 'river'),
  missing_thin_value: (row) => isPostflopInitiativeOrBarrelSpot(row, 'river'),
  missed_value: (row) => isPostflopInitiativeOrBarrelSpot(row, 'river') || isPostflopInitiativeOrBarrelSpot(row, 'turn'),
  aggression_low: (row) => {
    const street = String(row?.street || '').toLowerCase();
    const action = String(row?.player_action || '').toLowerCase();
    return ['flop', 'turn', 'river'].includes(street) && ['call', 'check', 'bet', 'raise', 'allin'].includes(action);
  },
  passive_postflop: (row) => {
    const street = String(row?.street || '').toLowerCase();
    const action = String(row?.player_action || '').toLowerCase();
    return ['flop', 'turn', 'river'].includes(street) && ['call', 'check', 'bet', 'raise', 'allin'].includes(action);
  },
  passive_postflop_facts: (row) => RULE_LEAK_DECISION_MATCHERS.passive_postflop(row),
  passive_turn_river: (row) => {
    const street = String(row?.street || '').toLowerCase();
    const action = String(row?.player_action || '').toLowerCase();
    return ['turn', 'river'].includes(street) && ['call', 'check', 'bet', 'raise', 'allin'].includes(action);
  },
  over_aggressive_postflop: (row) => {
    const street = String(row?.street || '').toLowerCase();
    const action = String(row?.player_action || '').toLowerCase();
    return ['flop', 'turn', 'river'].includes(street) && ['bet', 'raise', 'allin', 'check', 'call'].includes(action);
  },
  over_calling: (row) => {
    const action = String(row?.player_action || '').toLowerCase();
    return ['call', 'fold', 'raise'].includes(action) || isPostflopFacingBetSpot(row);
  },
});

export function findRuleBasedDecisions(rawLeak, id, decisionIndex) {
  const rawKey = String(rawLeak?.leak_type || rawLeak?.leakType || rawLeak?.situation_class || rawLeak?.situationClass || id || '').toLowerCase().trim();
  const leakKey = normalizeRuleLeakKey(rawKey);
  if (!leakKey || leakKey.length < 3) return [];
  const matcher = RULE_LEAK_DECISION_MATCHERS[rawKey]
    || RULE_LEAK_DECISION_MATCHERS[leakKey]
    || Object.entries(RULE_LEAK_DECISION_MATCHERS).find(([k]) => (
      k.length >= 3 && (leakKey === k || leakKey.includes(k) || k.includes(leakKey))
    ))?.[1];
  if (!matcher || typeof matcher !== 'function') return [];
  const list = decisionIndex?.list || [];
  return list.filter(row => {
    try {
      return Boolean(matcher(row));
    } catch (_) {
      return false;
    }
  });
}

export function buildStakePoolContext({ leak, poolBenchmarks, liveTableActive, cooldownActive } = {}) {
  if (liveTableActive || cooldownActive) return null;
  if (!leak || !poolBenchmarks) return null;

  let benchmarksList = [];
  if (Array.isArray(poolBenchmarks)) {
    benchmarksList = poolBenchmarks;
  } else if (typeof poolBenchmarks === 'object') {
    benchmarksList = Object.values(poolBenchmarks);
  }

  const leakFormat = String(leak?.format || leak?.gameType || '').toLowerCase();
  const leakCat = String(leak?.category || leak?.leakCategory || leak?.leak_category || '').toLowerCase();
  const leakType = String(leak?.leakType || leak?.leak_type || leak?.id || '').toLowerCase();

  const match = benchmarksList.find(b => {
    if (!b) return false;
    const sample = Number(b.sampleHands ?? b.sample_hands ?? 0);
    if (!Number.isFinite(sample) || sample < 500) return false;
    if (b.verified === false) return false;

    if (b.format && leakFormat && String(b.format).toLowerCase() !== leakFormat) return false;

    const bKey = String(b.key || b.category || b.leakType || b.leak_type || b.leakCategory || '').toLowerCase();
    if (!bKey) return false;
    return bKey === leakType || bKey === leakCat || leakType.includes(bKey) || bKey.includes(leakType) || leakCat.includes(bKey) || bKey.includes(leakCat);
  });

  if (!match) return null;

  const sampleHands = Number(match.sampleHands ?? match.sample_hands);
  const stakeLabel = String(match.stakeLabel ?? match.stakes ?? match.stake ?? 'Pool Stakes');
  const poolMetricLabel = String(match.poolMetricLabel ?? match.poolMetric ?? match.poolAverage ?? match.metricLabel ?? 'Pool Average');
  const gtoBaselineLabel = String(match.gtoBaselineLabel ?? match.gtoBaseline ?? match.baselineLabel ?? 'GTO Baseline');
  const label = String(match.label ?? `${stakeLabel} Pool Context`);

  return {
    label,
    stakeLabel,
    poolMetricLabel,
    gtoBaselineLabel,
    sampleHands,
    readOnly: true,
    postSessionOnly: true,
  };
}

/** Table verification for a leak against the full indexed decision window. */
function leakTableVerification(rawLeak, id, review, decisionIndex, claimedSet = null) {
  let related = relatedDecisionsFor(
    decisionIndex, id, String(rawLeak?.leakType || rawLeak?.leak_type || ''),
  );
  if (related.length === 0) {
    related = findRuleBasedDecisions(rawLeak, id, decisionIndex);
  }
  const mastered = masteryProgress(review, id)?.retired === true;
  return evaluateTableVerification(rawLeak, review, related, mastered, claimedSet);
}

/**
 * Extracts a deterministic representative hand & decision summary for a finding.
 * Never fabricates optimal solver actions or EV loss when solver_verified or
 * ev_loss_measured is false.
 */
export function buildRepresentativeHandSummary(leak, relatedDecisions = []) {
  const rows = Array.isArray(relatedDecisions) ? relatedDecisions.filter(Boolean) : [];
  const mistakeRows = rows.filter(
    row => !['best', 'correct'].includes(String(row?.classification || '').toLowerCase()),
  );
  const pool = mistakeRows.length > 0 ? mistakeRows : rows;
  const lossOf = row => (row?.ev_loss_measured === true ? Math.abs(finite(row?.ev_loss) ?? 0) : -1);
  const sorted = [...pool].sort((a, b) => {
    const lossDiff = lossOf(b) - lossOf(a);
    if (lossDiff !== 0) return lossDiff;
    const tA = playedAtMs(a) ?? new Date(a?.audited_at ?? 0).getTime();
    const tB = playedAtMs(b) ?? new Date(b?.audited_at ?? 0).getTime();
    return tB - tA;
  });
  const rep = sorted[0] || leak?.representativeDecision || leak?.representative_decision || null;
  const drill = leakToDrill(leak);
  const rawExternalId = String(
    rep?.hand_external_id
    ?? rep?.handExternalId
    ?? leak?.representative_hand_id
    ?? leak?.representativeHandId
    ?? (Array.isArray(leak?.sample_hand_ids) ? leak.sample_hand_ids[0] : null)
    ?? '',
  ).trim();
  const handId = rawExternalId ? rawExternalId.replace(/^club-arena:/, '') : null;
  const solverVerified = rep?.solver_verified === true;
  const evMeasured = rep?.ev_loss_measured === true
    || (rep === null && (leak?.evLossMeasured === true || leak?.ev_loss_measured === true));
  const rawEvLoss = rep?.ev_loss_measured === true
    ? finite(rep?.ev_loss ?? rep?.evLossBB)
    : (evMeasured ? measuredLoss(leak) : null);
  const evLossBB = evMeasured && rawEvLoss !== null
    ? Math.round(Math.abs(rawEvLoss) * 100) / 100
    : null;
  const priceOrSizing = rep?.price_or_sizing
    ?? rep?.priceOrSizing
    ?? (finite(rep?.pot_odds_pct) !== null ? `${finite(rep.pot_odds_pct)}% pot odds` : null)
    ?? (finite(rep?.bet_pct_pot) !== null ? `${finite(rep.bet_pct_pot)}% pot bet` : null)
    ?? String(rep?.spot_type ?? leak?.spotType ?? leak?.spot_type ?? drill?.spotType ?? 'general');

  return {
    handId: handId || null,
    handExternalId: rawExternalId || null,
    decisionKey: rep?.decision_key ?? rep?.decisionKey ?? null,
    street: String(rep?.street || leak?.street || drill?.street || 'Preflop'),
    heroPosition: String(rep?.hero_position || rep?.heroPosition || leak?.hero_position || leak?.position || drill?.position || 'BTN').toUpperCase(),
    villainPosition: rep?.villain_position || rep?.villainPosition || null,
    heroHand: rep?.hero_hand ?? rep?.heroHand ?? null,
    boardCards: Array.isArray(rep?.board_cards)
      ? rep.board_cards
      : (Array.isArray(rep?.boardCards) ? rep.boardCards : []),
    playerAction: rep?.player_action ?? rep?.playerAction ?? null,
    solverAction: solverVerified ? (rep?.solver_action ?? rep?.solverAction ?? null) : null,
    spotType: String(rep?.spot_type || rep?.spotType || leak?.spotType || leak?.spot_type || drill?.spotType || 'general'),
    priceOrSizing,
    stackDepthBb: finite(rep?.stack_depth_bb ?? rep?.stackDepthBb ?? leak?.stack_depth_bb ?? null),
    evLossBB,
    evLossMeasured: Boolean(evMeasured && evLossBB !== null),
    solverVerified,
  };
}

function minSamplesForLeak(leak) {
  const explicit = finite(leak?.minSamples ?? leak?.min_samples ?? leak?.minOpportunities);
  if (explicit !== null && explicit > 0) return Math.round(explicit);
  const rawKey = String(leak?.leakType || leak?.leak_type || leak?.id || '').toLowerCase().trim();
  const normKey = normalizeRuleLeakKey(rawKey);
  if (LEAK_PATTERNS[rawKey]?.minSamples) return LEAK_PATTERNS[rawKey].minSamples;
  if (LEAK_PATTERNS[normKey]?.minSamples) return LEAK_PATTERNS[normKey].minSamples;
  const factsKey = `${normKey}_facts`;
  if (CA_HAND_FACTS_DETECTORS[rawKey]?.minOpportunities) return CA_HAND_FACTS_DETECTORS[rawKey].minOpportunities;
  if (CA_HAND_FACTS_DETECTORS[normKey]?.minOpportunities) return CA_HAND_FACTS_DETECTORS[normKey].minOpportunities;
  if (CA_HAND_FACTS_DETECTORS[factsKey]?.minOpportunities) return CA_HAND_FACTS_DETECTORS[factsKey].minOpportunities;
  if (rawKey.startsWith('solver_')) return 5;
  return 12;
}

/**
 * Qualifies sample and opportunity counts for a leak or candidate spot.
 */
export function buildSampleQualification(leak, relatedDecisions = []) {
  const rows = Array.isArray(relatedDecisions) ? relatedDecisions.filter(Boolean) : [];
  const rawSamples = leakSamples(leak);
  const rawMistakes = leakMistakes(leak);
  const opportunities = rawSamples > 0 ? rawSamples : rows.length;
  const mistakes = rawMistakes > 0
    ? rawMistakes
    : rows.filter(r => !['best', 'correct', 'unpriced', ''].includes(String(r?.classification || '').toLowerCase())).length;
  const minRequiredSamples = minSamplesForLeak(leak);
  const minRequiredMistakes = String(leak?.leakType || leak?.leak_type || '').startsWith('solver_') ? 3 : 2;
  const mistakeRatePct = opportunities > 0 ? Math.round((mistakes / opportunities) * 1000) / 10 : null;
  const measuredDecisionMistakes = rows.filter(
    r => r?.ev_loss_measured === true && !['best', 'correct'].includes(String(r?.classification || '').toLowerCase()),
  ).length;
  const measuredEvMistakes = measuredDecisionMistakes > 0
    ? measuredDecisionMistakes
    : (measuredLoss(leak) !== null ? mistakes : 0);
  const sufficientSample = opportunities >= minRequiredSamples && mistakes >= minRequiredMistakes;
  let sampleState = 'no_opportunities_recorded';
  if (sufficientSample) {
    sampleState = 'recurring_leak_qualified';
  } else if (mistakes === 1) {
    sampleState = 'single_hand_observation';
  } else if (opportunities > 0) {
    sampleState = 'insufficient_sample';
  }
  return {
    mistakes,
    opportunities,
    minRequiredSamples,
    minRequiredMistakes,
    mistakeRatePct,
    measuredEvMistakes,
    sufficientSample,
    sampleState,
  };
}

/**
 * Complete advice & evidence basis contract for a finding:
 * plain-English takeaway, representative hand, sample & opportunity counts,
 * explicit basis classification, rule version, and skill-matched Practice This target.
 */
export function buildAdviceExplanation(leak, relatedDecisions = [], availableGameIds = null) {
  const drillParams = leakToDrill(leak);
  const trainingGameId = leakToTrainingGame(leak, availableGameIds)
    || resolveSkillMatchedDrillGame(leak, drillParams?.street)
    || drillParams?.game
    || null;
  const evidenceBasis = resolveLeakEvidenceBasis(leak, relatedDecisions);
  const ruleVersion = resolveLeakRuleVersion(leak);
  const takeaway = leak?.takeaway || buildLeakTakeaway(leak);
  const representativeHand = buildRepresentativeHandSummary(leak, relatedDecisions);
  const sampleCounts = buildSampleQualification(leak, relatedDecisions);
  const practiceTarget = {
    trainingGameId,
    street: drillParams?.street || representativeHand.street || 'Preflop',
    position: drillParams?.position || representativeHand.heroPosition || 'BTN',
    spotType: drillParams?.spotType || representativeHand.spotType || normalizeRuleLeakKey(leak?.leakType || leak?.leak_type || '') || 'general',
    limit: drillParams?.limit || 'NL100',
  };
  return {
    evidenceBasis,
    ruleVersion,
    takeaway,
    representativeHand,
    sampleCounts,
    practiceTarget,
  };
}

/**
 * Deterministic qualification evaluator for any candidate finding, single hand,
 * missing-metric spot, unsupported game variant, or failed solver lookup.
 * Enforces:
 *   - Unsupported game / missing metric / failed lookup -> explicit limitation, zero fabricated optimal play or EV loss
 *   - Single poor decision or too few opportunities -> explains hand & exact count without claiming recurring leak
 *   - Supported recurring mistake -> cites decisions, evidence basis, rule version, takeaway, and skill-matched practice target
 */
export function qualifyDetectorFinding({
  leak = null,
  decisions = [],
  gameVariant = null,
  metricAvailable = true,
  availableGameIds = null,
} = {}) {
  const normalizedVariant = String(gameVariant || leak?.gameVariant || leak?.game_variant || 'nlhe').toLowerCase().trim();
  const isUnsupportedVariant = ['plo', 'plo5', 'plo6', 'omaha', 'ofc', 'pineapple', 'short_deck', '6plus', 'stud', 'razz', 'badugi', 'draw', 'mixed', 'unsupported'].some(
    v => normalizedVariant === v || normalizedVariant.includes(v),
  );
  if (isUnsupportedVariant) {
    return {
      status: 'unsupported_game_context',
      isRecurringLeak: false,
      gameVariant: normalizedVariant,
      ruleVersion: resolveLeakRuleVersion(leak),
      evidenceBasis: null,
      optimalAction: null,
      evLossBB: null,
      evLossMeasured: false,
      limitation: `Unsupported game variant (${normalizedVariant.toUpperCase()}): deterministic leak detectors and Hold'em solver tables only support No-Limit Hold'em cash and tournament hands.`,
    };
  }

  if (metricAvailable === false) {
    return {
      status: 'unavailable_metric',
      isRecurringLeak: false,
      ruleVersion: resolveLeakRuleVersion(leak),
      evidenceBasis: null,
      optimalAction: null,
      evLossBB: null,
      evLossMeasured: false,
      limitation: 'Required opportunity or action frequency metric is unavailable for this spot; no recurring leak, optimal frequency, or EV loss is claimed.',
    };
  }

  const dedupedDecisions = dedupeDecisions(decisions);
  const allUnpricedOrLookupFailed = dedupedDecisions.length > 0 && dedupedDecisions.every(
    row => row?.solver_verified !== true || /lookup-failed|unpriced/i.test(String(row?.solver_source || '')),
  );
  if (!leak && allUnpricedOrLookupFailed) {
    const first = dedupedDecisions[0];
    const isLookupFailed = /lookup-failed/i.test(String(first?.solver_source || ''));
    return {
      status: isLookupFailed ? 'solver_lookup_failed' : 'unpriced_spot',
      isRecurringLeak: false,
      ruleVersion: SOLVER_EVIDENCE_RULE_VERSION,
      evidenceBasis: null,
      optimalAction: null,
      evLossBB: null,
      evLossMeasured: false,
      sampleCounts: {
        mistakes: 0,
        opportunities: dedupedDecisions.length,
        sufficientSample: false,
        sampleState: isLookupFailed ? 'solver_lookup_failed' : 'unpriced_spot',
      },
      limitation: isLookupFailed
        ? 'Solver lookup failed for this decision node; optimal action and EV loss are withheld rather than fabricated.'
        : 'No exact solver node or chart covers this spot; decision is preserved as unpriced with zero fabricated EV loss.',
    };
  }

  if (!leak && dedupedDecisions.length > 0) {
    const solverQual = qualifySolverDecisionSample(dedupedDecisions, { minSamples: 5, minMistakes: 3 });
    if (!solverQual.isRecurringLeak) {
      const sampleState = solverQual.mistakes === 1 ? 'single_hand_observation' : solverQual.state;
      return {
        status: sampleState,
        isRecurringLeak: false,
        ruleVersion: solverQual.ruleVersion,
        evidenceBasis: solverQual.evidenceBasis,
        optimalAction: solverQual.optimalAction,
        evLossBB: solverQual.evLossMeasured ? solverQual.evLossBB : null,
        evLossMeasured: Boolean(solverQual.evLossMeasured),
        sampleCounts: {
          mistakes: solverQual.mistakes,
          opportunities: solverQual.opportunities,
          minRequiredSamples: solverQual.requiredOpportunities,
          minRequiredMistakes: solverQual.requiredMistakes,
          sufficientSample: false,
          sampleState,
        },
        handExplanation: solverQual.explanation,
        limitation: sampleState === 'insufficient_sample' || sampleState === 'single_hand_observation'
          ? solverQual.explanation
          : null,
      };
    }
  }

  const effectiveLeak = leak || {};
  const advice = buildAdviceExplanation(effectiveLeak, dedupedDecisions, availableGameIds);
  if (!advice.sampleCounts.sufficientSample) {
    const { mistakes, opportunities, minRequiredSamples, minRequiredMistakes, sampleState } = advice.sampleCounts;
    const rep = advice.representativeHand;
    const handDesc = rep.handId
      ? `Hand ${rep.handId} (${rep.street} ${rep.heroPosition}${rep.playerAction ? ` ${rep.playerAction}` : ''})`
      : `${rep.street} ${rep.heroPosition} spot`;
    return {
      status: sampleState,
      isRecurringLeak: false,
      ruleVersion: advice.ruleVersion,
      evidenceBasis: advice.evidenceBasis,
      optimalAction: rep.solverVerified ? rep.solverAction : null,
      evLossBB: rep.evLossMeasured ? rep.evLossBB : null,
      evLossMeasured: rep.evLossMeasured,
      sampleCounts: advice.sampleCounts,
      representativeHand: rep,
      handExplanation: mistakes === 1
        ? `Single-hand observation on ${handDesc}: 1 mistake across ${opportunities} eligible opportunities (minimum ${minRequiredMistakes} mistakes across ${minRequiredSamples} opportunities required before claiming a recurring leak).`
        : `Insufficient sample on ${handDesc}: ${mistakes} mistakes across ${opportunities} eligible opportunities (minimum ${minRequiredMistakes} mistakes across ${minRequiredSamples} opportunities required before claiming a recurring leak).`,
    };
  }

  return {
    status: 'recurring_leak_qualified',
    isRecurringLeak: true,
    ...advice,
  };
}

/**
 * Authoritative catalog of every active detector across `leakRecord.js` (16 patterns),
 * `caHandFactsAnalyzer.mjs` (11 opportunity detectors), and `solverDecisionEvidence.js`
 * (solver & chart decision group aggregator).
 */
export const DETECTOR_QUALIFICATION_MATRIX = Object.freeze([
  ...Object.entries(LEAK_PATTERNS).map(([id, pattern]) => {
    const canonicalStreet = title(pattern.street || pattern.category || 'Preflop');
    const cashLeak = { leakType: id, leakCategory: pattern.category, street: canonicalStreet, recommendedDrill: pattern.recommendedDrill };
    const mttLeak = { leakType: id, leakCategory: pattern.category, street: canonicalStreet, format: 'mtt', recommendedDrill: null };
    return Object.freeze({
      id,
      family: 'leak_patterns',
      title: pattern.name || pattern.title || title(id),
      ruleVersion: pattern.ruleVersion || DETECTOR_RULE_VERSION,
      gameContext: 'Cash & Tournament NLH',
      street: canonicalStreet,
      spotType: pattern.spotType,
      inputs: Object.freeze([...new Set([...(PATTERN_STAT_KEYS[id] || [id]), pattern.opportunityKey || 'handsPlayed'])]),
      opportunityKey: pattern.opportunityKey || 'handsPlayed',
      minSamples: pattern.minSamples || 15,
      evidenceSource: 'ca_player_stats_overview_separated / hand_audit_decisions',
      evidenceBasis: pattern.evidenceBasis || EVIDENCE_BASIS.DETERMINISTIC_RULE,
      recommendation: generateLeakFix({ leakType: id }),
      practiceMapping: Object.freeze({
        cashGameId: leakToTrainingGame(cashLeak),
        mttGameId: resolveSkillMatchedDrillGame(mttLeak, canonicalStreet),
        street: canonicalStreet,
        spotType: pattern.spotType,
      }),
    });
  }),
  ...Object.values(CA_HAND_FACTS_DETECTORS).map((det) => Object.freeze({
    id: det.slug,
    family: 'ca_hand_facts',
    title: title(det.slug),
    ruleVersion: det.ruleVersion || CA_HAND_FACTS_RULE_VERSION,
    gameContext: 'Cash & Tournament NLH (Per Format & Stack Bucket)',
    street: title(det.street),
    spotType: det.spotType,
    inputs: Object.freeze([det.opportunityField, 'hero_position', 'is_tournament', 'hero_effective_stack_bb']),
    opportunityKey: det.opportunityField,
    minSamples: det.minOpportunities,
    evidenceSource: 'ca_hand_facts',
    evidenceBasis: det.evidenceBasis || EVIDENCE_BASIS.DETERMINISTIC_RULE,
    recommendation: `Calibrate ${det.spotType} frequency on ${det.opportunityField} (${det.heroPosition})`,
    practiceMapping: Object.freeze({
      cashGameId: det.cashDrill,
      mttShortGameId: det.tournamentShortDrill || det.tournamentDrill,
      mttDeepGameId: det.tournamentDrill,
      street: title(det.street),
      spotType: det.spotType,
    }),
  })),
  Object.freeze({
    id: 'solver_decision_group',
    family: 'solver_decision_evidence',
    title: 'Solver & Chart Decision Evidence Aggregator',
    ruleVersion: SOLVER_EVIDENCE_RULE_VERSION,
    gameContext: 'Cash & Tournament NLH (By Evidence Scope, Game, Street, Position, Spot)',
    street: 'Preflop | Flop | Turn | River',
    spotType: 'exact_node_or_chart_spot',
    inputs: Object.freeze(['hand_audit_decisions', 'jarvis_training_question_attempts']),
    opportunityKey: 'grouped_decisions_in_spot',
    minSamples: 5,
    evidenceSource: 'jarvis_Precomputed_Solutions / mttShortStackCharts / deterministic_policy',
    evidenceBasis: `${EVIDENCE_BASIS.EXACT_SOLVER_MATCH} | ${EVIDENCE_BASIS.CHART}`,
    recommendation: 'Follow highest-EV solver or push/fold chart action at this street, position, and stack depth',
    practiceMapping: Object.freeze({
      preflopCashGameId: 'cash-001',
      flopCashGameId: 'cash-002',
      turnCashGameId: 'cash-004',
      riverDefenseCashGameId: 'cash-005',
      riverValueCashGameId: 'cash-012',
      mttShortGameId: 'mtt-001',
      mttPostflopGameId: 'mtt-024',
    }),
  }),
]);

/**
 * Deterministic Training Plan generator.
 * Turns ranked active leaks, audited Club Arena/Training decisions, and
 * spaced-repetition review state into an ordered, reproducible training plan
 * with concrete drill targets, mastery thresholds, table-verified resolution
 * tracking, and hand evidence links.
 */
export function buildTrainingPlan({
  leaks = [],
  decisions = [],
  reviews = [],
  coverage = {},
  now = Date.now(),
  availableGameIds = null,
  decisionIndex = null,
  poolBenchmarks = null,
  liveTableActive = false,
  cooldownActive = false,
  claimedReferenceIds = null,
} = {}) {
  const uniqueLeaks = dedupeLeaks(leaks);
  const uniqueDecisions = dedupeDecisions(decisions);
  const uniqueReviews = dedupeReviews(reviews);
  const claimedSet = toClaimedSet(claimedReferenceIds);
  const priorities = rankCoachingPriorities(uniqueLeaks, uniqueReviews, coverage, now);
  const leakById = new Map(uniqueLeaks.map(item => [leakId(item), item]));
  const reviewByLeak = new Map(uniqueReviews.map(row => [String(row?.leak_id ?? row?.leakId ?? ''), row]));
  const lookup = decisionIndex || buildDecisionIndex(uniqueDecisions);

  const modules = priorities.slice(0, 6).map((priority, index) => {
    const rawLeak = leakById.get(priority.id) || priority;
    const review = reviewByLeak.get(priority.id) || null;
    const currentStreak = count(review?.strong_streak ?? review?.strongStreak);
    const targetStreak = RETIRE_AFTER_STRONG;
    const progress = masteryProgress(review, priority.id);
    let relatedDecisions = relatedDecisionsFor(
      lookup, priority.id, String(rawLeak?.leakType || rawLeak?.leak_type || ''),
    );
    if (relatedDecisions.length === 0) {
      relatedDecisions = findRuleBasedDecisions(rawLeak, priority.id, lookup);
    }
    const exampleHands = [...new Set(
      relatedDecisions
        .map(row => String(row?.hand_external_id || '').replace(/^club-arena:/, '').trim())
        .filter(Boolean),
    )].slice(0, 3);
    const drillParams = leakToDrill(rawLeak);
    const trainingGameId = leakToTrainingGame(rawLeak, availableGameIds)
      || resolveSkillMatchedDrillGame(rawLeak, drillParams?.street)
      || drillParams?.game
      || null;
    const advice = buildAdviceExplanation(rawLeak, relatedDecisions, availableGameIds);
    const formatScope = inferFormatScope(rawLeak, relatedDecisions);
    const mastered = progress?.retired === true;
    const tableVerification = evaluateTableVerification(rawLeak, review, relatedDecisions, mastered, claimedSet);
    const stakePoolContext = buildStakePoolContext({
      leak: rawLeak,
      poolBenchmarks,
      liveTableActive,
      cooldownActive,
    });
    const targetSessions = mastered ? 0 : Math.max(1, targetStreak - currentStreak);
    const cadence = tableVerification.status === 'relapsed_at_tables'
      ? 'Re-Drill Required'
      : (priority.due
          ? 'Review Due Today'
          : (review?.due_at || review?.dueAt ? 'Scheduled Spaced Review' : 'Start Baseline Drill'));

    return {
      rank: index + 1,
      leakId: priority.id,
      title: priority.title,
      category: priority.category,
      status: priority.status,
      formatScope,
      cadence,
      due: priority.due,
      dueAt: priority.dueAt,
      priorityScore: priority.score,
      confidence: priority.confidence,
      measuredEvLoss: priority.measuredEvLoss,
      mistakes: priority.mistakes,
      samples: priority.samples,
      drillParams,
      trainingGameId,
      exampleHands,
      evidenceBasis: advice.evidenceBasis,
      ruleVersion: advice.ruleVersion,
      takeaway: advice.takeaway,
      representativeHand: advice.representativeHand,
      sampleCounts: advice.sampleCounts,
      practiceTarget: advice.practiceTarget,
      mastery: {
        currentStreak,
        targetStreak,
        percent: progress?.percent || 0,
        stage: progress?.stage || 'not-started',
        mastered,
        targetAccuracyPercent: 85,
        remainingSessions: targetSessions,
      },
      tableVerification,
      ...(stakePoolContext ? { stakePoolContext } : {}),
      objective: tableVerification.status === 'confirmed_fixed_at_tables'
        ? 'Verified Fixed In Post-Drill Live Play. Keep Reviewing Periodically To Prevent Regression.'
        : (priority.measuredEvLoss !== null
            ? `Recover ${priority.measuredEvLoss.toFixed(2)} BB Per Spot By Completing ${targetSessions || 1} Focused ${drillParams?.street || 'Spot'} Drill Session${(targetSessions || 1) === 1 ? '' : 's'} At 85% Or Higher.`
            : `Complete ${targetSessions || 1} Focused ${drillParams?.street || 'Spot'} Drill Session${(targetSessions || 1) === 1 ? '' : 's'} At 85% Or Higher And Re-Audit Fresh Club Arena Hands.`),
    };
  });

  const dueCount = modules.filter(item => item.due).length;
  const masteredCount = modules.filter(item => item.mastery.mastered).length;
  const tableVerifiedCount = modules.filter(item => item.tableVerification.status === 'confirmed_fixed_at_tables').length;
  return {
    version: 'pa-training-plan-v2',
    generatedAt: new Date(now).toISOString(),
    totalModules: modules.length,
    dueNowCount: dueCount,
    masteredCount,
    tableVerifiedCount,
    headline: modules.length
      ? `${modules.length} Targeted Drill Module${modules.length === 1 ? '' : 's'} Ordered By Impact`
      : 'No Active Training Plan Modules Are Pending',
    modules,
  };
}

export function buildCoachingSnapshot({
  leaks = [],
  decisions = [],
  reviews = [],
  rejected = {},
  now = Date.now(),
  versions = {},
  availableGameIds = null,
  audit = null,
  liveTable = null,
  sessionWindow = null,
  poolBenchmarks = null,
  claimedReferenceIds = null,
} = {}) {
  const uniqueLeaks = dedupeLeaks(leaks);
  const uniqueDecisions = dedupeDecisions(decisions);
  const uniqueReviews = dedupeReviews(reviews);
  const claimedSet = toClaimedSet(claimedReferenceIds);
  const coverage = decisionCoverage(uniqueDecisions, rejected);
  const solverCoverageGaps = summarizeSolverCoverageGaps(uniqueDecisions);
  const priorities = rankCoachingPriorities(uniqueLeaks, uniqueReviews, coverage, now);
  const decisionIndex = buildDecisionIndex(uniqueDecisions);

  const liveStateKnown = Boolean(liveTable) && typeof liveTable === 'object';
  const liveTableActive = liveStateKnown ? liveTable.active === true : true;
  const cooldownActive = liveStateKnown && liveTable.cooldown === true;

  const trainingPlan = buildTrainingPlan({
    leaks: uniqueLeaks,
    decisions: uniqueDecisions,
    reviews: uniqueReviews,
    coverage,
    now,
    availableGameIds,
    decisionIndex,
    poolBenchmarks,
    liveTableActive,
    cooldownActive,
    claimedReferenceIds: claimedSet,
  });
  const active = priorities.length;
  const resolved = uniqueLeaks.filter(leak => leakStatus(leak) === 'resolved').length;
  const due = priorities.filter(priority => priority.due).length;
  const measuredPriorities = priorities.filter(
    priority => typeof priority.measuredEvLoss === 'number' && Number.isFinite(priority.measuredEvLoss),
  );
  const measuredLoss = measuredPriorities.length > 0
    ? Math.round(
        measuredPriorities.reduce((sum, priority) => sum + (priority.measuredEvLoss * Math.max(1, priority.mistakes)), 0) * 100,
      ) / 100
    : null;
  const top = priorities[0] || null;

  // Before/after live-play proof and advice explanation for EVERY leak.
  const reviewByLeak = new Map(uniqueReviews.map(row => [String(row?.leak_id ?? row?.leakId ?? ''), row]));
  const leakList = uniqueLeaks.filter(Boolean);
  const tableVerificationByLeak = new Map();
  const adviceByLeak = new Map();
  for (const leak of leakList) {
    const id = leakId(leak);
    if (!id || tableVerificationByLeak.has(id)) continue;
    let related = relatedDecisionsFor(
      decisionIndex, id, String(leak?.leakType || leak?.leak_type || ''),
    );
    if (related.length === 0) {
      related = findRuleBasedDecisions(leak, id, decisionIndex);
    }
    const mastered = masteryProgress(reviewByLeak.get(id) || null, id)?.retired === true;
    tableVerificationByLeak.set(id, evaluateTableVerification(leak, reviewByLeak.get(id) || null, related, mastered, claimedSet));
    adviceByLeak.set(id, buildAdviceExplanation(leak, related, availableGameIds));
  }
  const priorityRows = priorities.map(priority => {
    const advice = adviceByLeak.get(priority.id) || null;
    return {
      ...priority,
      ...(advice ? {
        evidenceBasis: advice.evidenceBasis,
        ruleVersion: advice.ruleVersion,
        takeaway: advice.takeaway,
        representativeHand: advice.representativeHand,
        sampleCounts: advice.sampleCounts,
        practiceTarget: advice.practiceTarget,
      } : {}),
      tableVerification: tableVerificationByLeak.get(priority.id) || null,
    };
  });
  const leakRows = leakList.map(leak => {
    const id = leakId(leak);
    const advice = adviceByLeak.get(id) || buildAdviceExplanation(leak, [], availableGameIds);
    const stakePoolContext = buildStakePoolContext({
      leak,
      poolBenchmarks,
      liveTableActive,
      cooldownActive,
    });
    return {
      id,
      leakId: id,
      title: title(leak?.title || leak?.situationClass || leak?.situation_class || leak?.leakType || leak?.leak_type),
      category: title(leak?.leakCategory || leak?.leak_category || 'Strategy'),
      status: leakStatus(leak),
      evidenceBasis: advice.evidenceBasis,
      ruleVersion: advice.ruleVersion,
      takeaway: advice.takeaway,
      representativeHand: advice.representativeHand,
      sampleCounts: advice.sampleCounts,
      practiceTarget: advice.practiceTarget,
      tableVerification: tableVerificationByLeak.get(id) || null,
      ...(stakePoolContext ? { stakePoolContext } : {}),
    };
  }).filter(row => row.id);
  const verifiedLiveMilestones = leakRows
    .map(row => row.tableVerification?.verifiedLiveMilestone)
    .filter(Boolean);
  const verifiedFixedLive = leakRows.filter(row => row.status !== 'resolved'
    && row.tableVerification?.status === 'confirmed_fixed_at_tables').length;

  const coverageGaps = buildCoverageGapsRanked(uniqueDecisions);
  const coverageGapsSummary = {
    source: 'first_party_hand_audit_decisions',
    thirdPartyTelemetry: false,
    totalUnpriced: coverageGaps.totalUnpriced,
    totalDecisions: coverageGaps.totalDecisions,
    bucketCount: coverageGaps.bucketCount,
    tiers: summarizeCoverageTiers(uniqueDecisions),
  };

  // Recap eligibility. Without a verified table state the snapshot assumes the
  // player MAY be seated: fail closed so a recap can never show at a live table
  // OR during the mandatory 5-minute post-session cooldown.
  const recapBlockedByLivePolicy = liveTableActive || cooldownActive;
  const recap = recapBlockedByLivePolicy
    ? { hands: [], sessionSource: null, unavailableReason: liveTableActive ? 'live_table_active' : 'cooldown_active' }
    : selectTopLeakedHands(uniqueDecisions, sessionWindow);
  const topLeakedHands = recap.hands;

  return {
    generatedAt: new Date(now).toISOString(),
    versions: { schema: 'pa-coaching-v1', ...versions },
    evidenceFingerprint: evidenceFingerprint({ leaks: uniqueLeaks, decisions: uniqueDecisions, reviews: uniqueReviews, rejected }),
    coverage,
    solverCoverageGaps,
    coverageGapsRanked: coverageGaps.gaps,
    coverageGapsSummary,
    funnelMetrics: buildFunnelMetrics({
      leaks: Array.isArray(leaks) ? uniqueLeaks : null,
      reviews: Array.isArray(reviews) ? uniqueReviews : null,
      decisions: Array.isArray(decisions) ? uniqueDecisions : null,
      audit,
      verifiedFixedLive: Array.isArray(leaks) ? verifiedFixedLive : null,
    }),
    priorities: priorityRows,
    leaks: leakRows,
    verifiedLiveMilestones,
    trainingPlan,
    timeline: buildProgressTimeline(uniqueLeaks, uniqueReviews),
    summary: { active, resolved, due, measuredEvLoss: measuredLoss },
    nextBestAction: top ? {
      leakId: top.id,
      title: top.title,
      reason: top.reason,
      action: top.due ? 'Complete The Due Corrective Review' : 'Study The Highest-Impact Leak',
    } : null,
    sessionDebrief: {
      headline: active ? `${active} Active Leak${active === 1 ? '' : 's'} Need Attention` : 'No Active Leak Is Currently Proven',
      strongestSignal: top?.title || 'Run A Fresh Club Arena Audit',
      expensiveMistake: priorities.find(priority => priority.measuredEvLoss !== null)?.title || 'No Priced Mistake Is Available',
      coverageNote: `${coverage.verified} Of ${coverage.decisions} Decisions Are Solver Verified`,
      topLeakedHands,
      liveTableActive,
      liveTableStateKnown: liveStateKnown,
      cooldownActive,
      recapEligible: !recapBlockedByLivePolicy && topLeakedHands.length > 0,
      recapUnavailableReason: recap.unavailableReason,
      recapSessionSource: recap.sessionSource,
    },
    weeklyReport: {
      focus: priorityRows.slice(0, 3).map((priority, index) => ({ ...priority, rank: index + 1, targetReviews: priority.due ? 3 : 2 })),
      reviewLoad: due,
      verifiedCoverage: coverage.verifiedPercent,
      measuredEvLoss: measuredLoss,
    },
  };
}

export function receiptFingerprint(snapshot = {}) {
  const input = JSON.stringify({
    versions: snapshot.versions || {},
    evidenceFingerprint: snapshot.evidenceFingerprint || 'unavailable',
    priorities: (snapshot.priorities || []).map(item => [item.id, item.score, item.confidence?.score]),
    coverage: snapshot.coverage || {},
  });
  return `pa7-${hashText(input)}`;
}

export { DAY_MS, describeCoverageTier, qualifySolverDecisionSample };
