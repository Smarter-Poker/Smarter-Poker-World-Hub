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
 assert.match(source,/Video Unavailable\|No Reels/);assert.match(source,/video\.currentSrc===outputUrl\|\|video\.getAttribute\('src'\)===outputUrl/);
 assert.match(source,/actualCaptionSafePosition=true/);assert.match(source,/cue\.line===70&&cue\.snapToLines===false/);
 assert.match(source,/journal\.commentReadErrors=\[\]/);assert.match(source,/commentReadErrors\.length<5/);
 assert.match(source,/failureMedia=await page\.evaluate/);assert.match(source,/transitioning:document\.body\.classList\.contains\('page-transitioning'\)/);assert.match(source,/reels-native-failed\.png/);
});


test('startup proof requires the actual successful browser acknowledgment before any UI reload',async()=>{
 const {isStartupMetricAcknowledgment}=await import('../scripts/ci/reels-enhancements-live-check.mjs');
 const receipt={origin:'https://smarter.poker',path:'/api/reels/delivery-metrics',method:'POST',status:202,bodyReadable:true,success:true,kind:'startup',surface:'standalone',playbackType:'native',startupMs:81};
 assert.equal(isStartupMetricAcknowledgment(receipt),true);
 for(const change of[{status:503},{kind:'summary'},{surface:'library'},{playbackType:'youtube_embed'},{startupMs:null},{startupMs:-1},{startupMs:120001},{success:false},{path:'/api/other'},{origin:'https://other.example'},{method:'GET'},{bodyReadable:false}])assert.equal(isStartupMetricAcknowledgment({...receipt,...change}),false);
 const source=readFileSync(new URL('../scripts/ci/reels-enhancements-live-check.mjs',import.meta.url),'utf8');
 assert.match(source,/await observeBrowserMetrics/);assert.match(source,/const startupAcknowledgment=new Promise/);
 assert.ok(source.indexOf('const startupAcknowledgment=new Promise')<source.indexOf('await open();journal.checks.actualPrivateNativeViewer'));
 assert.ok(source.indexOf('await startupAcknowledgment;')<source.indexOf("await step('like'"));
 assert.match(source,/Actual persisted startup metric acknowledgment required/);assert.match(source,/metricAcknowledgments\.length<20/);
 assert.match(source,/clearTimeout\(startupTimeout\)/);
});

test('actual in-browser observer reads a real Response clone and leaves fetch arguments, promise and body intact',{timeout:2000},async()=>{
 const {observeBrowserMetrics,isStartupMetricAcknowledgment}=await import('../scripts/ci/reels-enhancements-live-check.mjs');
 const savedFetch=globalThis.fetch,savedLocation=Object.getOwnPropertyDescriptor(globalThis,'location'),bindingName='reelsQAMetric_test',frame={},page={mainFrame:()=>frame};
 const originalResponse=new Response(JSON.stringify({success:true}),{status:202}),pending=Promise.resolve(originalResponse),calls=[],observations=[];let receive,binding;
 const received=new Promise(resolve=>{receive=resolve;});
 globalThis.fetch=function(...args){calls.push(args);return pending;};Object.defineProperty(globalThis,'location',{configurable:true,value:{href:'https://smarter.poker/hub/reels'}});
 const context={async exposeBinding(name,fn){binding=fn;globalThis[name]=value=>fn({page,frame},value);},async addInitScript(fn,args){fn(args);}};
 try{
  await observeBrowserMetrics(context,page,bindingName,value=>{observations.push(value);receive(value);});
  const options={method:'POST',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({event_kind:'startup',surface:'standalone',playback_type:'native',startup_ms:395})};
  const result=globalThis.fetch('/api/reels/delivery-metrics',options);assert.equal(result,pending);assert.equal(calls[0][0],'/api/reels/delivery-metrics');assert.equal(calls[0][1],options);
  const receipt=await received;assert.equal(isStartupMetricAcknowledgment(receipt),true);assert.equal(receipt.startupMs,395);assert.equal(originalResponse.bodyUsed,false);assert.deepEqual(await originalResponse.json(),{success:true});
  await binding({page,frame:{}},receipt);assert.equal(observations.length,1,'other frames cannot report this page acknowledgment');
  assert.equal(globalThis.fetch('/api/unrelated',options),pending);assert.equal(globalThis.fetch('https://other.example/api/reels/delivery-metrics',options),pending);assert.equal(observations.length,1);
 }finally{globalThis.fetch=savedFetch;delete globalThis[bindingName];if(savedLocation)Object.defineProperty(globalThis,'location',savedLocation);else delete globalThis.location;}
});
