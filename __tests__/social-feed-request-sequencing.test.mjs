import assert from 'node:assert/strict';
import test from 'node:test';

import { createLatestRequestGuard } from '../src/lib/latestRequestGuard.mjs';

test('a newer refresh aborts and invalidates an older successful response', () => {
  const guard = createLatestRequestGuard();
  const stale = guard.begin({ append: false });
  const current = guard.begin({ append: false });

  assert.equal(stale.signal.aborted, true);
  assert.equal(stale.isCurrent(), false);
  assert.equal(current.isCurrent(), true);
  assert.equal(current.finish(), true);
  assert.equal(guard.isFullRefreshPending(), false);
});

test('an old cursor append cannot start while an authoritative refresh is unresolved', () => {
  const guard = createLatestRequestGuard();
  const refresh = guard.begin({ append: false });

  assert.equal(guard.begin({ append: true }), null);
  assert.equal(refresh.isCurrent(), true);
  refresh.finish();

  const append = guard.begin({ append: true });
  assert.ok(append);
  assert.equal(append.isCurrent(), true);
});

test('unmount invalidates the active request even when transport abort is ignored', () => {
  const guard = createLatestRequestGuard();
  const request = guard.begin({ append: false });
  guard.abort();
  assert.equal(request.signal.aborted, true);
  assert.equal(request.isCurrent(), false);
});
