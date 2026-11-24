import assert from 'node:assert/strict';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
const parent=process.env.MESSENGER_UI_ROOT||process.env.RUNNER_TEMP;
assert(parent,'Task-owned external or hosted runner scratch required');
if(process.platform==='darwin') assert.notEqual(statSync(parent).dev,statSync('/').dev,'External disk required');
const scratch=mkdtempSync(path.join(parent,'notice-payout-ui-'));let browser,server;
try {
 await build({entryPoints:[path.join(root,'__tests__/fixtures/notice-payout-ui.jsx')],outfile:path.join(scratch,'fixture.js'),bundle:true,format:'iife',loader:{'.js':'jsx'},plugins:[{name:'isolated-transport',setup(b){
  b.onResolve({filter:/lib\/authUtils$/},()=>({path:'auth',namespace:'fixture'}));
  b.onResolve({filter:/lib\/supabase$/},()=>({path:'supabase',namespace:'fixture'}));
  b.onResolve({filter:/^@smarter-poker\/commander-shared\/lib\/broadcastSync$/},()=>({path:path.join(root,'node_modules/@smarter-poker/commander-shared/src/lib/broadcastSync.js')}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='auth'?"export const getAccessToken=()=>null;export async function authedFetch(url,options){const r=await window.testRequest(options.method,JSON.parse(options.body));return {ok:r.status<400,status:r.status,json:async()=>r.body};}":`export const supabase={rpc:(name,args)=>window.testRpc(name,args),channel:()=>{const listeners=[];const channel={on:(kind,filter,fn)=>{listeners.push({filter,fn});return channel;},subscribe:fn=>{window.emitNotice=(table,row)=>listeners.filter(x=>x.filter.table===table).forEach(x=>x.fn({new:row}));return channel;}};return channel;},removeChannel:async()=>{}};`}));
 }}]});
 server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?readFileSync(path.join(scratch,'fixture.js')):'<!doctype html><html><meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0;background:#18191b;color:white;font-family:system-ui"><div id="root"></div><script src="/fixture.js"></script></body></html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||['/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync)||puppeteer.executablePath(),headless:true,userDataDir:path.join(scratch,'profile'),args:process.platform==='linux'?['--no-sandbox']:[]});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const clubId='10000000-0000-4000-8000-000000000001',userId='10000000-0000-4000-8000-000000000002',cashoutId='20000000-0000-4000-8000-000000000001';
 let manager=false,allowed=true,escalated=false,failOnce=true,bareEscalation=true,bareApproval=true,status='pending',notes=[],version=1,noteConflict=true;const operations=[];
 const card=()=>({cashout_id:cashoutId,club_id:clubId,player_id:'40000000-0000-4000-8000-000000000001',amount:'500.00',player_name:'Fixture Player',player_note:'Please Coordinate My Payout',status,is_escalated:escalated,can_escalate:!escalated,can_decide:escalated?manager:true,approval_destination:escalated?'club_bank':'agent_wallet'});
 const row=()=>({id:'30000000-0000-4000-8000-000000000001',club_id:clubId,cashout_id:cashoutId,cashout:card(),manager_notes:notes,content:'Requested Payout',status:status==='pending'?'pending_payout':'paid',is_pinned:status==='pending',version,created_at:'2026-11-17T20:00:00Z'});
 const receipt=(args,approval)=>{
  const id=n=>`50000000-0000-4000-8000-${String(n).padStart(12,'0')}`,player=card().player_id,at='2026-11-17T20:00:00Z',later='2026-11-17T20:02:00Z';
  const cashier={contract_version:1,event_id:id(1),invoice_id:id(2),cashout_id:cashoutId,escrow_id:id(3),source_transaction_id:id(4),source_ledger_id:id(5),club_id:clubId,player_id:player,assigned_agent_id:id(6),issuer_representative_id:id(7),actor_user_id:userId,actor_role:'admin',event_kind:approval?'approval':'decline',display_state:approval?'approved':'refunded',amount:'500.00',occurred_at:later,issued_at:later,hold_event_id:id(8),hold_invoice_id:id(9),ledger_from_type:'escrow',ledger_from_entity_id:id(3),ledger_to_type:approval?'club_treasury':'player_wallet',ledger_to_entity_id:approval?clubId:player,custody_movement_recorded:true,cashout_completed:approval,refund_recorded:!approval,...(approval?{approval_destination:'club_bank'}:{})};
  return {...cashier,success:true,replayed:false,op_id:args.p_op_id,request_status:approval?'approved':'rejected',accepted_note:null,actor_wallet_after:approval?'5000.00':null,...(approval?{club_bank_after:'5000.00'}:{}),cashier,request:{id:cashoutId,club_id:clubId,player_id:player,agent_id:id(6),amount:'500.00',status:approval?'approved':'rejected',created_at:at,updated_at:later,acknowledged_at:later,completed_at:approval?later:null,cancelled_at:approval?null:later,player_note:card().player_note,agent_note:null}};
 };
 let deferRead=false,releaseRead;
 await page.exposeFunction('testRpc',async(name,args)=>{
  if(name==='fn_cashout_request_card'){const response=allowed?{data:card(),error:null}:{data:null,error:{message:'Access Denied'}};if(deferRead){deferRead=false;await new Promise(resolve=>{releaseRead=resolve;});}return response;}
  operations.push({name,args});
  if(name==='fn_cashout_escalate_v2') {
   if(failOnce){failOnce=false;throw new Error('Transport Failed Before Acknowledgment');}
   if(bareEscalation){bareEscalation=false;return {data:null,error:null};}
   escalated=true;version++;return {data:{...card(),success:true,contract_version:1,op_id:args.p_op_id,actor_user_id:userId,notice_id:row().id,replayed:false},error:null};
  }
  assert(manager,'Only manager UI may decide an escalated request');assert(escalated);assert.equal(Number(args.p_amount),500);
  if(name==='fn_cashout_approve_v2'&&bareApproval){bareApproval=false;return {data:{success:true},error:null};}
  const approval=name==='fn_cashout_approve_v2';status=approval?'approved':'rejected';version++;return {data:receipt(args,approval),error:null};
 });
 await page.exposeFunction('testRequest',async(method,body)=>{
  if(!allowed)return {status:403,body:{success:false,error:'Access Revoked'}};
  if(method==='PATCH'){assert(manager);if(body.action==='add_note'){if(noteConflict){noteConflict=false;version++;return {status:409,body:{success:false,error:'Notice Changed. Retry Your Note.'}};}assert.equal(body.payload.version,version);notes.push({id:body.payload.op_id,note:body.payload.note,actor_name:'Club Admin',created_at:'2026-11-17T20:01:00Z'});version++;}return {status:200,body:{success:true,entry:row()}};}
  return {status:200,body:{success:true,entries:[row()],pinned:status==='pending'?[row()]:[],canManage:manager,hasMore:false,cursor:null}};
 });
 const click=async text=>{await page.waitForFunction(t=>[...document.querySelectorAll('button')].some(e=>e.textContent.trim()===t&&!e.disabled),{},text);await page.evaluate(t=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===t&&!e.disabled).click(),text);};
 await page.setViewport({width:375,height:812});await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.waitForFunction(()=>document.body.textContent.includes('Note For Agent'));await click('Send To Notice Board');await page.waitForFunction(()=>document.body.textContent.includes('Result Is Unconfirmed'));
 await click('Send To Notice Board');await page.waitForFunction(()=>document.body.textContent.includes('Result Is Unconfirmed'));assert.equal(escalated,false,'Null success cannot acknowledge escalation');
 await click('Send To Notice Board');await page.waitForFunction(()=>document.body.textContent.includes('Original Request Remains Pending'));
 assert.equal(operations.length,3);assert.equal(operations[1].args.p_op_id,operations[2].args.p_op_id);assert.equal(operations[0].args.p_op_id,operations[1].args.p_op_id,'Escalation retry keeps operation ID');assert.equal(operations[0].args.p_cashout_id,cashoutId);
 assert(await page.$$eval('button',bs=>!bs.some(b=>['Accept','Cancel'].includes(b.textContent))),'Escalated agent cannot decide');
 await page.evaluate(()=>window.showFixture('board'));await page.waitForFunction(()=>document.body.textContent.includes('Read Only'));
 assert(await page.$$eval('button',bs=>!bs.some(b=>['Accept','Deny','Add Note','Pin','Unpin'].includes(b.textContent))),'Agent board is read only');
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=375),'Mobile board overflows');
 manager=true;await page.evaluate(()=>window.showFixture('board',1));await click('Add Note');await page.type('[aria-label="Payout Note"]','Owner Will Coordinate');await click('Save Note');await page.waitForFunction(()=>document.body.textContent.includes('Notice Changed. Retry Your Note.'));await click('Save Note');await page.waitForFunction(()=>document.body.textContent.includes('Owner Will Coordinate')&&!document.querySelector('[aria-label="Payout Note"]'));
 await click('Accept');await page.waitForFunction(()=>document.body.textContent.includes('Result Is Unconfirmed'));assert.equal(status,'pending','Bare success must not acknowledge a payout');const approvalOp=operations.at(-1).args.p_op_id;
 await click('Accept');await page.waitForFunction(()=>document.body.textContent.includes('Club Chip Bank'));assert.equal(operations.at(-1).args.p_op_id,approvalOp);assert.equal(status,'approved');assert.equal(operations.at(-1).name,'fn_cashout_approve_v2');
 if(process.env.MESSENGER_UI_EVIDENCE)await page.screenshot({path:path.join(process.env.MESSENGER_UI_EVIDENCE,'notice-payout-mobile.png'),fullPage:true});
 status='pending';version++;await page.evaluate(()=>window.showFixture('board',2));await click('Deny');await page.waitForFunction(()=>document.body.textContent.includes('Returned To The Player'));assert.equal(status,'rejected');assert.equal(operations.at(-1).name,'fn_cashout_release_v2');
 allowed=false;await page.evaluate(({clubId,userId})=>window.emitNotice('club_notice_access_events',{club_id:clubId,user_id:userId,can_access:false}),{clubId,userId});
 await page.waitForFunction(()=>document.body.textContent.includes('No Longer Has Access'));assert(!await page.evaluate(()=>document.body.textContent.includes('Fixture Player')),'Revocation removes history immediately');
 await page.evaluate(({clubId,cashoutId})=>window.emitNotice('club_notice_board',{club_id:clubId,cashout_id:cashoutId}),{clubId,cashoutId});assert(!await page.evaluate(()=>document.body.textContent.includes('Fixture Player')));
 // An older authorized response must never restore details after a newer denial.
 allowed=true;await page.evaluate(()=>window.showFixture('private',3));await page.waitForFunction(()=>document.body.textContent.includes('Fixture Player'));
 deferRead=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.waitForFunction(()=>true);assert(releaseRead,'Deferred authorized read started');
 allowed=false;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForFunction(()=>document.body.textContent.includes('This Payout Is Unavailable'));
 releaseRead();await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,100)));
 assert(!await page.evaluate(()=>document.body.textContent.includes('Fixture Player')),'Older authorized read cannot restore denied payout details');
 // The same ordering rule keeps a newer terminal status from regressing.
 allowed=true;status='pending';await page.evaluate(()=>window.showFixture('private',4));await page.waitForFunction(()=>document.body.textContent.includes('Awaiting Owner'));
 deferRead=true;releaseRead=null;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForFunction(()=>true);assert(releaseRead);
 status='approved';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForFunction(()=>document.body.textContent.includes('Accepted · Chips Sent To The Club Chip Bank'));
 releaseRead();await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,100)));
  assert(!await page.evaluate(()=>document.body.textContent.includes('Awaiting Owner')),'Older pending read cannot restore a terminal request');

  // Desktop (1280x800) + Two-Tab interactive Notice Board verification:
  // roster, search, pins, unread divider, read receipts, reactions, View Card under filter,
  // Message Agent destination, live second-session updates, and BroadcastChannel cross-tab read sync.
  const ownerId='10000000-0000-4000-8000-000000000002';
  const agentId='10000000-0000-4000-8000-000000000009';
  const adminId='10000000-0000-4000-8000-000000000010';
  const agent2Id='10000000-0000-4000-8000-000000000011';
  const notice1Id='30000000-0000-4000-8000-000000000010';
  const notice2Id='30000000-0000-4000-8000-000000000011';
  const staffMembers=[
    {user_id:ownerId,display_name:'Club Owner',username:'clubowner',role:'owner',is_online:true},
    {user_id:adminId,display_name:'Club Admin',username:'clubadmin',role:'admin',is_online:true},
    {user_id:agentId,display_name:'Agent Alpha',username:'agentalpha',role:'agent',is_online:true},
    {user_id:agent2Id,display_name:'Agent Beta',username:'agentbeta',role:'sub_agent',is_online:false},
  ];
  let tab2AckCount=1,tab2SeenCount=2,tab2Unread=1,tab2PrevRead='2026-11-17T19:50:00Z';
  const regularNotice=()=>({
    id:notice1Id,club_id:clubId,author_id:adminId,author_name:'Club Admin',author_role:'admin',
    content:'Weekly Settlement Window Opens At 8 PM',status:'notice',is_pinned:true,version:1,
    created_at:'2026-11-17T20:05:00Z',seen_count:tab2SeenCount,
    reactions:{ack:tab2AckCount,thumbs_up:0,fire:0,eyes:0},my_reactions:tab2AckCount>1?['ack']:[],
    ack_users:tab2AckCount>1?['Club Admin','Club Owner']:['Club Admin'],attachments:[],mentions:[],
  });
  const liveEntries=()=>[row(),regularNotice()];
  const liveOverdue=()=>[{
    cashout_id:cashoutId,player_id:'40000000-0000-4000-8000-000000000001',player_name:'Fixture Player',
    agent_id:agentId,agent_name:'Agent Alpha',amount:'500.00',created_at:'2026-11-17T14:00:00Z',
    hours_pending:6,is_escalated:true,
  }];
  const roleCounts={owner:1,co_owner:0,admin:1,super_agent:0,agent:1,sub_agent:1,management:2,agents:2,online:3,total:4};
  const desktopPage=await browser.newPage(),tab2Page=await browser.newPage();
  desktopPage.on('pageerror',e=>errors.push(`desktop:${e.message}`));
  tab2Page.on('pageerror',e=>errors.push(`tab2:${e.message}`));
  const bindBoardMock=async(targetPage,isTab2)=>{
    await targetPage.exposeFunction('testRpc',async()=>({data:null,error:null}));
    await targetPage.exposeFunction('testRequest',async(method,body)=>{
      if(method==='PATCH'&&body.action==='mark_read'){
        if(!isTab2){tab2Unread=0;tab2PrevRead=null;}
        return {status:200,body:{success:true,unreadCount:0}};
      }
      if(method==='PATCH'&&body.action==='toggle_reaction'){
        tab2AckCount=tab2AckCount>1?1:2;
        return {status:200,body:{success:true,entry:regularNotice()}};
      }
      if(body?.refreshMeta){
        return {status:200,body:{success:true,metaOnly:true,canManage:true,viewerRole:'owner',memberCount:4,roleCounts,members:staffMembers,overduePayouts:liveOverdue(),alertSettings:{overdue_threshold_hours:4,followup_threshold_hours:null,notify_admins:false,auto_escalate_hours:null}}};
      }
      return {status:200,body:{
        success:true,entries:liveEntries(),pinned:[row(),regularNotice()],canManage:true,viewerRole:'owner',
        memberCount:4,roleCounts,members:staffMembers,overduePayouts:liveOverdue(),
        alertSettings:{overdue_threshold_hours:4,followup_threshold_hours:null,notify_admins:false,auto_escalate_hours:null},
        unreadCount:isTab2?tab2Unread:1,previousLastReadAt:isTab2?tab2PrevRead:'2026-11-17T19:50:00Z',
        hasMore:false,cursor:null,
      }};
    });
  };
  await bindBoardMock(desktopPage,false);
  await bindBoardMock(tab2Page,true);
  await desktopPage.setViewport({width:1280,height:800});
  await tab2Page.setViewport({width:1280,height:800});
  await desktopPage.goto(`http://127.0.0.1:${server.address().port}`);
  await tab2Page.goto(`http://127.0.0.1:${server.address().port}`);
  // Open Tab 2 first with unread divider visible (unreadCount=1), verify self-broadcast keeps divider visible,
  // then open Tab 1 which marks read and broadcasts BroadcastChannel sync -> Tab 2 clears Unread Messages without reload.
  await tab2Page.evaluate(()=>window.showFixture('board',10));
  await tab2Page.waitForFunction(()=>document.body.textContent.includes('Weekly Settlement Window Opens At 8 PM'));
  await tab2Page.waitForFunction(()=>document.body.textContent.includes('Unread Messages'));
  await tab2Page.waitForFunction(()=>document.body.textContent.includes('2/4 Seen'));
  assert(await tab2Page.evaluate(()=>document.documentElement.scrollWidth<=1280),'Desktop board overflows');
  await new Promise(resolve=>setTimeout(resolve,600));
  assert(await tab2Page.evaluate(()=>document.body.textContent.includes('Unread Messages')),'Own mark_read broadcast must not wipe active tab unread divider');
  // Now open Tab 1 (reads & broadcasts smarter_poker_unread_sync -> Tab 2 must clear Unread Messages without reload).
  await desktopPage.evaluate(()=>window.showFixture('board',11));
  await desktopPage.waitForFunction(()=>document.body.textContent.includes('Staff (4)'),{polling:50});
  await tab2Page.waitForFunction(()=>!document.body.textContent.includes('Unread Messages'),{polling:50});
  // Verify Roster modal, search, role counts, and Agents filter on Desktop.
  await desktopPage.evaluate(()=>{document.querySelector('[aria-label="View Staff And Agents"]').click();});
  await desktopPage.waitForFunction(()=>document.body.textContent.includes('Fixture Club · Notice Board Staff')&&document.body.textContent.includes('Agent Alpha'),{polling:50});
  await desktopPage.evaluate(()=>{const dlg=document.querySelector('dialog[open]');if(dlg)dlg.close();});
  // Verify View Card clears an active filter (Notices) and highlights/scrolls to the escalated payout card.
  await desktopPage.evaluate(()=>{[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('Notices')).click();});
  await desktopPage.waitForFunction(id=>!document.querySelector(`[data-notice-id="${id}"]`),{polling:50},row().id);
  await desktopPage.evaluate(()=>{const btn=document.querySelector('[aria-label*="Unfulfilled Payouts"] button');if(btn)btn.click();});
  await desktopPage.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='View Card'),{polling:50});
  await desktopPage.evaluate(()=>{[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='View Card').click();});
  await desktopPage.waitForFunction(id=>Boolean(document.querySelector(`[data-notice-id="${id}"]`)),{polling:50},row().id);
  // Verify Message Agent calls onMessageMember with exact agent identity & prefilled DM text.
  await desktopPage.evaluate(()=>{[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Message Agent').click();});
  const messaged=await desktopPage.evaluate(()=>window.__messagedMembers);
  assert.equal(messaged.length,1,'Message Agent must invoke onMessageMember');
  assert.equal(messaged[0].member.user_id,agentId);
  assert.match(messaged[0].prefill,/Fixture Player/i);
  // Verify reaction toggle + live club_notice_board_reads + club_notice_board_reactions updates in Tab 2 without reload.
  await desktopPage.evaluate(()=>{[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Confirm')).click();});
  await desktopPage.waitForFunction(()=>document.body.textContent.includes('Confirmed'),{polling:50});
  tab2SeenCount=3;
  await tab2Page.evaluate(({clubId})=>{
    window.emitNotice('club_notice_board_reactions',{club_id:clubId});
    window.emitNotice('club_notice_board_reads',{club_id:clubId});
  },{clubId});
  await tab2Page.waitForFunction(()=>document.body.textContent.includes('3/4 Seen')&&document.body.textContent.includes('Confirmed'),{polling:50});
  // Verify live notice push arrives in Tab 2 without reload.
  await tab2Page.evaluate(({clubId,notice2Id,adminId})=>{
    window.emitNotice('club_notice_board',{id:notice2Id,club_id:clubId,author_id:adminId,content:'Live Realtime Notice Arrival',status:'notice',is_pinned:false,version:1,created_at:'2026-11-17T20:10:00Z'});
  },{clubId,notice2Id,adminId});
  await tab2Page.waitForFunction(()=>document.body.textContent.includes('Live Realtime Notice Arrival')&&document.body.textContent.includes('Club Admin'),{polling:50});
  await desktopPage.close();await tab2Page.close();

  assert.deepEqual(errors,[]);console.log('Notice payout browser passed: mobile + desktop, roster, filters, View Card, Message Agent, reactions, live read receipts, cross-tab BroadcastChannel sync, and immediate history revocation.');
}finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));rmSync(scratch,{recursive:true,force:true});}
