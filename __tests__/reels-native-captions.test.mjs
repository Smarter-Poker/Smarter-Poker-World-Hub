import test from 'node:test';import assert from 'node:assert/strict';
import {validateReelWebVTT,trustedReelCaptionUrl,uploadReelCaptionTrack} from '../src/lib/reelNativeCaptions.mjs';
const valid='WEBVTT\n\n00:00.000 --> 00:01.500\nOriginal test tone\n';
const author='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',storageUrl='https://kuklfnapbkmacvwxktbh.supabase.co';
const url=`${storageUrl}/storage/v1/object/public/social-media/reels/${author}/caption-${id}-${'a'.repeat(64)}.vtt`;
test('finite real WebVTT cues reject malformed timings oversized text and scripts',()=>{
 assert.equal(validateReelWebVTT(valid).cues,1);
 for(const text of ['fake',valid.replace('00:01.500','00:00.000'),valid.replace('00:01.500','99:99.999'),valid.replace('Original test tone','<script>alert(1)</script>'),valid+'a'.repeat(102401)])assert.throws(()=>validateReelWebVTT(text));
 assert.throws(()=>validateReelWebVTT(valid,{duration:1}));
});
test('track URLs accept only the actual canonical owner and Reel object',()=>{
 assert.equal(trustedReelCaptionUrl(url,{storageUrl,authorId:author,reelId:id}),url);
 for(const bad of [url.replace(author,id),url.replace(id,author),url+'?token=123',url.replace(storageUrl,'https://evil.example'),url.replace('caption-','../../caption-')])assert.equal(trustedReelCaptionUrl(bad,{storageUrl,authorId:author,reelId:id}),null);
});
test('creator upload requires authentication and verified returned URL',async()=>{
 await assert.rejects(uploadReelCaptionTrack({id,author_id:author},valid,{storageUrl}));
 const fetcher=async(_url,options)=>{assert.equal(options.method,'POST');assert.equal(JSON.parse(options.body).text,valid);return{ok:true,json:async()=>({success:true,url})};};
 assert.equal(await uploadReelCaptionTrack({id,author_id:author},valid,{storageUrl,accessToken:'test-only',fetcher}),url);
});
test('a present but unsafe caption URL is an error rather than false no-track success',async()=>{
 const {getReelCaptionTrack}=await import('../src/lib/reelNativeCaptions.mjs');
 const fetcher=async()=>({ok:true,json:async()=>({success:true,url:'https://evil.example/fake.vtt'})});
 await assert.rejects(getReelCaptionTrack({id,author_id:author},{storageUrl,fetcher}),/could not be verified/);
 await assert.rejects(uploadReelCaptionTrack({id,author_id:author},valid,{storageUrl,accessToken:'fixture',fetcher}),/could not be verified/);
});
