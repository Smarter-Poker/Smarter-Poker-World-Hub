import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { notificationMessageText } from '../src/lib/notificationMessageText.mjs';

test('a financial digest prints its figures with thousands separators and its own decimals', () => {
  const n = {
    type: 'financial_digest',
    message:
      'Cash Rake 1536191.30 | Rakeback Paid 0.00 | Minted 80201150.93 | Unexplained Supply Net -14081.45 | Window 7',
  };
  assert.equal(
    notificationMessageText(n),
    'Cash Rake 1,536,191.30 | Rakeback Paid 0.00 | Minted 80,201,150.93 | Unexplained Supply Net -14,081.45 | Window 7'
  );
});

test('every other notification prints exactly as written', () => {
  assert.equal(notificationMessageText({ type: 'friend_request', message: 'Code 123456' }), 'Code 123456');
  assert.equal(notificationMessageText({ type: 'financial_digest', message: null }), '');
});

test('the feed prints notification messages through it', () => {
  const feed = readFileSync('src/components/notifications/HubNotificationsFeed.jsx', 'utf8');
  assert.match(feed, /\{' '\}\{notificationMessageText\(n\)\}/);
});
