import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
import{validateQAInputs}from'../scripts/ci/reels-enhancements-live-check.mjs';
const actor='11111111-1111-4111-8111-111111111111',reel='22222222-2222-4222-8222-222222222222',target='33333333-3333-4333-8333-333333333333';
const env={REELS_QA_PASSWORD:'configured-secret-placeholder',REELS_EXPECTED_SHA:'a'.repeat(40),NEXT_PUBLIC_SUPABASE_URL:'https://kuklfnapbkmacvwxktbh.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-placeholder',REELS_QA_SETUP_RECEIPT:'/Volumes/SmarterWork/agent-work/owned/setup.json',REELS_INTERACTION_SAFETY_RECEIPT:'/Volumes/SmarterWork/agent-work/owned/safety.json',REELS_ENHANCEMENTS_JOURNAL:'/Volumes/SmarterWork/agent-work/owned/journal.json'};
const setup={kind:'reels-qa-fixture-setup',purpose:'reels-qualification',status:'fixture-prepared-not-certified',markedQAAccounts:{actor:true,target:true},actorId:actor,reelId:reel,followTargetId:target,postId:reel};
const safety={kind:'reels-interaction-fixture-safety',actorId:actor,reelId:reel,followTargetId:target,designatedServiceAccount:true,followTargetDesignatedTestAccount:true,privateOwnedFixture:true,noNotificationFanout:true,followRewardAlreadyClaimed:true,installedTriggerDigest:'b'.repeat(64),observedAt:new Date().toISOString()};
test('published UI qualification accepts only marked QA and fresh exact fixture receipts on assigned storage',()=>{
 assert.doesNotThrow(()=>validateQAInputs(env,setup,safety));
 assert.throws(()=>validateQAInputs({...env,REELS_QA_PASSWORD:''},setup,safety));
 assert.throws(()=>validateQAInputs(env,{...setup,markedQAAccounts:{actor:false,target:true}},safety));
 assert.throws(()=>validateQAInputs(env,setup,{...safety,observedAt:'2020-01-01T00:00:00Z'}));
 assert.throws(()=>validateQAInputs({...env,REELS_ENHANCEMENTS_JOURNAL:'/tmp/report.json'},setup,safety));
});
test('proof uses real UI writes and exact scoped cleanup without feeding synthetic public rows',()=>{
 const source=readFileSync(new URL('../scripts/ci/reels-enhancements-live-check.mjs',import.meta.url),'utf8');
 assert.match(source,/getByRole\('button',\{name:'Like'/);assert.match(source,/setInputFiles/);assert.match(source,/textTracks/);assert.match(source,/activeCues/);
 assert.match(source,/baselineClean:true/);assert.match(source,/commentIds/);assert.match(source,/retainedPrivateNativeAndCaption:true/);
 assert.doesNotMatch(source,/route\.fulfill|TEST_USER_PASSWORD|auth\.admin|SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(source,/flag:first\?'wx':'w'/);
 assert.match(source,/\/hub\/reels\/saved/);assert.match(source,/a\.vlc-saved-link/);assert.match(source,/actualPrivateSavedCollection=true/);assert.match(source,/savedLink\.click\(\)/);
 assert.match(source,/journal\.commentReadErrors=\[\]/);assert.match(source,/commentReadErrors\.length<5/);
 assert.match(source,/failureMedia=await page\.evaluate/);assert.match(source,/transitioning:document\.body\.classList\.contains\('page-transitioning'\)/);assert.match(source,/reels-native-failed\.png/);
});
