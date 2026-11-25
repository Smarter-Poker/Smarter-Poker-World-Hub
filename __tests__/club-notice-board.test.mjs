import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { noticePage, validateNoticeRequest, mergeNotices, pendingPins, compareNotices } from '../src/lib/clubNoticeBoard.mjs';
const clubId = '10000000-0000-4000-8000-000000000001';
const id = '20000000-0000-4000-8000-000000000001';

test('cursor keeps timestamp microseconds and rejects injected expressions and partial tuples', () => {
 const before = '2026-10-15T12:00:00.123456+00:00';
 assert.deepEqual(validateNoticeRequest('POST', {clubId, payload:{before,beforeId:id}}).payload,{before,beforeId:id});
 for (const payload of [{before}, {beforeId:id}, {before:"x),club_id.eq.other",beforeId:id}, {before, beforeId:'garbage'}]) {
  assert.throws(() => validateNoticeRequest('POST',{clubId,payload}), {status:400});
 }
});
test('mutation schema rejects forged identity fields, empty/oversized content and invalid versions', () => {
 const payload = {id,content:'Notice',status:'notice'};
 assert.equal(validateNoticeRequest('PUT',{clubId,payload}).action,'create');
 for (const bad of [{...payload,author_id:id},{...payload,content:''},{...payload,content:'x'.repeat(4001)},{...payload,is_pinned:'true'}]) {
  assert.throws(() => validateNoticeRequest('PUT',{clubId,payload:bad}),{status:400});
 }
 assert.throws(() => validateNoticeRequest('PATCH',{clubId,payload:{id,version:0}}),{status:400});
});
test('51-row lookahead trims oldest extra row and advances by original timestamp plus UUID', () => {
 const rows = Array.from({length:51},(_,i)=>({id:String(i),created_at:'2026-10-15T12:00:00.123456+00:00'}));
 const page=noticePage({rows,pinned:[],canManage:false});
 assert.equal(page.entries.length,50);assert.equal(page.hasMore,true);assert.equal(page.cursor.beforeId,'1');
 assert.equal(page.cursor.before,'2026-10-15T12:00:00.123456+00:00');
});
test('event races deduplicate by UUID/version and cannot resurrect tombstones', () => {
 const row={id,created_at:'2026-10-15T12:00:00Z',version:1,status:'pending_payout',is_pinned:true};
 const deleted={...row,version:3,is_deleted:true,is_pinned:false};
 const result=mergeNotices(mergeNotices([row],[deleted]),[{...row,version:2}]);
 assert.equal(result.length,1);assert.equal(result[0].is_deleted,true);assert.deepEqual(pendingPins(result),[]);
 assert.deepEqual(pendingPins([{...row,status:'paid'},row,{...row,is_pinned:false}]),[row]);
});
test('board navigation preserves club and existing inbox tabs', async () => {
 const {resolveMessengerClubEntry}=await import('../src/lib/messengerClubEntry.mjs');
 const club={id:clubId,pageId:id};
 assert.equal(resolveMessengerClubEntry([club],{clubId,folder:'notice-board'}).folder,'notice-board');
 assert.equal(resolveMessengerClubEntry([club],{clubId,folder:'invoices'}).folder,'invoices');
 assert.equal(resolveMessengerClubEntry([],{clubId,folder:'notice-board'}),null);
});
test('notice regressions stay in the required workflow and API verifies JWT actor', () => {
 const workflow=readFileSync('.github/workflows/build-safety-gate.yml','utf8');
 assert.match(workflow,/__tests__\/club-notice-board.test.mjs/);
 assert.match(workflow,/__tests__\/club-notice-board-postgres.test.mjs/);
 const api=readFileSync('pages/api/messenger/notice-board.js','utf8');
 assert.match(api,/getServerUserWithFallback\(req, db\)/); assert.match(api,/p_actor: user.id/); assert.match(api,/'42501': 403/);
});

test('realtime timezone suffixes and microseconds preserve chronological UUID ordering', () => {
 const a={id:'z',created_at:'2026-10-15T12:00:00.123456+00:00'}, b={id:'a',created_at:'2026-10-15T12:00:00.123457Z'};
 assert.ok(compareNotices(a,b)<0);
 assert.ok(compareNotices({...a,created_at:'2026-10-15T07:00:00.123456-05:00'},{...a,id:'zz'})<0);
});

test('create retries use the same canonical text and pin state as persistence without mutating input', () => {
 const payload={id,content:'  Club Notice  ',status:'notice',is_pinned:true};
 const first=validateNoticeRequest('PUT',{clubId,payload});
 assert.deepEqual(first.payload,{id,content:'Club Notice',status:'notice',is_pinned:true});
 assert.deepEqual(payload,{id,content:'  Club Notice  ',status:'notice',is_pinned:true});
 assert.deepEqual(validateNoticeRequest('PUT',{clubId,payload:{...payload}}).payload,first.payload);
 const paid=validateNoticeRequest('PUT',{clubId,payload:{...payload,status:'paid',is_pinned:true}});
 assert.equal(paid.payload.is_pinned,false);
 const payout=validateNoticeRequest('PUT',{clubId,payload:{...payload,status:'pending_payout'}});
 assert.equal(payout.payload.is_pinned,true);
});

test('noticePage preserves staff roster, role counts, overdue payouts and Telegram-style summary', async () => {
 const { formatMemberSummary, pinnedNotices } = await import('../src/lib/clubNoticeBoard.mjs');
 const rows = [{ id, created_at: '2026-11-24T12:00:00Z', status: 'notice', is_pinned: true, is_deleted: false, version: 1, author_name: 'KingFish', author_role: 'owner' }];
 const page = noticePage({
  rows,
  pinned: rows,
  canManage: true,
  viewerRole: 'owner',
  memberCount: 55,
  roleCounts: { owner: 1, co_owner: 1, admin: 2, super_agent: 40, agent: 10, sub_agent: 1, management: 4, agents: 51, online: 3, total: 55 },
  members: [{ user_id: id, display_name: 'KingFish', username: 'kingfish', role: 'owner', is_online: true }],
  overduePayouts: [{ cashout_id: clubId, player_name: 'Breezy', agent_name: 'Probyourmom', amount: '200.00', hours_pending: 6 }],
 });
 assert.equal(page.memberCount, 55);
 assert.equal(page.roleCounts.agents, 51);
 assert.equal(page.roleCounts.management, 4);
 assert.equal(page.members.length, 1);
 assert.equal(page.overduePayouts.length, 1);
 assert.equal(formatMemberSummary(page.roleCounts, page.memberCount), '55 Members · 4 Admins · 51 Agents · 3 Online');
 assert.equal(pinnedNotices([...rows, { ...rows[0], id: clubId, status: 'paid', is_pinned: true }]).length, 1);
 const merged = mergeNotices(rows, [{ id, created_at: '2026-11-24T12:00:00Z', status: 'notice', is_pinned: false, is_deleted: false, version: 2 }]);
 assert.equal(merged[0].author_name, 'KingFish');
 assert.equal(merged[0].author_role, 'owner');
});

test('overdue cashout and notice mention notifications route to club Notice Board and respect push prefs', async () => {
 const { resolveNotificationRoute } = await import('../src/lib/notificationRoute.js');
 const { eventToTypeKey } = await import('../src/lib/push/push-prefs.js');
 assert.equal(resolveNotificationRoute({ type: 'cashout_overdue', data: { club_id: clubId } }), `/hub/messenger?clubId=${clubId}&folder=notice-board`);
 assert.equal(eventToTypeKey('cashout_overdue'), 'cashier');
 assert.equal(resolveNotificationRoute({ type: 'notice_board_mention', data: { club_id: clubId } }), `/hub/messenger?clubId=${clubId}&folder=notice-board`);
 assert.equal(eventToTypeKey('notice_board_mention'), 'club_announcement');
});

test('Phase 2 actions (mark_read, toggle_reaction, update_alert_settings, attachments, mentions, refreshMeta, paginated) validate strictly', () => {
 assert.deepEqual(validateNoticeRequest('PATCH', { clubId, action: 'mark_read', payload: { lastNoticeId: id } }), { clubId, action: 'mark_read', payload: { lastNoticeId: id } });
 assert.throws(() => validateNoticeRequest('PATCH', { clubId, action: 'mark_read', payload: { lastNoticeId: 'bad' } }), { status: 400 });
 assert.deepEqual(validateNoticeRequest('PATCH', { clubId, action: 'toggle_reaction', payload: { id, reaction: 'ack' } }), { clubId, action: 'toggle_reaction', payload: { id, reaction: 'ack' } });
 assert.throws(() => validateNoticeRequest('PATCH', { clubId, action: 'toggle_reaction', payload: { id, reaction: 'bogus' } }), { status: 400 });
 assert.deepEqual(
  validateNoticeRequest('PATCH', { clubId, action: 'update_alert_settings', payload: { overdue_threshold_hours: 4, followup_threshold_hours: 12, notify_admins: true, auto_escalate_hours: 24 } }).payload,
  { overdue_threshold_hours: 4, followup_threshold_hours: 12, notify_admins: true, auto_escalate_hours: 24 }
 );
 assert.throws(() => validateNoticeRequest('PATCH', { clubId, action: 'update_alert_settings', payload: { overdue_threshold_hours: 6, followup_threshold_hours: 4 } }), { status: 400 });
 assert.throws(() => validateNoticeRequest('PUT', { clubId, payload: { id, content: 'Hi', status: 'notice', attachments: [{ url: 'http://insecure.example/x.png' }] } }), { status: 400 });
 const rich = validateNoticeRequest('PUT', { clubId, payload: { id, content: 'Hi @AllStaff', status: 'notice', attachments: [{ url: 'https://cdn.example/a.png', name: 'Proof' }], mention_all: true } });
 assert.equal(rich.payload.attachments[0].url, 'https://cdn.example/a.png');
 assert.equal(rich.payload.mention_all, true);
 assert.deepEqual(validateNoticeRequest('POST', { clubId, payload: { refreshMeta: true } }), { clubId, action: 'read', payload: { refreshMeta: true } });
 assert.throws(() => validateNoticeRequest('POST', { clubId, payload: { refreshMeta: true, before: '2026-11-24T12:00:00Z', beforeId: id } }), { status: 400 });
 const paged = noticePage({ rows: [{ id, created_at: '2026-11-24T12:00:00Z' }], pinned: [], paginated: true, canManage: true, viewerRole: 'owner' });
 assert.equal(paged.paginated, true);
 assert.equal(paged.entries.length, 1);
 const meta = noticePage({ metaOnly: true, canManage: true, viewerRole: 'owner', memberCount: 55, roleCounts: { total: 55 }, members: [], overduePayouts: [] });
 assert.equal(meta.metaOnly, true);
 assert.equal(meta.memberCount, 55);
});


test('non-staff deep-link to folder=notice-board safely falls back to messages', async () => {
 const { resolveMessengerClubEntry } = await import('../src/lib/messengerClubEntry.mjs');
 const staffClub = { id: clubId, pageId: id, canAccessNoticeBoard: true };
 const playerClub = { id: clubId, pageId: id, canAccessNoticeBoard: false };
 assert.equal(resolveMessengerClubEntry([staffClub], { clubId, folder: 'notice-board' })?.folder, 'notice-board');
 assert.equal(resolveMessengerClubEntry([playerClub], { clubId, folder: 'notice-board' })?.folder, 'messages');
});

test('manager payout notes require a bounded note and stable operation identity', () => {
 const payload={id,version:1,note:'  Please Help  ',op_id:clubId};
 assert.deepEqual(validateNoticeRequest('PATCH',{clubId,action:'add_note',payload}),{clubId,action:'add_note',payload:{...payload,note:'Please Help'}});
 for(const bad of [{...payload,note:''},{...payload,note:'x'.repeat(2001)},{...payload,op_id:'bad'},{...payload,amount:500},{...payload,actor_id:id}]) assert.throws(()=>validateNoticeRequest('PATCH',{clubId,action:'add_note',payload:bad}),{status:400});
 assert.equal(validateNoticeRequest('PATCH',{clubId,action:'add_note',payload:{...payload,note:'x'.repeat(2000)}}).payload.note.length,2000);
 assert.throws(()=>validateNoticeRequest('POST',{clubId,action:'add_note',payload}),{status:400});
 assert.throws(()=>validateNoticeRequest('PATCH',{clubId,action:'approve',payload}),{status:400});
});

test('Phase 4 actions (threads, polls, confirm campaign, pin reorder, scheduled, search, delta entry, quiet hours, formatting, SLA) validate strictly', async () => {
 const { parseNoticeFormatting, formatSlaMinutes, normalizeAlertSettings } = await import('../src/lib/clubNoticeBoard.mjs');
 assert.deepEqual(validateNoticeRequest('POST', { clubId, action: 'entry', payload: { id } }), { clubId, action: 'entry', payload: { id } });
 assert.deepEqual(validateNoticeRequest('POST', { clubId, action: 'search', payload: { query: '  Settlement  ', limit: 20 } }), { clubId, action: 'search', payload: { query: 'Settlement', limit: 20 } });
 assert.throws(() => validateNoticeRequest('POST', { clubId, action: 'search', payload: { query: '   ' } }), { status: 400 });
 assert.deepEqual(validateNoticeRequest('POST', { clubId, action: 'list_replies', payload: { id } }), { clubId, action: 'list_replies', payload: { id } });
 assert.equal(validateNoticeRequest('PATCH', { clubId, action: 'create_reply', payload: { id, content: '  On it  ' } }).payload.content, 'On it');
 assert.throws(() => validateNoticeRequest('PATCH', { clubId, action: 'create_reply', payload: { id, content: 'x'.repeat(1001) } }), { status: 400 });
 assert.equal(validateNoticeRequest('PATCH', { clubId, action: 'delete_reply', payload: { reply_id: id } }).action, 'delete_reply');
 assert.equal(validateNoticeRequest('PATCH', { clubId, action: 'vote_poll', payload: { id, option_id: 'opt_0' } }).action, 'vote_poll');
 assert.equal(validateNoticeRequest('PATCH', { clubId, action: 'close_poll', payload: { id } }).action, 'close_poll');
 assert.equal(validateNoticeRequest('PATCH', { clubId, action: 'remind_unconfirmed', payload: { id } }).action, 'remind_unconfirmed');
 assert.equal(validateNoticeRequest('PATCH', { clubId, action: 'reorder_pins', payload: { notice_ids: [id] } }).action, 'reorder_pins');
 assert.equal(validateNoticeRequest('PATCH', { clubId, action: 'publish_now', payload: { id } }).action, 'publish_now');
 const richP4 = validateNoticeRequest('PUT', {
  clubId,
  payload: {
   id, content: '**Policy**\n- Check https://smarter.poker', status: 'notice',
   require_confirmation: true,
   scheduled_for: '2026-12-01T12:00:00.000Z',
   attachments: [{ url: 'https://cdn.example/guide.pdf', name: 'Guide.pdf', mime: 'application/pdf' }],
   poll: { question: ' Best Window? ', options: [' 8 PM ', ' 10 AM '], allow_multiple: true },
  },
 });
 assert.equal(richP4.payload.poll.question, 'Best Window?');
 assert.deepEqual(richP4.payload.poll.options, ['8 PM', '10 AM']);
 assert.throws(() => validateNoticeRequest('PUT', { clubId, payload: { id, content: 'Bad', status: 'notice', attachments: [{ url: 'https://cdn.example/x.exe', mime: 'application/x-msdownload' }] } }), { status: 400 });
 assert.throws(() => validateNoticeRequest('PATCH', { clubId, action: 'update_alert_settings', payload: { overdue_threshold_hours: 4, quiet_hours_start: 22 } }), { status: 400 });
 const qh = normalizeAlertSettings({ overdue_threshold_hours: 4, quiet_hours_start: 23, quiet_hours_end: 7, quiet_hours_tz: 'America/Chicago', quiet_hours_backup_role: 'co_owner' });
 assert.equal(qh.quiet_hours_backup_role, 'co_owner');
 assert.equal(qh.quiet_hours_start, 23);
 const parsed = parseNoticeFormatting('**Bold** Check https://smarter.poker.\n- Bullet Item');
 assert.equal(parsed[0].segments[0].type, 'bold');
 assert.equal(parsed[0].segments[2].href, 'https://smarter.poker');
 assert.equal(parsed[1].type, 'bullet');
 assert.equal(formatSlaMinutes(0.4), '<1m');
 assert.equal(formatSlaMinutes(18), '18m');
 assert.equal(formatSlaMinutes(85), '1h 25m');
});

test('cashout_prebreach_warning routes to club invoices and honors cashier push pref', async () => {
 const { resolveNotificationRoute } = await import('../src/lib/notificationRoute.js');
 const { eventToTypeKey } = await import('../src/lib/push/push-prefs.js');
 assert.equal(resolveNotificationRoute({ type: 'cashout_prebreach_warning', data: { club_id: clubId } }), `/hub/messenger?clubId=${clubId}&folder=invoices`);
 assert.equal(eventToTypeKey('cashout_prebreach_warning'), 'cashier');
});
