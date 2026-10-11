import assert from 'node:assert/strict';

// Missing browser measurements are not a zero-byte or instant-load success.
// Keep the existing cold mobile budget; this does not redefine its conditions.
export function assertPnmMobileBudget(metrics, budget) {
  assert.ok(Number.isFinite(metrics.scriptCount) && metrics.scriptCount > 0, 'PNM script measurements required');
  assert.equal(metrics.unmeasuredScripts, 0, 'PNM script transfer measurements incomplete');
  assert.ok(Number.isFinite(metrics.jsBytes) && metrics.jsBytes > 0, 'PNM script transfer bytes unavailable');
  assert.ok(Number.isFinite(metrics.lcpMs) && metrics.lcpMs > 0, 'PNM Largest Contentful Paint unavailable');
  assert.ok(Number.isFinite(metrics.overflow), 'PNM layout measurement unavailable');
  assert.ok(metrics.overflow <= 0, 'PNM mobile document overflows');
  assert.ok(metrics.jsBytes / 1024 <= budget.jsKb, 'PNM JavaScript exceeds maintained mobile budget');
  assert.ok(metrics.lcpMs <= budget.lcpMs, 'PNM loading exceeds maintained mobile budget');
}
