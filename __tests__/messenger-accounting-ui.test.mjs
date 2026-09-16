import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as accountingMessage from '../src/lib/accountingMessage.mjs';
const require=createRequire(import.meta.url);
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const ts=require('typescript');
function component(path, load=require) {
 const code=ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{fileName:'component.jsx',compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 new Function('require','module','exports',code)(load,module,module.exports);
 return module.exports.default;
}
const Widget=component('../src/components/messenger/ClubArenaWorkspace.js');
const Invoice=component('../src/components/messenger/AccountingInvoiceCard.js',name=>name==='../../lib/accountingMessage.mjs'?accountingMessage:require(name));
const AccountingIntroduction=component('../src/components/messenger/AccountingConversationIntroduction.js');
const theme={card:'#fff',text:'#111',border:'#ccc',textSec:'#555',blue:'#007bff'};
const clubs=[{id:'a',name:'First Club',canManage:true},{id:'b',name:'Second Club',canManage:false}];
function elements(element,result=[]) { if(!React.isValidElement(element))return result;result.push(element);for(const child of React.Children.toArray(element.props.children))elements(child,result);return result; }
const noop=()=>{};
function widget(overrides={}){return Widget({clubs,open:false,clubId:null,folder:'messages',theme,onEnter:noop,onExit:noop,onFolder:noop,...overrides});}

test('nonmembers have no Club Arena widget even if a URL or saved state says open',()=>{assert.equal(widget({clubs:[],open:true}),null);});
test('social entry shows a collapsed Club Arena button without invoice or club conversations',()=>{const html=renderToStaticMarkup(widget());assert.match(html,/aria-expanded="false"/);assert.doesNotMatch(html,/role="tab"|First Club|Weekly Club Statements/);});
test('Club Arena requires a click before its tabs become available',()=>{let selected=null;let tree=widget({onEnter:c=>selected=c});elements(tree).find(e=>e.type==='button').props.onClick();assert.equal(selected.id,'a');tree=widget({open:true,clubId:selected.id});const html=renderToStaticMarkup(tree);assert.match(html,/Club Arena Inbox/);assert.match(html,/>Invoices</);});
test('invoice tab is a separate explicit selection',()=>{let folder='messages';const tree=widget({open:true,clubId:'a',onFolder:v=>folder=v});elements(tree).find(e=>e.props.role==='tab'&&e.props.children==='Invoices').props.onClick();assert.equal(folder,'invoices');const html=renderToStaticMarkup(widget({open:true,clubId:'a',folder}));assert.match(html,/Weekly Club Statements And Invoice Discussions/);});
test('ordinary members see their own invoice instructions without a club representative claim',()=>{const html=renderToStaticMarkup(widget({open:true,clubId:'b',folder:'invoices'}));assert.match(html,/Your Invoices And Invoice Discussions/);assert.doesNotMatch(html,/Messaging As|Weekly Club Statements/);});
test('back to social messages explicitly exits the club workspace',()=>{let exited=false;const tree=widget({open:true,clubId:'a',onExit:()=>exited=true});elements(tree).find(e=>e.props.children==='Back To Social Messages').props.onClick();assert.equal(exited,true);});
test('invoice renders full cents and status instead of a social text bubble',()=>{const html=renderToStaticMarkup(React.createElement(Invoice,{meta:{invoice_number:'CA-1',amount:'100.29',status:'paid'},content:'Original Issued Invoice',theme}));assert.match(html,/Accounting Invoice/);assert.match(html,/100\.29/);assert.match(html,/View Invoice Details/);assert.match(html,/paid/);});
test('missing financial facts are not converted into zero',()=>{const html=renderToStaticMarkup(React.createElement(Invoice,{meta:{invoice_type:'club_weekly_accounting',lines:{rake_received:'100.00',paid_players:null}},content:'',theme}));assert.match(html,/Not Available/);assert.match(html,/Rake Received From Union/);assert.match(html,/Rakeback Sent To Players/);});

test('weekly preview states reconciliation and separates unknown roles and downstream movement',()=>{
 const html=renderToStaticMarkup(React.createElement(Invoice,{meta:{invoice_type:'club_weekly_accounting',preview:true,status:'needs_reconciliation',lines:{paid_unclassified:'6070.49',downstream_redistributed:'500.29'}},content:'Recorded Union Close',theme}));
 assert.match(html,/Needs Reconciliation/);assert.match(html,/6,070.49/);assert.match(html,/500.29/);assert.match(html,/Further Sent By Agents/);assert.match(html,/View Statement Details/);assert.doesNotMatch(html,/undefined|Individual Agent/);
});

test('message API uses the authenticated database page and preserves provenance and cursor precision',async()=>{
 const {verifyAccountingMessage}=await import('../src/lib/accountingMessage.mjs');
 const calls=[];const db={async rpc(){return {data:[]};}};
 const privateReader=async(receivedDb,userId,request)=>{assert.equal(receivedDb,db);calls.push({userId,...request});return [{id:'message',sender_id:'issuer',content:'Issued Document',message_type:'invoice',media_metadata:{accounting_verified:true,invoice_id:'real',status:'paid',issued_status:'pending'},profiles:{id:'issuer'}}];};
 const source=fs.readFileSync(new URL('../pages/api/messenger/get-messages.js',import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 const mocks={serverAuth:{getServerUserWithFallback:async()=>({user:{id:'verified-user'}})},supabaseServerClient:{createClient:()=>db},apiRateLimit:{applyRateLimit:()=>true,LIMITS:{}},apiErrorHandler:{reportApiError:()=>{}},'accountingMessage.mjs':{verifyAccountingMessage},'messengerWorkspace.mjs':{readMessengerMessages:privateReader}};
 new Function('require','module','exports','process',code)(p=>mocks[p.split('/').at(-1)],module,module.exports,{env:{SUPABASE_SERVICE_ROLE_KEY:'fixture'}});
 let status=200,payload=null;const res={status(n){status=n;return this;},json(v){payload=v;return this;}};
 const cursor='2026-09-14T12:00:00.123456Z',beforeId='00000000-0000-4000-8000-000000000001';
 await module.exports.default({method:'POST',headers:{authorization:'Bearer fixture'},body:{userId:'forged',conversationId:'conversation',before:cursor,beforeId,limit:500}},res);
 assert.equal(status,200);assert.equal(calls[0].userId,'verified-user');assert.equal(calls[0].before,cursor);assert.equal(calls[0].limit,200);assert.equal(payload.messages[0].media_metadata.issued_status,'pending');assert.equal(payload.messages[0].media_metadata.status,'paid');
 await module.exports.default({method:'POST',headers:{authorization:'Bearer fixture'},body:{conversationId:'conversation',beforeId}},res);assert.equal(status,400);
});


test('accounting conversation introduction identifies documents without a synthetic member profile',()=>{
 const html=renderToStaticMarkup(React.createElement(AccountingIntroduction,{title:'Midway Union Statements',theme}));
 assert.match(html,/Accounting Conversation/);assert.match(html,/Midway Union Statements/);assert.match(html,/Invoices, Statements And Related Discussions/);
 assert.doesNotMatch(html,/href=|View Profile|Smarter.Poker Member|undefined/);
});


function overlayFixture(page='notifications') {
 const handlers=new Map(),cleanups=[];let closed=0;
 const state={overlayPage:page,overlayUrl:'/hub/notifications',overlayTitle:'Notifications',closeOverlay:()=>closed++,setNotifClearedCount:noop};
 const mockReact={...React,useEffect:effect=>{const cleanup=effect();if(cleanup)cleanups.push(cleanup);},useCallback:fn=>fn};
 const events={on:(event,fn)=>handlers.set(event,fn),off:(event,fn)=>{if(handlers.get(event)===fn)handlers.delete(event);}};
 const Overlay=component('../src/components/ui/GlobalPageOverlay.jsx',name=>{
  if(name==='react')return mockReact;if(name==='next/router')return {useRouter:()=>({events})};
  if(name==='next/dynamic')return ()=>()=>null;if(name==='./FullScreenPageOverlay')return props=>props.children;
  if(name.endsWith('pageOverlayStore'))return {usePageOverlayStore:selector=>selector(state)};throw Error(name);
 });
 const rendered=Overlay();
 return {handlers,cleanups,rendered,closed:()=>closed};
}

test('notification popup reveals the invoice after successful same-page navigation',()=>{
 const fixture=overlayFixture();assert.equal(fixture.rendered.props.isOpen,true);assert.equal(fixture.closed(),0);
 fixture.handlers.get('routeChangeComplete')('/hub/messenger?conversation=invoice');assert.equal(fixture.closed(),1);
 fixture.cleanups.forEach(cleanup=>cleanup());assert.equal(fixture.handlers.size,0);
});
test('failed navigation retains the notification popup and unrelated overlays do not subscribe',()=>{
 const fixture=overlayFixture();fixture.handlers.get('routeChangeError')?.(new Error('failed'));assert.equal(fixture.closed(),0);
 const settings=overlayFixture('settings');assert.equal(settings.handlers.size,0);assert.equal(settings.closed(),0);
});


test('notification cache accepts only the current account and rejects legacy or expired snapshots',async()=>{
 const {notificationCache,readNotificationCache}=await import('../src/lib/notificationVisibility.mjs');
 const now=1_000_000,rows=[{id:'document',type:'accounting_invoice'}];
 const cache=notificationCache(rows,'account-a',now);
 assert.equal(readNotificationCache(cache,'account-a',now+1)[0].id,'document');
 assert.equal(readNotificationCache(cache,'account-b',now+1),null);assert.equal(readNotificationCache(cache,null,now+1),null);
 assert.equal(readNotificationCache(JSON.stringify([{...rows[0],_cache_ts:now}]),'account-a',now+1),null);
 assert.equal(readNotificationCache(cache,'account-a',now+300_000),null);assert.equal(readNotificationCache(cache,'account-a',now-1),null);
 assert.equal(readNotificationCache('not json','account-a',now),null);
});
test('archived club invoice copies stay out of notification caches and realtime eligibility',async()=>{
 const {isVisibleNotification,notificationCache,readNotificationCache}=await import('../src/lib/notificationVisibility.mjs');
 const rows=[{id:'archived',type:'accounting_invoice_detail'},{id:'recipient',type:'accounting_invoice'},{id:'social',type:null}];
 assert.equal(isVisibleNotification(rows[0]),false);assert.equal(isVisibleNotification(null),false);
 const cache=notificationCache(rows,'account',1000);assert.deepEqual(readNotificationCache(cache,'account',1001).map(row=>row.id),['recipient','social']);
 const changed=JSON.parse(cache);changed[1].type='accounting_invoice_detail';assert.deepEqual(readNotificationCache(JSON.stringify(changed),'account',1001).map(row=>row.id),['recipient']);
});


for (const [route, limit] of [['global-search',30],['search-messages',50]]) {
 test(route+' authenticates the caller and uses the scoped search without a raw-message fallback',async()=>{
  const calls=[];let refusal=null;
  const source=fs.readFileSync(new URL('../pages/api/messenger/'+route+'.js',import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}},db={from(){throw Error('Raw message access is forbidden');}};
  const mocks={serverAuth:{getServerUserWithFallback:async()=>({user:{id:'verified-user'}})},supabaseServerClient:{createClient:()=>db},apiRateLimit:{applyRateLimit:()=>true,LIMITS:{}},apiErrorHandler:{reportApiError:noop},'messengerWorkspace.mjs':{searchMessengerWorkspace:async(client,userId,request,cap)=>{assert.equal(client,db);calls.push({userId,request,cap});if(refusal)throw refusal;return [];}}};
  new Function('require','module','exports','process',code)(name=>mocks[name.split('/').at(-1)],module,module.exports,{env:{SUPABASE_SERVICE_ROLE_KEY:'fixture'}});
  let status=200,payload=null;const res={status(value){status=value;return this;},json(value){payload=value;return this;}};
  const req={method:'POST',headers:{authorization:'Bearer fixture'},body:{userId:'forged-user',conversationId:'invoice',query:'query'}};
  await module.exports.default(req,res);assert.equal(status,200);assert.deepEqual(payload.results,[]);assert.equal(calls[0].userId,'verified-user');assert.equal(calls[0].cap,limit);
  if(route==='global-search'){assert.equal(calls[0].request.workspace,undefined);assert.equal(calls[0].request.conversationId,undefined);}else assert.equal(calls[0].request.conversationId,'invoice');
  refusal=Object.assign(new Error('Search Permission Denied'),{status:403});await module.exports.default(req,res);assert.equal(status,403);assert.equal(payload.success,false);assert.equal(payload.results,undefined);
 });
}


test('accounting introduction uses its workspace text color against the page theme',()=>{
 for(const color of ['#050505','#E4E6EB']){
  const html=renderToStaticMarkup(React.createElement(AccountingIntroduction,{title:'Union Statements',theme:{...theme,text:color}}));
  assert.match(html,new RegExp('color:'+color));assert.match(html,/Union Statements/);
 }
});
