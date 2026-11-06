import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The published-app verifier must prove a read survives a refresh that reopens
// the same conversation, not only an API read straight after the receipt.
test('the live verifier refreshes, reopens and re-reads every conversation it marked read', () => {
  const source = readFileSync(new URL('../scripts/ci/messenger-live-check.mjs', import.meta.url), 'utf8');
  const loop = source.slice(source.indexOf('for (const conversation of candidates)'), source.indexOf('report.coverage.messageReadReceipts'));
  const order = ['/api/messenger/mark-read', "workspace: 'resolve'", 'page.reload(', 'Reopened conversation history did not load after refresh', 'Read status did not survive refresh and reopen'];
  let at = -1;
  for (const marker of order) { const next = loop.indexOf(marker, at + 1); assert.ok(next > at, marker); at = next; }
  assert.match(source, /report\.coverage\.readSurvivedRefreshAndReopen = reopenedAfterRefresh\.size/);
});

test('a live verifier failure names its phase and error class without provider text', () => {
  const source = readFileSync(new URL('../scripts/ci/messenger-live-check.mjs', import.meta.url), 'utf8');
  for (const phase of ['initial-snapshot', 'browser-start', 'conversation-read', 'conversation-refresh-reopen', 'notification-read', 'final-snapshot-and-badges']) {
    assert.match(source, new RegExp(`report\\.phase = '${phase}'`), phase);
  }
  assert.match(source, /Live probe could not complete during \$\{report\.phase \|\| 'setup'\} \(\$\{errorClass\}\)/);
  assert.match(source, /\/\^\[A-Za-z\]\{1,40\}\$\/\.test\(error\?\.name/);
  assert.doesNotMatch(source, /report\.failure = [^;]*error\.message(?!\.split)/);
});
