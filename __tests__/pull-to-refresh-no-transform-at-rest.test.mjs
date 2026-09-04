/**
 * GUARD: a pull-to-refresh wrapper must not transform its content at rest.
 * `translateY(0px)` makes the wrapper the containing block for every
 * position:fixed descendant; the Bankroll Manager drawer opened 160px from the
 * viewport edge because of it (2026-09-04, e2e/020-hamburger.spec.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(root, 'src', 'components', 'ui', 'PullToRefresh.jsx'), 'utf8');

test('sp-ptr-content carries a transform only while a pull is in progress', () => {
  const content = src.slice(src.indexOf('className="sp-ptr-content"'));
  assert.match(content, /transform:\s*pull \? `translateY\(\$\{pull\}px\)` : undefined/);
  assert.doesNotMatch(content.split('willChange')[0], /transform:\s*`translateY\(\$\{pull\}px\)`,/, 'an unconditional translateY(0) is still a containing block');
});
