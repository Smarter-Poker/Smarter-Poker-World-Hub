import assert from 'node:assert/strict';
import test from 'node:test';
import {createReelMutationGuard,postReelComment} from '../src/lib/reelMutationGuard.mjs';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const owner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const post='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const payload={id,author_id:owner,post_id:post,content:'Hello'};
function client({insertError=null,readError=null,commit=true,duplicate=false,foreign=false,auth=owner}={}) {
  const calls=[]; let row=duplicate?{...payload,parent_id:null,media_url:null,media_type:null}:null;
  return {calls,auth:{async getUser(){return {data:{user:{id:auth}}};}},from(table){calls.push(table);let writing=false; const query={insert(value){writing=true;calls.push('insert');if(commit)row={...value};return query;},select(){return query;},eq(key,value){calls.push([key,value]);return query;},async maybeSingle(){if(writing)return {data:insertError?null:row,error:insertError};return {data:foreign&&row?{...row,content:'Different'}:row,error:readError};}};return query;}};
}
test('confirmed comments return actual UUID rows; unknown acknowledgments read back once without retry',async()=>{
  for(const options of [{},{insertError:new Error('network')},{duplicate:true,insertError:{code:'23505'},commit:false}]) {
    const db=client(options);const result=await postReelComment(db,payload);
    assert.equal(result.comment.id,id);assert.equal(db.calls.filter(x=>x==='insert').length,1);
    assert.equal(db.calls.filter(x=>x==='social_comments').length,options.insertError?2:1);
  }
});
test('unconfirmed writes retain operation ID; foreign rows and wrong account cannot manufacture success',async()=>{
  const absent=client({commit:false,insertError:new Error('network')});
  await assert.rejects(postReelComment(absent,payload),error=>error.code==='REEL_COMMENT_UNKNOWN'&&error.operationId===id);
  const mismatch=client({insertError:{code:'23505'},duplicate:true,commit:false,foreign:true});
  await assert.rejects(postReelComment(mismatch,payload),{code:'REEL_COMMENT_MISMATCH'});
  const wrong=client({auth:post});await assert.rejects(postReelComment(wrong,payload),{code:'REEL_COMMENT_UNAUTHORIZED'});assert.equal(wrong.calls.length,0);
});
test('singleflight is owner/epoch/kind/target scoped, bounded, and cannot apply stale completion',async()=>{
  let current=true;const guard=createReelMutationGuard({maxPending:2});
  const scope={ownerId:owner,epoch:1,isCurrent:()=>current};
  const request={ownerRequest:scope,kind:'like',target:post};
  const token=guard.begin(request);assert.equal(guard.begin(request),null);
  const other=guard.begin({...request,kind:'save'});assert.equal(guard.size,2);
  assert.throws(()=>guard.begin({...request,target:id}),{code:'REEL_MUTATION_CAPACITY'});
  token.finish();token.finish();other.finish();assert.equal(guard.size,0);
  let release;const operation=guard.run(request,()=>new Promise(resolve=>{release=resolve;}));
  await assert.rejects(guard.run(request,()=>assert.fail('duplicate task invoked')),{code:'REEL_MUTATION_PENDING'});
  current=false;release('committed');await assert.rejects(operation,{code:'REEL_MUTATION_STALE'});assert.equal(guard.size,0);
});
test('the maintained account scope revision gives a returning account a distinct operation slot', async () => {
  const {createReelAccountScope}=await import('../src/lib/reelAccountScope.mjs');
  const account=createReelAccountScope(owner);const guard=createReelMutationGuard();
  const first=guard.begin({ownerRequest:account.capture(),kind:'like',target:post});
  account.bind(post);account.bind(owner);
  const second=guard.begin({ownerRequest:account.capture(),kind:'like',target:post});
  assert.ok(second);assert.equal(first.isCurrent(),false);assert.equal(second.isCurrent(),true);
  first.finish();assert.equal(second.isCurrent(),true);second.finish();
});
