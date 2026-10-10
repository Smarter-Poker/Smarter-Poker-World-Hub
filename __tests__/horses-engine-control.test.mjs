import test from 'node:test';
import assert from 'node:assert/strict';
import { engineOperatorControl } from '../src/lib/horses/engineOperatorControl.js';
const id='11111111-1111-4111-8111-111111111111';
const context=(overrides={})=>({req:{headers:{authorization:'Bearer fixture-token'}},op:{permissions:['console.read','clubs.write','settings.write'],requestId:'fixture'},method:'POST',body:{domain:'floor',action:'pause',reason:'Investigating table integrity',operationId:id},query:{},...overrides});
test('engine receives only the verified caller token and exact operation identity',async()=>{
 let seen;
 const result=await engineOperatorControl(context({fetchImpl:async(url,options)=>{seen={url,options};return {ok:true,status:200,json:async()=>({success:true,command:{id,domain:'floor',status:'accepted'}})};}}));
 assert.equal(result.command.id,id);
 assert.equal(seen.options.headers.Authorization,'Bearer fixture-token');
 assert.deepEqual(JSON.parse(seen.options.body),context().body);
 assert.equal(seen.options.redirect,'error');
});
test('read-only permission cannot dispatch floor or maintenance mutation',async()=>{
 for(const domain of ['floor','maintenance']) await assert.rejects(engineOperatorControl(context({body:{...context().body,domain,action:domain==='floor'?'park':'start'},op:{permissions:['console.read']},fetchImpl:()=>assert.fail('must not call engine')})),error=>error.status===403);
});
test('an unknown transport or mismatched receipt retains an unknown verdict',async()=>{
 await assert.rejects(engineOperatorControl(context({fetchImpl:async()=>{throw Error('lost');}})),error=>error.code==='unknown_outcome');
 await assert.rejects(engineOperatorControl(context({fetchImpl:async()=>({ok:true,status:200,json:async()=>({success:true,command:{id:'other',domain:'floor'}})})})),error=>error.code==='unknown_outcome');
});
test('GET reattaches to the same durable receipt without write payload',async()=>{
 await engineOperatorControl(context({method:'GET',query:{domain:'maintenance',operationId:id},fetchImpl:async(url,options)=>{
  assert.equal(options.body,undefined);assert.ok(url.endsWith(`operationId=${id}`));
  return {ok:true,status:200,json:async()=>({success:true,command:{id,domain:'maintenance',status:'active'}})};
 }}));
});
