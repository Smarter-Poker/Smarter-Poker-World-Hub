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
