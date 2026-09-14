import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const ts=require('typescript');
function component(path) {
 const code=ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{fileName:'component.jsx',compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 new Function('require','module','exports',code)(require,module,module.exports);
 return module.exports.default;
}
const Widget=component('../src/components/messenger/ClubArenaWorkspace.js');
const Invoice=component('../src/components/messenger/AccountingInvoiceCard.js');
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
 const calls=[];const db={from(table){assert.equal(table,'social_conversation_participants');return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:{id:'participant'}};}};},async rpc(name,args){calls.push({name,args});return name==='fn_messenger_message_page'?{data:[{id:'message',sender_id:'issuer',content:'Issued Document',message_type:'invoice',media_metadata:{accounting_verified:true,invoice_id:'real',status:'paid',issued_status:'pending'},profiles:{id:'issuer'}}]}:{data:[]};}};
 const source=fs.readFileSync(new URL('../pages/api/messenger/get-messages.js',import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 const mocks={serverAuth:{getServerUserWithFallback:async()=>({user:{id:'verified-user'}})},supabaseServerClient:{createClient:()=>db},apiRateLimit:{applyRateLimit:()=>true,LIMITS:{}},sentryWrap:{reportApiError:()=>{}},'accountingMessage.mjs':{verifyAccountingMessage}};
 new Function('require','module','exports','process',code)(p=>mocks[p.split('/').at(-1)],module,module.exports,{env:{SUPABASE_SERVICE_ROLE_KEY:'fixture'}});
 let status=200,payload=null;const res={status(n){status=n;return this;},json(v){payload=v;return this;}};
 const cursor='2026-09-14T12:00:00.123456Z',beforeId='00000000-0000-4000-8000-000000000001';
 await module.exports.default({method:'POST',headers:{authorization:'Bearer fixture'},body:{userId:'forged',conversationId:'conversation',before:cursor,beforeId,limit:500}},res);
 assert.equal(status,200);assert.equal(calls[0].args.p_user_id,'verified-user');assert.equal(calls[0].args.p_before,cursor);assert.equal(calls[0].args.p_limit,200);assert.equal(payload.messages[0].media_metadata.issued_status,'pending');assert.equal(payload.messages[0].media_metadata.status,'paid');
 await module.exports.default({method:'POST',headers:{authorization:'Bearer fixture'},body:{conversationId:'conversation',beforeId}},res);assert.equal(status,400);
});
