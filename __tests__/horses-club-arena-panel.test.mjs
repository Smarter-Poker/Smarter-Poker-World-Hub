import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/components/horses/ClubArenaPanel.jsx', import.meta.url),
  'utf8',
);

test('ClubArenaPanel owns every legacy section and keeps URL state controlled', () => {
  assert.match(source, /export default function ClubArenaPanel\(\{/);
  assert.match(source, /section = DEFAULT_CA_SECTION/);
  assert.match(source, /onSectionChange = \(\) => \{\}/);
  assert.match(source, /onSectionChange\(nextSection\)/);
  assert.doesNotMatch(source, /router\.(?:push|replace)\(/);
  for (const section of [
    'overview', 'clubs', 'revenue', 'ledger', 'finance', 'users', 'unions',
    'approvals', 'operations', 'announcements',
  ]) {
    assert.match(source, new RegExp(`(?:['"]${section}['"]|\\b${section}\\s*:)`), section);
  }
});

test('Club Arena reads canonical page rows and preserves nested panel seams', () => {
  for (const page of [
    'clubs', 'unions', 'cashouts', 'transactions', 'members', 'agents',
    'tables', 'memberships', 'txns',
  ]) {
    assert.match(source, new RegExp(`pages\\?\\.${page}\\?\\.rows`), page);
  }
  assert.match(source, /operations: ClubsUnionsPanel/);
  assert.match(source, /announcements: AnnouncementsPanel/);
  assert.match(source, /<NestedPanel[\s\S]*approvalsAvailable=\{approvalsAvailable\}[\s\S]*permissionsDegraded=\{permissionsDegraded\}/);
});

test('cashout terminal decisions retain scope, epochs, receipts and honest 202 state', () => {
  assert.match(source, /useCashoutTerminalScope\(operatorId, cashoutScopeKey, router\)/);
  assert.match(source, /cashoutDialogEpoch\.current === dialogEpoch/);
  assert.match(source, /caReqRef\.current === readEpoch/);
  assert.match(source, /cashoutReadEpoch\.current === overviewEpoch/);
  assert.match(source, /retainCashoutTerminalIntent/);
  assert.match(source, /headers: \{ 'X-Idempotency-Key': operationId \}/);
  assert.match(source, /if \(isPendingApproval\(body\)\)/);
  assert.match(source, /markCashoutPendingApproval\(cashout\.id, body\.approvalId\)/);
  assert.match(source, /Sent For Approval\. No Chips Have Moved\./);
  assert.match(source, /body\?\.receipt\?\.operationId !== operationId/);
  assert.match(source, /receipt\.cashier\?\.actor_user_id !== operatorId/);
  assert.match(source, /Open Approval/);
});

test('known permissions gate writes while routes remain authoritative', () => {
  assert.match(source, /hasPermission\(permissions, 'cashier\.write'\)/);
  assert.match(source, /hasPermission\(permissions, 'clubs\.write'\)/);
  assert.match(source, /hasPermission\(permissions, 'moderation\.write'\)/);
  assert.match(source, /disabled=\{caProcessing \|\| !canCashierWrite\}/);
  assert.match(source, /disabled=\{caProcessing \|\| !canClubsWrite\}/);
  assert.match(source, /disabled=\{caProcessing \|\| !canModerate\}/);
  assert.match(source, /Operator Permissions Could Not Be Fully Verified/);
});

test('realtime and every in-flight request are invalidated on cleanup', () => {
  assert.match(source, /channel\('horses-club-arena-sync'\)/);
  assert.match(source, /supabase\.removeChannel\(channel\)/);
  assert.match(source, /if \(timer\) clearTimeout\(timer\)/);
  for (const ref of [
    'caReqRef', 'overviewReqRef', 'applicationsReqRef', 'leaveReqRef',
    'ledgerReqRef', 'revenueReqRef', 'cashoutReadEpoch', 'cashoutDialogEpoch',
  ]) {
    assert.match(source, new RegExp(`${ref}\\.current \\+= 1`), ref);
  }
  assert.match(source, /mountedRef\.current = false/);
});
