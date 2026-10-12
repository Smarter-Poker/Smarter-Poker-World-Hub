import {createReelHydrationRevision} from '../src/lib/reelHydrationRevision.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {createReelMutationGuard} from '../src/lib/reelMutationGuard.mjs';
import {createReelAccountScope} from '../src/lib/reelAccountScope.mjs';
import {mutateReelReaction} from '../src/lib/reelReactionMutation.mjs';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',owner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const surfaces=['pages/hub/reels.js','src/components/social/Reels.jsx','src/components/social/ReelsFeedCarousel.jsx'];
function actualHandlers(file,deps) {
 const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX),parts={};
 function visit(node){if(ts.isVariableDeclaration(node)&&['withReelMutation','handleLike','handleDislike'].includes(node.name.getText(source))){parts[node.name.getText(source)]=node.parent.parent.getText(source);}ts.forEachChild(node,visit);}visit(source);
 const code=['withReelMutation','handleLike','handleDislike'].map(name=>{assert.ok(parts[name],name);return parts[name];}).join('\n');
 const compiled=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 return Function(...Object.keys(deps),compiled+';return {handleLike,handleDislike};')(...Object.values(deps));
}
for(const file of surfaces)test(`${file}: actual handlers singleflight, atomic truth, rollback and stale account`,async()=>{
 const scope=createReelAccountScope(owner),state={liked:{[id]:false},disliked:{[id]:true},likeCounts:{[id]:4}},errors=[],calls=[],bus=[],guard=createReelMutationGuard();let resolve;
 const deps={interactionRevisionRef:{current:createReelHydrationRevision()},currentReel:{id,like_count:4},reels:[{id}],currentIndex:0,activeUserIdRef:{current:owner},accountScopeRef:{current:scope},mutationGuardRef:{current:guard},mutateReelReaction,supabase:{rpc(name,payload){calls.push({name,payload});return new Promise(r=>{resolve=r;});}},liked:state.liked,disliked:state.disliked,likeCounts:state.likeCounts,setLiked:f=>state.liked=f(state.liked),setDisliked:f=>state.disliked=f(state.disliked),setLikeCounts:f=>state.likeCounts=f(state.likeCounts),setLikeBounceId(){},likeBounceTimerRef:{current:null},setTimeout(){return 1;},clearTimeout(){},showErrorToast:x=>errors.push(x),busEmit:{socialPostLiked:(...x)=>bus.push(x)},setNotInterestedIds(){},persistNotInterestedReelIds(){},goNext(){}};
 let handlers=actualHandlers(file,deps),first=handlers.handleLike();await handlers.handleLike();await handlers.handleDislike();assert.equal(calls.length,1);assert.equal(calls[0].name,'set_reel_reaction');assert.equal(calls[0].payload.p_active,true);resolve({data:{liked:true,disliked:false,likeCount:9},error:null});await first;assert.deepEqual(state,{liked:{[id]:true},disliked:{[id]:false},likeCounts:{[id]:9}});assert.equal(bus.length,1);assert.equal(guard.size,0);
 deps.liked=state.liked;deps.disliked=state.disliked;deps.likeCounts=state.likeCounts;handlers=actualHandlers(file,deps);const failed=handlers.handleDislike();resolve({data:null,error:{code:'42501'}});await failed;assert.equal(state.liked[id],true);assert.equal(state.disliked[id],false);assert.equal(state.likeCounts[id],9);assert.equal(errors.length,1);
 const pending=handlers.handleLike();scope.bind('cccccccc-cccc-4ccc-8ccc-cccccccccccc');state.liked={};state.disliked={};state.likeCounts={};resolve({data:{liked:false,disliked:false,likeCount:8},error:null});await pending;assert.deepEqual(state,{liked:{},disliked:{},likeCounts:{}});assert.equal(guard.size,0);
});
