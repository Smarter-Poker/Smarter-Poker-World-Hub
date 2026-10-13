#!/usr/bin/env node
// Finite, explicitly configured private-fixture probe. This is separate from
// the public read-only Reels certificate and never creates public content.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export const AUTH_ORIGIN='https://kuklfnapbkmacvwxktbh.supabase.co';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateConfiguration(env) {
  for(const key of ['TEST_USER_EMAIL','TEST_USER_PASSWORD','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','REELS_EXPECTED_SHA','REELS_TEST_USER_ID','REELS_TEST_REEL_ID','REELS_TEST_FOLLOW_USER_ID','REELS_INTERACTION_SAFETY_RECEIPT','REELS_INTERACTION_JOURNAL']) assert.ok(env[key]?.trim(),`${key} is required`);
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/,''),AUTH_ORIGIN);
  assert.match(env.REELS_EXPECTED_SHA,/^[0-9a-f]{40}$/i);
  for(const key of ['REELS_TEST_USER_ID','REELS_TEST_REEL_ID','REELS_TEST_FOLLOW_USER_ID']) assert.match(env[key],UUID);
  assert.notEqual(env.REELS_TEST_USER_ID,env.REELS_TEST_FOLLOW_USER_ID,'Self-follow cannot prove persisted following');
  for(const key of ['REELS_INTERACTION_SAFETY_RECEIPT','REELS_INTERACTION_JOURNAL']) {
    const path=resolve(env[key]);
    const ssd=/^\/Volumes\/Smarter(?:Work\/agent-work|Archives\/agent-evidence)\//.test(path);
    const hosted=env.GITHUB_ACTIONS==='true'&&env.GITHUB_WORKSPACE?.startsWith('/')&&path.startsWith(`${resolve(env.GITHUB_WORKSPACE)}/`);
    assert.ok(ssd||hosted,'Evidence must use the assigned SSD or hosted Actions workspace');
  }
}
export function validateSafetyReceipt(receipt,env,now=Date.now()) {
  assert.equal(receipt.kind,'reels-interaction-fixture-safety');
  assert.equal(receipt.actorId,env.REELS_TEST_USER_ID);assert.equal(receipt.reelId,env.REELS_TEST_REEL_ID);assert.equal(receipt.followTargetId,env.REELS_TEST_FOLLOW_USER_ID);
  assert.equal(receipt.designatedServiceAccount,true);assert.equal(receipt.followTargetDesignatedTestAccount,true);
  assert.equal(receipt.privateOwnedFixture,true);assert.equal(receipt.noNotificationFanout,true);
  if(receipt.allowNewFixtureReward===true){assert.equal(receipt.freshQAActor,true);assert.equal(receipt.freshQATarget,true);assert.equal(receipt.fixturePurpose,'reels-qualification');assert.ok(Number.isFinite(Date.parse(receipt.profileCreatedAt)));}
  else assert.equal(receipt.followRewardAlreadyClaimed,true);
  assert.match(receipt.installedTriggerDigest,/^[0-9a-f]{64}$/i);
  const age=now-Date.parse(receipt.observedAt);assert.ok(Number.isFinite(age)&&age>=0&&age<=15*60*1000,'Installed-trigger/fixture evidence must be freshly verified before this finite execution');
}
export function validateFixture(row,owner,id) {
  assert.equal(row?.id,id);assert.equal(row.author_id,owner);assert.equal(row.is_public,false);assert.equal(row.is_deleted,false);
  assert.equal(row.media_status,'ready');assert.equal(row.playback_type,'native');assert.equal(row.rights_status,'user_authorized');
  assert.ok(row.caption?.startsWith('[reels-test-fixture:'),'Only an explicitly marked private test fixture is writable');
  const url=new URL(row.video_url);assert.equal(url.origin,AUTH_ORIGIN);assert.ok(['videos','reels'].some(folder=>url.pathname.startsWith(`/storage/v1/object/public/social-media/${folder}/${owner}/`)));
  assert.equal(url.username,'');assert.equal(url.password,'');
}
export function allowedMutation(table,payload,config,commentIds) {
  if(table==='social_likes') return payload.post_id===config.reelId&&payload.user_id===config.actorId&&payload.reaction_type==='like';
  if(table==='saved_reels') return payload.reel_id===config.reelId&&payload.user_id===config.actorId&&payload.source_type==='reel';
  if(table==='social_follows') return payload.follower_id===config.actorId&&payload.following_id===config.followTargetId;
  if(table==='social_comments') return payload.post_id===config.reelId&&payload.author_id===config.actorId&&commentIds.includes(payload.id)&&payload.content==='Reel QA';
  return false;
}
const checked=async query=>{const result=await query;if(result.error)throw new Error(`Fixture operation refused (${result.error.code||'unknown'})`);return result.data;};
export async function runFixtureProbe({client,anonymous,env,safetyReceipt,persist,execute=false}) {
  validateConfiguration(env);validateSafetyReceipt(safetyReceipt,env);
  const actorId=env.REELS_TEST_USER_ID,reelId=env.REELS_TEST_REEL_ID,followTargetId=env.REELS_TEST_FOLLOW_USER_ID;
  const auth=await client.auth.getUser();assert.equal(auth.error,null);assert.equal(auth.data.user?.id,actorId,'Authenticated identity must match the designated service account');
  const reel=await checked(client.from('social_reels').select('id,author_id,is_public,is_deleted,media_status,playback_type,rights_status,video_url,caption,like_count,comment_count').eq('id',reelId).maybeSingle());validateFixture(reel,actorId,reelId);
  const filters={social_likes:{post_id:reelId,user_id:actorId,reaction_type:'like'},saved_reels:{reel_id:reelId,user_id:actorId},social_follows:{follower_id:actorId,following_id:followTargetId},social_comments:{post_id:reelId,author_id:actorId}};
  const read=async(table,values=filters[table])=>{let query=client.from(table).select('*');for(const [key,value]of Object.entries(values))query=query.eq(key,value);return checked(query);};
  for(const table of Object.keys(filters))assert.equal((await read(table)).length,0,'Existing baseline interactions must remain untouched; use a clean dedicated fixture');
  assert.equal((await read('social_likes',{post_id:reelId})).length,0);assert.equal((await read('social_comments',{post_id:reelId})).length,0);assert.equal(reel.like_count||0,0);assert.equal(reel.comment_count||0,0);
  const freshQA=safetyReceipt.allowNewFixtureReward===true;let rewardAgeBlocked=false;
  if(freshQA){assert.equal(auth.data.user.app_metadata?.reels_qualification_fixture,true);assert.equal(auth.data.user.app_metadata?.purpose,'reels-qualification');const profile=await checked(client.from('profiles').select('id,created_at').eq('id',actorId).maybeSingle());assert.equal(profile?.id,actorId);assert.equal(profile.created_at,safetyReceipt.profileCreatedAt,'Account age must match authoritative fixture qualification');rewardAgeBlocked=Date.now()-Date.parse(profile.created_at)<24*60*60*1000;}
  const reference=`follow_${actorId}_${followTargetId}`;
  const rewardBefore=await checked(client.from('diamond_transactions').select('id,reference_id,amount').eq('user_id',actorId).eq('reference_id',reference));if(!freshQA)assert.ok(rewardBefore.length>0,'Following requires an existing immutable reward claim; never create a new award for verification');
  const journal={kind:'reels-interaction-fixture-operation',operationId:randomUUID(),actorId,reelId,followTargetId,commentIds:[randomUUID(),randomUUID()],expectedSha:env.REELS_EXPECTED_SHA,startedAt:new Date().toISOString(),status:execute?'prepared':'preflight-only',writes:[],checks:{fixture:true,authenticated:true,baselineClean:true,existingFollowRewardClaim:rewardBefore.length>0,markedIsolatedQA:freshQA,rewardAgeBlocked},limitations:['API persistence only; browser UI and refresh are not certified','Cross-account write rejection is not certified by this finite fixture probe','Installed trigger isolation is qualified by the supplied fresh manual receipt']};
  if(!execute)return journal;
  await persist(journal,true);
  const payloads={social_likes:{...filters.social_likes},saved_reels:{...filters.saved_reels,source_type:'reel'},social_follows:{...filters.social_follows},social_comments:{...filters.social_comments,id:journal.commentIds[0],content:'Reel QA'}};
  const update=async()=>persist(journal,false);
  try {
    for(const [table,payload]of Object.entries(payloads)) {
      assert.ok(allowedMutation(table,payload,journal,journal.commentIds));journal.writes.push({table,stage:'requested'});await update();
      await checked(client.from(table).insert(payload));assert.equal((await read(table)).length,1,`${table} must persist exactly one fixture row`);
      const duplicate=table==='saved_reels'?await client.from(table).upsert(payload,{onConflict:'user_id,reel_id',ignoreDuplicates:true}):await client.from(table).insert(payload);if(table==='saved_reels')assert.equal(duplicate.error,null);else{assert.ok(duplicate.error,'A repeated insert must not create a second row');assert.equal(duplicate.error.code,'23505');}assert.equal((await read(table)).length,1);journal.checks[table]=true;journal.writes.at(-1).stage='read-back';await update();
    }
    const denied={...filters.social_comments,id:journal.commentIds[1],content:'Reel QA'};
    assert.ok(allowedMutation('social_comments',denied,journal,journal.commentIds));
    const result=await anonymous.from('social_comments').insert(denied);assert.ok(result.error,'Signed-out comment insertion must be refused');assert.equal(result.error.code,'42501');journal.checks.signedOutWriteRejected=true;
    const counters=await checked(client.from('social_reels').select('like_count,comment_count').eq('id',reelId).maybeSingle());assert.equal(counters.like_count,1);assert.equal(counters.comment_count,1);journal.checks.authoritativeCounters=true;
    const rewardAfter=await checked(client.from('diamond_transactions').select('id,reference_id,amount').eq('user_id',actorId).eq('reference_id',reference));
    if(!freshQA||rewardAgeBlocked||rewardBefore.length>0){assert.deepEqual(rewardAfter,rewardBefore,'Follow replay or the account-age gate must not alter immutable rewards');journal.checks.noNewFollowReward=true;}
    else{assert.equal(rewardAfter.length,1);assert.equal(Number(rewardAfter[0].amount),2,'Only the ordinary configured two-diamond follow award is allowed on an isolated eligible QA actor');journal.checks.isolatedFollowAwardOnce=true;}
    journal.rewardFixture={retained:true,ageBlocked:rewardAgeBlocked,before:rewardBefore.length,after:rewardAfter.length,awarded:rewardAfter.length>rewardBefore.length?2:0};
    journal.status='verified-awaiting-cleanup';
  } catch(error) {journal.status='failed';journal.error=error.message;throw error;}
  finally {
    const failures=[];
    for(const table of Object.keys(payloads).reverse()) {
      try {
        let query=client.from(table).delete();for(const [key,value]of Object.entries(filters[table]))query=query.eq(key,value);
        if(table==='social_comments')query=query.in('id',journal.commentIds);
        await checked(query);assert.equal((await read(table)).length,0);
      } catch {failures.push(table);}
    }
    try {const counters=await checked(client.from('social_reels').select('like_count,comment_count').eq('id',reelId).maybeSingle());assert.equal(counters.like_count,0);assert.equal(counters.comment_count,0);}catch{failures.push('fixture-counters');}
    journal.cleanup={verified:failures.length===0,failures};if(journal.status==='verified-awaiting-cleanup'&&failures.length===0)journal.status='passed-api-only';await update();assert.equal(failures.length,0,'Cleanup requires durable readback; never claim completion while cleanup is uncertain');
  }
  return journal;
}
export async function recoverFixtureProbe({client,env,safetyReceipt,journal,persist}) {
  validateConfiguration(env);validateSafetyReceipt(safetyReceipt,env);
  assert.equal(journal.kind,'reels-interaction-fixture-operation');assert.match(journal.operationId,UUID);
  assert.equal(journal.actorId,env.REELS_TEST_USER_ID);assert.equal(journal.reelId,env.REELS_TEST_REEL_ID);assert.equal(journal.followTargetId,env.REELS_TEST_FOLLOW_USER_ID);
  assert.equal(journal.checks.baselineClean,true);assert.ok(Array.isArray(journal.commentIds)&&journal.commentIds.length===2);for(const id of journal.commentIds)assert.match(id,UUID);
  const auth=await client.auth.getUser();assert.equal(auth.error,null);assert.equal(auth.data.user?.id,journal.actorId);
  validateFixture(await checked(client.from('social_reels').select('id,author_id,is_public,is_deleted,media_status,playback_type,rights_status,caption,video_url,like_count,comment_count').eq('id',journal.reelId).maybeSingle()),journal.actorId,journal.reelId);
  const scopes={social_likes:{post_id:journal.reelId,user_id:journal.actorId,reaction_type:'like'},saved_reels:{reel_id:journal.reelId,user_id:journal.actorId},social_follows:{follower_id:journal.actorId,following_id:journal.followTargetId},social_comments:{post_id:journal.reelId,author_id:journal.actorId}};
  const tables=[...new Set(journal.writes.map(write=>write.table))];for(const table of tables)assert.ok(scopes[table],'Journal cannot authorize an unrelated table');
  // A signed-out denial may have committed unexpectedly; its explicit ID is
  // part of this operation even when the expected rejection did not arrive.
  if(!tables.includes('social_comments'))tables.push('social_comments');
  const failures=[];
  for(const table of tables.reverse()) {
    try {
      let remove=client.from(table).delete(),read=client.from(table).select('*');for(const [key,value]of Object.entries(scopes[table])){remove=remove.eq(key,value);read=read.eq(key,value);}
      if(table==='social_comments'){remove=remove.in('id',journal.commentIds);read=read.in('id',journal.commentIds);}
      await checked(remove);assert.equal((await checked(read)).length,0);
    }catch{failures.push(table);}
  }
  journal.cleanup={verified:failures.length===0,failures};journal.status=failures.length?'recovery-incomplete':'recovered-not-certified';await persist(journal,false);
  assert.equal(failures.length,0,'Recovery requires exact durable readback');return journal;
}
async function main() {
  const env=process.env;validateConfiguration(env);
  const receipt=JSON.parse(await readFile(env.REELS_INTERACTION_SAFETY_RECEIPT,'utf8'));validateSafetyReceipt(receipt,env);
  const health=await fetch('https://smarter.poker/api/health',{signal:AbortSignal.timeout(15000)}).then(response=>response.json());assert.equal(health.commitSha||health.version,env.REELS_EXPECTED_SHA);
  const {createClient}=await import('@supabase/supabase-js');const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,init={})=>fetch(url,{...init,signal:init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)})}};
  const client=createClient(AUTH_ORIGIN,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options),anonymous=createClient(AUTH_ORIGIN,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
  const login=await client.auth.signInWithPassword({email:env.TEST_USER_EMAIL,password:env.TEST_USER_PASSWORD});assert.equal(login.error,null,'Designated service-account login failed');
  const persist=(journal,first)=>writeFile(env.REELS_INTERACTION_JOURNAL,JSON.stringify(journal,null,2),{flag:first?'wx':'w'});
  const result=process.argv.includes('--recover')?await recoverFixtureProbe({client,env,safetyReceipt:receipt,journal:JSON.parse(await readFile(env.REELS_INTERACTION_JOURNAL,'utf8')),persist}):await runFixtureProbe({client,anonymous,env,safetyReceipt:receipt,execute:process.argv.includes('--execute'),persist});
  const after=await fetch('https://smarter.poker/api/health',{signal:AbortSignal.timeout(15000)}).then(response=>response.json());assert.equal(after.commitSha||after.version,env.REELS_EXPECTED_SHA,'Serving revision changed during the fixture probe');
  console.log(JSON.stringify({status:result.status,checks:result.checks,cleanup:result.cleanup,accountFingerprint:createHash('sha256').update(result.actorId).digest('hex').slice(0,16),limitations:result.limitations}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
