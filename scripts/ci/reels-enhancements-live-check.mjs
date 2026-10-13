#!/usr/bin/env node
// Explicit finite published UI qualification. Only marked private QA fixtures may be mutated.
import assert from 'node:assert/strict';
import{randomUUID}from'node:crypto';
import{readFile,writeFile}from'node:fs/promises';
import{resolve,dirname,join}from'node:path';
import{pathToFileURL}from'node:url';
import{AUTH_ORIGIN,validateSafetyReceipt,validateFixture}from'./reels-interaction-live-check.mjs';
import{QA_ACTOR_EMAIL,assertMarkedUser}from'./reels-qa-fixture-setup.mjs';
const APP='https://smarter.poker';
const UUID=/^[0-9a-f-]{36}$/i;
export function validateQAInputs(env,setup,safety,now=Date.now()){
 for(const key of['REELS_QA_PASSWORD','REELS_EXPECTED_SHA','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','REELS_QA_SETUP_RECEIPT','REELS_INTERACTION_SAFETY_RECEIPT','REELS_ENHANCEMENTS_JOURNAL'])assert.ok(env[key]?.trim(),`${key} is required`);
 assert.match(env.REELS_EXPECTED_SHA,/^[0-9a-f]{40}$/);assert.equal(env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/,''),AUTH_ORIGIN);
 assert.equal(setup.kind,'reels-qa-fixture-setup');assert.equal(setup.purpose,'reels-qualification');assert.equal(setup.status,'fixture-prepared-not-certified');assert.equal(setup.markedQAAccounts?.actor,true);assert.equal(setup.markedQAAccounts?.target,true);
 for(const key of['actorId','followTargetId','reelId','postId'])assert.match(setup[key],UUID);
 validateSafetyReceipt(safety,{REELS_TEST_USER_ID:setup.actorId,REELS_TEST_REEL_ID:setup.reelId,REELS_TEST_FOLLOW_USER_ID:setup.followTargetId},now);
 for(const key of['REELS_QA_SETUP_RECEIPT','REELS_INTERACTION_SAFETY_RECEIPT','REELS_ENHANCEMENTS_JOURNAL']){const path=resolve(env[key]);assert.ok(/^\/Volumes\/Smarter(?:Work\/agent-work|Archives\/agent-evidence)\//.test(path)||(env.GITHUB_ACTIONS==='true'&&path.startsWith(`${resolve(env.GITHUB_WORKSPACE)}/`)),'Proof files must use assigned storage');}
}
const checked=async query=>{const value=await query;if(value.error)throw new Error(`QA readback refused (${value.error.code||'unknown'})`);return value.data;};
export async function qualifyOwnedNativePipeline({request,client,setup,session,journal,persist,timeoutMs=10*60*1000}){
 assert.ok(timeoutMs>0&&timeoutMs<=10*60*1000);
 const source=await checked(client.from('social_posts').select('id,author_id,visibility,media_urls,original_media_url').eq('id',setup.postId).eq('author_id',setup.actorId).maybeSingle());
 assert.equal(source.id,setup.postId);assert.equal(source.visibility,'private');
 const original=source.original_media_url||source.media_urls?.[0];const url=new URL(original);assert.equal(url.origin,AUTH_ORIGIN);assert.ok(url.pathname.startsWith(`/storage/v1/object/public/social-media/reels/${setup.actorId}/`)||url.pathname.startsWith(`/storage/v1/object/public/social-media/videos/${setup.actorId}/`));
 journal.nativePipeline={postId:setup.postId,stage:'queue-requested',requestedAt:new Date().toISOString()};await persist(journal,false);
 const queued=await request.post(`${APP}/api/video/transcode`,{headers:{Authorization:`Bearer ${session.access_token}`},data:{postId:setup.postId,videoUrl:original},timeout:20000});assert.ok(queued.ok(),'Actual owned queue API refused fixture');const receipt=await queued.json();assert.equal(receipt.success,true);assert.ok(receipt.jobId);journal.nativePipeline.jobId=receipt.jobId;journal.nativePipeline.queueStatus=receipt.status;journal.nativePipeline.reused=receipt.reused===true;journal.nativePipeline.stage='queued';await persist(journal,false);
 const deadline=Date.now()+timeoutMs;let output;
 while(Date.now()<deadline){
  const response=await request.get(`${APP}/api/video/transcode-status?postId=${setup.postId}`,{headers:{Authorization:`Bearer ${session.access_token}`},timeout:15000});assert.ok(response.ok(),'Owned pipeline observation unavailable');const status=await response.json();assert.equal(status.success,true);assert.notEqual(status.job?.status,'failed','Existing worker reported failed processing');
  if(status.job?.status==='completed'){output=status.job.output_url;break;}
  await new Promise(resolve=>setTimeout(resolve,Math.min(2000,Math.max(0,deadline-Date.now()))));
 }
 assert.ok(output,'Explicit ten-minute native worker observation expired; no write was retried');
 const reel=await checked(client.from('social_reels').select('id,author_id,is_public,media_status,playback_type,rights_status,video_url,thumbnail_url').eq('id',setup.reelId).maybeSingle());
 assert.equal(reel.author_id,setup.actorId);assert.equal(reel.is_public,false);assert.equal(reel.media_status,'ready');assert.equal(reel.playback_type,'native');assert.equal(reel.rights_status,'user_authorized');assert.equal(reel.video_url,output);assert.ok(reel.thumbnail_url,'Native worker must deliver an actual thumbnail');
 for(const value of[output,reel.thumbnail_url]){const trusted=new URL(value);assert.equal(trusted.origin,AUTH_ORIGIN);assert.ok(trusted.pathname.startsWith('/storage/v1/object/public/social-media/'));assert.equal(trusted.search,'');assert.equal(trusted.username,'');}
 journal.nativePipeline.outputUrl=output;journal.nativePipeline.thumbnailUrl=reel.thumbnail_url;journal.nativePipeline.stage='completed-read-back';journal.nativePipeline.completedAt=new Date().toISOString();journal.checks.nativeWorkerOutputAndThumbnailPersisted=true;await persist(journal,false);
 return reel;
}
export async function runPublishedEnhancements({page,context,client,setup,env,persist,session}){
 const journal={kind:'reels-enhancements-published-ui',operationId:randomUUID(),expectedSha:env.REELS_EXPECTED_SHA,actorId:setup.actorId,reelId:setup.reelId,followTargetId:setup.followTargetId,status:'prepared',checks:{baselineClean:true},commentIds:[],writes:[],limitations:['Synthetic original private QA video; no public content or personal account writes','Physical device and pixel-identical provider overlays are not certified','Library and social-carousel private fixture writes require their actual authenticated entrypoints; this standalone probe does not fabricate feed data']};
 const scopes={social_likes:{post_id:setup.reelId,user_id:setup.actorId},saved_reels:{reel_id:setup.reelId,user_id:setup.actorId},social_follows:{follower_id:setup.actorId,following_id:setup.followTargetId},social_comments:{post_id:setup.reelId,author_id:setup.actorId}};
 const read=async table=>{let q=client.from(table).select('*');for(const[k,v]of Object.entries(scopes[table]))q=q.eq(k,v);return checked(q);};
 for(const table of Object.keys(scopes))assert.equal((await read(table)).length,0,'QA baseline must be clean; never remove an existing interaction');
 const baseline=await checked(client.from('social_reels').select('id,author_id,is_public,is_deleted,media_status,playback_type,rights_status,caption,video_url,like_count,comment_count').eq('id',setup.reelId).maybeSingle());validateFixture(baseline,setup.actorId,setup.reelId);assert.equal(baseline.like_count||0,0);assert.equal(baseline.comment_count||0,0);
 await persist(journal,true);
 await context.addInitScript(({session})=>{if(!sessionStorage.getItem('reels-qa-auth-initialized')){localStorage.setItem('smarter-poker-auth',JSON.stringify(session));sessionStorage.setItem('reels-qa-auth-initialized','1');}}, {session});
 const notificationsBlocked=[];await context.route('**/api/notifications/follow',async route=>{notificationsBlocked.push('follow');await route.abort('blockedbyclient');});
 const metrics=[];page.on('response',async response=>{const request=response.request();if(request.url().endsWith('/api/reels/delivery-metrics')&&request.method()==='POST'&&response.status()===202){try{const acknowledgment=await response.json();if(acknowledgment.success===true)metrics.push(request.postDataJSON());}catch(_){}}});
 const route=`${APP}/hub/reels?id=${setup.reelId}&category=poker`;let expectedNative=null;
 async function open(){await page.goto(route,{waitUntil:'domcontentloaded'});await page.locator('[data-reels-stage] video').waitFor({state:'visible',timeout:30000});const current=await page.locator('[data-reels-stage] video').getAttribute('src');assert.equal(current,expectedNative?.video_url,'UI must show the actual processed private owned fixture');}
 async function uiWrite(table,action){const acknowledged=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().includes(`/rest/v1/${table}`),{timeout:20000});await action();const response=await acknowledged;assert.ok(response.ok(),'UI mutation must receive an authoritative success response');}
 async function step(name,action){journal.writes.push({name,stage:'requested'});await persist(journal,false);await action();journal.writes.at(-1).stage='read-back';journal.checks[name]=true;await persist(journal,false);}
 try{
  expectedNative=await qualifyOwnedNativePipeline({request:context.request,client,setup,session,journal,persist});
  await open();journal.checks.actualPrivateNativeViewer=true;
  await page.waitForFunction(()=>{const v=document.querySelector('[data-reels-stage] video');return v&&v.readyState>=3&&!v.paused&&v.currentTime>0;},{},{timeout:30000});journal.checks.actualProcessedNativePlaying=true;
  const poster=await page.locator('[data-reels-stage] video').getAttribute('poster');assert.equal(poster,expectedNative.thumbnail_url);await page.evaluate(url=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>image.naturalWidth>0?resolve():reject(new Error('Thumbnail has no pixels'));image.onerror=()=>reject(new Error('Actual native thumbnail failed'));image.src=url;}),poster);journal.checks.actualNativeThumbnailDecoded=true;
  await step('like',async()=>{await uiWrite('rpc/set_reel_reaction',()=>page.getByRole('button',{name:'Like',exact:true}).click());assert.equal((await read('social_likes')).length,1);await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Unlike',exact:true}).waitFor({state:'visible'});});
  await step('save',async()=>{await uiWrite('saved_reels',()=>page.locator('[data-reel-action="save"]').click());assert.equal((await read('saved_reels')).length,1);await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Unsave',exact:true}).waitFor({state:'visible'});});
  await step('comment',async()=>{await page.getByRole('button',{name:'Comments',exact:true}).click();await page.getByPlaceholder('Add A Comment...',{exact:true}).fill('Reel QA');await uiWrite('social_comments',()=>page.getByRole('button',{name:'Post Comment',exact:true}).click());await page.waitForFunction(()=>!document.querySelector('[placeholder="Add A Comment..."]')?.value,{}, {timeout:15000});const comments=await read('social_comments');assert.equal(comments.length,1);assert.equal(comments[0].content,'Reel QA');journal.commentIds=[comments[0].id];await persist(journal,false);await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Comments',exact:true}).click();await page.getByText('Reel QA',{exact:true}).waitFor({state:'visible'});});
  await step('follow',async()=>{await page.goto(`${APP}/hub/user/reels_qa_target`,{waitUntil:'domcontentloaded'});await uiWrite('social_follows',()=>page.getByRole('button',{name:'Follow',exact:true}).click());assert.equal((await read('social_follows')).length,1);await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:/Following$/}).waitFor({state:'visible'});});
  await open();
  await step('nativeCaptions',async()=>{const vtt='WEBVTT\n\n00:00.000 --> 00:05.900\nOriginal QA test tone\n';await page.getByLabel('Add Creator Caption File',{exact:true}).setInputFiles({name:'original-qa.vtt',mimeType:'text/vtt',buffer:Buffer.from(vtt)});await page.locator('[data-reel-captions][data-reel-caption-status="available"]').waitFor({state:'visible',timeout:30000});const cc=page.locator('[data-reel-captions]');if(await cc.getAttribute('aria-pressed')!=='true')await cc.click();await page.waitForFunction(()=>{const v=document.querySelector('[data-reels-stage] video');return v&&[...v.textTracks].some(t=>t.mode==='showing'&&t.activeCues?.length>0);},{},{timeout:15000});journal.checks.actualCaptionTrackLoaded=true;});
  const counters=await checked(client.from('social_reels').select('like_count,comment_count').eq('id',setup.reelId).maybeSingle());assert.equal(counters.like_count,1);assert.equal(counters.comment_count,1);journal.checks.authoritativeCounters=true;
  assert.ok(metrics.some(metric=>metric.event_kind==='startup'&&Number.isFinite(metric.startup_ms)),'Actual persisted startup metric acknowledgment required');journal.checks.actualMeasuredSubmission=true;
  journal.measuredStartupMs=metrics.filter(metric=>metric.event_kind==='startup').map(metric=>metric.startup_ms);
  journal.viewports=[];
  for(const viewport of[{width:390,height:844},{width:1440,height:900}]) {
    await page.setViewportSize(viewport);
    const geometry=await page.evaluate(()=>({width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,activeNative:[...document.querySelectorAll('video')].filter(video=>!video.paused).length}));
    assert.equal(geometry.width,geometry.scrollWidth,'Reels must not overflow at either affected width');assert.equal(geometry.activeNative,1,'Only the current native Reel may play');
    await page.screenshot({path:join(dirname(env.REELS_ENHANCEMENTS_JOURNAL),`reels-native-${viewport.width}.png`),fullPage:false});journal.viewports.push({...viewport,...geometry});
  }
  await page.getByRole('button',{name:'Comments',exact:true}).click();
  const deleted=page.waitForResponse(response=>response.request().method()==='DELETE'&&response.url().includes('/rest/v1/social_comments'),{timeout:20000});
  await page.getByRole('button',{name:'Delete',exact:true}).click();assert.ok((await deleted).ok(),'Actual comment deletion acknowledgment required');
  assert.equal((await read('social_comments')).length,0);assert.equal((await checked(client.from('social_reels').select('comment_count').eq('id',setup.reelId).maybeSingle())).comment_count,0);journal.checks.actualCommentDeletion=true;
  await page.getByRole('dialog',{name:'Comments',exact:true}).getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:/^More Options$/i}).click();await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:/^(Sign Out|Log Out|Logout)$/i}).click();await page.waitForFunction(()=>!document.querySelector('[data-reels-stage] video'),{},{timeout:30000});journal.checks.actualSignOutClearedMountedPrivateMedia=true;
  await context.clearCookies();await page.evaluate(()=>{localStorage.removeItem('smarter-poker-auth');for(const key of Object.keys(localStorage))if(/^sb-.*-auth-token$/.test(key))localStorage.removeItem(key);});const anonymousContext=await context.browser().newContext({viewport:{width:390,height:844}});try{const anonymousPage=await anonymousContext.newPage();await anonymousPage.goto(route,{waitUntil:'domcontentloaded'});await anonymousPage.getByText(/Reel.*Unavailable|Reel.*Not Found|No Reels|No Videos/i).first().waitFor({state:'visible',timeout:30000});assert.equal(await anonymousPage.locator('[data-reels-stage] video').count(),0);}finally{await anonymousContext.close();}journal.checks.signedOutPrivateMediaRemoved=true;journal.checks.notificationFanoutBlocked=notificationsBlocked.length>0;
  journal.status='verified-awaiting-cleanup';
 }catch(error){journal.status='failed';journal.error=error.message;throw error;}
 finally{
  const failures=[];
  for(const table of Object.keys(scopes).reverse()){
   try{let q=client.from(table).delete();for(const[k,v]of Object.entries(scopes[table]))q=q.eq(k,v);if(table==='social_comments'){const own=await read(table);for(const row of own)assert.equal(row.content,'Reel QA','Only this operation fixture comment may be cleaned');q=q.in('id',own.map(row=>row.id));journal.commentIds=[...new Set([...journal.commentIds,...own.map(row=>row.id)])];await persist(journal,false);}await checked(q);assert.equal((await read(table)).length,0);}catch(_){failures.push(table);}
  }
  const counters=await checked(client.from('social_reels').select('like_count,comment_count').eq('id',setup.reelId).maybeSingle());if(counters.like_count!==0||counters.comment_count!==0)failures.push('fixture-counters');
  journal.cleanup={verified:failures.length===0,failures,retainedPrivateNativeAndCaption:true};if(journal.status==='verified-awaiting-cleanup'&&!failures.length)journal.status='passed-scoped-standalone-ui';await persist(journal,false);assert.equal(failures.length,0,'Exact cleanup readback is required');
 }
 return journal;
}
async function main(){
 const env=process.env;const setup=JSON.parse(await readFile(env.REELS_QA_SETUP_RECEIPT,'utf8')),safety=JSON.parse(await readFile(env.REELS_INTERACTION_SAFETY_RECEIPT,'utf8'));validateQAInputs(env,setup,safety);
 const health=await fetch(`${APP}/api/health`,{signal:AbortSignal.timeout(15000)}).then(r=>r.json());assert.equal(health.commitSha||health.version,env.REELS_EXPECTED_SHA);
 const{createClient}=await import('@supabase/supabase-js');const client=createClient(AUTH_ORIGIN,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(15000)})}});
 const login=await client.auth.signInWithPassword({email:QA_ACTOR_EMAIL,password:env.REELS_QA_PASSWORD});assert.equal(login.error,null);assertMarkedUser(login.data.user,QA_ACTOR_EMAIL);assert.equal(login.data.user.id,setup.actorId);
 const{chromium}=await import('playwright');const browser=await chromium.launch({headless:true});try{const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.setDefaultTimeout(20000);const persist=(value,first)=>writeFile(env.REELS_ENHANCEMENTS_JOURNAL,JSON.stringify(value,null,2),{flag:first?'wx':'w',mode:0o600});const result=await runPublishedEnhancements({page,context,client,setup,env,persist,session:login.data.session});const after=await fetch(`${APP}/api/health`,{signal:AbortSignal.timeout(15000)}).then(r=>r.json());assert.equal(after.commitSha||after.version,env.REELS_EXPECTED_SHA);console.log(JSON.stringify({status:result.status,checks:result.checks,cleanup:result.cleanup,limitations:result.limitations}));}finally{await browser.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Published QA verification failed. Read the existing operation journal before retrying; no credentials are logged.');process.exitCode=1;});
