import test from 'node:test';
import assert from 'node:assert/strict';
import { getMessengerWorkspace, searchMessengerWorkspace, readMessengerMessages } from '../src/lib/messengerWorkspace.mjs';

const ids = { user:'00000000-0000-4000-8000-000000000001', other:'00000000-0000-4000-8000-000000000002', club:'10000000-0000-4000-8000-000000000001', second:'10000000-0000-4000-8000-000000000002', page:'20000000-0000-4000-8000-000000000001', social:'30000000-0000-4000-8000-000000000001', chat:'30000000-0000-4000-8000-000000000002', invoice:'30000000-0000-4000-8000-000000000003', agentInvoice:'30000000-0000-4000-8000-000000000004' };
function fixture({ member=true, role='player', broken=null, cap=200, page=true }={}) {
    const tables={
        club_members: member ? [{ user_id:ids.user, club_id:ids.club, role, status:'active', membership_lifecycle_status:'active', is_active:true }] : [],
        clubs:[{ id:ids.club, name:'First Club' }],
        social_pages:page ? [{id:ids.page, linked_entity_id:ids.club, linked_entity_type:'club'}] : [],
        social_conversations:[ids.social, ids.chat, ids.invoice, ids.agentInvoice].map(id=>({id,group_name:id,is_request:false})),
        social_conversation_participants:[{conversation_id:ids.invoice,user_id:ids.user,context_entity_id:page ? ids.page:null}],
        accounting_conversations:[{conversation_id:ids.invoice,scope_id:ids.club,recipient_id:ids.user,sender_id:ids.other,issuer_type:'club'}, {conversation_id:ids.agentInvoice,scope_id:ids.club,recipient_id:ids.other,sender_id:ids.user,issuer_type:'club'}],
    };
    const calls=[];
    const db={ from(table) {
        let data=[...(tables[table] || [])], limit=Infinity, order=null, ascending=true;
        const q={select(){return q;},eq(k,v){data=data.filter(r=>r[k]===v);return q;},neq(k,v){data=data.filter(r=>r[k]!==v);return q;},contains(k,v){data=data.filter(r=>Object.entries(v).every(([key,value])=>r[k]?.[key]===value));return q;},in(k,values){data=data.filter(r=>values.includes(r[k]));return q;},gt(k,v){data=data.filter(r=>r[k]>v);return q;},not(k,op,v){data=data.filter(r=>r[k]!==v);return q;},lte(k,v){data=data.filter(r=>r[k]<=v);return q;},order(k,options={}){order=k;ascending=options.ascending!==false;return q;},limit(n){limit=n;return q;},then(resolve,reject){calls.push(table);if(order)data.sort((a,b)=>String(a[order]).localeCompare(String(b[order]))*(ascending?1:-1));return Promise.resolve({data:data.slice(0,Math.min(cap,limit)),error:broken===table?{code:'42501'}:null}).then(resolve,reject);}};
        return q;
    },async rpc(name,args){calls.push({...args,rpc:name});if(name==='fn_messenger_private_message_page')return {data:tables.messages||[],error:broken==='messages'?{code:'42883'}:null};if(name==='fn_messenger_private_search_messages')return {data:tables.searchResults||[],error:broken==='search'?{code:'57014'}:null};if(name==='fn_messenger_private_accounting_threads')return {data:tables.accounting_conversations.filter(c=>args.p_conversation_ids.includes(c.conversation_id)).map(c=>({conversation_id:c.conversation_id,recipient_visible:c.recipient_visible!==false&&c.recipient_id===args.p_user_id,last_message_preview:'Visible Document'})),error:broken==='visibility'?{code:'42501'}:null};if(name==='fn_messenger_private_weekly_summary')return {data:Object.hasOwn(tables,'weeklyReceipt')?tables.weeklyReceipt:{contract_version:1,user_id:args.p_user_id,club_id:args.p_club_id,period_id:args.p_period_id,summary:tables.report},error:broken==='summary'?{code:'42501'}:null};if(broken==='rpc')return {data:null,error:{code:'57014'}}; const convs=args.p_context_entity_id ? [ids.chat,ids.invoice,ids.agentInvoice] : page ? [ids.social] : [ids.social,ids.invoice,ids.agentInvoice];return {data:convs.map(id=>({conversation_id:id,title:id,is_group:true,unread_count:1})),error:null};}};
    return {db,tables,calls};
}

test('social entry ignores saved or forged club context and reports actual memberships',async()=>{
 const {db,calls}=fixture(); const result=await getMessengerWorkspace(db,ids.user,{workspace:'social',contextEntityId:ids.page,clubId:ids.club,folder:'invoices'});
 assert.deepEqual(result.conversations.map(c=>c.id),[ids.social]); assert.equal(result.clubs.length,1);assert.equal(result.workspace,'social');assert.equal(result.clubs[0].canManage,false);assert.ok(calls.some(c=>c.p_context_entity_id===null));
});
test('nonmembers receive no Club Arena widget data',async()=>{const {db}=fixture({member:false});const r=await getMessengerWorkspace(db,ids.user,{workspace:'social'});assert.deepEqual(r.clubs,[]);});
test('a forged club URL cannot grant membership',async()=>{const {db}=fixture({member:false});await assert.rejects(getMessengerWorkspace(db,ids.user,{workspace:'club',clubId:ids.club}),e=>e.status===403);});
test('membership in a different club does not grant access',async()=>{const {db}=fixture();await assert.rejects(getMessengerWorkspace(db,ids.user,{workspace:'club',clubId:ids.second}),e=>e.status===403);});
test('club messages exclude all accounting threads',async()=>{const {db}=fixture();const r=await getMessengerWorkspace(db,ids.user,{workspace:'club',clubId:ids.club});assert.deepEqual(r.conversations.map(c=>c.id),[ids.chat]);});
test('invoice tab includes recipient documents and discussions, not every issuer-to-agent thread',async()=>{const {db}=fixture({role:'owner'});const r=await getMessengerWorkspace(db,ids.user,{workspace:'club',clubId:ids.club,folder:'invoices'});assert.deepEqual(r.conversations.map(c=>c.id),[ids.invoice]);assert.equal(r.conversations[0].isAccounting,true);});
test('invoice notification resolves its workspace even from social entry',async()=>{const {db}=fixture();const r=await getMessengerWorkspace(db,ids.user,{workspace:'resolve',conversationId:ids.invoice});assert.equal(r.clubId,ids.club);assert.equal(r.folder,'invoices');assert.equal(r.conversation.id,ids.invoice);});
test('notification cannot resolve a conversation without participation',async()=>{const {db}=fixture();await assert.rejects(getMessengerWorkspace(db,ids.user,{workspace:'resolve',conversationId:ids.agentInvoice}),e=>e.status===403);});
test('removed club membership cannot be restored by a notification',async()=>{const {db}=fixture({member:false});await assert.rejects(getMessengerWorkspace(db,ids.user,{workspace:'resolve',conversationId:ids.invoice}),e=>e.status===403);});
test('accounting classification outages never put invoices into social messages',async()=>{const {db}=fixture({broken:'accounting_conversations',page:false});await assert.rejects(getMessengerWorkspace(db,ids.user,{workspace:'social'}),e=>e.status===503);});
test('membership outage is distinct from no memberships',async()=>{const {db}=fixture({broken:'club_members'});await assert.rejects(getMessengerWorkspace(db,ids.user,{workspace:'social'}),e=>e.status===503);});
test('RPC outage does not fall back to unclassified messages',async()=>{const {db}=fixture({broken:'rpc'});await assert.rejects(getMessengerWorkspace(db,ids.user,{workspace:'social'}),e=>e.status===503);});
test('ordinary member access never grants club representative identity',async()=>{const {db}=fixture();const r=await getMessengerWorkspace(db,ids.user,{workspace:'club',clubId:ids.club});assert.equal(r.clubs[0].canManage,false);});
test('a smaller server page cap still loads every joined club',async()=>{const {db,tables}=fixture({cap:1});tables.club_members.push({...tables.club_members[0],club_id:ids.second});tables.clubs.push({id:ids.second,name:'Second Club'});const r=await getMessengerWorkspace(db,ids.user,{workspace:'social'});assert.equal(r.clubs.length,2);});
test('page-less club invoices never mix with personal messages',async()=>{const {db}=fixture({page:false});const social=await getMessengerWorkspace(db,ids.user,{workspace:'social'});assert.deepEqual(social.conversations.map(c=>c.id),[ids.social]);const club=await getMessengerWorkspace(db,ids.user,{workspace:'club',clubId:ids.club});assert.deepEqual(club.conversations,[]);const invoice=await getMessengerWorkspace(db,ids.user,{workspace:'club',clubId:ids.club,folder:'invoices'});assert.deepEqual(invoice.conversations.map(c=>c.id),[ids.invoice]);});

test('client metadata cannot forge an accounting receipt',async()=>{
 const {verifyAccountingMessage}=await import('../src/lib/accountingMessage.mjs');
 const message={id:'fake',message_type:'invoice',content:'Pay 1000',media_metadata:{kind:'accounting_invoice',accounting_verified:true,status:'paid'}};
 const result=verifyAccountingMessage(message,null);
 assert.equal(result.message_type,'text');assert.equal(result.media_metadata.accounting_verified,false);
});
test('current invoice status is read from its real delivery link while issued status remains recorded',async()=>{
 const {verifyAccountingMessage}=await import('../src/lib/accountingMessage.mjs');
 const message={id:'real',message_type:'invoice',media_metadata:{kind:'accounting_invoice',invoice_id:'forged',status:'pending'}};
 const result=verifyAccountingMessage(message,{id:'real-invoice',status:'paid',chips_transferred:true});
 assert.equal(result.media_metadata.accounting_verified,true);assert.equal(result.media_metadata.invoice_id,'real-invoice');assert.equal(result.media_metadata.status,'paid');assert.equal(result.media_metadata.issued_status,'pending');
});


test('human invoice questions appear for the issuer and resolve in the invoice tab',async()=>{
 const {db,tables}=fixture({role:'owner'});
 tables.accounting_conversations[1].last_discussion_at='2026-09-14T12:00:00Z';
 tables.social_conversation_participants.push({conversation_id:ids.agentInvoice,user_id:ids.user,context_entity_id:ids.page});
 const result=await getMessengerWorkspace(db,ids.user,{workspace:'club',clubId:ids.club,folder:'invoices'});
 assert.deepEqual(result.conversations.map(c=>c.id),[ids.invoice,ids.agentInvoice]);
 const resolved=await getMessengerWorkspace(db,ids.user,{workspace:'resolve',conversationId:ids.agentInvoice});
 assert.equal(resolved.folder,'invoices'); assert.equal(resolved.conversation.id,ids.agentInvoice);
});
test('an unanswered issuer thread cannot be reopened through a forged link',async()=>{
 const {db,tables}=fixture({role:'owner'});tables.social_conversation_participants.push({conversation_id:ids.agentInvoice,user_id:ids.user,context_entity_id:ids.page});
 await assert.rejects(getMessengerWorkspace(db,ids.user,{workspace:'resolve',conversationId:ids.agentInvoice}),e=>e.status===403);
});
test('direct message paging and search refuse a hidden payee thread before calling a message reader',async()=>{
 const {db,tables,calls}=fixture({role:'owner'});
 tables.social_conversation_participants.push({conversation_id:ids.agentInvoice,user_id:ids.user,context_entity_id:ids.page});
 await assert.rejects(readMessengerMessages(db,ids.user,{conversationId:ids.agentInvoice,limit:10}),e=>e.status===403);
 await assert.rejects(searchMessengerWorkspace(db,ids.user,{conversationId:ids.agentInvoice,query:'invoice'}),e=>e.status===403);
 assert.ok(!calls.some(c=>c.rpc==='fn_messenger_private_message_page'||c.rpc==='fn_messenger_private_search_messages'));
});
test('genuine issuer discussion can be paged but only through the private database contract',async()=>{
 const {db,tables,calls}=fixture({role:'owner'});
 tables.accounting_conversations[1].last_discussion_at='2026-09-14T12:00:00Z';
 tables.social_conversation_participants.push({conversation_id:ids.agentInvoice,user_id:ids.user,context_entity_id:ids.page});
 tables.messages=[{id:'question',message_type:'text',content:'Please explain the statement.'}];
 const result=await readMessengerMessages(db,ids.user,{conversationId:ids.agentInvoice,limit:10,before:'2026-09-14T12:00:00.123456Z'});
 assert.deepEqual(result,tables.messages);
 const read=calls.find(c=>c.rpc==='fn_messenger_private_message_page');
 assert.equal(read.p_user_id,ids.user);assert.equal(read.p_conversation_id,ids.agentInvoice);assert.equal(read.p_before,'2026-09-14T12:00:00.123456Z');
});
test('uninstalled private reader and revoked membership are unavailable, never legacy page fallbacks',async()=>{
 const absent=fixture({broken:'messages'});
 await assert.rejects(readMessengerMessages(absent.db,ids.user,{conversationId:ids.invoice,limit:10}),e=>e.status===503);
 assert.ok(!absent.calls.some(c=>c.rpc==='fn_messenger_message_page'));
 const removed=fixture({member:false});
 await assert.rejects(readMessengerMessages(removed.db,ids.user,{conversationId:ids.invoice,limit:10}),e=>e.status===403);
 assert.ok(!removed.calls.some(c=>c.rpc==='fn_messenger_private_message_page'));
});
function reportFixture(options={}) {
 const f=fixture({role:'owner',...options});f.tables.settlement_periods=[{id:'40000000-0000-4000-8000-000000000001',club_id:ids.club,union_id:ids.second,start_at:'2026-08-31T07:00:00Z',end_at:'2026-09-07T07:00:00Z'}];
 const p=f.tables.settlement_periods[0];
 f.tables.report={accounting_version:3,scope_kind:'union',scope_id:p.union_id,period_id:p.id,club_id:p.club_id,union_id:p.union_id,
  period_start:p.start_at,period_end:p.end_at,currency:'CHIPS',status:'needs_reconciliation',run_status:'blocked',rake_received:'100.29'};return f;
}
test('club manager receives one unresolved weekly preview without individual transfer IDs',async()=>{
 const {db}=reportFixture();const result=await getMessengerWorkspace(db,ids.user,{workspace:'club',clubId:ids.club,folder:'invoices'});
 assert.equal(result.weeklySummary.rake_received,'100.29');assert.equal(result.weeklySummary.source_ledger_ids,undefined);
});
test('ordinary players and social entry never receive club totals',async()=>{
 const {db,calls}=reportFixture({role:'player'});const player=await getMessengerWorkspace(db,ids.user,{workspace:'club',clubId:ids.club,folder:'invoices'});assert.equal(player.weeklySummary,null);assert.ok(!calls.includes('settlement_periods'));
 const owner=reportFixture();const social=await getMessengerWorkspace(owner.db,ids.user,{workspace:'social'});assert.equal(social.weeklySummary,null);assert.ok(!owner.calls.includes('settlement_periods'));
});
test('a failed or wrongly scoped summary does not display a false total',async()=>{
 const f=reportFixture({broken:'summary'});await assert.rejects(getMessengerWorkspace(f.db,ids.user,{workspace:'club',clubId:ids.club,folder:'invoices'}),e=>e.status===503);
 const g=reportFixture();g.tables.report.club_id=ids.second;await assert.rejects(getMessengerWorkspace(g.db,ids.user,{workspace:'club',clubId:ids.club,folder:'invoices'}),e=>e.status===503);
});
test('an already complete weekly statement does not duplicate the delivered invoice',async()=>{
 const {db,tables}=reportFixture();tables.report.status='complete';const r=await getMessengerWorkspace(db,ids.user,{workspace:'club',clubId:ids.club,folder:'invoices'});assert.equal(r.weeklySummary,null);
});
test('an unresolved standalone week uses its exact recorded club scope and preserves unknown amounts',async()=>{
 const {db,tables,calls}=reportFixture();tables.settlement_periods[0].union_id=null;
 Object.assign(tables.report,{union_id:null,scope_kind:'club',scope_id:ids.club,rake_received:'0.00',private_rake_banked:null,ready_to_issue:false});
 const r=await getMessengerWorkspace(db,ids.user,{workspace:'club',clubId:ids.club,folder:'invoices',userId:ids.other});
 assert.equal(r.weeklySummary.scope_kind,'club');assert.equal(r.weeklySummary.union_id,null);
 assert.equal(r.weeklySummary.status,'needs_reconciliation');assert.equal(r.weeklySummary.run_status,'blocked');
 assert.equal(r.weeklySummary.private_rake_banked,null);assert.equal(r.weeklySummary.ready_to_issue,false);
 assert.deepEqual(calls.find(c=>c.rpc==='fn_messenger_private_weekly_summary'),{rpc:'fn_messenger_private_weekly_summary',p_user_id:ids.user,p_club_id:ids.club,p_period_id:tables.report.period_id});
 assert.ok(!calls.some(c=>c.rpc==='fn_club_weekly_accounting_summary'||c.rpc==='fn_accounting_party_users'));
});
test('a former union club selects the newer standalone period instead of an older union or foreign club book',async()=>{
 const {db,tables,calls}=reportFixture();const prior=tables.settlement_periods[0];
 const latest={...prior,id:'40000000-0000-4000-8000-000000000002',union_id:null,start_at:prior.end_at,end_at:'2026-09-14T07:00:00Z'};
 tables.settlement_periods.push(latest,{...latest,id:'40000000-0000-4000-8000-000000000003',club_id:ids.second,end_at:'2026-09-14T08:00:00Z'});
 Object.assign(tables.report,{period_id:latest.id,union_id:null,scope_kind:'club',scope_id:ids.club,period_start:latest.start_at,period_end:latest.end_at});
 const r=await getMessengerWorkspace(db,ids.user,{workspace:'club',clubId:ids.club,folder:'invoices'});
 assert.equal(r.weeklySummary.period_id,latest.id);assert.equal(calls.find(c=>c.rpc==='fn_messenger_private_weekly_summary').p_period_id,latest.id);
});
test('a recorded union period stays a union book regardless of missing current-union metadata',async()=>{
 const {db,tables}=reportFixture();assert.equal(tables.clubs[0].union_id,undefined);
 const r=await getMessengerWorkspace(db,ids.user,{workspace:'club',clubId:ids.club,folder:'invoices'});
 assert.equal(r.weeklySummary.scope_kind,'union');assert.equal(r.weeklySummary.scope_id,ids.second);
});
test('two books ending together are unavailable instead of an arbitrary or locally added total',async()=>{
 const {db,tables,calls}=reportFixture();tables.settlement_periods.push({...tables.settlement_periods[0],id:'40000000-0000-4000-8000-000000000002',union_id:null});
 await assert.rejects(getMessengerWorkspace(db,ids.user,{workspace:'club',clubId:ids.club,folder:'invoices'}),e=>e.status===503);
 assert.ok(!calls.some(c=>c.rpc==='fn_messenger_private_weekly_summary'));
});
test('completed standalone summary does not duplicate the delivered weekly invoice',async()=>{
 const {db,tables}=reportFixture();tables.settlement_periods[0].union_id=null;
 Object.assign(tables.report,{union_id:null,scope_kind:'club',scope_id:ids.club,status:'complete',run_status:'complete',ready_to_issue:true});
 const r=await getMessengerWorkspace(db,ids.user,{workspace:'club',clubId:ids.club,folder:'invoices'});
 assert.equal(r.weeklySummary,null);assert.deepEqual(r.conversations.map(c=>c.id),[ids.invoice]);
});
test('wrong period, recorded scope, version or status cannot be presented as a weekly summary',async()=>{
 for(const patch of [{period_id:'different'},{union_id:null},{scope_kind:'club'},{scope_id:ids.club},{accounting_version:2},
  {period_start:'2026-08-30T07:00:00Z'},{period_end:'2026-09-08T07:00:00Z'},{currency:'USD'},{status:'paid'},{status:null}]) {
  const {db,tables}=reportFixture();Object.assign(tables.report,patch);
  await assert.rejects(getMessengerWorkspace(db,ids.user,{workspace:'club',clubId:ids.club,folder:'invoices'}),e=>e.status===503);
 }
});
test('missing, wrong-actor and stale-scope wrapper receipts are unavailable with no privileged fallback',async()=>{
 for(const patch of [null,{contract_version:0},{user_id:ids.other},{club_id:ids.second},{period_id:'other-period'}]) {
  const {db,tables,calls}=reportFixture();tables.weeklyReceipt=patch===null?null:{contract_version:1,user_id:ids.user,club_id:ids.club,period_id:tables.report.period_id,summary:tables.report,...patch};
  await assert.rejects(getMessengerWorkspace(db,ids.user,{workspace:'club',clubId:ids.club,folder:'invoices'}),e=>e.status===503);
  assert.ok(!calls.some(c=>c.rpc==='fn_club_weekly_accounting_summary'));
 }
});

test('archived club copies do not leave empty individual-payout threads in the invoice tab',async()=>{
 const {db,tables}=fixture({role:'owner'});tables.accounting_conversations[0].recipient_visible=false;
 const result=await getMessengerWorkspace(db,ids.user,{workspace:'club',clubId:ids.club,folder:'invoices'});assert.deepEqual(result.conversations,[]);
 await assert.rejects(getMessengerWorkspace(db,ids.user,{workspace:'resolve',conversationId:ids.invoice}),e=>e.status===403);
});
test('receipt visibility failure cannot restore archived invoice copies',async()=>{
 const {db}=fixture({role:'owner',broken:'visibility'});await assert.rejects(getMessengerWorkspace(db,ids.user,{workspace:'club',clubId:ids.club,folder:'invoices'}),e=>e.status===503);
});
test('accounting preview text comes from the latest visible message',async()=>{
 const {db,tables}=fixture();tables.social_conversations.find(c=>c.id===ids.invoice).last_message_preview='Archived Individual Payout';
 const r=await getMessengerWorkspace(db,ids.user,{workspace:'club',clubId:ids.club,folder:'invoices'});assert.equal(r.conversations[0].last_message_preview,'Visible Document');
});


test('legacy search without a workspace is restricted to social conversations',async()=>{
 const {db,calls,tables}=fixture({page:false});tables.searchResults=[{id:'result',conversation_id:ids.social,content:'Social Match'}];
 const result=await searchMessengerWorkspace(db,ids.user,{query:'Match',clubId:ids.club,folder:'invoices'},30);
 assert.deepEqual(result,tables.searchResults);assert.deepEqual(calls.find(call=>call.p_query).p_conversation_ids,[ids.social]);
});
test('invoice search resolves current membership and the exact visible invoice conversation',async()=>{
 const {db,calls}=fixture();await searchMessengerWorkspace(db,ids.user,{conversationId:ids.invoice,query:' 100%_ '});
 const search=calls.find(call=>call.p_query);assert.equal(search.p_user_id,ids.user);assert.deepEqual(search.p_conversation_ids,[ids.invoice]);assert.equal(search.p_query,'100%_');
 const removed=fixture({member:false});await assert.rejects(searchMessengerWorkspace(removed.db,ids.user,{conversationId:ids.invoice,query:'invoice'}),e=>e.status===403);assert.ok(!removed.calls.some(call=>call.p_query));
});
test('search does not reopen archived-only threads or treat unavailable search as empty',async()=>{
 const archived=fixture();archived.tables.accounting_conversations[0].recipient_visible=false;
 await assert.rejects(searchMessengerWorkspace(archived.db,ids.user,{conversationId:ids.invoice,query:'invoice'}),e=>e.status===403);
 const unavailable=fixture({broken:'search'});await assert.rejects(searchMessengerWorkspace(unavailable.db,ids.user,{query:'match'}),e=>e.status===503);
});
test('search validates query size and result limits before any database call',async()=>{
 const {db,calls}=fixture();for(const query of ['x',' '.repeat(3),'x'.repeat(501)])await assert.rejects(searchMessengerWorkspace(db,ids.user,{query}),e=>e.status===400);
 await assert.rejects(searchMessengerWorkspace(db,ids.user,{query:'valid'},101),e=>e.status===400);assert.equal(calls.length,0);
});


test('invoice deep links select only the requested joined club and supported folder',async()=>{
 const {resolveMessengerClubEntry}=await import('../src/lib/messengerClubEntry.mjs');
 const clubs=[{id:'club-a',pageId:'page-a'},{id:'club-b'}];
 assert.deepEqual(resolveMessengerClubEntry(clubs,{clubId:'club-b',folder:'invoices'}),{club:clubs[1],folder:'invoices'});
 assert.equal(resolveMessengerClubEntry(clubs,{clubId:'not-joined',folder:'invoices'}),null);
 assert.equal(resolveMessengerClubEntry([],{clubId:'club-b',folder:'invoices'}),null);
 assert.equal(resolveMessengerClubEntry(clubs,{clubId:['club-a'],folder:'invoices'}),null);
 assert.equal(resolveMessengerClubEntry(clubs,{clubId:'club-a',conversation:'explicit-thread'}),null);
 assert.equal(resolveMessengerClubEntry(clubs,{forceIdentity:'page-a',folder:'unknown'}).folder,'messages');
});
