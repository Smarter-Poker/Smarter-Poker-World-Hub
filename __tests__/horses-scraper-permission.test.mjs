import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require=createRequire(import.meta.url),{transformSync}=require('@babel/core');
const file='pages/api/admin/scraper-health.js';
const source=process.env.STABLE_ADMIN_ACCOUNT_BASELINE?execFileSync('git',['show',`HEAD:${file}`],{encoding:'utf8'}):fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
async function invoke(profileRole, allowed) {
 const calls=[];const db={auth:{getUser:async()=>({data:{user:{id:'operator'}}})},from:table=>{const q=new Proxy({}, {get(_t,key){if(key==='then')return done=>done({data:table==='profiles'?{role:profileRole}:[],count:0,error:null});return()=>q;}});return q;}};
 const mocks={'../../../src/lib/supabaseServerClient':{createClient:()=>db},'../../../src/lib/apiRateLimit':{applyRateLimit:()=>true,LIMITS:{}},'../../../src/lib/poker-near-me/dailyTournamentData.mjs':{classifyScraperHealth:()=>({})},'../../../src/lib/horses/operatorGate.js':{operatorHoldsPermission:async(client,who,permission)=>{calls.push({client,who,permission});return {ok:allowed};}},'../../../src/lib/horses/permissions.js':{PERMISSIONS:{CONSOLE_READ:'console.read'}}};
 const code=transformSync(source,{filename:file,babelrc:false,configFile:false,presets:[require.resolve('next/babel')]}).code,m={exports:{}};vm.runInThisContext(`(function(require,module,exports){${code}\n})`)(n=>mocks[n]??require(n),m,m.exports);
 const res={statusCode:200,setHeader(){},status(s){this.statusCode=s;return this;},json(body){this.body=body;return this;}};
 await m.exports.default({method:'GET',headers:{authorization:'Bearer fixture'},query:{}},res);return {res,calls,db};
}
test('named operator with ordinary profile may read scraper health through console.read',async()=>{const {res,calls,db}=await invoke('user',true);assert.equal(res.statusCode,200);assert.equal(calls.length,1);assert.equal(calls[0].client,db);assert.deepEqual(calls[0].who,{userId:'operator',profileRole:'user'});assert.equal(calls[0].permission,'console.read');});
test('narrowed legacy profile cannot bypass a refused console.read permission',async()=>{const {res,calls}=await invoke('admin',false);assert.equal(res.statusCode,403);assert.equal(calls.length,1);});
