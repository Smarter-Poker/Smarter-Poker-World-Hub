/**
 * Read-Only Solver Coverage Gap Harvest Queue Exporter
 *
 * PURE. DEPENDENCY-FREE OF RUNTIME I/O. DETERMINISTIC.
 * - Aggregates unmeasured (`solver_verified !== true` or `classification === 'unpriced'`)
 *   audited decision rows into ranked harvest queue targets for offline solver expansion.
 * - Never connects to or dispatches work to M1/M2 solver hosts.
 */
import { classifyStackBucket, summarizeSolverCoverageGaps } from './caHandFactsAnalyzer.mjs';

export function bucketHarvestStackDepth(stackDepthBb) {
  if (stackDepthBb === null || stackDepthBb === undefined || stackDepthBb === '') return 'unknown';
  const bb = Number(stackDepthBb);
  if (!Number.isFinite(bb) || bb <= 0) return 'unknown';
  if (bb <= 20) return '<=20bb';
  if (bb <= 50) return '20-50bb';
  if (bb <= 100) return '50-100bb';
  return '100bb+';
}

function resolveHarvestFormat(row) {
  const explicit = String(row?.format || row?.format_scope || row?.formatScope || '').trim();
  if (/mtt|tournament/i.test(explicit)) return 'Tournament NLH';
  if (/cash/i.test(explicit)) return 'Cash NLH';
  const gameId = String(row?.game_id || row?.gameId || '').trim().toLowerCase();
  if (gameId.startsWith('mtt-') || gameId.includes('tournament')) return 'Tournament NLH';
  return 'Cash NLH';
}

function resolveHarvestStackBucket(row) {
  const numericStack = row?.stack_depth_bb
    ?? row?.stackDepthBb
    ?? row?.hero_effective_stack_bb
    ?? row?.effective_stack_bb
    ?? null;
  if (numericStack !== null && numericStack !== undefined && numericStack !== '') {
    const bucketed = bucketHarvestStackDepth(numericStack);
    if (bucketed !== 'unknown') return bucketed;
  }
  const explicitBucket = row?.stack_bucket ?? row?.stackBucket ?? null;
  if (explicitBucket !== null && explicitBucket !== undefined && String(explicitBucket).trim() !== '') {
    return String(explicitBucket).trim();
  }
  return classifyStackBucket(numericStack);
}

function resolveHarvestSpot(row) {
  if (row?.spot !== undefined && row?.spot !== null && String(row.spot).trim() !== '') {
    return String(row.spot).trim();
  }
  const spotType = String(row?.spot_type ?? row?.spotType ?? 'general').trim().toLowerCase() || 'general';
  const rawPos = String(row?.hero_position ?? row?.heroPosition ?? row?.position ?? '').trim().toUpperCase();
  if (rawPos && rawPos !== 'ANY' && rawPos !== 'UNKNOWN') {
    if (spotType.startsWith(`${rawPos.toLowerCase()}:`) || spotType.startsWith(`${rawPos.toLowerCase()}_`)) {
      return spotType;
    }
    return `${rawPos}:${spotType}`;
  }
  return spotType;
}

function isUnmeasuredDecisionRow(row) {
  if (!row || typeof row !== 'object') return false;
  if (row.solver_verified === true || row.solverVerified === true) return false;
  return true;
}

function classifyHarvestPriority(unmeasuredCount, sharePct) {
  if (sharePct >= 25 || unmeasuredCount >= 10) return 'high';
  if (sharePct >= 10 || unmeasuredCount >= 4) return 'medium';
  return 'low';
}

/**
 * Builds a deterministic, read-only solver harvest queue report from audited decisions.
 */
export function buildSolverHarvestQueueExport(
  decisions = [],
  { maxBuckets = 15, generatedAt = new Date().toISOString() } = {},
) {
  const safeMaxBuckets = Math.max(1, Math.min(200, Math.floor(Number(maxBuckets) || 15)));
  const safeGeneratedAt = typeof generatedAt === 'string' && generatedAt.trim()
    ? generatedAt.trim()
    : new Date().toISOString();

  const rows = Array.isArray(decisions) ? decisions.filter(Boolean) : [];
  const unmeasured = rows.filter(isUnmeasuredDecisionRow);
  const totalUnmeasuredDecisions = unmeasured.length;

  const summary = summarizeSolverCoverageGaps(rows, { limit: safeMaxBuckets });

  if (totalUnmeasuredDecisions === 0) {
    return {
      schemaVersion: 1,
      generatedAt: safeGeneratedAt,
      readOnly: true,
      totalDecisions: rows.length,
      totalUnmeasuredDecisions: 0,
      totalUnmeasured: 0,
      buckets: [],
      topGaps: summary.topGaps,
    };
  }

  const groups = new Map();
  for (const row of unmeasured) {
    const format = resolveHarvestFormat(row);
    const street = String(row?.street || 'unknown').trim().toLowerCase() || 'unknown';
    const stackBucket = resolveHarvestStackBucket(row);
    const spot = resolveHarvestSpot(row);
    const heroPosition = String(row?.hero_position ?? row?.heroPosition ?? row?.position ?? 'ANY').trim().toUpperCase() || 'ANY';
    const spotType = String(row?.spot_type ?? row?.spotType ?? row?.spot ?? 'general').trim().toLowerCase() || 'general';
    const key = `${format}|${street}|${stackBucket}|${spot}`;

    const existing = groups.get(key);
    if (existing) {
      existing.unmeasuredCount += 1;
    } else {
      groups.set(key, {
        format,
        street,
        stackBucket,
        spot,
        heroPosition,
        spotType,
        unmeasuredCount: 1,
      });
    }
  }

  const buckets = [...groups.values()]
    .sort((a, b) => (
      b.unmeasuredCount - a.unmeasuredCount
      || a.format.localeCompare(b.format)
      || a.street.localeCompare(b.street)
      || a.stackBucket.localeCompare(b.stackBucket)
      || a.spot.localeCompare(b.spot)
    ))
    .slice(0, safeMaxBuckets)
    .map((group, idx) => {
      const sharePct = Math.round((group.unmeasuredCount / totalUnmeasuredDecisions) * 1000) / 10;
      const priority = classifyHarvestPriority(group.unmeasuredCount, sharePct);
      return {
        rank: idx + 1,
        format: group.format,
        street: group.street,
        stackBucket: group.stackBucket,
        spot: group.spot,
        heroPosition: group.heroPosition,
        spotType: group.spotType,
        unmeasuredCount: group.unmeasuredCount,
        count: group.unmeasuredCount,
        sharePct,
        sharePercent: sharePct,
        priority,
      };
    });

  return {
    schemaVersion: 1,
    generatedAt: safeGeneratedAt,
    readOnly: true,
    totalDecisions: rows.length,
    totalUnmeasuredDecisions,
    totalUnmeasured: totalUnmeasuredDecisions,
    buckets,
    topGaps: summary.topGaps,
  };
}

/**
 * Formats a harvest queue report as deterministic Markdown for operator review.
 */
export function formatHarvestQueueMarkdown(report = {}) {
  const schemaVersion = Number(report?.schemaVersion) || 1;
  const generatedAt = String(report?.generatedAt || new Date().toISOString());
  const totalUnmeasured = Number(report?.totalUnmeasuredDecisions ?? report?.totalUnmeasured ?? 0) || 0;
  const buckets = Array.isArray(report?.buckets) ? report.buckets : [];

  const lines = [
    '# Solver Coverage Harvest Queue',
    '',
    `- Schema Version: ${schemaVersion}`,
    `- Generated At: ${generatedAt}`,
    `- Total Unmeasured Decisions: ${totalUnmeasured}`,
    `- Exported Buckets: ${buckets.length}`,
    '',
  ];

  if (buckets.length === 0) {
    lines.push('No unmeasured solver coverage gaps found.');
    return lines.join('\n');
  }

  lines.push('| Rank | Priority | Format | Street | Stack Bucket | Spot | Unmeasured Count | Share % |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const b of buckets) {
    lines.push(
      `| ${b.rank} | ${String(b.priority || 'low').toUpperCase()} | ${b.format} | ${b.street} | ${b.stackBucket} | ${b.spot} | ${b.unmeasuredCount} | ${b.sharePct}% |`,
    );
  }

  return lines.join('\n');
}

export default {
  bucketHarvestStackDepth,
  buildSolverHarvestQueueExport,
  formatHarvestQueueMarkdown,
};
