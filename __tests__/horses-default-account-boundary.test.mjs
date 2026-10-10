import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url), React = require('react');
const { act, create } = require('react-test-renderer');
const { transformSync } = require('@babel/core');
const actor = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
const load = file => process.env.STABLE_ADMIN_ACCOUNT_BASELINE ? execFileSync('git',['show',`HEAD:${file}`],{encoding:'utf8'}) : fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
function moduleOf(source, mocks) { const code = transformSync(source,{babelrc:false,configFile:false,filename:'test.js',presets:[require.resolve('next/babel')]}).code; const m={exports:{}}; vm.runInThisContext(`(function(require,module,exports){${code}\n})`)(n=>mocks[n]??require(n),m,m.exports); return m.exports; }
function jwt(id) { return `header.${Buffer.from(JSON.stringify({sub:id})).toString('base64url')}.signature`; }
async function fetchHarness({ready=true}={}) {
 let state={operatorId:actor,sessionGeneration:1,contextStatus:ready?'ready':'unknown'}, token=jwt(actor), pending;
 const calls=[];
 const store={getState:()=>state};
 const api=moduleOf(load('src/components/horses/useOperatorFetch.js'),{'react':React,'../../lib/authUtils':{getFreshAccessToken:async()=>token},'../../stores/stableAdminStore':{useStableAdminStore:store}});
 let fetcher, view; function Harness(){fetcher=api.default();return null;}
 await act(async()=>{view=create(React.createElement(Harness));});
 globalThis.fetch=async (url,opts)=>{calls.push({url,opts});return pending?await pending:{ok:true,status:200,json:async()=>({success:true})};};
 return { get fetcher(){return fetcher;},calls,change:(id=other)=>{state={...state,operatorId:id,sessionGeneration:state.sessionGeneration+1};token=jwt(id);},nullActor:()=>{state={...state,operatorId:null};},unknown:()=>{state={...state,contextStatus:'unknown',sessionGeneration:state.sessionGeneration+1};},hold:()=>{let done;pending=new Promise(r=>{done=r;});return ()=>done({ok:true,status:200,json:async()=>({success:true})});},close:()=>act(async()=>view.unmount()) };
}
test('default mounted fetch discards a response after operator account changes',async()=>{const h=await fetchHarness();try{const release=h.hold();const request=h.fetcher('/read');await new Promise(r=>setImmediate(r));h.change();release();await assert.rejects(request,/account|view|Operator/);}finally{await h.close();}});
test('same-account new generation invalidates an in-flight default write',async()=>{const h=await fetchHarness();try{const release=h.hold();const request=h.fetcher('/write',{method:'POST'});await new Promise(r=>setImmediate(r));h.change(actor);release();await assert.rejects(request,/account|view|Operator/);}finally{await h.close();}});
test('unknown context refuses ordinary dispatch but explicit initial policy identity can bootstrap',async()=>{const h=await fetchHarness({ready:false});try{await assert.rejects(()=>h.fetcher('/write',{method:'POST'}),/Operator/);assert.equal(h.calls.length,0);await h.fetcher('/api/horses/operator-admin?section=policy',{expectedOperatorId:actor,isCurrent:()=>true});assert.equal(h.calls.length,1);}finally{await h.close();}});
test('explicit bootstrap identity rejects a mismatched transport subject',async()=>{const h=await fetchHarness({ready:false});try{h.change();await assert.rejects(()=>h.fetcher('/policy',{expectedOperatorId:actor,isCurrent:()=>true}),/account/);assert.equal(h.calls.length,0);}finally{await h.close();}});
test('mounted Horses auth subscription clears old operator on direct different-user SIGNED_IN',async()=>{
 const source=load('pages/horses/index.js');
 const start=source.indexOf('    let subscriptionAlive = true;') >= 0 ? source.indexOf('    let subscriptionAlive = true;') : source.indexOf('    const { data } = supabase.auth.onAuthStateChange('), end=source.indexOf('\n\n  useEffect(() => {\n    if (!user?.id)',start);
 assert.ok(start>=0&&end>start);
 const effect=source.slice(start,end).replace(/\n  \}, \[[^\]]*\]\);\s*$/,'');
 let callback,state={operatorId:actor,sessionGeneration:1,contextStatus:'ready'},user=actor,resolvePolicy;
 const policy=new Promise(r=>resolvePolicy=r), epoch={current:0};
 const run=new Function('useEffect','supabase','contextReadEpoch','setUser','resetOperatorContext','useStableAdminStore','readOperatorContext','setLoginError','ACCESS_DENIED_MESSAGE','VERIFY_FAILED_MESSAGE', `useEffect(()=>{${effect}},[]);`);
 let view;function Harness(){run(React.useEffect,{auth:{onAuthStateChange:fn=>{callback=fn;return {data:{subscription:{unsubscribe(){}}}};}}},epoch,v=>{user=v?.id??v;},id=>{state={operatorId:id,contextStatus:'unknown',sessionGeneration:state.sessionGeneration+1};},{getState:()=>state},async()=>policy,()=>{},'denied','unknown');return null;}
 await act(async()=>{view=create(React.createElement(Harness));});
 try {await act(async()=>{callback('SIGNED_IN',{user:{id:other}});});assert.equal(user,null);assert.equal(state.operatorId,other);assert.equal(state.contextStatus,'unknown');resolvePolicy({ok:true});await act(async()=>{await policy;});assert.equal(user,other);}finally{await act(async()=>view.unmount());}
});

test('ready context without an operator identity refuses ordinary dispatch',async()=>{const h=await fetchHarness();try{h.nullActor();await assert.rejects(()=>h.fetcher('/write',{method:'POST'}),/Operator/);assert.equal(h.calls.length,0);}finally{await h.close();}});

test('queued account switch does not read or apply policy after subscription unmount',async()=>{
 const source=load('pages/horses/index.js');
 const start=source.indexOf('    let subscriptionAlive = true;'),end=source.indexOf('\n\n  useEffect(() => {\n    if (!user?.id)',start);
 const effect=source.slice(start,end).replace(/\n  \}, \[[^\]]*\]\);\s*$/,'');
 let callback,queued,reads=0,writes=0,view;
 const run=new Function('useEffect','supabase','contextReadEpoch','setUser','resetOperatorContext','useStableAdminStore','readOperatorContext','setLoginError','ACCESS_DENIED_MESSAGE','VERIFY_FAILED_MESSAGE','queueMicrotask',`useEffect(()=>{${effect}},[]);`);
 function Harness(){run(React.useEffect,{auth:{onAuthStateChange:fn=>{callback=fn;return {data:{subscription:{unsubscribe(){}}}};}}},{current:0},()=>writes++,()=>{},{getState:()=>({operatorId:actor})},async()=>{reads++;return{ok:true};},()=>{},'denied','unknown',fn=>queued=fn);return null;}
 await act(async()=>{view=create(React.createElement(Harness));});
 await act(async()=>callback('SIGNED_IN',{user:{id:other}}));
 const before=writes;await act(async()=>view.unmount());await queued();
 assert.equal(reads,0);assert.equal(writes,before);
});
