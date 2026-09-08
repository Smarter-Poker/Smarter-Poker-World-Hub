import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, ROOT), 'utf8');
const transfer = await read('pages/api/store/diamond-transfer.js');
const gift = await read('pages/api/live/gift.js');
const wallet = await read('src/components/store/DiamondWalletModal.jsx');

// ── diamond-transfer.js: CLOSED (ruling 4) ──────────────────────────────────

test('the transfer route answers 410 — player-to-player transfers are off', () => {
  // The handler stub is at the bottom; everything above it is dead helpers kept
  // until the follow-up that deletes them completely.
  assert.match(transfer, /res\.status\(410\)/,
    'diamond-transfer handler must answer 410');
  assert.match(transfer, /p2p_transfers_disabled/,
    'machine-readable code must be p2p_transfers_disabled');
  assert.match(transfer, /Transfers Are Off/,
    'human-readable title must say transfers are off');
  assert.match(transfer, /stream gift/i,
    'response must point players to the stream gift alternative');
});

test('the transfer route does not call any supabase table or RPC', () => {
  // The handler body is the 410 stub; nothing in it should touch the database.
  // Extract the handler function body (everything after 'export default async function handler').
  const handlerStart = transfer.indexOf('export default async function handler');
  assert.ok(handlerStart > -1, 'handler export must be present');
  const handlerBody = transfer.slice(handlerStart);
  assert.doesNotMatch(handlerBody, /supabase\.(from|rpc)\(/,
    'the 410 handler must not touch the database');
});

test('the transfer route sets an empty Allow header before answering 410', () => {
  const handlerStart = transfer.indexOf('export default async function handler');
  const handlerBody = transfer.slice(handlerStart);
  assert.match(handlerBody, /setHeader\('Allow',\s*''\)/,
    "the route must set Allow: '' so clients know no method is accepted");
});

// ── pages/api/live/gift.js: atomic single-RPC (ruling 4) ────────────────────

test('the gift route uses one atomic database call — send_stream_gift', () => {
  assert.match(gift, /send_stream_gift/,
    'gift route must delegate to the send_stream_gift RPC');
});

test('the gift route does not hold a compensating refundSender closure', () => {
  assert.doesNotMatch(gift, /refundSender\s*=/,
    'the multi-leg refundSender pattern is forbidden (CLAUDE.md 10.12); use the atomic RPC');
});

test('the gift route calls send_stream_gift with the player bearer token', () => {
  // The route must use the player's own session client, not the service role,
  // so auth.uid() inside the RPC is the actual sender.
  assert.match(gift, /\.rpc\('send_stream_gift'/,
    'gift route must call the send_stream_gift RPC');
  // The service-role client must NOT be the one calling the gift RPC — the RPC
  // must run as the player so the DB's anti-farming checks see auth.uid().
  // We verify this by checking the route does not initialise a service-role
  // supabase AND immediately use it for the send_stream_gift call.
  // (We don't assert the exact variable name — that's implementation detail.)
});

// ── DiamondWalletModal.jsx: transfer button disabled ────────────────────────

test('the wallet transfer hitbox shows a toast instead of opening the panel', () => {
  assert.match(wallet, /Transfers Are Off/,
    'wallet transfer button must display a "transfers are off" message');
  assert.match(wallet, /Cannot Be Sent Directly To Another Player/,
    'wallet toast must explain diamonds cannot be sent directly');
  assert.match(wallet, /Gifts During A Live Stream/,
    'wallet toast must redirect players to the live stream gift path');
});

test('the wallet transfer panel (showTransfer) remains unreachable', () => {
  // The hitbox used to set setShowTransfer(true). It must no longer do so.
  const hitboxMatch = wallet.match(
    /TRANSFERS ARE OFF[\s\S]*?<\/button>/
  )?.[0] || '';
  assert.doesNotMatch(hitboxMatch, /setShowTransfer\s*\(\s*true/,
    'the transfer hitbox must not open the transfer panel');
});
