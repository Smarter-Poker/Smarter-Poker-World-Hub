import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setTimeout as pause } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { isPushHealthSnapshot } from '../src/lib/pushHealthSnapshot.mjs';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
function snapshot() {
 return {schemaVersion:1, observedAt:'2026-09-14T13:45:00Z',windowDays:7,
  subscriptions:{total:4,active:3,zombies:2},outbox:{pending:0,processing:2,failed:0,skipped:6007,sentLast24h:2},
  funnel:{windowHours:24,queued:6007,sent:1,suppressed:6006,devicesPushed:3,devicesConfirmed:1,confirmRate:33,deliveryRate:0},
  dispatch:{lastRunAt:null,minutesSince:null,recent:[]},
  byType:[{event:'accounting_invoice',total:6007,sent:1}],skipReasons:[{reason:'no_subscription',count:6006,kind:'not_enrolled'}],
  staff:[{id:'admin',username:'Admin',status:'zombie',devices:3,totalDevices:4,lastReceiptAt:null}],
 };
}
function compile(path, load, extraReact, env={}) {
 const code=ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{fileName:'component.jsx',compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};new Function('require','module','exports','React','fetch','window',code)(load,module,module.exports,extraReact,env.fetch,env.window);return module.exports.default;
}
function routeFixture() {
 let user={id:'verified-admin'},rpcError=null,rpcData=snapshot(),throwRpc=false;const calls=[];
 const db={from(){throw Error('Sampled row queries are forbidden');},async rpc(name,args){calls.push({name,args});if(throwRpc)throw Error('database unavailable');return {data:rpcData,error:rpcError};}};
 const handler=compile('../pages/api/admin/push-health-data.js',name=>{
  if(name.endsWith('supabaseServerClient'))return {createClient:()=>db};
  if(name.endsWith('serverAuth'))return {getServerUserWithFallback:async()=>({user})};
  if(name.endsWith('push/web-push'))return {isPushConfigured:()=>true,vapidConfig:()=>({publicKey:process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''})};
  if(name.endsWith('pushHealthSnapshot.mjs'))return {isPushHealthSnapshot};
  if(name.endsWith('apiRateLimit'))return {applyRateLimit:()=>true};throw Error(name);
 });
 return {calls,set(values){if('user'in values)user=values.user;if('error'in values)rpcError=values.error;if('data'in values)rpcData=values.data;if('throwRpc'in values)throwRpc=values.throwRpc;},async run(method='GET'){
  const result={headers:{}};const res={setHeader(k,v){result.headers[k]=v;},status(status){result.status=status;return this;},json(body){result.body=body;return this;}};
  await handler({method,query:{userId:'forged'},body:{userId:'forged'}},res);return result;
 }};
}

test('exact aggregate with more than transport row limits retains count and unknown dispatcher',()=>{const d=snapshot();assert.equal(isPushHealthSnapshot(d),true);assert.equal(d.byType[0].total,6007);assert.equal(d.dispatch.minutesSince,null);});
test('missing or inconsistent counts cannot become a green health snapshot',()=>{
 for(const mutate of [d=>delete d.outbox,d=>delete d.outbox.pending,d=>d.outbox.pending=null,d=>d.outbox.pending=Number.MAX_SAFE_INTEGER+1,d=>d.subscriptions.active=6,d=>d.funnel.devicesConfirmed=4,d=>d.funnel.confirmRate=100,d=>d.funnel.sent=7000,d=>d.dispatch.minutesSince=0,d=>delete d.skipReasons]){const d=snapshot();mutate(d);assert.equal(isPushHealthSnapshot(d),false);}
});
test('subscription existence without receipt cannot declare a staff account reachable',()=>{const d=snapshot();d.staff[0].status='ok';assert.equal(isPushHealthSnapshot(d),false);d.staff[0].lastReceiptAt=d.observedAt;assert.equal(isPushHealthSnapshot(d),true);});
test('health API uses verified actor and exact RPC without sampled table fallback',async()=>{
 const f=routeFixture(),r=await f.run();assert.equal(r.status,200);assert.deepEqual(f.calls,[{name:'fn_push_health_snapshot',args:{p_user_id:'verified-admin'}}]);assert.equal(r.body.byType[0].total,6007);assert.equal(r.body.config.configured,true);assert.match(r.headers['Cache-Control'],/no-store/);
});
test('database failure and missing aggregate fail unavailable without publishing partial zero totals',async()=>{
 const f=routeFixture();for(const values of [{error:{code:'57014'},data:null},{error:null,data:{}},{data:snapshot(),throwRpc:true}]){f.set(values);const r=await f.run();assert.equal(r.status,503);assert.match(r.body.error,/Unavailable/);assert.equal(r.body.outbox,undefined);}
});
test('anonymous and nonadministrator callers are rejected',async()=>{
 const f=routeFixture();f.set({user:null});assert.equal((await f.run()).status,401);assert.equal(f.calls.length,0);
 f.set({user:{id:'ordinary-user'},error:{code:'42501'}});assert.equal((await f.run()).status,403);
 assert.equal((await f.run('POST')).status,405);
});
function pageHtml(data,error=null) {
 let index=0;const react={...React,useState:()=>[index++===0?data:error,()=>{}],useEffect:()=>{}};
 const Page=compile('../pages/admin/push-health.js',name=>{
  if(name==='react')return react;if(name==='next/head')return ({children})=>React.createElement(React.Fragment,null,children);
  if(name.endsWith('usePushHealth'))return ()=>({data,error});throw Error(name);
 },React);return renderToStaticMarkup(Page());
}
test('rendered dashboard does not present old healthy totals after an error',()=>{const html=pageHtml({...snapshot(),config:{configured:true,keyMatches:true}},'Push Health Is Unavailable.');assert.match(html,/Push Health Is Unavailable/);assert.doesNotMatch(html,/VAPID configured|Queue backlog|6007/);});
test('rendered dashboard shows exact accounting volume, observed time and unfinished backlog',()=>{const html=pageHtml({...snapshot(),config:{configured:true,keyMatches:true}});assert.match(html,/accounting_invoice/);assert.match(html,/6007/);assert.match(html,/Counts Include Every Matching Record/);assert.match(html,/Queue backlog[\s\S]*?>2<\/p>/);assert.match(html,/33% \(1\/3\)/);assert.match(html,/never/);});

function readerFixture() {
 let actor={id:'admin-a'},state,effect,cleanup,authCallback,unsubscribed=false,writes=0;const requests=[],events=new Map();
 const react={useState:()=>[state||{userId:null,data:null,error:null},next=>{state=next;writes++;}],useEffect:cb=>{effect ||= cb;}};
 const useReader=compile('../src/hooks/usePushHealth.js',name=>{
  if(name==='react')return react;if(name.endsWith('authUtils'))return {getAuthUser:()=>actor,getAccessToken:()=>actor?.id+'-token'};
  if(name.endsWith('/supabase'))return {supabase:{auth:{onAuthStateChange:cb=>{authCallback=cb;return {data:{subscription:{unsubscribe(){unsubscribed=true;}}}};}}}};
  if(name.endsWith('pushHealthSnapshot.mjs'))return {isPushHealthSnapshot};throw Error(name);
 },React,{fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve})),window:{addEventListener:(event,fn)=>events.set(event,fn),removeEventListener:event=>events.delete(event)}});
 return {requests,render:()=>useReader(),mount(){useReader();cleanup=effect();},unmount(){cleanup();},switch(id,event='SIGNED_IN'){actor=id?{id}:null;authCallback(event,id?{user:actor,access_token:id+'-token'}:null);},storageSwitch(id){actor=id?{id}:null;events.get('storage')({key:'smarter-poker-auth'});},setActor(id){actor=id?{id}:null;},hydrating(){authCallback('INITIAL_SESSION',null);},cleaned:()=>unsubscribed&&events.size===0,writes:()=>writes};
}
const goodResponse=()=>({ok:true,status:200,json:async()=>({...snapshot(),config:{configured:true,keyMatches:true}})});
test('push health hides the prior account before a listener callback and ignores delayed old requests',async()=>{
 const f=readerFixture();f.mount();f.setActor('admin-b');assert.equal(f.render().data,null);f.switch('admin-b');
 assert.equal(f.requests[1].options.headers.Authorization,'Bearer admin-b-token');f.requests[1].resolve(goodResponse());await pause(1);assert.ok(f.render().data);
 f.requests[0].resolve({ok:true,status:200,json:async()=>({...snapshot(),config:{configured:true,keyMatches:true},observedAt:'2026-01-01T00:00:00Z'})});await pause(1);
 assert.equal(f.render().data.observedAt,'2026-09-14T13:45:00Z');f.unmount();
});
test('cross-tab account switch clears a completed admin snapshot before a nonadmin refusal',async()=>{
 const f=readerFixture();f.mount();f.requests[0].resolve(goodResponse());await pause(1);assert.ok(f.render().data);
 f.storageSwitch('ordinary-user');assert.equal(f.render().data,null);f.requests[1].resolve({ok:false,status:403,json:async()=>({error:'Admin Required'})});await pause(1);
 assert.equal(f.render().data,null);assert.equal(f.render().error,'Admin Required');f.unmount();
});
test('sign-out clears metrics immediately and ignores an in-flight receipt',async()=>{
 const f=readerFixture();f.mount();f.switch(null,'SIGNED_OUT');assert.deepEqual(f.render(),{data:null,error:'Not Authenticated'});
 f.requests[0].resolve(goodResponse());await pause(1);assert.deepEqual(f.render(),{data:null,error:'Not Authenticated'});f.unmount();
});
test('unmount unsubscribes auth and storage and prevents a delayed state update',async()=>{
 const f=readerFixture();f.mount();f.unmount();const writes=f.writes();assert.equal(f.cleaned(),true);f.requests[0].resolve(goodResponse());await pause(1);assert.equal(f.writes(),writes);
});

test('SDK hydration without a session does not cancel the existing authenticated health read',async()=>{
 const f=readerFixture();f.mount();f.hydrating();assert.equal(f.requests.length,1);f.requests[0].resolve(goodResponse());await pause(1);assert.ok(f.render().data);f.unmount();
});
