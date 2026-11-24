/**
 * ANTI-REGRESSION LAW: OWNER DOWNLINE PAYOUT NOTIFICATIONS & TELEGRAM NOTICE BOARD
 * (Dan 2026-11-24, binding)
 *
 * 1. A club owner must NEVER receive notifications for another agent's downline
 *    payout requests or decisions (approval, decline, cancellation, expiry)
 *    unless the owner is the assigned agent, the acting decider, the payout was
 *    escalated to the club bank, or the assigned agent profile is missing.
 * 2. A club owner receives an at-most-once `cashout_overdue` notification ONLY
 *    when another agent leaves a downline payout request unfulfilled for >4h.
 * 3. Club Notice Board auto-syncs staff group names on club rename, allows
 *    pinning regular club notices alongside pending payouts, exposes live
 *    member/admin/agent counts and roster to the UI, and hides the tab from
 *    non-staff players.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const migration = read('supabase/migrations/20261124150500_payout_overdue_owner_notify_and_telegram_notice_board.sql');
const migrationP2 = read('supabase/migrations/20261124180000_notice_board_phase2_reads_acks_media_mentions_and_overdue_config.sql');
const migrationP3 = read('supabase/migrations/20261124190000_notice_board_hardening_auto_escalate_realtime_and_parity.sql');
const boardLib = read('src/lib/clubNoticeBoard.mjs');
const boardUi = read('src/components/messenger/NoticeBoard.jsx');
const workspace = read('src/lib/messengerWorkspace.mjs');
const workspaceUi = read('src/components/messenger/ClubArenaWorkspace.js');
const clubEntry = read('src/lib/messengerClubEntry.mjs');
const messengerPage = read('pages/hub/messenger.js');
const unreadHook = read('src/hooks/useUnreadCount.jsx');
const routeLib = read('src/lib/notificationRoute.js');
const pushPrefs = read('src/lib/push/push-prefs.js');
const pushDispatch = read('pages/api/cron/push-dispatch.js');
const bellUi = read('src/components/club-arena/NotificationBell.js');
const workflow = read('.github/workflows/build-safety-gate.yml');

test('LAW 1: fn_cashier_cashout_transition never unconditionally notifies club.owner_id on other-agent downline payouts', () => {
    assert.doesNotMatch(
        migration,
        /ELSE\s+ARRAY\[club\.owner_id\s*,\s*r\.player_id\]\s+END/,
        'club.owner_id must not be unconditionally included on every terminal cashout transition'
    );
    assert.match(migration, /WHEN kind<>'hold' AND escalated THEN ARRAY\[club\.owner_id\]/);
    assert.match(migration, /has_function_privilege\('authenticated','public\.fn_cashier_cashout_transition/);
});

test('LAW 2: >4h unfulfilled downline payout alert enforces at-most-once PK dedupe, non-null other-agent guard, and routing/push wiring', () => {
    assert.match(migration, /CREATE TABLE public\.cashout_overdue_owner_notifications/);
    assert.match(migration, /cashout_id uuid PRIMARY KEY REFERENCES public\.cashout_requests\(id\)/);
    assert.match(migration, /AND cr\.agent_id IS NOT NULL/);
    assert.match(migration, /AND cr\.agent_id IS DISTINCT FROM c\.owner_id/);
    assert.match(migration, /FOR UPDATE OF cr SKIP LOCKED/);
    assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('cashout-overdue-owner-notify'/);
    assert.match(migration, /'cashout-overdue-owner-notify'/);
    assert.match(pushPrefs, /cashout_overdue:\s*'cashier'/);
    assert.match(routeLib, /t === 'cashout_overdue'/);
    assert.match(routeLib, /folder=notice-board/);
    assert.match(bellUi, /cashout_overdue:/);
});

test('LAW 3: Notice Board preserves member counts, role counts, roster, regular-notice pinning, group-name sync, and staff-only tab gating', () => {
    assert.match(migration, /status IN \('notice', 'pending_payout'\) AND NOT is_deleted/);
    assert.match(migration, /UPDATE public\.social_conversations SET group_name=v_name\|\|' - Notice Board'/);
    assert.doesNotMatch(migration, /REFERENCES\s+public\.clubs/i, 'migration must not acquire FK DDL locks on live table public.clubs');
    assert.doesNotMatch(migration, /TRIGGER\s+.*\s+ON\s+public\.clubs/i, 'migration must not acquire trigger DDL locks on live table public.clubs');
    assert.match(boardLib, /memberCount/);
    assert.match(boardLib, /roleCounts/);
    assert.match(boardLib, /members/);
    assert.match(boardLib, /overduePayouts/);
    assert.match(boardUi, /notice-member-summary/);
    assert.match(boardUi, /enrichWithRoster/);
    assert.match(boardUi, /<dialog/);
    assert.match(workspace, /canAccessNoticeBoard:\s*canAccessNoticeBoard && STAFF_ROLES\.has\(role\)/);
    assert.match(workspaceUi, /canAccessNoticeBoard === false/);
});

test('LAW 4: this anti-regression law remains wired into the required build-safety-gate workflow', () => {
    assert.match(workflow, /__tests__\/payout-owner-notifications-and-notice-board\.law\.test\.mjs/);
});

test('LAW 5: Phase 2 migration preserves zero live-table DDL locks while enforcing read receipts, reactions, attachments, @mentions, and pagination skip', () => {
    assert.doesNotMatch(migrationP2, /REFERENCES\s+public\.(clubs|profiles|club_members)/i, 'Phase 2 migration must never lock live gameplay tables');
    assert.doesNotMatch(migrationP2, /TRIGGER\s+.*\s+ON\s+public\.(clubs|profiles|club_members)/i, 'Phase 2 migration must never add triggers to live gameplay tables');
    assert.match(migrationP2, /CREATE TABLE public\.club_notice_board_reads/);
    assert.match(migrationP2, /CREATE TABLE public\.club_notice_board_reactions/);
    assert.match(migrationP2, /CREATE OR REPLACE FUNCTION public\.fn_club_notice_unread_counts/);
    assert.match(migrationP2, /'paginated',\s*true/);
    assert.match(migrationP2, /'metaOnly',\s*true/);
    assert.match(migrationP2, /'notice_board_mention'/);
    assert.match(workspace, /fn_club_notice_unread_counts/);
    assert.match(workspaceUi, /activeNoticeUnread/);
    assert.match(boardUi, /notice-unread-divider/);
    assert.match(boardUi, /toggle_reaction/);
    assert.match(boardUi, /Escalate To Bank/);
    assert.match(boardUi, /Message Agent/);
});

test('LAW 6: Configurable overdue escalation ladder, management overdue escalation, and push digest labels remain wired', () => {
    assert.match(migrationP2, /CREATE TABLE public\.club_payout_alert_settings/);
    assert.match(migrationP2, /CREATE TABLE public\.cashout_overdue_alert_deliveries/);
    assert.match(migrationP2, /v_is_overdue_mgmt/);
    assert.match(pushPrefs, /notice_board_mention:\s*'club_announcement'/);
    assert.match(routeLib, /t === 'notice_board_mention'/);
    assert.match(bellUi, /notice_board_mention:/);
    assert.match(pushDispatch, /cashout_overdue:\s*'unfulfilled payouts'/);
    assert.match(pushDispatch, /notice_board_mention:\s*'notice board mentions'/);
});

test('LAW 7: Phase 3 hardening migration preserves zero live-table DDL locks, receipt-verified auto-escalation, card can_escalate parity, reactions realtime RLS, and attachment replay check', () => {
    assert.doesNotMatch(migrationP3, /REFERENCES\s+public\.(clubs|profiles|club_members)/i);
    assert.doesNotMatch(migrationP3, /TRIGGER\s+.*\s+ON\s+public\.(clubs|profiles|club_members)/i);
    assert.match(migrationP3, /PERFORM public\.fn_cashier_operation_receipt\(v_hold_event_id,\s*true\)/);
    assert.match(migrationP3, /pg_advisory_xact_lock\(hashtextextended\('agent-agreement:'/);
    assert.match(migrationP3, /CREATE POLICY club_notice_reactions_member_read/);
    assert.match(migrationP3, /ALTER PUBLICATION supabase_realtime ADD TABLE public\.club_notice_board_reactions/);
    assert.match(migrationP3, /v_old\.attachments IS NOT DISTINCT FROM v_attachments/);
    assert.match(migrationP3, /CREATE OR REPLACE FUNCTION public\.fn_notice_cashout_card/);
});

test('LAW 8: Non-staff deep-link guard, active-agent parity, cross-tab unread sync, realtime reactions, and first-visit unread divider remain wired', () => {
    assert.match(clubEntry, /canAccessNoticeBoard === false/);
    assert.match(messengerPage, /canAccessNoticeBoard === false/);
    assert.match(messengerPage, /broadcastSync\('smarter_poker_unread_sync',\s*'refresh_unread'\)/);
    assert.match(workspace, /activeAgentClubs/);
    assert.match(unreadHook, /table:\s*'club_notice_board'/);
    assert.match(boardUi, /table:\s*'club_notice_board_reactions'/);
    assert.match(boardUi, /ESCALATE_ERROR_COPY/);
    assert.match(boardUi, /initialUnreadCount/);
    assert.match(boardUi, /View Card/);
});
