import test from 'node:test';
import assert from 'node:assert/strict';
import { playerSessionVerdict, sessionIdOf } from '../src/lib/horses/playerSessionAccess.mjs';
import { getServerUserWithFallback } from '../src/lib/serverAuth.js';
const uid='11111111-1111-4111-8111-111111111111';
const sid='22222222-2222-4222-8222-222222222222';
const token=`header.${Buffer.from(JSON.stringify({sub:uid,session_id:sid})).toString('base64url')}.signature`;
test('session claims are only transport for an already verified identity',async()=>{
  assert.equal(sessionIdOf(token),sid);
  assert.equal(sessionIdOf('malformed'),null);
  let args;
  const verdict=await playerSessionVerdict({rpc:async(name,values)=>{args={name,values};return {data:true,error:null};}},uid,token);
  assert.equal(verdict,'alive');
  assert.deepEqual(args,{name:'fn_ca_player_session_live',values:{p_user_id:uid,p_session_id:sid}});
});
test('unknown, revoked and new valid sessions remain distinct',async()=>{
  assert.equal(await playerSessionVerdict({rpc:async()=>({data:false,error:null})},uid,token),'revoked');
  assert.equal(await playerSessionVerdict({rpc:async()=>({data:null,error:{code:'503'}})},uid,token),'unknown');
  assert.equal(await playerSessionVerdict({rpc:async()=>{throw Error('offline');}},uid,token),'unknown');
});
test('verified claims cannot bypass fresh server session refusal',async()=>{
  const req={headers:{authorization:`Bearer ${token}`}};
  const db={auth:{getClaims:async()=>({data:{claims:{sub:uid}},error:null})}};
  const revoked=await getServerUserWithFallback(req,db,{verifySession:async()=> 'revoked'});
  assert.equal(revoked.user,null);assert.equal(revoked.error,'SESSION_REVOKED');assert.equal(revoked.status,401);
  const unknown=await getServerUserWithFallback(req,db,{verifySession:async()=> 'unknown'});
  assert.equal(unknown.user,null);assert.equal(unknown.error,'SESSION_CHECK_UNAVAILABLE');assert.equal(unknown.status,503);
  const fresh=await getServerUserWithFallback(req,db,{verifySession:async()=> 'alive'});
  assert.equal(fresh.user.id,uid);
});
