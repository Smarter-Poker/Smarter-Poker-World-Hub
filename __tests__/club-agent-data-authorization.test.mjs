import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { isClubStaffMembership, loadAgentDataScope } from '../src/lib/club-arena/clubDataAuthorization.mjs';
const id='00000000-0000-4000-8000-000000000001';
test('all agent ranks are denied club staff data authority',()=>{
 for(const role of ['super_agent','agent','sub_agent','player','manager']) assert.equal(isClubStaffMembership({role,status:'active'}),false);
 for(const role of ['owner','co_owner','admin']) {
  assert.equal(isClubStaffMembership({role,status:'active'}),true);
  assert.equal(isClubStaffMembership({role,status:'approved'}),true);
  for(const status of ['banned','suspended','pending',null]) assert.equal(isClubStaffMembership({role,status}),false);
  assert.equal(isClubStaffMembership({role,status:'active',is_active:false}),false);
 }
});
test('scope comes from verified actor and malformed/error results never become all players',async()=>{
 const rpc=async(name,args)=>{assert.equal(name,'fn_ca_club_data_downline');assert.deepEqual(args,{p_club_id:id,p_user:id});return {data:[id,id],error:null};};
 assert.deepEqual(await loadAgentDataScope({rpc},id,id),[id]);
 for(const data of [null,[],['bad'],[1]]) await assert.rejects(loadAgentDataScope({rpc:async()=>({data,error:null})},id,id));
 await assert.rejects(loadAgentDataScope({rpc:async()=>({data:[id],error:new Error('unavailable')})},id,id));
});
test('no club-wide privileged handler still treats super agent as club staff',()=>{
 for(const file of readdirSync(new URL('../pages/api/club-arena/',import.meta.url)).filter(f=>f.endsWith('.js'))){
  const source=readFileSync(new URL('../pages/api/club-arena/'+file,import.meta.url),'utf8');
  assert.ok(!source.includes("['owner', 'admin', 'super_agent'].includes"),file);
  if(source.includes('!isClubStaffMembership(')) assert.ok(source.includes(".select('role, status, is_active')"),file);
 }
});
test('agent chip flow never includes an unrelated transaction counterparty',()=>{
 const source=readFileSync(new URL('../pages/api/club-arena/player-chip-flow.js',import.meta.url),'utf8');
 assert.ok(source.includes('loadAgentDataScope(getSupabase(), clubId, user.id)'));
 assert.ok(source.includes('playerIds.includes(tx.to_user_id)'));
 assert.ok(source.includes('playerIds.includes(tx.from_user_id)'));
 assert.ok(!source.includes("eq('agent_id', agentRow.id)"));
});

test('actual session and analytics handlers deny every agent before private service-role reads',async()=>{
 const vm=await import('node:vm');
 for(const file of ['player-sessions.js','club-analytics.js']) {
  for(const membership of [
   {role:'super_agent',status:'active'}, {role:'agent',status:'active'}, {role:'sub_agent',status:'active'},
   {role:'owner',status:'suspended'},
  ]) {
   const reads=[];
   const db={from(name){reads.push(name);assert.equal(name,'club_members');const chain={select(){return chain},eq(){return chain},async maybeSingle(){return {data:membership,error:null}}};return chain;}};
   const context={isClubStaffMembership,createClient:()=>db,getServerUserWithFallback:async()=>({user:{id},error:null}),
    reportApiError(){},console,process:{env:{SUPABASE_SERVICE_ROLE_KEY:'fixture-only'}},
    require:()=>({applyRateLimit:()=>true,checkIdempotency:()=>false})};
   vm.createContext(context);
   const source=readFileSync(new URL('../pages/api/club-arena/'+file,import.meta.url),'utf8')
    .replace(/^import .* from .*;\s*$/gm,'').replace('export default async function handler','globalThis.handler = async function handler');
   new vm.Script(source,{filename:file}).runInContext(context);
   const result={statusCode:200,status(code){this.statusCode=code;return this},json(value){this.body=value;return this}};
   await context.handler({method:'GET',headers:{authorization:'Bearer fixture'},query:{clubId:id},body:{clubId:id,action:'overview'}},result);
   assert.equal(result.statusCode,403,file+JSON.stringify(membership));assert.deepEqual(reads,['club_members']);
  }
 }
});
