import test from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {isMissingQAObject,QA_ACTOR_EMAIL,QA_TARGET_EMAIL,QA_PURPOSE,assertMarkedUser,fixtureUUID,findQAUser,validateMediaProof,setupQAFixture} from '../scripts/ci/reels-qa-fixture-setup.mjs';
const actor='00000000-0000-4000-8000-000000000001',target='00000000-0000-4000-8000-000000000002';
const marker={reels_qualification_fixture:true,purpose:QA_PURPOSE};const marked=(id,email)=>({id,email,app_metadata:{...marker},created_at:new Date().toISOString()});
const bytes=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftyp'),Buffer.alloc(64)]);
const codec={streams:[{codec_type:'video',codec_name:'h264',width:180,height:320,pix_fmt:'yuv420p'}],format:{duration:'4.0'}};
test('only the two explicitly named, metadata-marked QA Auth users can be reused',()=>{
 assertMarkedUser(marked(actor,QA_ACTOR_EMAIL),QA_ACTOR_EMAIL);for(const user of [{...marked(actor,QA_ACTOR_EMAIL),app_metadata:{}},{...marked(actor,QA_ACTOR_EMAIL),email:'owner@example.invalid'},{...marked(actor,QA_ACTOR_EMAIL),app_metadata:{...marker,purpose:'other'}}])assert.throws(()=>assertMarkedUser(user,QA_ACTOR_EMAIL));
});
test('bounded Auth inventory cannot treat a non-terminal scan or transport error as absence',async()=>{
 const full={auth:{admin:{listUsers:async()=>({data:{users:[marked(actor,'different@example.invalid')]},error:null})}}};await assert.rejects(()=>findQAUser(full,QA_ACTOR_EMAIL,{maxPages:2,perPage:1}),/absence is unknown/);
 await assert.rejects(()=>findQAUser({auth:{admin:{listUsers:async()=>({error:{}})}}},QA_ACTOR_EMAIL),/unavailable/);
 assert.equal(await findQAUser({auth:{admin:{listUsers:async()=>({error:null,data:{users:[]}})}}},QA_ACTOR_EMAIL),null);
});
test('stable owner-bound fixture IDs prevent duplicated source rows on interruption',()=>{
 assert.equal(fixtureUUID(actor,'original-post-v1'),fixtureUUID(actor,'original-post-v1'));assert.notEqual(fixtureUUID(actor,'original-post-v1'),fixtureUUID(target,'original-post-v1'));assert.match(fixtureUUID(actor,'original-post-v1'),/^[a-f0-9-]{36}$/);
});
test('ready native QA media requires actual bounded MP4 bytes and decoded H264 portrait proof',()=>{
 const proof=validateMediaProof(bytes,codec);assert.equal(proof.sha256,createHash('sha256').update(bytes).digest('hex'));
 for(const patch of [{streams:[]},{streams:[{...codec.streams[0],codec_name:'hevc'}]},{format:{duration:'999'}},{streams:[{...codec.streams[0],width:1000}]}])assert.throws(()=>validateMediaProof(bytes,{...codec,...patch}));assert.throws(()=>validateMediaProof(Buffer.alloc(100),codec));
});
function fixture({unmarked=false,existing=false,wrongBytes=false}={}) {
 const users=existing?[marked(actor,QA_ACTOR_EMAIL),marked(target,QA_TARGET_EMAIL)]:[],calls=[],receipts=[],tables={social_posts:[],social_reels:[]};let storage=null;
 if(unmarked)users.push({...marked(actor,QA_ACTOR_EMAIL),app_metadata:{}});
 const admin={auth:{admin:{listUsers:async()=>({error:null,data:{users}}),getUserById:async id=>({error:null,data:{user:users.find(user=>user.id===id)}}),createUser:async values=>{calls.push({adminCreate:values});const user=marked(values.email===QA_ACTOR_EMAIL?actor:target,values.email);users.push(user);return{error:null,data:{user}};},updateUserById:async(id,values)=>{calls.push({adminCredential:id,values});return{error:null};}}}};
 const createdAt=new Date().toISOString();
 const actorClient={auth:{signInWithPassword:async()=>({error:null,data:{user:marked(actor,QA_ACTOR_EMAIL)}})},storage:{from:bucket=>({upload:async(path,value,options)=>{calls.push({upload:{bucket,path,options}});storage=Buffer.from(value);return{error:null};}})},from(table){let filters={},operation='select',payload;const q={select:()=>q,eq:(key,value)=>{filters[key]=value;return q;},maybeSingle:()=>q,insert:value=>{operation='insert';payload=value;return q;},update:value=>{operation='update';payload=value;return q;},then(resolve,reject){
  const match=row=>Object.entries(filters).every(([key,value])=>row[key]===value);
  if(operation==='insert'){calls.push({actorInsert:{table,payload}});tables[table].push({...payload});if(table==='social_posts')tables.social_reels.push({id:fixtureUUID(actor,'mirror'),author_id:actor,source_post_id:payload.id,video_url:payload.media_urls[0],caption:payload.content,is_public:false,is_deleted:false,media_status:'ready',playback_type:'native',rights_status:'user_authorized',native_processing_requested:false,source_asset_id:null,youtube_video_id:null,canonical_asset_key:'native:real',disclosure_kind:'organic'});}
  if(operation==='update'){calls.push({actorUpdate:{table,payload}});for(const row of tables[table].filter(match))Object.assign(row,payload);}
  const data=table==='profiles'?{id:filters.id,created_at:createdAt,username:filters.id===actor?'reels_qa':'reels_qa_target'}:tables[table].find(match)||null;return Promise.resolve({error:null,data}).then(resolve,reject);
 }};return q;}};
 admin.from=table=>actorClient.from(table);
 return{admin,actorClient,calls,tables,users,receipts,password:'dedicated-test-password-only-32chars',bytes,mediaProof:validateMediaProof(bytes,codec),readObject:async()=>storage?(wrongBytes?Buffer.alloc(80):storage):null,persist:async value=>receipts.push(structuredClone(value))};
}
test('setup isolates confirmed no-email Auth fixtures and private native content through actor RLS',async()=>{
 const f=fixture();const result=await setupQAFixture(f);assert.equal(result.status,'fixture-prepared-not-certified');assert.equal(result.actorId,actor);assert.equal(result.followTargetId,target);assert.equal(result.freshAccountRewardAgeBlocked,true);
 const creates=f.calls.filter(call=>call.adminCreate);assert.equal(creates.length,2);for(const call of creates){assert.equal(call.adminCreate.email_confirm,true);assert.equal(call.adminCreate.user_metadata.poker_alias,call.adminCreate.email===QA_ACTOR_EMAIL?'reels_qa':'reels_qa_target');assert.deepEqual(call.adminCreate.app_metadata,marker);assert.equal(Object.hasOwn(call.adminCreate,'invite'),false);}
 assert.equal(f.calls.find(call=>call.upload).upload.options.upsert,false);assert.equal(f.calls.find(call=>call.upload).upload.path,`reels/${actor}/qa-reels.mp4`);
 assert.equal(f.tables.social_posts[0].visibility,'private');assert.equal(f.tables.social_posts[0].audience_mode,'only_me');assert.ok(f.tables.social_posts[0].content.length<20);assert.equal(f.tables.social_reels[0].is_public,false);assert.equal(f.tables.social_reels.length,1,'the existing private source mirror is reused');
 assert.equal(JSON.stringify(f.receipts).includes(f.password),false);assert.equal(f.receipts[0].stages[0].state,'requested');
});
test('pre-existing unmarked Auth identities fail before any password, Storage or content mutation',async()=>{
 const f=fixture({unmarked:true});await assert.rejects(()=>setupQAFixture(f),/non-fixture/);assert.equal(f.calls.length,0);
});
test('marked fixture reuse never creates another Auth account',async()=>{
 const f=fixture({existing:true});await setupQAFixture(f);assert.equal(f.calls.filter(call=>call.adminCreate).length,0);assert.equal(f.calls.filter(call=>call.adminCredential).length,1);
});
test('Storage bytes must be read back exactly before any native ready content is created',async()=>{
 const f=fixture({wrongBytes:true});await assert.rejects(()=>setupQAFixture(f),/overwritten or relabeled/);assert.equal(f.calls.filter(call=>call.actorInsert).length,0);
});

test('actual Storage HTTP400 NoSuchKey body is absence; other failures remain refused',async()=>{
 const missing={statusCode:'404',code:'NoSuchKey',error:'not_found'};assert.equal(await isMissingQAObject(new Response(JSON.stringify(missing),{status:400})),true);
 for(const [status,body] of [[400,{error:'bad_request'}],[403,missing],[400,{...missing,statusCode:'400'}],[400,'x'.repeat(1025)]])assert.equal(await isMissingQAObject(new Response(typeof body==='string'?body:JSON.stringify(body),{status})),false);
 await assert.rejects(()=>isMissingQAObject({status:400,body:new ReadableStream({start(c){c.error(new Error('timeout'));}})}),/timeout/);
});
test('failed signin and profile read retain sanitized exact stage without secrets',async()=>{
 for(const phase of ['actor-signin','profile-read']){const f=fixture();if(phase==='actor-signin')f.actorClient.auth.signInWithPassword=async()=>({error:{message:f.password},data:{}});else f.actorClient.from=()=>({select(){return this;},eq(){return this;},maybeSingle(){return Promise.resolve({error:{code:'42501',message:f.password}});}});
 await assert.rejects(()=>setupQAFixture(f));const last=f.receipts.at(-1);assert.equal(last.status,'failed');assert.equal(last.failure.stage,phase);if(phase==='profile-read')assert.equal(last.failure.code,'42501');assert.equal(JSON.stringify(f.receipts).includes(f.password),false);assert.equal(f.calls.filter(x=>x.upload||x.actorInsert).length,0);}
});

test('actor post read excludes withheld metadata columns; exact admin read validates fixture marker',async()=>{
 const f=fixture();const original=f.actorClient.from;const selected=[];f.actorClient.from=table=>{const q=original.call(f.actorClient,table);const select=q.select;q.select=fields=>{if(table==='social_posts'){selected.push(fields);assert.notEqual(fields,'*');assert.equal(fields.includes('metadata'),false);assert.equal(fields.includes('origin_type'),false);}return select.call(q,fields);};return q;};f.admin.from=table=>original.call(f.actorClient,table);
 await setupQAFixture(f);assert.ok(selected.length>=2);assert.ok(f.receipts.some(r=>r.stages.some(s=>s.name==='source-post-read')));
});
test('retained original requires exact prior receipt and decoded stored media proof, without upload',async()=>{
 const f=fixture({existing:true});const retained=Buffer.from(bytes);retained[retained.length-1]=1;const proof=validateMediaProof(retained,codec);f.readObject=async()=>retained;f.priorReceipt={kind:'reels-qa-fixture-setup',operationId:'00000000-0000-4000-8000-000000000004',purpose:QA_PURPOSE,mediaProof:proof,stages:[{name:'actor-auth',state:'read-back',id:actor},{name:'native-storage',state:'read-back',objectPath:`reels/${actor}/qa-reels.mp4`}]};f.validateStoredMedia=async stored=>validateMediaProof(stored,codec);const result=await setupQAFixture(f);assert.deepEqual(result.mediaProof,proof);assert.equal(f.calls.filter(c=>c.upload).length,0);assert.equal(f.tables.social_posts[0].metadata.media_sha256,proof.sha256);
 const bad=fixture({existing:true});bad.readObject=async()=>retained;bad.priorReceipt={...f.priorReceipt,mediaProof:{...proof,sha256:'0'.repeat(64)}};bad.validateStoredMedia=f.validateStoredMedia;await assert.rejects(()=>setupQAFixture(bad));assert.equal(bad.calls.filter(c=>c.upload||c.actorInsert).length,0);
});
test('all three QA scripts select explicit allowed Reel fields rather than withheld columns',async()=>{
 const {readFile}=await import('node:fs/promises');for(const file of ['reels-qa-fixture-setup.mjs','reels-interaction-live-check.mjs','reels-enhancements-live-check.mjs']){const source=await readFile(new URL(`../scripts/ci/${file}`,import.meta.url),'utf8');assert.equal(/from\('social_reels'\)\.select\('\*'\)/.test(source),false,file);for(const match of source.matchAll(/from\('social_reels'\)\.select\('([^']+)'\)/g)){assert.equal(match[1].split(',').includes('origin_type'),false);assert.equal(match[1].split(',').includes('caption_track_url'),false);}}
});
