import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {createReelHydrationRevision} from '../src/lib/reelHydrationRevision.mjs';
import {createReelMutationGuard} from '../src/lib/reelMutationGuard.mjs';
import {createReelAccountScope} from '../src/lib/reelAccountScope.mjs';
import {mutateReelReaction} from '../src/lib/reelReactionMutation.mjs';
const owner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const files=['pages/hub/reels.js','src/components/social/Reels.jsx','src/components/social/ReelsFeedCarousel.jsx'];
function sourceParts(file){
 const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX),variables={},effects=[];
 function visit(node){if(ts.isVariableDeclaration(node)&&['withReelMutation','handleLike','clearAccountOwnedState','bindAuthUser','bindAuthOwner'].includes(node.name.getText(source)))variables[node.name.getText(source)]=node.parent.parent.getText(source);
 if(ts.isCallExpression(node)&&node.expression.getText(source)==='useEffect'&&node.arguments[0]&&/loadReel(?:Interaction|Follow)State\(/.test(node.arguments[0].getText(source)))effects.push(node.arguments[0].getText(source));ts.forEachChild(node,visit);}visit(source);return{variables,effects};
}
function evaluate(code,deps){const compiled=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;return Function(...Object.keys(deps),compiled)(...Object.values(deps));}
for(const file of files)test(`${file}: actual delayed hydration preserves confirmed touched targets and loads unrelated state`,async()=>{
 const parts=sourceParts(file),scope=createReelAccountScope(owner),state={liked:{},disliked:{},saved:{},savedSet:new Set(),following:{},counts:{[id]:2}},savedTargetsByReelRef={current:new Map()},cleanups=[];let resolveRead,resolveFollow;
 const reads=new Promise(resolve=>resolveRead=resolve),follows=new Promise(resolve=>resolveFollow=resolve);
 const setter=key=>update=>state[key]=typeof update==='function'?update(state[key]):update;
 const deps={interactionRevisionRef:{current:createReelHydrationRevision()},accountScopeRef:{current:scope},activeUserIdRef:{current:owner},user:{id:owner},currentUserId:owner,authUser:{id:owner},reels:[{id,author_id:other},{id:other,author_id:other}],currentReel:{id,like_count:2},currentIndex:0,interactionReelIds:[id,other],interactionAuthorIds:[other],normaliseReelAuthorIds:()=>[other],supabase:{rpc:async()=>({data:{liked:true,disliked:false,likeCount:3}})},loadReelInteractionState:()=>reads,loadReelFollowState:()=>follows,savedReelsService:{getSavedReelsForIds(){}},savedTargetsByReelRef,setLiked:setter('liked'),setDisliked:setter('disliked'),setSaved:setter('saved'),setSavedReels:setter('savedSet'),setFollowing:setter('following'),setLikeCounts:setter('counts'),mutationGuardRef:{current:createReelMutationGuard()},mutateReelReaction,liked:state.liked,disliked:state.disliked,likeCounts:state.counts,setLikeBounceId(){},likeBounceTimerRef:{current:null},setTimeout(){return 1;},clearTimeout(){},showErrorToast(){},busEmit:{socialPostLiked(){}},setNotInterestedIds(){},persistNotInterestedReelIds(){},goNext(){}};
 const actions=evaluate(parts.variables.withReelMutation+'\n'+parts.variables.handleLike+'\nreturn {handleLike,withReelMutation};',deps);
 for(const effect of parts.effects)cleanups.push(evaluate('return ('+effect+')();',deps));
 await actions.handleLike();
 await actions.withReelMutation('save',()=>id,async()=>{state.saved[id]=true;state.savedSet.add(id);savedTargetsByReelRef.current.set(id,'canonical-target');})();
 await actions.withReelMutation('follow',()=>other,async()=>{state.following[other]=true;})();
 resolveRead({liked:{[other]:true},disliked:{[id]:true},saved:{[other]:true},savedTargets:{[other]:'other-target'}});resolveFollow({});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(state.liked[id],true);assert.equal(state.liked[other],true);assert.equal(state.disliked[id],false);assert.equal(state.following[other],true);assert.equal(savedTargetsByReelRef.current.get(id),'canonical-target');assert.equal(savedTargetsByReelRef.current.get(other),'other-target');
 if(file.startsWith('pages/'))assert.deepEqual([...state.savedSet].sort(),[id,other].sort());else assert.deepEqual(state.saved,{[id]:true,[other]:true});
 for(const cleanup of cleanups)cleanup?.();
});
test('reads started during pending actions and account round trips cannot restore stale state',()=>{
 const scope=createReelAccountScope(owner),revision=createReelHydrationRevision(),request=scope.capture(),finish=revision.begin(request,'reaction',id),read=revision.capture(request);finish();assert.deepEqual(read.merge('reaction',{[id]:false,[other]:true},{[id]:true}),{[id]:true,[other]:true});scope.bind(other);revision.capture(scope.capture());scope.bind(owner);revision.capture(scope.capture());assert.deepEqual(read.merge('reaction',{[id]:false},{[id]:true}),{[id]:true});
});
for(const file of files)test(`${file}: actual account binding drops private rows, preserves public cursor and stops private playback`,()=>{
 const parts=sourceParts(file),scope=createReelAccountScope(owner),privateRow={id,is_public:false},publicRow={id:other,is_public:true},refs={reelsRef:{current:[privateRow,publicRow]},currentIndexRef:{current:0}},state={};let paused=0,providerPaused=0,clears=0;
 const deps={useCallback:fn=>fn,accountScopeRef:{current:scope},activeUserIdRef:{current:owner},...refs,videoRef:{current:{pause:()=>paused++}},youtubeCommandRef:{current:command=>{assert.equal(command,'pauseVideo');providerPaused++;}},setReels:rows=>state.rows=rows,onReorderReels:rows=>state.rows=rows,setCurrentIndex:index=>state.index=index,router:{query:{}},feedModeForReelsRoute:()=> 'for-you',setUser(){},setCurrentUserId(){},setAuthUser(){},setFollowingReauthRequired(){},loadWatchedReelIds:()=>[],loadNotInterestedReelIds:()=>[],savedTargetsByReelRef:{current:new Map()},likeDebounceRef:{current:false},commentRequestGuardRef:{current:{abort(){}}},reelsRequestGuardRef:{current:{abort(){}}}};
 const clear=parts.variables.clearAccountOwnedState;
 // Stub each unrelated account-owned reset; execute the maintained callback and binding themselves.
 for(const name of clear.match(/\bset[A-Z]\w+/g)||[])if(!deps[name])deps[name]=()=>clears++;
 const binding=parts.variables.bindAuthOwner||parts.variables.bindAuthUser;
 const bind=evaluate(clear+'\n'+binding+'\nreturn '+(parts.variables.bindAuthOwner?'bindAuthOwner':'bindAuthUser')+';',deps);
 bind({id:other});assert.deepEqual(state.rows,[publicRow]);assert.equal(refs.reelsRef.current.length,1);assert.equal(state.index,0);assert.equal(paused,1);assert.equal(providerPaused,1);
 const before=clears;bind({id:other});assert.equal(clears,before,'unchanged identity must not clear confirmed interactions');
 refs.reelsRef.current=[privateRow,publicRow];refs.currentIndexRef.current=1;bind(null);assert.deepEqual(state.rows,[publicRow]);assert.equal(paused,1,'retained public active clip keeps playback intent');assert.equal(state.index,0);
});
