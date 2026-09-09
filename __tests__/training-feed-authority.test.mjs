import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL(
  '../pages/hub/training/training-feed.js',
  import.meta.url,
), 'utf8');

test('browser events invalidate the verified feed but never create activity', () => {
  assert.match(source, /EventType\?\.SESSION_END[\s\S]*?\(\) => fetchFeed\(\)/);
  assert.match(source, /api\/training\/get-sessions\?limit=50/);
  for (const forbidden of [
    'isLiveInjection',
    '`live-${Date.now()}`',
    'payload.questionsAnswered',
    'setFeedItems((prev) => [liveItem, ...prev])',
  ]) {
    assert.doesNotMatch(source, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
