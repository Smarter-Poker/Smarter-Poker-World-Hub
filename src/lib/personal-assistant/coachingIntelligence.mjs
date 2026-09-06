const DAY_MS = 86_400_000;

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
  const parsed = new Date(value || 0);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function title(value, fallback = 'Poker Decision') {
  const clean = String(value || fallback).replace(/[_-]+/g, ' ').trim();
  return clean.replace(/\b\w/g, letter => letter.toUpperCase());
}

function leakId(leak) {
  return String(leak?.id ?? leak?.leak_id ?? '').trim();
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
  return normalized || fallback;
}

function decisionLeakType(row) {
  const scope = slug(row?.evidence_scope, 'club_arena');
  return [
    'solver', scope, slug(row?.game_id, 'training'), slug(row?.street, 'all_streets'),
    slug(row?.hero_position, 'all_positions'), slug(row?.spot_type, 'general'),
  ].join('_').slice(0, 180);
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
  const leakRows = canonicalRows((Array.isArray(leaks) ? leaks : []).map(leak => [
    leakId(leak), leakStatus(leak), leakSamples(leak), leakMistakes(leak), measuredLoss(leak),
    iso(leak?.firstDetected || leak?.first_detected_at || leak?.created_at),
    iso(leak?.resolvedAt || leak?.resolved_at),
    finite(leak?.currentFrequency ?? leak?.current_frequency),
    finite(leak?.optimalFrequency ?? leak?.optimal_frequency),
  ]));
  const decisionRows = canonicalRows((Array.isArray(decisions) ? decisions : []).map(row => [
    String(row?.hand_external_id || ''), String(row?.decision_key || ''), String(row?.question_id || ''), String(row?.evidence_scope || ''),
    String(row?.game_id || ''), String(row?.street || ''), String(row?.hero_position || ''),
    String(row?.villain_position || ''), String(row?.spot_type || ''), String(row?.hero_hand || ''),
    row?.board_cards || [], String(row?.player_action || ''), String(row?.solver_action || ''),
    finite(row?.selected_frequency), finite(row?.optimal_frequency), String(row?.classification || ''),
    finite(row?.ev_loss), row?.ev_loss_measured === true, row?.solver_verified === true,
    String(row?.solver_source || ''), count(row?.match_tier), iso(row?.audited_at),
  ]));
  const reviewRows = canonicalRows((Array.isArray(reviews) ? reviews : []).map(row => [
    String(row?.leak_id ?? row?.leakId ?? ''), iso(row?.due_at ?? row?.dueAt),
    count(row?.reps), count(row?.lapses), count(row?.strong_streak), row?.retired === true,
    finite(row?.last_score), String(row?.last_outcome || ''), iso(row?.updated_at),
    canonicalRows((Array.isArray(row?.history) ? row.history : []).map(item => [iso(item?.at), finite(item?.score)])),
  ]));
  const rejectedRows = Object.entries(rejected || {})
    .map(([key, value]) => [String(key), count(value)])
    .sort((a, b) => a[0].localeCompare(b[0]));

  return `pa7e-${hashText(JSON.stringify({ leakRows, decisionRows, reviewRows, rejectedRows }))}`;
}

export function decisionCoverage(decisions = [], rejected = {}) {
  const rows = Array.isArray(decisions) ? decisions.filter(Boolean) : [];
  const verified = rows.filter(row => row.solver_verified === true).length;
  const priced = rows.filter(row => row.ev_loss_measured === true && finite(row.ev_loss) !== null).length;
  const unpriced = rows.filter(row => row.ev_loss_measured !== true).length;
  const partiallyMatched = rows.filter(row => row.solver_verified !== true && count(row.match_tier) > 0).length;
  const sourceCounts = rows.reduce((result, row) => {
    const raw = String(row.solver_source || '').toLowerCase();
    const key = raw.includes('ai') ? 'aiGuidance'
      : raw.includes('offline') ? 'offlineEstimate'
      : raw.includes('solver') ? 'solverEvidence'
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
  const reviewByLeak = new Map((Array.isArray(reviewRecords) ? reviewRecords : []).map(row => [String(row.leak_id ?? row.leakId ?? ''), row]));
  return (Array.isArray(leaks) ? leaks : [])
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
        recommendedDrill: leak?.recommendedDrill || leak?.recommended_drill || null,
        reason: loss !== null
          ? `${mistakes} Repeated Mistakes With ${loss.toFixed(2)} BB Measured Loss Per Occurrence`
          : `${mistakes} Repeated Mistakes Require Review While Solver EV Remains Unpriced`,
      };
    })
    .sort((a, b) => b.score - a.score || b.confidence.score - a.confidence.score || a.title.localeCompare(b.title));
}

export function buildEvidenceChain(leak, decisions = [], reviewRecords = [], versions = {}, examples = []) {
  const id = leakId(leak);
  const example = Array.isArray(examples) ? examples[0] : null;
  const snapshot = example?.snapshot && typeof example.snapshot === 'object' ? example.snapshot : {};
  const exampleExternalIds = [
    snapshot.external_id, snapshot.externalId, snapshot.hand_external_id,
    snapshot.hand_id, snapshot.handId,
  ].filter(Boolean).map(String);
  const decisionRows = (Array.isArray(decisions) ? decisions : []).filter(row => {
    const keys = [row?.leak_id, row?.leak_type, row?.spot_type, row?.game_id, decisionLeakType(row)].filter(Boolean).map(String);
    return keys.includes(id)
      || keys.includes(String(leak?.leakType || leak?.leak_type || ''))
      || exampleExternalIds.includes(String(row?.hand_external_id || ''));
  });
  const newest = [...decisionRows].sort((a, b) => String(b?.audited_at || '').localeCompare(String(a?.audited_at || '')))[0] || null;
  const review = (Array.isArray(reviewRecords) ? reviewRecords : []).find(row => String(row?.leak_id ?? row?.leakId ?? '') === id) || null;
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
  for (const leak of Array.isArray(leaks) ? leaks : []) {
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
  for (const review of Array.isArray(reviewRecords) ? reviewRecords : []) {
    const id = String(review?.leak_id ?? review?.leakId ?? '');
    const history = Array.isArray(review?.history) ? review.history : [];
    for (const item of history) {
      const at = iso(item?.at);
      if (at) events.push({ at, type: 'review', leakId: id, title: 'Corrective Review Completed', score: finite(item?.score) });
    }
  }
  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100);
}

export function buildCoachingSnapshot({ leaks = [], decisions = [], reviews = [], rejected = {}, now = Date.now(), versions = {} } = {}) {
  const coverage = decisionCoverage(decisions, rejected);
  const priorities = rankCoachingPriorities(leaks, reviews, coverage, now);
  const active = priorities.length;
  const resolved = (Array.isArray(leaks) ? leaks : []).filter(leak => leakStatus(leak) === 'resolved').length;
  const due = priorities.filter(priority => priority.due).length;
  const measuredLoss = priorities.reduce((sum, priority) => sum + ((priority.measuredEvLoss || 0) * Math.max(1, priority.mistakes)), 0);
  const top = priorities[0] || null;
  return {
    generatedAt: new Date(now).toISOString(),
    versions: { schema: 'pa-coaching-v1', ...versions },
    evidenceFingerprint: evidenceFingerprint({ leaks, decisions, reviews, rejected }),
    coverage,
    priorities,
    timeline: buildProgressTimeline(leaks, reviews),
    summary: { active, resolved, due, measuredEvLoss: Math.round(measuredLoss * 100) / 100 },
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
    },
    weeklyReport: {
      focus: priorities.slice(0, 3).map((priority, index) => ({ ...priority, rank: index + 1, targetReviews: priority.due ? 3 : 2 })),
      reviewLoad: due,
      verifiedCoverage: coverage.verifiedPercent,
      measuredEvLoss: Math.round(measuredLoss * 100) / 100,
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

export { DAY_MS };
