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

function sanitizePii(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(EMAIL_RE, '[REDACTED_EMAIL]')
    .replace(AUTH_TOKEN_RE, '[REDACTED_TOKEN]')
    .replace(UUID_RE, '[REDACTED_ID]');
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
  const title = sanitizePii(String(rawTitle).trim());
  const rawDate = snapshot?.generatedAt || options?.generatedAt || new Date().toISOString();
  const generatedDate = sanitizePii(String(rawDate).trim());

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
      const rank = mod.rank || idx + 1;
      const modTitle = sanitizePii(mod.title || 'Untitled Leak');
      const status = sanitizePii(mod.status || 'Active');

      const preRate = mod.tableVerification?.preMistakeRate ?? mod.preMistakeRate;
      const postRate = mod.tableVerification?.postMistakeRate ?? mod.postMistakeRate;

      let rateStr = 'N/A';
      if (preRate != null && postRate != null) {
        rateStr = `${formatPercent(preRate)} → ${formatPercent(postRate)}`;
      } else if (preRate != null) {
        rateStr = `${formatPercent(preRate)} → Pending`;
      }

      const liveStatus = sanitizePii(
        mod.tableVerification?.label
        || mod.tableVerification?.status
        || 'Awaiting Verification'
      );

      const targetDrill = sanitizePii(
        mod.drillParams?.street
        || mod.drillParams?.spot
        || mod.trainingGameId
        || 'Spot Training Drill'
      );

      lines.push(`| ${rank} | ${modTitle} | ${status} | ${rateStr} | ${liveStatus} | ${targetDrill} |`);

      if (mod.stakePoolContext?.label) {
        const poolInfo = sanitizePii(
          `Stake-Pool Context: ${mod.stakePoolContext.label} (${mod.stakePoolContext.poolMetricLabel} vs GTO ${mod.stakePoolContext.gtoBaselineLabel}, ${formatNumber(mod.stakePoolContext.sampleHands)} hands)`
        );
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
      const format = sanitizePii(gap.format || 'Unknown Format');
      const street = sanitizePii(gap.street || 'unknown');
      const position = sanitizePii(gap.position || 'UNKNOWN');
      const stackBucket = sanitizePii(gap.stackBucket || 'unknown');
      const count = formatNumber(gap.count);
      const tier = sanitizePii(gap.coverageHint?.label || gap.coverageHint?.tier || gap.reason || 'Awaiting Solver Coverage');

      lines.push(`| ${format} | ${street} | ${position} | ${stackBucket} | ${count} | ${tier} |`);
    });
  }

  lines.push('');
  return lines.join('\n');
}

export default {
  buildStudyPlanMarkdown,
};
