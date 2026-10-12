import test from 'node:test';import assert from 'node:assert/strict';
import {getOrCreateReelCommentAttempt,forgetReelCommentAttempt,shouldRestoreReelCommentDraft}from'../src/lib/reelCommentAttempts.mjs';
const owner='11111111-1111-4111-8111-111111111111',post='22222222-2222-4222-8222-222222222222';
test('unknown comment identity survives reload and account isolation without plaintext, confirmed attempts retire',async()=>{
 const values=new Map();globalThis.sessionStorage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 try{
 const payload={author_id:owner,post_id:post,content:'Private draft words'};
 const first=await getOrCreateReelCommentAttempt(payload);const second=await getOrCreateReelCommentAttempt({...payload});assert.equal(first.id,second.id);
 assert.equal([...values.values()].join('').includes(payload.content),false);
 assert.notEqual((await getOrCreateReelCommentAttempt({...payload,author_id:post})).id,first.id);
 forgetReelCommentAttempt(first);assert.notEqual((await getOrCreateReelCommentAttempt(payload)).id,first.id);
 assert.equal(shouldRestoreReelCommentDraft({text:'Newer draft'}),false);assert.equal(shouldRestoreReelCommentDraft({mediaUrl:'new.jpg'}),false);assert.equal(shouldRestoreReelCommentDraft({reply:{id:'new'}}),false);assert.equal(shouldRestoreReelCommentDraft({text:''}),true);
 }finally{delete globalThis.sessionStorage;}
});
test('attempt cache is bounded without evicting unknown identities; unavailable durable storage fails before write',async()=>{
 const values=new Map();globalThis.sessionStorage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 try{
 for(let i=0;i<32;i++)await getOrCreateReelCommentAttempt({author_id:owner,post_id:post,content:`draft-${i}`});
 await assert.rejects(getOrCreateReelCommentAttempt({author_id:owner,post_id:post,content:'one more'}));
 assert.ok((await getOrCreateReelCommentAttempt({author_id:owner,post_id:post,content:'draft-0'})).id);
 globalThis.sessionStorage={getItem(){throw new Error('blocked');}};
 await assert.rejects(getOrCreateReelCommentAttempt({author_id:owner,post_id:post,content:'draft'}));
 }finally{delete globalThis.sessionStorage;}
});
