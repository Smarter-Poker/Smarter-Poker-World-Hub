import test from 'node:test';import assert from 'node:assert/strict';
import {mutateReelReaction} from '../src/lib/reelReactionMutation.mjs';
const reelId='22222222-2222-4222-8222-222222222222';
test('reaction helper sends one desired authenticated transaction and retains authoritative state',async()=>{
 let calls=0;const client={rpc:async(name,args)=>{calls++;assert.equal(name,'set_reel_reaction');assert.deepEqual(args,{p_reel_id:reelId,p_reaction:'like',p_active:true});return{data:{liked:true,disliked:false,likeCount:1}};}};
 assert.equal((await mutateReelReaction(client,{reelId,reaction:'like',active:true})).liked,true);assert.equal(calls,1);
 await assert.rejects(()=>mutateReelReaction(client,{reelId:'invalid',reaction:'like',active:true}),TypeError);
 await assert.rejects(()=>mutateReelReaction({rpc:async()=>({error:{code:'55P03'}})},{reelId,reaction:'like',active:true}),error=>error.code==='55P03');
 await assert.rejects(()=>mutateReelReaction({rpc:async()=>({data:{liked:true,disliked:true,likeCount:1}})},{reelId,reaction:'like',active:true}),/Acknowledgment/);
});
