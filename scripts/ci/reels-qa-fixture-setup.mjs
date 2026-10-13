#!/usr/bin/env node
// Explicitly invoked private QA fixture setup in the existing canonical project.
// Admin access owns only marked Auth fixtures; content and Storage use actor RLS.
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
export const QA_ACTOR_EMAIL='reels-qa@smarter.poker',QA_TARGET_EMAIL='reels-qa-target@smarter.poker';
export const QA_PURPOSE='reels-qualification',AUTH_ORIGIN='https://kuklfnapbkmacvwxktbh.supabase.co';
const hash=value=>createHash('sha256').update(value).digest('hex');
export function fixtureUUID(owner,kind) {const value=hash(`${QA_PURPOSE}:${owner}:${kind}`).slice(0,32).split('');value[12]='5';value[16]='8';return`${value.slice(0,8).join('')}-${value.slice(8,12).join('')}-${value.slice(12,16).join('')}-${value.slice(16,20).join('')}-${value.slice(20).join('')}`;}
export function assertMarkedUser(user,email) {
 assert.equal(user?.email?.toLowerCase(),email);assert.equal(user.app_metadata?.reels_qualification_fixture,true,'An existing non-fixture account must never be changed');assert.equal(user.app_metadata?.purpose,QA_PURPOSE);
}
export function validateMediaProof(bytes,probe) {
 assert.ok(bytes.length>32&&bytes.length<=2*1024*1024,'Only the small generated QA original is accepted');assert.equal(bytes.subarray(4,8).toString(),'ftyp','QA file must be actual MP4 bytes');
 const video=probe.streams?.find(stream=>stream.codec_type==='video');assert.equal(video?.codec_name,'h264');assert.ok(video.width>=120&&video.width<=720&&video.height>video.width&&video.height<=1280);assert.equal(video.pix_fmt,'yuv420p');const duration=Number(probe.format?.duration);assert.ok(duration>=2&&duration<=15);
 return{sha256:hash(bytes),bytes:bytes.length,width:video.width,height:video.height,durationSeconds:duration,codec:'h264'};
}
export async function findQAUser(admin,email,{maxPages=50,perPage=1000}={}) {
 assert.ok([QA_ACTOR_EMAIL,QA_TARGET_EMAIL].includes(email));
 for(let page=1;page<=maxPages;page++) {
  const result=await admin.auth.admin.listUsers({page,perPage});if(result.error)throw new Error('QA Auth inventory is unavailable');const users=result.data?.users;assert.ok(Array.isArray(users));const matches=users.filter(user=>user.email?.toLowerCase()===email);assert.ok(matches.length<=1,'QA Auth identity is ambiguous');if(matches.length){assertMarkedUser(matches[0],email);return matches[0];}
  if(users.length<perPage)return null;
 }
 throw new Error('Bounded Auth inventory did not reach its terminal page; account absence is unknown');
}
const checked=async query=>{const result=await query;if(result.error){const failure=new Error('QA fixture operation refused');failure.code=['42501','23505','23514','22P02','PGRST116'].includes(result.error.code)?result.error.code:'OPERATION_REFUSED';throw failure;}return result.data;};
export async function setupQAFixture({admin,actorClient,password,bytes,mediaProof,readObject,persist,priorReceipt=null,validateStoredMedia}) {
 assert.ok(typeof password==='string'&&password.length>=24,'QA password must come from its dedicated configured secret');assert.equal(hash(bytes),mediaProof.sha256);
 const journal={kind:'reels-qa-fixture-setup',operationId:randomUUID(),purpose:QA_PURPOSE,startedAt:new Date().toISOString(),status:'preparing',stages:[],mediaProof};
 const stage=async(name,state='requested',extra={})=>{journal.stages.push({name,state,...extra});await persist(journal);};
 async function account(email,username,isActor) {
  let user=await findQAUser(admin,email);const existed=Boolean(user);
  if(!user){await stage(isActor?'actor-auth':'target-auth');const result=await admin.auth.admin.createUser({email,password:isActor?password:randomBytes(36).toString('base64url'),email_confirm:true,app_metadata:{reels_qualification_fixture:true,purpose:QA_PURPOSE},user_metadata:{username,poker_alias:username,full_name:isActor?'Reels QA Fixture':'Reels QA Follow Fixture'}});if(result.error)throw new Error('QA account creation acknowledgement failed; read back the same exact marked identity before retry');user=result.data?.user;assertMarkedUser(user,email);}
  const confirmed=await admin.auth.admin.getUserById(user.id);if(confirmed.error)throw new Error('QA Auth identity readback failed');assertMarkedUser(confirmed.data?.user,email);user=confirmed.data.user;
  if(isActor&&existed){await stage('actor-credential-install');const update=await admin.auth.admin.updateUserById(user.id,{password});if(update.error)throw new Error('Marked QA actor credential installation failed');}
  await stage(isActor?'actor-auth':'target-auth','read-back',{id:user.id});return user;
 }
 try {
 const actor=await account(QA_ACTOR_EMAIL,'reels_qa',true),target=await account(QA_TARGET_EMAIL,'reels_qa_target',false);assert.notEqual(actor.id,target.id);journal.actorId=actor.id;journal.followTargetId=target.id;journal.markedQAAccounts={actor:true,target:true};
 await stage('actor-signin');
 const signIn=await actorClient.auth.signInWithPassword({email:QA_ACTOR_EMAIL,password});if(signIn.error||signIn.data?.user?.id!==actor.id)throw new Error('Designated QA actor sign-in failed');assertMarkedUser(signIn.data.user,QA_ACTOR_EMAIL);await stage('actor-signin','read-back');await stage('profile-read');
 const profile=await checked(actorClient.from('profiles').select('id,created_at,username').eq('id',actor.id).maybeSingle());assert.equal(profile?.id,actor.id);assert.equal(profile.username,'reels_qa','Actual Auth producer must create the configured QA profile route');const targetProfile=await checked(actorClient.from('profiles').select('id,username').eq('id',target.id).maybeSingle());assert.equal(targetProfile?.id,target.id);assert.equal(targetProfile.username,'reels_qa_target');assert.ok(Number.isFinite(Date.parse(profile.created_at)),'QA profile age must be authoritative');
 await stage('profile-read','read-back');
 const objectPath=`reels/${actor.id}/qa-reels.mp4`,videoUrl=`${AUTH_ORIGIN}/storage/v1/object/public/social-media/${objectPath}`;
 await stage('native-storage-read');let stored=await readObject(videoUrl);await stage('native-storage-read','read-back',{exists:stored!==null});
 if(stored===null){await stage('native-storage');const uploaded=await actorClient.storage.from('social-media').upload(objectPath,bytes,{contentType:'video/mp4',cacheControl:'3600',upsert:false});if(uploaded.error)throw new Error('QA storage upload acknowledgement failed; read back the exact object before retry');stored=await readObject(videoUrl);}
 assert.ok(stored,'QA native Storage readback is unavailable');if(hash(stored)!==mediaProof.sha256){assert.ok(priorReceipt,'Existing QA Storage bytes cannot be overwritten or relabeled without the exact prior receipt');assertPriorMediaReceipt(priorReceipt,actor.id,objectPath);assert.equal(hash(stored),priorReceipt.mediaProof.sha256);assert.equal(typeof validateStoredMedia,'function');const retained=await validateStoredMedia(stored);assert.deepEqual(retained,priorReceipt.mediaProof);mediaProof=retained;journal.mediaProof=retained;journal.reusedOriginalReceipt=priorReceipt.operationId;}assert.equal(hash(stored),mediaProof.sha256,'Existing QA Storage bytes cannot be overwritten or relabeled');await stage('native-storage','read-back',{objectPath});
 const postId=fixtureUUID(actor.id,'original-post-v1');journal.postId=postId;
 const postPayload={id:postId,author_id:actor.id,content:'Reels QA',content_type:'video',media_urls:[videoUrl],visibility:'private',audience_mode:'only_me',is_deleted:false,is_flagged:false,origin_type:'user_upload',playback_type:'native',rights_status:'user_authorized',topic:'poker',topics:['poker'],disclosure_kind:'generated',metadata:{reels_qualification_fixture:true,purpose:QA_PURPOSE,media_sha256:mediaProof.sha256}};
 await stage('source-post-read');
 const postFields='id,author_id,visibility,audience_mode,media_urls,original_media_url,transcode_status,playback_type,rights_status';
 let post=await checked(actorClient.from('social_posts').select(postFields).eq('id',postId).maybeSingle());
 if(!post){await stage('private-source-post');await checked(actorClient.from('social_posts').insert(postPayload));post=await checked(actorClient.from('social_posts').select(postFields).eq('id',postId).maybeSingle());}
 const marker=await checked(admin.from('social_posts').select('id,author_id,metadata,origin_type').eq('id',postId).eq('author_id',actor.id).maybeSingle());assert.equal(marker?.id,postId);assert.equal(marker.author_id,actor.id);assert.equal(marker.origin_type,'user_upload');
 assert.equal(post?.author_id,actor.id);assert.equal(post.visibility,'private');assert.equal(post.audience_mode,'only_me');assert.equal(marker.metadata?.reels_qualification_fixture,true);assert.equal(marker.metadata?.purpose,QA_PURPOSE);assert.equal(marker.metadata?.media_sha256,mediaProof.sha256);assert.equal(post.original_media_url||post.media_urls?.[0],videoUrl);if(post.media_urls?.[0]!==videoUrl){assert.equal(post.transcode_status,'done');assertOwnedFixtureOutput(post.media_urls[0],actor.id);}assert.equal(post.playback_type,'native');assert.equal(post.rights_status,'user_authorized');await stage('private-source-post','read-back',{id:postId});
 // The maintained source-post trigger normally creates this private mirror.
 let reel=await checked(actorClient.from('social_reels').select('id,author_id,is_public,is_deleted,media_status,playback_type,rights_status,caption,video_url,source_post_id,disclosure_kind,native_processing_requested,source_asset_id,youtube_video_id,canonical_asset_key').eq('source_post_id',postId).maybeSingle());
 if(!reel){const id=fixtureUUID(actor.id,'original-reel-v1');await stage('private-reel');await checked(actorClient.from('social_reels').insert({id,author_id:actor.id,source_post_id:postId,video_url:videoUrl,caption:'[reels-test-fixture:original-v1]',is_public:false,is_deleted:false,source_type:'native',media_status:'ready',origin_type:'social_post',playback_type:'native',rights_status:'user_authorized',topic:'poker',native_processing_requested:false,disclosure_kind:'generated'}));reel=await checked(actorClient.from('social_reels').select('id,author_id,is_public,is_deleted,media_status,playback_type,rights_status,caption,video_url,source_post_id,disclosure_kind,native_processing_requested,source_asset_id,youtube_video_id,canonical_asset_key').eq('id',id).maybeSingle());}
 assert.equal(reel?.author_id,actor.id);assert.equal(reel.is_public,false);assert.equal(reel.source_post_id,postId);if(reel.video_url!==videoUrl)assertOwnedFixtureOutput(reel.video_url,actor.id);assert.equal(reel.is_deleted,false);
 if(reel.caption!=='[reels-test-fixture:original-v1]'||reel.disclosure_kind!=='generated'){await stage('private-reel-description');await checked(actorClient.from('social_reels').update({caption:'[reels-test-fixture:original-v1]',disclosure_kind:'generated'}).eq('id',reel.id).eq('author_id',actor.id).eq('is_public',false));reel=await checked(actorClient.from('social_reels').select('id,author_id,is_public,is_deleted,media_status,playback_type,rights_status,caption,video_url,source_post_id,disclosure_kind,native_processing_requested,source_asset_id,youtube_video_id,canonical_asset_key').eq('id',reel.id).maybeSingle());}
 assert.equal(reel.caption,'[reels-test-fixture:original-v1]');assert.equal(reel.media_status,'ready');assert.equal(reel.playback_type,'native');assert.equal(reel.rights_status,'user_authorized');assert.equal(reel.native_processing_requested,false);assert.equal(reel.source_asset_id,null);assert.equal(reel.youtube_video_id,null);assert.ok(reel.canonical_asset_key?.startsWith('native:'));assert.equal(reel.is_public,false);journal.reelId=reel.id;
 await stage('private-reel','read-back',{id:reel.id});journal.profileCreatedAt=profile.created_at;journal.actorCreatedAt=actor.created_at;journal.freshAccountRewardAgeBlocked=Date.now()-Date.parse(profile.created_at)<24*60*60*1000;
 journal.status='fixture-prepared-not-certified';journal.completedAt=new Date().toISOString();journal.retainedFixtures=true;journal.limitations=['This creates only private qualification data; it is not interaction or browser proof','Synthetic QA media is an original test artifact, not public player content','Auth users, private content, Storage object and any future immutable rewards are retained as explicit QA fixtures'];await persist(journal);return journal;
 } catch(error) {journal.status='failed';journal.failure={stage:journal.stages.at(-1)?.name||'account-inventory',code:error?.code==='ERR_ASSERTION'?'ASSERTION':['42501','23505','23514','22P02','PGRST116'].includes(error?.code)?error.code:'OPERATION_REFUSED',category:'qualification-operation-refused'};await persist(journal);throw error;}
}
export function assertPriorMediaReceipt(receipt,actorId,objectPath){
 assert.equal(receipt?.kind,'reels-qa-fixture-setup');assert.equal(receipt.purpose,QA_PURPOSE);assert.match(receipt.operationId,/^[a-f0-9-]{36}$/i);assert.ok(receipt.stages?.some(s=>s.name==='actor-auth'&&s.state==='read-back'&&s.id===actorId));assert.ok(receipt.stages?.some(s=>s.name==='native-storage'&&s.state==='read-back'&&s.objectPath===objectPath));assert.match(receipt.mediaProof?.sha256,/^[a-f0-9]{64}$/);assert.ok(receipt.mediaProof.bytes>32&&receipt.mediaProof.bytes<=2*1024*1024);
}
function assertOwnedFixtureOutput(value,actor){const u=new URL(value);assert.equal(u.origin,AUTH_ORIGIN);assert.equal(u.search,'');assert.equal(u.hash,'');assert.equal(u.username,'');assert.equal(u.password,'');assert.match(u.pathname,new RegExp(`^/storage/v1/object/public/social-media/videos/${actor}/native-[a-f0-9-]+-[a-f0-9-]+\\.mp4$`));}
export async function isMissingQAObject(response) {
 if(response.status===404)return true;if(response.status!==400)return false;
 const reader=response.body?.getReader();if(!reader)return false;const chunks=[];let size=0;
 try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024){await reader.cancel();return false;}chunks.push(Buffer.from(value));}} finally {reader.releaseLock();}
 let failure;try{failure=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return false;}
 return failure?.statusCode==='404'&&failure?.code==='NoSuchKey'&&failure?.error==='not_found';
}
function allowedPath(path,env) {const value=resolve(path);return /^\/Volumes\/Smarter(?:Work\/agent-work|Archives\/agent-evidence)\//.test(value)||(env.GITHUB_ACTIONS==='true'&&env.GITHUB_WORKSPACE?.startsWith('/')&&value.startsWith(`${resolve(env.GITHUB_WORKSPACE)}/`));}
async function main(){
 const env=process.env;for(const key of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','REELS_QA_PASSWORD','REELS_QA_VIDEO_FILE','REELS_QA_SETUP_RECEIPT'])assert.ok(env[key]?.trim(),`${key} is required`);assert.equal(env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/,''),AUTH_ORIGIN);for(const key of ['REELS_QA_VIDEO_FILE','REELS_QA_SETUP_RECEIPT'])assert.ok(allowedPath(env[key],env),'QA media and evidence must use the assigned SSD or hosted workspace');
 const bytes=await readFile(env.REELS_QA_VIDEO_FILE);const inspected=await promisify(execFile)('ffprobe',['-v','error','-show_streams','-show_format','-of','json',env.REELS_QA_VIDEO_FILE],{timeout:15000,maxBuffer:256*1024});const mediaProof=validateMediaProof(bytes,JSON.parse(inspected.stdout));
 const {createClient}=await import('@supabase/supabase-js');const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,init={})=>fetch(url,{...init,signal:init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)})}};
 const admin=createClient(AUTH_ORIGIN,env.SUPABASE_SERVICE_ROLE_KEY,options),actorClient=createClient(AUTH_ORIGIN,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
 const readObject=async url=>{const response=await fetch(url,{signal:AbortSignal.timeout(15000)});if(await isMissingQAObject(response))return null;assert.ok(response.ok,'QA Storage readback refused');assert.ok(Number(response.headers.get('content-length')||0)<=2*1024*1024);const reader=response.body.getReader(),chunks=[];let total=0;for(;;){const{done,value}=await reader.read();if(done)break;total+=value.length;if(total>2*1024*1024){await reader.cancel();throw new Error('QA Storage readback exceeded its finite byte limit');}chunks.push(Buffer.from(value));}return Buffer.concat(chunks);};
 let priorReceipt=null;if(env.REELS_QA_PRIOR_SETUP_RECEIPT){assert.ok(allowedPath(env.REELS_QA_PRIOR_SETUP_RECEIPT,env));priorReceipt=JSON.parse(await readFile(env.REELS_QA_PRIOR_SETUP_RECEIPT,'utf8'));}
 const validateStoredMedia=async stored=>{const retainedPath=resolve(env.REELS_QA_VIDEO_FILE)+'.retained-'+randomUUID()+'.mp4';try{await writeFile(retainedPath,stored,{flag:'wx',mode:0o600});const proof=await promisify(execFile)('ffprobe',['-v','error','-show_streams','-show_format','-of','json',retainedPath],{timeout:15000,maxBuffer:256*1024});return validateMediaProof(stored,JSON.parse(proof.stdout));}finally{await unlink(retainedPath).catch(()=>{});}};
 const result=await setupQAFixture({admin,actorClient,priorReceipt,validateStoredMedia,password:env.REELS_QA_PASSWORD,bytes,mediaProof,readObject,persist:value=>writeFile(env.REELS_QA_SETUP_RECEIPT,JSON.stringify(value,null,2),{mode:0o600})});console.log(JSON.stringify({status:result.status,actorId:result.actorId,followTargetId:result.followTargetId,reelId:result.reelId,postId:result.postId,profileCreatedAt:result.profileCreatedAt,freshAccountRewardAgeBlocked:result.freshAccountRewardAgeBlocked,mediaProof:result.mediaProof,retainedFixtures:true}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('QA fixture setup did not complete. Recover its exact receipt and provider identities before retrying; no private credential is logged.');process.exitCode=1;});
