import test from 'node:test';
import assert from 'node:assert/strict';
import { executeClubWelcomeRequest } from '../src/lib/clubWelcomeMessages.mjs';
import { enrichMessengerClubRelationships } from '../src/lib/messengerClubRelationships.mjs';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('welcome settings derive identity from JWT RPC, ignoring a forged body actor',async()=>{
 let call;
 const reply=await executeClubWelcomeRequest({action:'save',clubId:id(1),requestId:id(2),userId:id(99),content:'My Custom Message',enabled:true,revision:0},async(name,args)=>{call={name,args};return{data:{success:true,revision:1,content:'My Custom Message',enabled:true}};});
 assert.equal(reply.revision,1);assert.equal(call.name,'fn_save_club_welcome_message');assert.deepEqual(Object.keys(call.args).sort(),['p_club_id','p_content','p_enabled','p_expected_revision','p_request_id']);assert.ok(!Object.values(call.args).includes(id(99)));
});
test('invalid or empty enabled messages never reach persistence',async()=>{
 let calls=0;const rpc=()=>{calls++;};
 const valid={action:'save',clubId:id(1),requestId:id(2),content:'Hello',enabled:true,revision:0};
 for(const patch of [{content:' '.repeat(20)},{content:'a'.repeat(2001)},{clubId:'no'},{requestId:null},{revision:-1},{revision:1.2},{enabled:'true'}])await assert.rejects(executeClubWelcomeRequest({...valid,...patch},rpc),e=>e.status===400);
 assert.equal(calls,0);
});
test('unreadable settings and uncertain writes never claim success',async()=>{
 await assert.rejects(executeClubWelcomeRequest({action:'read'},async()=>({data:null})),e=>e.status===503);
 const valid={action:'save',clubId:id(1),requestId:id(2),content:'Hello',enabled:true,revision:0};
 for(const data of [null,{}, {success:true}, {success:true,revision:0}, {success:true,revision:1}]) await assert.rejects(executeClubWelcomeRequest(valid,async()=>({data})),e=>e.status===503);
 for(const [code,status] of [['42501',403],['40001',409],['22023',400],['57014',503]])await assert.rejects(executeClubWelcomeRequest(valid,async()=>({error:{code,message:'Refused'}})),e=>e.status===status);
});
test('club labels enrich only already-authorized human peers and never trust message metadata',async()=>{
 const rows=[{id:id(5),otherUser:{id:id(2)},media_metadata:{role:'owner'}},{id:id(6),is_group:true,otherUser:{id:id(3)}},{id:id(7),otherUser:{id:id(4),is_club_identity:true}}];
 let call;
 const result=await enrichMessengerClubRelationships({rpc:async(name,args)=>{call={name,args};return{data:[{peer_user_id:id(2),club_id:id(10),club_name:'Shark Club',role:'agent',is_upline:true,label:'Your Agent In Shark Club'}]};}},id(1),rows);
 assert.deepEqual(call.args,{p_viewer:id(1),p_peers:[id(2)]});assert.equal(result[0].relationshipTags[0].label,'Your Agent In Shark Club');assert.deepEqual(result[1].relationshipTags,[]);assert.deepEqual(result[2].relationshipTags,[]);assert.equal(rows[0].relationshipTags,undefined);
});
test('relationship lookup failure or unrelated peer data is unavailable rather than a forged role',async()=>{
 const rows=[{id:id(5),otherUser:{id:id(2)}}];
 for(const reply of [{error:{code:'57014'}},{data:null},{data:[{peer_user_id:id(99),club_id:id(10),label:'Owner Of Another Club'}]}])await assert.rejects(enrichMessengerClubRelationships({rpc:async()=>reply},id(1),rows),e=>e.status===503);
});
