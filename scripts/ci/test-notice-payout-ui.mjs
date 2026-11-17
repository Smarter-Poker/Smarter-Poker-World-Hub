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
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='auth'?"export const getAccessToken=()=>null;export async function authedFetch(url,options){const r=await window.testRequest(options.method,JSON.parse(options.body));return {ok:r.status<400,status:r.status,json:async()=>r.body};}":`export const supabase={rpc:(name,args)=>window.testRpc(name,args),channel:()=>{const listeners=[];const channel={on:(kind,filter,fn)=>{listeners.push({filter,fn});return channel;},subscribe:fn=>{window.emitNotice=(table,row)=>listeners.filter(x=>x.filter.table===table).forEach(x=>x.fn({new:row}));return channel;}};return channel;},removeChannel:async()=>{}};`}));
 }}]});
 server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?readFileSync(path.join(scratch,'fixture.js')):'<!doctype html><html><meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0;background:#18191b;color:white;font-family:system-ui"><div id="root"></div><script src="/fixture.js"></script></body></html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||['/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync)||puppeteer.executablePath(),headless:true,userDataDir:path.join(scratch,'profile'),args:process.platform==='linux'?['--no-sandbox']:[]});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const clubId='10000000-0000-4000-8000-000000000001',userId='10000000-0000-4000-8000-000000000002',cashoutId='20000000-0000-4000-8000-000000000001';
 let manager=false,allowed=true,escalated=false,failOnce=true,status='pending',notes=[],version=1,noteConflict=true;const operations=[];
 const card=()=>({cashout_id:cashoutId,club_id:clubId,amount:500,player_name:'Fixture Player',player_note:'Please Coordinate My Payout',status,is_escalated:escalated,can_escalate:!escalated,can_decide:escalated?manager:true,approval_destination:escalated?'club_bank':'agent_wallet'});
 const row=()=>({id:'30000000-0000-4000-8000-000000000001',club_id:clubId,cashout_id:cashoutId,cashout:card(),manager_notes:notes,content:'Requested Payout',status:status==='pending'?'pending_payout':'paid',is_pinned:status==='pending',version,created_at:'2026-11-17T20:00:00Z'});
 await page.exposeFunction('testRpc',async(name,args)=>{
  if(name==='fn_cashout_request_card')return allowed?{data:card(),error:null}:{data:null,error:{message:'Access Denied'}};
  operations.push({name,args});
  if(name==='fn_cashout_escalate_v2') {if(failOnce){failOnce=false;throw new Error('Transport Failed Before Acknowledgment');}escalated=true;version++;return {data:card(),error:null};}
  assert(manager,'Only manager UI may decide an escalated request');assert(escalated);assert.equal(args.p_amount,500);status=name==='fn_cashout_approve_v2'?'approved':'rejected';version++;return {data:{approval_destination:'club_bank'},error:null};
 });
 await page.exposeFunction('testRequest',async(method,body)=>{
  if(!allowed)return {status:403,body:{success:false,error:'Access Revoked'}};
  if(method==='PATCH'){assert(manager);if(body.action==='add_note'){if(noteConflict){noteConflict=false;version++;return {status:409,body:{success:false,error:'Notice Changed. Retry Your Note.'}};}assert.equal(body.payload.version,version);notes.push({id:body.payload.op_id,note:body.payload.note,actor_name:'Club Admin',created_at:'2026-11-17T20:01:00Z'});version++;}return {status:200,body:{success:true,entry:row()}};}
  return {status:200,body:{success:true,entries:[row()],pinned:status==='pending'?[row()]:[],canManage:manager,hasMore:false,cursor:null}};
 });
 const click=async text=>{await page.waitForFunction(t=>[...document.querySelectorAll('button')].some(e=>e.textContent.trim()===t&&!e.disabled),{},text);await page.evaluate(t=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===t&&!e.disabled).click(),text);};
 await page.setViewport({width:375,height:812});await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.waitForFunction(()=>document.body.textContent.includes('Note For Agent'));await click('Send To Notice Board');await page.waitForFunction(()=>document.body.textContent.includes('Result Is Unconfirmed'));
 await click('Send To Notice Board');await page.waitForFunction(()=>document.body.textContent.includes('Original Request Remains Pending'));
 assert.equal(operations.length,2);assert.equal(operations[0].args.p_op_id,operations[1].args.p_op_id,'Escalation retry keeps operation ID');assert.equal(operations[0].args.p_cashout_id,cashoutId);
 assert(await page.$$eval('button',bs=>!bs.some(b=>['Accept','Cancel'].includes(b.textContent))),'Escalated agent cannot decide');
 await page.evaluate(()=>window.showFixture('board'));await page.waitForFunction(()=>document.body.textContent.includes('Read Only'));
 assert(await page.$$eval('button',bs=>!bs.some(b=>['Accept','Deny','Add Note','Pin','Unpin'].includes(b.textContent))),'Agent board is read only');
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=375),'Mobile board overflows');
 manager=true;await page.evaluate(()=>window.showFixture('board',1));await click('Add Note');await page.type('[aria-label="Payout Note"]','Owner Will Coordinate');await click('Save Note');await page.waitForFunction(()=>document.body.textContent.includes('Notice Changed. Retry Your Note.'));await click('Save Note');await page.waitForFunction(()=>document.body.textContent.includes('Owner Will Coordinate')&&!document.querySelector('[aria-label="Payout Note"]'));
 await click('Accept');await page.waitForFunction(()=>document.body.textContent.includes('Club Chip Bank'));assert.equal(status,'approved');assert.equal(operations.at(-1).name,'fn_cashout_approve_v2');
 if(process.env.MESSENGER_UI_EVIDENCE)await page.screenshot({path:path.join(process.env.MESSENGER_UI_EVIDENCE,'notice-payout-mobile.png'),fullPage:true});
 status='pending';version++;await page.evaluate(()=>window.showFixture('board',2));await click('Deny');await page.waitForFunction(()=>document.body.textContent.includes('Returned To The Player'));assert.equal(status,'rejected');assert.equal(operations.at(-1).name,'fn_cashout_release_v2');
 allowed=false;await page.evaluate(({clubId,userId})=>window.emitNotice('club_notice_access_events',{club_id:clubId,user_id:userId,can_access:false}),{clubId,userId});
 await page.waitForFunction(()=>document.body.textContent.includes('No Longer Has Access'));assert(!await page.evaluate(()=>document.body.textContent.includes('Fixture Player')),'Revocation removes history immediately');
 await page.evaluate(({clubId,cashoutId})=>window.emitNotice('club_notice_board',{club_id:clubId,cashout_id:cashoutId}),{clubId,cashoutId});assert(!await page.evaluate(()=>document.body.textContent.includes('Fixture Player')));
 assert.deepEqual(errors,[]);console.log('Notice payout browser passed: original request escalation/retry, agent read-only, manager note/bank approval, mobile layout and immediate history revocation.');
}finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));rmSync(scratch,{recursive:true,force:true});}
