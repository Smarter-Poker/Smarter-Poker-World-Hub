import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConfiguration,validateSafetyReceipt,validateFixture,allowedMutation,runFixtureProbe,recoverFixtureProbe} from '../scripts/ci/reels-interaction-live-check.mjs';
const actor='00000000-0000-4000-8000-000000000001',reel='00000000-0000-4000-8000-000000000002',target='00000000-0000-4000-8000-000000000003';
const env={TEST_USER_EMAIL:'fixture@example.invalid',TEST_USER_PASSWORD:'test-only',NEXT_PUBLIC_SUPABASE_URL:'https://kuklfnapbkmacvwxktbh.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'non-network-test-key',REELS_EXPECTED_SHA:'a'.repeat(40),REELS_TEST_USER_ID:actor,REELS_TEST_REEL_ID:reel,REELS_TEST_FOLLOW_USER_ID:target,REELS_INTERACTION_SAFETY_RECEIPT:'/Volumes/SmarterWork/agent-work/test/receipt.json',REELS_INTERACTION_JOURNAL:'/Volumes/SmarterWork/agent-work/test/journal.json'};
const receipt=()=>({kind:'reels-interaction-fixture-safety',actorId:actor,reelId:reel,followTargetId:target,designatedServiceAccount:true,followTargetDesignatedTestAccount:true,privateOwnedFixture:true,noNotificationFanout:true,followRewardAlreadyClaimed:true,installedTriggerDigest:'b'.repeat(64),observedAt:new Date().toISOString()});
const fixture=()=>({id:reel,author_id:actor,is_public:false,is_deleted:false,media_status:'ready',playback_type:'native',rights_status:'user_authorized',video_url:`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/social-media/videos/${actor}/fixture.mp4`,caption:'[reels-test-fixture:owned]',like_count:0,comment_count:0});
test('configuration cannot fall back to a personal identity, public target or internal-drive journal',()=>{
 assert.throws(()=>validateConfiguration({}),/TEST_USER_EMAIL/);assert.throws(()=>validateConfiguration({...env,REELS_TEST_USER_ID:target}),/Self-follow/);assert.throws(()=>validateConfiguration({...env,REELS_INTERACTION_JOURNAL:'/tmp/test.json'}));validateConfiguration(env);
 const hosted={...env,GITHUB_ACTIONS:'true',GITHUB_WORKSPACE:'/home/runner/work/repo/repo',REELS_INTERACTION_SAFETY_RECEIPT:'/home/runner/work/repo/repo/work/receipt.json',REELS_INTERACTION_JOURNAL:'/home/runner/work/repo/repo/work/journal.json'};validateConfiguration(hosted);assert.throws(()=>validateConfiguration({...hosted,REELS_INTERACTION_JOURNAL:'/home/runner/work/repo/repo/../other/journal.json'}));
});
test('fresh fixture and installed-trigger qualification is mandatory and cannot be inferred from source',()=>{
 validateSafetyReceipt(receipt(),env);
 for(const patch of [{actorId:target},{privateOwnedFixture:false},{noNotificationFanout:false},{followRewardAlreadyClaimed:false},{followTargetDesignatedTestAccount:false},{observedAt:new Date(Date.now()-16*60*1000).toISOString()}])assert.throws(()=>validateSafetyReceipt({...receipt(),...patch},env));
});
test('only private test-owned ready native storage is writable',()=>{
 validateFixture(fixture(),actor,reel);for(const patch of [{is_public:true},{author_id:target},{caption:'Real player content'},{rights_status:'embed_only'},{media_status:'pending'},{video_url:'https://attacker.example/a.mp4'}])assert.throws(()=>validateFixture({...fixture(),...patch},actor,reel));
});
test('mutation allowlist excludes arbitrary users, rows, reward-qualifying text and unrelated tables',()=>{
 const config={actorId:actor,reelId:reel,followTargetId:target},comment='00000000-0000-4000-8000-000000000004';
 assert.equal(allowedMutation('social_comments',{id:comment,post_id:reel,author_id:actor,content:'Reel QA'},config,[comment]),true);
 assert.equal(allowedMutation('social_comments',{id:comment,post_id:reel,author_id:actor,content:'Reward qualifying comment'},config,[comment]),false);
 assert.equal(allowedMutation('social_likes',{post_id:reel,user_id:target,reaction_type:'like'},config,[]),false);
 assert.equal(allowedMutation('profiles',{},config,[]),false);
});
function fake({timeoutAfterInsert=false,freshQA=false,profileCreatedAt=new Date().toISOString()}={}) {
 const rows={social_likes:[],saved_reels:[],social_follows:[],social_comments:[],diamond_transactions:[{id:target,user_id:actor,reference_id:`follow_${actor}_${target}`,amount:2}]},writes=[],journals=[];
 if(freshQA)rows.diamond_transactions=[];
 const client={auth:{getUser:async()=>({error:null,data:{user:{id:actor,app_metadata:freshQA?{reels_qualification_fixture:true,purpose:'reels-qualification'}:{}}}})},from(table){
  let operation='select',payload,filters={},ids,one=false,ignore=false;
  const query={select(){return query;},eq(key,value){filters[key]=value;return query;},in(key,value){ids={key,value};return query;},maybeSingle(){one=true;return query;},insert(value){operation='insert';payload=value;return query;},upsert(value){operation='insert';payload=value;ignore=true;return query;},delete(){operation='delete';return query;},then(resolve,reject){
   let error=null,data=[];
   const matches=row=>Object.entries(filters).every(([key,value])=>row[key]===value)&&(!ids||ids.value.includes(row[ids.key]));
   if(operation==='select')data=table==='profiles'?[{id:actor,created_at:profileCreatedAt}]:table==='social_reels'?[{...fixture(),like_count:rows.social_likes.length,comment_count:rows.social_comments.length}]:rows[table].filter(matches);
   else if(operation==='insert'){
    writes.push({table,payload});if(rows[table].length&&rows[table].some(row=>Object.keys(payload).every(key=>row[key]===payload[key])))error=ignore?null:{code:'23505'};else rows[table].push({...payload,id:payload.id||target});
    if(timeoutAfterInsert&&table==='social_likes'&&!error)return Promise.reject(new Error('Unknown transport acknowledgement')).then(resolve,reject);
   }else {writes.push({table,operation,filters,ids});rows[table]=rows[table].filter(row=>!matches(row));}
   return Promise.resolve({data:one?data[0]||null:data,error}).then(resolve,reject);
  }};return query;
 }};
 const anonymous={from:()=>({insert:async()=>({data:null,error:{code:'42501'}})})};
 return{client,anonymous,rows,writes,journals,persist:async journal=>journals.push(structuredClone(journal))};
}
test('preflight performs zero fixture writes and never claims persisted/UI success',async()=>{
 const f=fake();const result=await runFixtureProbe({...f,env,safetyReceipt:receipt()});assert.equal(f.writes.length,0);assert.equal(result.status,'preflight-only');assert.match(result.limitations[0],/UI.*not certified/);
});
test('finite execution readbacks duplicate safety and restores only its clean fixture baseline',async()=>{
 const f=fake();const result=await runFixtureProbe({...f,env,safetyReceipt:receipt(),execute:true});assert.equal(result.status,'passed-api-only');assert.equal(result.cleanup.verified,true);for(const table of ['social_likes','saved_reels','social_follows','social_comments'])assert.equal(f.rows[table].length,0);assert.equal(f.rows.diamond_transactions.length,1);assert.equal(f.journals[0].status,'prepared');assert.equal(f.journals[1].writes[0].stage,'requested');
});
test('unknown write acknowledgement cannot produce success and cleanup still reads the durable row',async()=>{
 const f=fake({timeoutAfterInsert:true});await assert.rejects(()=>runFixtureProbe({...f,env,safetyReceipt:receipt(),execute:true}),/Unknown transport/);assert.equal(f.rows.social_likes.length,0);assert.equal(f.journals.at(-1).status,'failed');assert.equal(f.journals.at(-1).cleanup.verified,true);
});

test('interrupted-operation recovery is restricted to its same owner and exact persisted comment identities',async()=>{
 const f=fake();const comment='00000000-0000-4000-8000-000000000004',denied='00000000-0000-4000-8000-000000000005';
 f.rows.social_comments.push({id:comment,post_id:reel,author_id:actor,content:'Reel QA'});
 const journal={kind:'reels-interaction-fixture-operation',operationId:'00000000-0000-4000-8000-000000000006',actorId:actor,reelId:reel,followTargetId:target,commentIds:[comment,denied],checks:{baselineClean:true},writes:[{table:'social_comments',stage:'requested'}]};
 await assert.rejects(()=>recoverFixtureProbe({...f,env,safetyReceipt:receipt(),journal:{...journal,actorId:target}}));assert.equal(f.rows.social_comments.length,1);
 const result=await recoverFixtureProbe({...f,env,safetyReceipt:receipt(),journal});assert.equal(result.status,'recovered-not-certified');assert.equal(f.rows.social_comments.length,0);assert.equal(f.writes[0].ids.key,'id');assert.deepEqual(f.writes[0].ids.value,[comment,denied]);
});

test('fresh marked QA accounts exercise persisted follows without weakening the ordinary 24-hour reward gate',async()=>{
 const createdAt=new Date().toISOString(),f=fake({freshQA:true,profileCreatedAt:createdAt});
 const qualified={...receipt(),allowNewFixtureReward:true,freshQAActor:true,freshQATarget:true,fixturePurpose:'reels-qualification',profileCreatedAt:createdAt,followRewardAlreadyClaimed:false};
 const result=await runFixtureProbe({...f,env,safetyReceipt:qualified,execute:true});assert.equal(result.status,'passed-api-only');assert.equal(result.checks.rewardAgeBlocked,true);assert.equal(result.rewardFixture.awarded,0);assert.equal(f.rows.diamond_transactions.length,0);assert.equal(result.cleanup.verified,true);
});
test('fresh-fixture financial exception cannot extend to an unmarked actor or guessed account age',async()=>{
 const createdAt=new Date().toISOString(),f=fake(),qualified={...receipt(),allowNewFixtureReward:true,freshQAActor:true,freshQATarget:true,fixturePurpose:'reels-qualification',profileCreatedAt:createdAt,followRewardAlreadyClaimed:false};
 await assert.rejects(()=>runFixtureProbe({...f,env,safetyReceipt:qualified,execute:true}));assert.equal(f.writes.length,0);
 const marked=fake({freshQA:true,profileCreatedAt:createdAt});await assert.rejects(()=>runFixtureProbe({...marked,env,safetyReceipt:{...qualified,profileCreatedAt:'2000-01-01T00:00:00.000Z'},execute:true}),/Account age/);assert.equal(marked.writes.length,0);
});
test('actual private-invisible trigger refusal must retain same-id absence proof',async()=>{
 const f=fake();f.anonymous.from=()=>({insert:async()=>({error:{code:'P0001',message:`social_comments.post_id ${reel} not found in social_posts or social_reels`}})});const result=await runFixtureProbe({...f,env,safetyReceipt:receipt(),execute:true});assert.equal(result.signedOutRefusal.code,'P0001');assert.equal(result.signedOutRefusal.rowAbsent,true);
});

test('arbitrary P0001 and mismatched private target are not denial proof',async()=>{
 for(const message of ['unrelated failure',`social_comments.post_id ${target} not found in social_posts or social_reels`]){const f=fake();f.anonymous.from=()=>({insert:async()=>({error:{code:'P0001',message}})});await assert.rejects(()=>runFixtureProbe({...f,env,safetyReceipt:receipt(),execute:true}),/installed private-target refusal/);}
});
test('error acknowledgment cannot hide an inserted anonymous row before cleanup',async()=>{
 const f=fake();f.anonymous.from=()=>({insert:async payload=>{f.rows.social_comments.push(payload);return {error:{code:'42501'}};}});await assert.rejects(()=>runFixtureProbe({...f,env,safetyReceipt:receipt(),execute:true}),/must be absent before cleanup/);assert.equal(f.journals.some(j=>j.signedOutRefusal?.rowAbsent===false),true);assert.equal(f.rows.social_comments.length,0);
});
