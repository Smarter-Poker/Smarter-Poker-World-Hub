import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import * as attempts from '../src/lib/reelCommentAttempts.mjs';
const owner='11111111-1111-4111-8111-111111111111',reelId='22222222-2222-4222-8222-222222222222';
const paths=['../pages/hub/reels.js','../src/components/social/Reels.jsx','../src/components/social/ReelsFeedCarousel.jsx'];
for(const path of paths)test(`actual ${path} comment handler retains unknown UUID and restores only captured draft`,async()=>{
 const values=new Map();globalThis.sessionStorage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 try{
 const source=readFileSync(new URL(path,import.meta.url),'utf8');const name=path.includes('pages/')?'submitComment':'handleSubmitComment';const start=source.indexOf(`  const ${name} = withReelMutation('comment'`),end=source.indexOf('  // Phase 6 - Comment like toggle',start);const body=source.slice(start,end)+`\nreturn ${name};`;
 let rows=[],draft='Original draft',calls=0;const ids=[];const ref={current:{text:draft,mediaUrl:null,mediaType:null,reply:null}};
 const updateRows=fn=>rows=typeof fn==='function'?fn(rows):fn;
 const setText=fn=>{draft=typeof fn==='function'?fn(draft):fn;ref.current.text=draft;};
 const userRequest={ownerId:owner,isCurrent:()=>true};
 const args={withReelMutation:(_kind,_target,handler)=>handler,reels:[{id:reelId}],currentIndex:0,currentReel:{id:reelId},accountScopeRef:{current:{capture:()=>userRequest}},activeUserIdRef:{current:owner},activeCommentReelIdRef:{current:reelId},commentText:draft,commentMediaUrl:null,commentMediaType:null,reelCommentMediaUrl:null,reelCommentMediaType:null,replyTo:null,commentAttemptDraftRef:ref,comments:[],reelComments:[],setComments:updateRows,setReelComments:updateRows,setCommentText:setText,setCommentMediaUrl:()=>{},setCommentMediaType:()=>{},setReelCommentMediaUrl:()=>{},setReelCommentMediaType:()=>{},setSubmittingComment:()=>{},setShowGifPicker:()=>{},setShowReelGifPicker:()=>{},setReplyTo:()=>{},showErrorToast:()=>{},...attempts,postReelComment:async(_client,payload)=>{ids.push(payload.id);if(++calls===1)throw new Error('Unknown acknowledgement');return{comment:{...payload,created_at:new Date().toISOString()}};},supabase:{from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{comment_count:1}})})},busEmit:{socialCommentAdded:()=>{}},setCommentCounts:()=>{}};
 const handler=new Function(...Object.keys(args),body)(...Object.values(args));
 await handler();assert.equal(draft,'Original draft');assert.equal(rows.length,0);
 await handler();assert.equal(ids[0],ids[1]);assert.equal(rows.length,1);assert.equal(rows[0].id,ids[0]);assert.equal(draft,'');
 const bus=source.slice(source.indexOf('    const handleCommentBus ='),source.indexOf('    const handleFollowBus ='));
 assert.match(bus,/d\.authorId !== activeUserIdRef\.current/);assert.doesNotMatch(bus,/d\.userId/);
 }finally{delete globalThis.sessionStorage;}
});
