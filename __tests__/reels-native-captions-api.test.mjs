import test from 'node:test';import assert from 'node:assert/strict';import {createRequire}from'node:module';import{readFileSync}from'node:fs';import * as captions from '../src/lib/reelNativeCaptions.mjs';
const require=createRequire(import.meta.url),ts=require('typescript');
const id='22222222-2222-4222-8222-222222222222',author='11111111-1111-4111-8111-111111111111';
const text='WEBVTT\n\n00:00.000 --> 00:01.000\nOriginal test tone\n';
const base='https://kuklfnapbkmacvwxktbh.supabase.co';
function fixture({actor=author,privateRow=false,deleted=false,uploadFails=false,race=false,duplicate=false}={}){
 const calls=[];const row={id,author_id:author,is_public:!privateRow,is_deleted:deleted,playback_type:'native',rights_status:'user_authorized',media_status:'ready',moderation_state:'active',taken_down_at:null,caption_track_url:null};
 const bucket={async upload(path,bytes){calls.push(['upload',path,bytes.toString()]);return uploadFails||duplicate?{error:new Error('uploadfailed')}:{data:{path}};},async list(_path,options){calls.push(['list']);return{data:duplicate?[{name:options.search,metadata:{size:text.length}}]:[]};},async download(){calls.push(['download']);return duplicate?{data:new Blob([text])}:{error:new Error('notfound')};},getPublicUrl(path){return{data:{publicUrl:`${base}/storage/v1/object/public/social-media/${path}`}};}};
 const client={storage:{from:()=>bucket},from(){let updated;const q={select(){return q;},eq(){return q;},is(){return q;},update(value){updated=value;calls.push(['update',value]);return q;},async maybeSingle(){return{data:updated?(race?null:{id,...updated}):row};}};return q;}};
 const deps={'node:crypto':require('node:crypto'),'../../../src/lib/supabaseServerClient':{createClient:()=>client},'../../../src/lib/serverAuth':{getServerUserWithFallback:async()=>({user:actor?{id:actor}:null})},'../../../src/lib/apiRateLimit':{applyRateLimit:()=>true,LIMITS:{read:{},write:{}}},'../../../src/lib/server/reelsFeed':{readPublicReelById:async()=>({data:privateRow?null:row})},'../../../src/lib/reelNativeCaptions.mjs':captions};
 const module={exports:{}};const source=ts.transpileModule(readFileSync(new URL('../pages/api/reels/captions.js',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',source)(name=>deps[name],module,module.exports);
 return {calls,async invoke(method='POST',auth=true){let status,body;const req={method,headers:auth?{authorization:'Bearer fixture-only'}:{},body:{id,text},query:{id}};const res={setHeader(){},status(code){status=code;return res;},json(value){body=value;return res;}};await module.exports.default(req,res);return{status,body};}};
}
test('creator API confirms upload before metadata, validates author, and refuses changed rows',async()=>{
 const previous=process.env.NEXT_PUBLIC_SUPABASE_URL;process.env.NEXT_PUBLIC_SUPABASE_URL=base;
 try{
 const success=fixture();assert.equal((await success.invoke()).status,200);assert.deepEqual(success.calls.map(c=>c[0]),['upload','update']);
 const duplicate=fixture({duplicate:true});assert.equal((await duplicate.invoke()).status,200);assert.deepEqual(duplicate.calls.map(c=>c[0]),['upload','list','download','update']);
 const foreign=fixture({actor:id});assert.equal((await foreign.invoke()).status,403);assert.equal(foreign.calls.length,0);
 const signedout=fixture({actor:null});assert.equal((await signedout.invoke()).status,401);assert.equal(signedout.calls.length,0);
 const failed=fixture({uploadFails:true});assert.equal((await failed.invoke()).status,503);assert.equal(failed.calls.some(c=>c[0]==='update'),false);
 assert.equal((await fixture({race:true}).invoke()).status,409);
 assert.equal((await fixture({privateRow:true,actor:null}).invoke('GET',false)).status,404);
 assert.equal((await fixture({deleted:true}).invoke('GET')).status,404);
 assert.equal((await fixture({privateRow:true}).invoke('GET')).status,200);
 }finally{if(previous===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=previous;}
});
