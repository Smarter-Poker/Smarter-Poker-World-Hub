import test from 'node:test';import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {nativeSourceForPost,processNativePost,downloadNativeSource,nativeEncodingArguments} from '../scripts/transcode-worker/index.js';
const origin='https://kuklfnapbkmacvwxktbh.supabase.co';
const id='22222222-2222-4222-8222-222222222222';const author='11111111-1111-4111-8111-111111111111';
const source=`${origin}/storage/v1/object/public/social-media/reels/${author}/source.mov`;
const initial=()=>({id,author_id:author,is_deleted:false,playback_type:'native',rights_status:'user_authorized',transcode_status:'queued',media_urls:[source],original_media_url:source,metadata:{native_reels_worker:'sp-transcode'}});
test('worker never fetches external, other-owner, embed-only, deleted or unmarked sources',async()=>{
 for(const change of [{rights_status:'embed_only'},{is_deleted:true},{metadata:{}},{original_media_url:'https://evil.test/video.mov',media_urls:['https://evil.test/video.mov']},{author_id:id}]){
  let calls=0;const result=await processNativePost({...initial(),...change},{origin,claim:()=>{calls++;}});assert.equal(result.state,'denied');assert.equal(calls,0);
 }
 assert.equal(nativeSourceForPost(initial(),origin),source);
});
function fixture(changes={}){
 let row=initial();const calls=[];
 const dependencies={origin,claim:async()=>{row={...row,transcode_status:'running'};return row;},read:async()=>row,
 download:async()=>calls.push('download'),render:async()=>calls.push('render'),upload:async()=>{calls.push('upload');return{url:'owned-output',path:'owned-artifact'};},
 publish:async()=>{calls.push('publish');return{completed:true,postId:id};},discard:async()=>calls.push('discard'),...changes};
 return{dependencies,calls,update:change=>row={...row,...change}};
}
test('revocation before upload prevents media publication and zero-row acknowledgment never succeeds',async()=>{
 const f=fixture();f.dependencies.render=async()=>f.update({rights_status:'embed_only'});
 assert.equal((await processNativePost(initial(),f.dependencies)).state,'revoked');assert.deepEqual(f.calls,['download']);
 const missing=fixture({publish:async()=>({completed:false})});await assert.rejects(()=>processNativePost(initial(),missing.dependencies),error=>error.code==='NATIVE_PUBLISH_UNKNOWN');assert.equal(missing.calls.includes('discard'),false);
});
test('unknown publish acknowledgment reads durable state before deleting bytes',async()=>{
 const f=fixture();f.dependencies.publish=async()=>{f.update({transcode_status:'done',media_urls:['owned-output']});throw new Error('timeout');};
 const result=await processNativePost(initial(),f.dependencies);assert.equal(result.state,'done');assert.equal(result.recoveredAcknowledgment,true);assert.equal(f.calls.includes('discard'),false);
 const refused=fixture({publish:async()=>{const error=new Error('revoked');error.definitiveRejection=true;throw error;}});
 await assert.rejects(()=>processNativePost(initial(),refused.dependencies),/revoked/);assert.equal(refused.calls.includes('discard'),true);
});
test('streamed native download observes redirect denial, file-size rejection and finite deadline',async()=>{
 const base=new URL('../work/native-worker-test/',import.meta.url).pathname;await mkdir(base,{recursive:true});const dir=await mkdtemp(join(base,'run-'));const output=join(dir,'source');
 try{
  await downloadNativeSource(source,output,{fetchImpl:async(url,options)=>{assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');return new Response(new Uint8Array([1,2,3]));}});
  assert.equal((await readFile(output)).length,3);
  await assert.rejects(()=>downloadNativeSource(source,output,{fetchImpl:async()=>new Response('',{headers:{'content-length':'500000001'}})}),/rejected/);
  await assert.rejects(()=>downloadNativeSource(source,output,{timeoutMs:10,fetchImpl:async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('deadline')),{once:true}))}),/deadline/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('scheduled cron excludes the protected native owner at queue, recovery, claim and publication',async()=>{
 const cron=await readFile(new URL('../pages/api/cron/transcode-videos.js',import.meta.url),'utf8');
 assert.match(cron,/metadata->>native_reels_worker\.is\.null,metadata->>native_reels_worker\.neq\.sp-transcode/);
 assert.match(cron,/eq\('transcode_status', 'running'\)\.or\(NATIVE_WORKER_EXCLUSION\)/);
 assert.match(cron,/eq\('transcode_status', 'queued'\)\.or\(NATIVE_WORKER_EXCLUSION\)/);
 assert.match(cron,/post\.metadata\?\.native_reels_worker==='sp-transcode'/);
 assert.match(cron,/update\(updatePayload\)[^;]+or\(NATIVE_WORKER_EXCLUSION\)[^;]+select\('id'\)/);
 assert.match(cron,/if\(publishError \|\| !published\?\.length\) throw/);
});


test('native reencode bounds portrait and landscape long edges and browser-safe codec settings',()=>{
 const args=nativeEncodingArguments('/owned/input','/owned/output.mp4');
 const option=name=>args[args.indexOf(name)+1];
 assert.equal(option('-profile:v'),'main');assert.equal(option('-level'),'4.0');assert.equal(option('-pix_fmt'),'yuv420p');assert.equal(option('-c:a'),'aac');assert.equal(option('-b:a'),'128k');
 assert.match(option('-vf'),/min\(1920,trunc\(iw\/2\)\*2\)/);assert.match(option('-vf'),/min\(1920,trunc\(ih\/2\)\*2\)/);assert.match(option('-vf'),/if\(gt\(iw,ih\)/);assert.match(option('-vf'),/min\(1080,trunc\(iw\/2\)\*2\)/);assert.match(option('-vf'),/min\(1080,trunc\(ih\/2\)\*2\)/);assert.equal(option('-fpsmax'),'30');
 assert.equal(option('-movflags'),'+faststart');assert.equal(args.at(-1),'/owned/output.mp4');
});
