import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const React = require('react');
const { create, act } = require('react-test-renderer');
const { transformSync } = require('@babel/core');
const read = p => process.env.STABLE_GEEVES_BASELINE ? execFileSync('git', ['show', `HEAD:${p}`], {encoding:'utf8'}) : fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
function load(p, deps) {
 const code = transformSync(read(p), {filename:p,babelrc:false,configFile:false,presets:[require.resolve('next/babel')]}).code;
 const mod = {exports:{}};
 vm.runInThisContext(`(function(require,module,exports){${code}\n})`)(n => Object.hasOwn(deps,n) ? deps[n] : n.endsWith('.css') ? {} : require(n),mod,mod.exports);
 return mod.exports.default;
}
function api({allowed=true}={}) {
 let writes=0, audit=0, checked=[];
 const db={ from: name => {
   const q={ select:()=>q, eq:()=>q, update: payload=>{writes++;assert.deepEqual(payload,{resolved:true,added_to_kb:true});return q;}, maybeSingle:async()=>({data:name==='profiles'?{role:'admin'}:{id:7,resolved:true,added_to_kb:true,question:'Question'}})};
   return q;
 }};
 const handler=load('pages/api/geeves/analytics.js',{
 '../../../src/lib/serverAuth':{getServerUserWithFallback:async()=>({user:{id:'actor'}})},
 '../../../src/lib/supabaseServerClient':{createClient:()=>db},
 '../../../src/lib/apiErrorHandler':{reportApiError(){}},
 '../../../src/lib/antiAbuse':{logAdminAction:async()=>{audit++;}},
 '../../../src/lib/apiRateLimit':{applyRateLimit:()=>true,LIMITS:{read:{},write:{}}},
 '../../../src/lib/horses/operatorAuth.js':{requireOperator:async(req,res,{permission})=>{checked.push(permission);if(!allowed){res.status(403).json({success:false,error:'Permission Required'});return null;}return {db,user:{id:'actor'}};}},
 '../../../src/lib/horses/permissions.js':{PERMISSIONS:{CONSOLE_READ:'console.read',MODERATION_WRITE:'moderation.write'}},
 });
 async function call(body) {let status,answer;await handler({method:'POST',headers:{authorization:'Bearer test-token-for-isolated-auth'},body,query:{}},{status(n){status=n;return this;},json(v){answer=v;return this;}});return {status,answer};}
 return {call,get writes(){return writes;},get audit(){return audit;},checked};
}
test('actual Geeves resolve handler accepts canonical payload and checks moderation permission',async()=>{
 const a=api();const r=await a.call({action:'mark_resolved',id:7,added_to_kb:true});assert.equal(r.status,200);assert.equal(a.writes,1);assert.equal(a.audit,1);assert.deepEqual(a.checked,['moderation.write']);
});
test('unauthorized Geeves resolve performs no update or audit',async()=>{
 const a=api({allowed:false});const r=await a.call({action:'mark_resolved',id:7,added_to_kb:true});assert.equal(r.status,403);assert.equal(a.writes,0);assert.equal(a.audit,0);
});
const Panel=load('src/components/horses/GeevesPanel.jsx',{
 react:React,
 '../../engine/EventBus':{eventBus:{on:()=>()=>{}},EventType:{}},
 '../../lib/horsesAdminTokens':{T:{},num:v=>v??'-',when:v=>v},
 './operatorPermissions':{hasPermission:(p,key)=>p.includes(key)},
 './DataTable':{__esModule:true,default:({rows,columns})=>React.createElement('div',null,...rows.map(row=>React.createElement('div',{key:row.id},columns.find(c=>c.key==='actions').render(row))))},
});
test('mounted Added To KB control calls actual handler using canonical schema',async()=>{
 const a=api();let view;const fetch=async(url,options={})=>{if(options.method==='POST'){const r=await a.call(JSON.parse(options.body));if(r.status!==200)throw Error(r.answer.error);return r.answer;}return url.includes('top_missed')?{questions:[{id:7,question:'Question'}]}:{summary:{}};};
 await act(async()=>{view=create(React.createElement(Panel,{authFetch:fetch,permissions:['moderation.write']}));});
 try{const b=view.root.findAllByType('button').find(b=>b.children.join('')==='Added To KB');assert.ok(b);await act(async()=>b.props.onClick());assert.equal(a.writes,1);assert.equal(view.root.findAllByType('button').some(b=>b.children.join('')==='Added To KB'),false);}finally{await act(async()=>view.unmount());}
});
test('missed-question read failure remains visible instead of a healthy empty list',async()=>{
 let view;await act(async()=>{view=create(React.createElement(Panel,{authFetch:async url=>{if(url.includes('top_missed'))throw Error('Missed Questions Unavailable');return {summary:{}};},permissions:[]}));});
 try{assert.ok(view.root.findAll(n=>n.props.role==='alert').some(n=>n.children.filter(v => typeof v === 'string').join('').includes('Missed Questions Unavailable')));}finally{await act(async()=>view.unmount());}
});
