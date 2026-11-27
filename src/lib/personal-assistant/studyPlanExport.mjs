/**
 * Coach-Ready Markdown Study Plan Exporter
 *
 * Generates structured, readable Markdown reports summarizing a player's
 * coaching funnel, prioritized leaks, drill targets, live table verification,
 * and ranked solver coverage gaps.
 *
 * Strict Privacy & Integrity Laws:
 * 1. ZERO PII: never outputs email addresses, user IDs, or authentication tokens.
 * 2. Truthful & Null-Safe: never fabricates zeros for missing data; uses 'N/A' when unmeasured.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const AUTH_TOKEN_RE = /(?:Bearer\s+[A-Za-z0-9._~+/-]+=*|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g;
const HANDLE_RE = /(^|[\s(,;:])@[a-zA-Z0-9_.-]{2,32}\b/g;
const HOLE_CARD_PAIR_RE = /(^|[\s([,:])(?:10|[2-9TJQKA])[cdhs♠♥♦♣][\s,-]?(?:10|[2-9TJQKA])[cdhs♠♥♦♣](?=$|[\s)\],.;:])/g;

function sanitizePii(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(EMAIL_RE, '[REDACTED_EMAIL]')
    .replace(AUTH_TOKEN_RE, '[REDACTED_TOKEN]')
    .replace(UUID_RE, '[REDACTED_ID]');
}

function sanitizeJsonText(text) {
  if (typeof text !== 'string') return '';
  return sanitizePii(text)
    .replace(HANDLE_RE, '$1[REDACTED_HANDLE]')
    .replace(HOLE_CARD_PAIR_RE, '$1[REDACTED_CARDS]')
    .replace(/\r?\n+/g, ' ')
    .trim();
}

function toFiniteNumberOrNull(val) {
  if (val === null || val === undefined || val === '' || typeof val === 'boolean') return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

function toRoundedPercentOrNull(val) {
  const num = toFiniteNumberOrNull(val);
  return num !== null ? Number(num.toFixed(1)) : null;
}

function sanitizeTableCell(text) {
  return sanitizePii(String(text ?? ''))
    .replace(/\r?\n+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

function formatNumber(val) {
  if (val === null || val === undefined || val === '') return 'N/A';
  const num = Number(val);
  return Number.isFinite(num) ? num.toLocaleString() : 'N/A';
}

function formatPercent(val) {
  if (val === null || val === undefined || val === '') return 'N/A';
  const num = Number(val);
  return Number.isFinite(num) ? `${num.toFixed(1)}%` : 'N/A';
}

export function buildStudyPlanMarkdown(snapshot = {}, options = {}) {
  const rawTitle = options?.title || 'Personal Assistant Poker Study Plan';
  const title = sanitizePii(String(rawTitle).replace(/\r?\n+/g, ' ').trim());
  const rawDate = snapshot?.generatedAt || options?.generatedAt || new Date().toISOString();
  const generatedDate = sanitizePii(String(rawDate).replace(/\r?\n+/g, ' ').trim());

  const funnel = snapshot?.funnelMetrics || {};
  const auditedHands = formatNumber(funnel.auditedHands);
  const activeLeaks = formatNumber(funnel.activeLeaks);
  const drilledLeaks = formatNumber(funnel.drilledLeaks);
  const masteredLeaks = formatNumber(funnel.masteredLeaks);
  const verifiedFixed = formatNumber(funnel.verifiedFixedLive);

  const lines = [
    `# ${title}`,
    `Generated: ${generatedDate}`,
    '',
    '## Coaching Funnel Summary',
    '| Metric | Count |',
    '| :--- | :--- |',
    `| Audited Hands | ${auditedHands} |`,
    `| Active Leaks | ${activeLeaks} |`,
    `| Drilled | ${drilledLeaks} |`,
    `| Mastered | ${masteredLeaks} |`,
    `| Verified Fixed Live | ${verifiedFixed} |`,
    '',
    '## Top Priority Leaks & Training Plan',
  ];

  const modules = Array.isArray(snapshot?.trainingPlan?.modules) && snapshot.trainingPlan.modules.length > 0
    ? snapshot.trainingPlan.modules
    : (Array.isArray(snapshot?.priorities) ? snapshot.priorities : []);

  if (modules.length === 0) {
    lines.push('_No active leak modules are currently pending._');
  } else {
    lines.push('| Rank | Leak Title | Status | Mistake Rate (Before → After) | Live Verification | Target Drill |');
    lines.push('| :---: | :--- | :--- | :--- | :--- | :--- |');

    modules.forEach((mod, idx) => {
      const rank = sanitizeTableCell(mod.rank || idx + 1);
      const modTitle = sanitizeTableCell(mod.title || 'Untitled Leak');
      const status = sanitizeTableCell(mod.status || 'Active');

      const preRate = mod.tableVerification?.preMistakeRate ?? mod.preMistakeRate;
      const postRate = mod.tableVerification?.postMistakeRate ?? mod.postMistakeRate;
      const hasPre = preRate !== null && preRate !== undefined && preRate !== '' && Number.isFinite(Number(preRate));
      const hasPost = postRate !== null && postRate !== undefined && postRate !== '' && Number.isFinite(Number(postRate));

      let rateStr = 'N/A';
      if (hasPre && hasPost) {
        rateStr = `${formatPercent(preRate)} → ${formatPercent(postRate)}`;
      } else if (hasPre) {
        rateStr = `${formatPercent(preRate)} → Pending`;
      } else if (hasPost) {
        rateStr = `N/A → ${formatPercent(postRate)}`;
      }

      const liveStatus = sanitizeTableCell(
        mod.tableVerification?.label
        || mod.tableVerification?.status
        || 'Awaiting Verification'
      );

      const targetDrill = sanitizeTableCell(
        mod.drillParams?.street
        || mod.drillParams?.spot
        || mod.trainingGameId
        || 'Spot Training Drill'
      );

      lines.push(`| ${rank} | ${modTitle} | ${status} | ${rateStr} | ${liveStatus} | ${targetDrill} |`);

      if (mod.stakePoolContext?.label) {
        const poolInfo = sanitizePii(
          `Stake-Pool Context: ${mod.stakePoolContext.label} (${mod.stakePoolContext.poolMetricLabel} vs GTO ${mod.stakePoolContext.gtoBaselineLabel}, ${formatNumber(mod.stakePoolContext.sampleHands)} hands)`
        ).replace(/\r?\n+/g, ' ');
        lines.push(`> ℹ️ *${poolInfo}*`);
      }
    });
  }

  lines.push('');
  lines.push('## Ranked Solver Coverage Gaps');

  const gaps = Array.isArray(snapshot?.coverageGapsRanked) ? snapshot.coverageGapsRanked : [];
  if (gaps.length === 0) {
    lines.push('_No unpriced solver coverage gaps recorded._');
  } else {
    lines.push('| Format | Street | Position | Stack Bucket | Count | Coverage Tier |');
    lines.push('| :--- | :--- | :---: | :---: | :---: | :--- |');

    gaps.forEach((gap) => {
      const format = sanitizeTableCell(gap.format || 'Unknown Format');
      const street = sanitizeTableCell(gap.street || 'unknown');
      const position = sanitizeTableCell(gap.position || 'UNKNOWN');
      const stackBucket = sanitizeTableCell(gap.stackBucket || 'unknown');
      const count = formatNumber(gap.count);
      const tier = sanitizeTableCell(gap.coverageHint?.label || gap.coverageHint?.tier || gap.reason || 'Awaiting Solver Coverage');

      lines.push(`| ${format} | ${street} | ${position} | ${stackBucket} | ${count} | ${tier} |`);
    });
  }

  lines.push('');
  return lines.join('\n');
}

export function buildStudyPlanJson(snapshot = {}, options = {}) {
  const rawTitle = options?.title || 'Personal Assistant Poker Study Plan';
  const title = sanitizeJsonText(String(rawTitle));
  const rawDate = snapshot?.generatedAt || options?.generatedAt || new Date().toISOString();
  const generatedAt = sanitizeJsonText(String(rawDate));

  const funnel = snapshot?.funnelMetrics || {};
  const funnelMetrics = {
    auditedHands: toFiniteNumberOrNull(funnel.auditedHands),
    activeLeaks: toFiniteNumberOrNull(funnel.activeLeaks),
    drilledLeaks: toFiniteNumberOrNull(funnel.drilledLeaks),
    masteredLeaks: toFiniteNumberOrNull(funnel.masteredLeaks),
    verifiedFixedLive: toFiniteNumberOrNull(funnel.verifiedFixedLive),
  };

  const rawModules = Array.isArray(snapshot?.trainingPlan?.modules) && snapshot.trainingPlan.modules.length > 0
    ? snapshot.trainingPlan.modules
    : (Array.isArray(snapshot?.priorities) ? snapshot.priorities : []);

  const modules = rawModules.map((mod, idx) => {
    const preRate = mod?.tableVerification?.preMistakeRate ?? mod?.preMistakeRate;
    const postRate = mod?.tableVerification?.postMistakeRate ?? mod?.postMistakeRate;
    const entry = {
      rank: toFiniteNumberOrNull(mod?.rank) ?? (idx + 1),
      title: sanitizeJsonText(String(mod?.title || 'Untitled Leak')),
      status: sanitizeJsonText(String(mod?.status || 'Active')),
      category: mod?.category ? sanitizeJsonText(String(mod.category)) : null,
      mistakeRate: {
        prePercent: toRoundedPercentOrNull(preRate),
        postPercent: toRoundedPercentOrNull(postRate),
      },
      liveVerification: {
        status: sanitizeJsonText(String(mod?.tableVerification?.status || 'awaiting_verification')),
        label: sanitizeJsonText(String(
          mod?.tableVerification?.label
          || mod?.tableVerification?.status
          || 'Awaiting Verification',
        )),
      },
      targetDrill: sanitizeJsonText(String(
        mod?.drillParams?.street
        || mod?.drillParams?.spot
        || mod?.trainingGameId
        || 'Spot Training Drill',
      )),
    };
    if (mod?.stakePoolContext?.label) {
      entry.stakePoolContext = {
        label: sanitizeJsonText(String(mod.stakePoolContext.label)),
        poolMetricLabel: mod.stakePoolContext.poolMetricLabel
          ? sanitizeJsonText(String(mod.stakePoolContext.poolMetricLabel))
          : null,
        gtoBaselineLabel: mod.stakePoolContext.gtoBaselineLabel
          ? sanitizeJsonText(String(mod.stakePoolContext.gtoBaselineLabel))
          : null,
        sampleHands: toFiniteNumberOrNull(mod.stakePoolContext.sampleHands),
      };
    }
    return entry;
  });

  const rawGaps = Array.isArray(snapshot?.coverageGapsRanked) ? snapshot.coverageGapsRanked : [];
  const coverageGaps = rawGaps.map((gap) => ({
    format: sanitizeJsonText(String(gap?.format || 'Unknown Format')),
    street: sanitizeJsonText(String(gap?.street || 'unknown')).toLowerCase(),
    position: sanitizeJsonText(String(gap?.position || 'UNKNOWN')).toUpperCase(),
    stackBucket: sanitizeJsonText(String(gap?.stackBucket || 'unknown')),
    count: toFiniteNumberOrNull(gap?.count),
    coverageTier: sanitizeJsonText(String(
      gap?.coverageHint?.label
      || gap?.coverageHint?.tier
      || gap?.reason
      || 'Awaiting Solver Coverage',
    )),
  }));

  return {
    schemaVersion: 1,
    title,
    generatedAt,
    funnelMetrics,
    modules,
    coverageGaps,
  };
}

export default {
  buildStudyPlanMarkdown,
  buildStudyPlanJson,
};
