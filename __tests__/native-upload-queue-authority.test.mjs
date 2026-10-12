import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const owner='11111111-1111-4111-8111-111111111111';const post='22222222-2222-4222-8222-222222222222';
const origin='https://kuklfnapbkmacvwxktbh.supabase.co';const url=`${origin}/storage/v1/object/public/social-media/videos/${owner}/one.mp4`;
const raw=await readFile(new URL('../pages/api/video/transcode.js',import.meta.url),'utf8');
const source=raw.replace(/import \{ createClient \}[^;]+;/,'const createClient = () => globalThis.__nativeQueueFixture.client;').replace(/import \{ requireAuth \}[^;]+;/,'const requireAuth = async () => ({id:globalThis.__nativeQueueFixture.owner});').replace(/import \{ reportApiError \}[^;]+;/,'const reportApiError = () => {};');
const {default:handler,isOwnedNativeUploadUrl}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('native source URL must belong to exact configured origin and authenticated upload path',()=>{
 assert.equal(isOwnedNativeUploadUrl(url,owner,origin),true);
 for(const bad of [url.replace('supabase.co','supabase.co.evil.test'),url+'?token=x',url.replace(owner,post),url.replace('/one.mp4','/nested/one.mp4'),url.replace('https:','http:')])assert.equal(isOwnedNativeUploadUrl(bad,owner,origin),false);
});
test('native queue acknowledges actual authoritative outcome and fails truthfully',async()=>{
 const old=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.NEXT_PUBLIC_SUPABASE_URL=origin;process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-local-only';
 const call=async result=>{let response;globalThis.__nativeQueueFixture={owner,client:{from:table=>table==='social_posts'?{select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:post,author_id:owner}})}:{insert:async()=>result},rpc:async(name,params)=>{assert.equal(name,'queue_owned_native_upload');assert.equal(params.p_actor,owner);return result;}}};const res={status(code){this.code=code;return this;},json(body){response={code:this.code,body};}};await handler({method:'POST',body:{videoUrl:url,postId:post}},res);return response;};
 try{
 assert.equal((await call({error:{code:'XX000'}})).code,503);
 assert.equal((await call({data:null})).body.success,false);
 assert.equal((await call({data:{jobId:'native:'+post,status:'queued',reused:true}})).body.reused,true);
 assert.equal((await call({error:{code:'42501'}})).code,403);
 }finally{delete globalThis.__nativeQueueFixture;if(old===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=old;if(key===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=key;}
});


test('native status observes owned post worker outcomes without fabricated intermediate progress',async()=>{
 const rawStatus=await readFile(new URL('../pages/api/video/transcode-status.js',import.meta.url),'utf8');
 const statusSource=rawStatus.replace(/import \{ createClient \}[^;]+;/,'const createClient = () => globalThis.__nativeStatusFixture.client;').replace(/import \{ requireAuth \}[^;]+;/,'const requireAuth = async () => ({id:globalThis.__nativeStatusFixture.owner});');
 const {default:statusHandler}=await import(`data:text/javascript;base64,${Buffer.from(statusSource).toString('base64')}`);
 const old=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.SUPABASE_SERVICE_ROLE_KEY;process.env.NEXT_PUBLIC_SUPABASE_URL=origin;process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-local-only';
 const call=async result=>{let response;const filters=[];const query={select(){return this;},eq(k,v){filters.push([k,v]);return this;},maybeSingle:async()=>result};globalThis.__nativeStatusFixture={owner,client:{from:table=>{assert.equal(table,'social_posts');return query;}}};const res={status(code){this.code=code;return this;},json(body){response={code:this.code,body};}};await statusHandler({method:'GET',query:{postId:post}},res);assert.ok(filters.some(([k,v])=>k==='author_id'&&v===owner));return response;};
 try{
 const running=await call({data:{id:post,transcode_status:'running',media_urls:[url]}});assert.equal(running.body.job.status,'processing');assert.equal(running.body.job.progress,null);
 assert.equal((await call({data:{id:post,transcode_status:'done',media_urls:[url]}})).body.job.output_url,url);
 assert.equal((await call({data:null})).code,404);assert.equal((await call({error:{code:'XX000'}})).code,503);
 }finally{delete globalThis.__nativeStatusFixture;if(old===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=old;if(key===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=key;}
});
