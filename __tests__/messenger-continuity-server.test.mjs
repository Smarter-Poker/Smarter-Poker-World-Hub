import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { navigationArgs, validateContinuityWrite } from '../src/lib/messengerContinuityServer.mjs';
import { verifyAccountingMessage } from '../src/lib/accountingMessage.mjs';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const user=id(1), conversation=id(2), other=id(3), message=id(4);
const state=()=>({draft:{text:'',replyToId:null,revision:0},pin:{value:false,revision:0},position:{messageId:null,offset:0,revision:0}});
const stamp='2026-09-27T12:00:00.123456+00:00';
function moduleAt(path,mocks){
 const mod={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports','process','console',code)(()=>mocks,mod,mod.exports,{env:{SUPABASE_SERVICE_ROLE_KEY:'local-fixture'}},{warn(){}});
 return mod.exports;
}
function fixture(options={}){
 const calls=[],access=[];
 let active=0,maxActive=0;
 const db={async rpc(name,args){
  calls.push({name,args});
  if(options.rpcError) return {data:null,error:options.rpcError};
  if(name==='fn_get_reactions_for_messages') return {data:[]};
  if(name==='fn_messenger_continuity_write') return {data:options.writeResult??{success:true,field:args.p_field,revision:1,value:args.p_value,state:state()}};
  if(name==='fn_messenger_continuity_read') return {data:options.readResult??{success:true,states:Object.fromEntries(args.p_conversation_ids.map(c=>[c,state()])),saved:options.saved??[]}};
  if(name==='fn_messenger_continuity_window'){
   active++;maxActive=Math.max(active,maxActive);await new Promise(resolve=>setImmediate(resolve));active--;
   if(options.windowError)return {error:options.windowError};
   const m={id:args.p_anchor||message,conversation_id:args.p_conversation_id,sender_id:other,created_at:stamp,content:'Fresh private reader content'};
   return {data:options.windowResult??{messages:options.missing?[]:[m],savedItems:options.missing?[]:[{messageId:m.id,conversationId:m.conversation_id,saved:true,revision:1}],firstUnreadMessageId:message,hasOlder:false,hasNewer:false,anchorMessageId:args.p_anchor,anchorUnavailable:!!options.missing}};
  }
  throw new Error('Unexpected RPC '+name);
 }};
 const helper=moduleAt('src/lib/messengerContinuityServer.mjs',{
  getMessengerWorkspace:async(_db,actor,request,internal)=>{
   access.push({actor,request,internal});if(options.accessError)throw Object.assign(new Error('Denied'),{status:options.accessError});
   return {conversation:{id:conversation},conversations:(options.ids||[conversation]).map(id=>({id}))};
  }
 });
 const route=moduleAt('pages/api/messenger/continuity.js',{
  ...helper,createClient:()=>db,getServerUserWithFallback:async()=>({user:options.unauthenticated?null:{id:user}}),applyRateLimit:()=>true,LIMITS:{read:{},write:{}}
 }).default;
 const history=moduleAt('pages/api/messenger/get-messages.js',{
  ...helper,verifyAccountingMessage,readMessengerMessages(){throw new Error('Navigation must not fall back');},
  createClient:()=>db,getServerUserWithFallback:async()=>({user:{id:user}}),applyRateLimit:()=>true,LIMITS:{read:{}},reportApiError(){}
 }).default;
 return {db,helper,calls,access,get maxActive(){return maxActive;},async history(body){
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;}};
  await history({method:'POST',headers:{authorization:'Bearer local-fixture'},body},res);return res;
 },async request(body,request={}){
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;}};
  await route({method:'POST',headers:{authorization:'Bearer local-fixture'},body,...request},res);return res;
 }};
}

test('writes validate exact field payloads and never accept forged revisions or reference types',()=>{
 for(const input of [
  {field:'draft',value:{text:1}}, {field:'draft',value:{text:'x'.repeat(2001)}}, {field:'draft',value:{text:'x',replyToId:4}},
  {field:'pin',value:'true'},{field:'position',value:{messageId:message,offset:0.5}},
  {field:'position',value:{messageId:message,offset:100001}},{field:'saved',value:{messageId:'invalid',saved:true}},
  {field:'saved',value:{messageId:message,saved:true,content:'forged'}},{field:'draft',value:{text:''},expectedRevision:-1}
 ])assert.throws(()=>validateContinuityWrite({conversationId:conversation,expectedRevision:0,...input}),e=>e.status===400);
 assert.deepEqual(validateContinuityWrite({conversationId:conversation,expectedRevision:0,field:'draft',value:{text:'Draft'}}),{text:'Draft',replyToId:null});
});

test('navigation rejects mixed modes, invalid cursor IDs, invalid timestamps and oversized windows',()=>{
 for(const invalid of [{anchorMessageId:message,firstUnread:true},{before:stamp,after:stamp,afterId:message},{beforeId:message},{after:stamp},{firstUnread:'yes'},{anchorMessageId:'bad'},{after:'bad',afterId:message},{limit:201},{limit:0}])assert.throws(()=>navigationArgs({conversationId:conversation,...invalid}),e=>e.status===400);
 const args=navigationArgs({conversationId:conversation,after:stamp,afterId:message,limit:1});
 assert.equal(args.p_at,stamp);assert.equal(args.p_at_id,message);assert.equal(args.p_mode,'after');
 assert.equal(navigationArgs({conversationId:conversation,before:stamp,beforeId:message,firstUnread:false}).p_mode,'before');
});

test('route verifies JWT actor and responds no-store',async()=>{
 const f=fixture();const r=await f.request({action:'write',userId:other,conversationId:conversation,field:'draft',expectedRevision:0,value:{text:'Draft'}});
 assert.equal(r.statusCode,200);assert.equal(r.headers['Cache-Control'],'private, no-store');
 assert.equal(f.calls[0].args.p_user_id,user);assert.equal(f.access[0].actor,user);
 assert.deepEqual(f.calls[0].args.p_value,{text:'Draft',replyToId:null});
});

test('missing and invalid authentication never query continuity data',async()=>{
 for(const [opts,request] of [[{}, {headers:{}}],[{unauthenticated:true},{}]]){
  const f=fixture(opts);assert.equal((await f.request({action:'read'},request)).statusCode,401);assert.equal(f.calls.length,0);
 }
});

test('workspace denial fails before ordinary state writes and reads',async()=>{
 for(const action of ['read','write']){
  const f=fixture({accessError:403});const r=await f.request({action,conversationId:conversation,field:'pin',expectedRevision:0,value:true});
  assert.equal(r.statusCode,403);assert.equal(f.calls.length,0);
 }
});

test('CAS conflict includes server field/revision and never reports success',async()=>{
 const current={text:'New device draft',replyToId:null};
 const f=fixture({writeResult:{success:false,field:'draft',revision:3,value:current,state:{...state(),draft:{...current,revision:3}}}});
 const r=await f.request({action:'write',conversationId:conversation,field:'draft',expectedRevision:1,value:{text:'Old device draft'}});
 assert.equal(r.statusCode,409);assert.equal(r.body.success,false);assert.equal(r.body.revision,3);assert.deepEqual(r.body.value,current);
});

test('unavailable or malformed persistence never becomes a successful save',async()=>{
 for(const options of [{rpcError:{code:'08006'}},{writeResult:{}},{writeResult:{success:true,field:'pin',revision:-1,value:true}}]){
  const f=fixture(options);assert.equal((await f.request({action:'write',conversationId:conversation,field:'pin',expectedRevision:0,value:true})).statusCode,503);
 }
});

test('unsave-only cleanup skips revoked workspace but keeps exact actor/conversation and CAS at database',async()=>{
 const f=fixture({accessError:403,writeResult:{success:true,field:'saved',revision:4,value:{messageId:message,saved:false},item:{messageId:message,conversationId:conversation,saved:false,revision:4}}});
 const r=await f.request({action:'write',conversationId:conversation,field:'saved',expectedRevision:3,value:{messageId:message,saved:false}});
 assert.equal(r.statusCode,200);assert.equal(f.access.length,0);assert.equal(f.calls[0].args.p_user_id,user);assert.equal(f.calls[0].args.p_conversation_id,conversation);assert.equal(f.calls[0].args.p_expected_revision,3);assert.equal(r.body.state,undefined);
});

test('unknown unsave IDs and wrong account/conversation share unavailable response',async()=>{
 const f=fixture({rpcError:{code:'P0002'}});const r=await f.request({action:'write',conversationId:conversation,field:'saved',expectedRevision:0,value:{messageId:message,saved:false}});
 assert.equal(r.statusCode,404);assert.equal(r.body.error,'Messenger State Unavailable');
});

test('scope reads use workspace authority and authoritative empty state without browser backfill',async()=>{
 const f=fixture({ids:[]});const r=await f.request({action:'read',workspace:{workspace:'club',clubId:id(9),folder:'invoices'},userId:other});
 assert.equal(r.statusCode,200);assert.deepEqual(r.body.states,{});assert.deepEqual(r.body.pins,[]);assert.deepEqual(r.body.saved,[]);assert.equal(f.calls.length,0);assert.equal(f.access[0].actor,user);
});

test('saved previews hydrate current private rows with bounded four-request concurrency',async()=>{
 const saved=Array.from({length:9},(_,n)=>({messageId:id(n+20),conversationId:conversation,saved:true,revision:1,createdAt:stamp}));
 const f=fixture({saved});const r=await f.request({action:'read'});
 assert.equal(r.statusCode,200);assert.equal(r.body.saved.length,9);assert.ok(r.body.saved.every(s=>s.message.content==='Fresh private reader content'));assert.equal(f.maxActive,4);assert.equal(f.access.length,1);
});

test('saved preview membership loss is hidden, while authority failure remains retryable',async()=>{
 for(const [windowError,expected] of [[{code:'42501'},200],[{code:'P0002'},200],[{code:'08006'},503]]){
  const f=fixture({windowError,saved:[{messageId:message,conversationId:conversation,saved:true,revision:1,createdAt:stamp}]});
  const r=await f.request({action:'read'});assert.equal(r.statusCode,expected);if(expected===200)assert.deepEqual(r.body.saved,[]);
 }
});

test('saved pages are finite and expose the last selected cursor without losing older items',async()=>{
 const saved=Array.from({length:51},(_,n)=>({messageId:id(n+20),conversationId:conversation,saved:true,revision:1,createdAt:stamp}));
 const f=fixture({saved});const r=await f.request({action:'read'});
 assert.equal(r.body.saved.length,50);assert.equal(r.body.hasMoreSaved,true);assert.equal(r.body.nextSavedCursor.messageId,id(21));
 assert.equal(f.calls.filter(c=>c.name==='fn_messenger_continuity_window').length,50);
});

test('visible-state batches are limited to authorized conversation IDs',async()=>{
 const ids=Array.from({length:205},(_,n)=>id(1000+n));const f=fixture({ids});const r=await f.request({action:'read'});
 assert.equal(r.statusCode,200);assert.equal(Object.keys(r.body.states).length,205);assert.deepEqual(f.calls.map(c=>c.args.p_conversation_ids.length),[100,100,5]);
});

test('malformed or foreign database data is unavailable and never sent to browser',async()=>{
 const f=fixture({readResult:{success:true,states:{[other]:state()},saved:[]}});assert.equal((await f.request({action:'read'})).statusCode,503);
 const g=fixture({windowResult:{messages:[{id:message,conversation_id:other}],savedItems:[],firstUnreadMessageId:null,hasOlder:false,hasNewer:false,anchorMessageId:null,anchorUnavailable:false}});
 await assert.rejects(g.helper.readMessengerNavigation(g.db,user,{conversationId:conversation,anchorMessageId:message}),e=>e.status===503);
});

test('navigation returns private projection, flags and current-page saved revision unchanged',async()=>{
 const f=fixture();const r=await f.helper.readMessengerNavigation(f.db,user,{conversationId:conversation,anchorMessageId:message,limit:1});
 assert.equal(r.messages[0].content,'Fresh private reader content');assert.equal(r.savedItems[0].revision,1);assert.equal(r.anchorMessageId,message);assert.equal(f.calls[0].args.p_user_id,user);
});

test('the maintained history route invokes navigation and retains normalized messages, flags and saved metadata',async()=>{
 const f=fixture();const result=await f.history({conversationId:conversation,anchorMessageId:message});
 assert.equal(result.statusCode,200);assert.equal(result.body.success,true);assert.equal(result.body.messages[0].text,'Fresh private reader content');
 assert.equal(result.body.savedItems[0].messageId,message);assert.equal(result.body.anchorMessageId,message);assert.equal(result.body.count,1);
 assert.equal(f.calls[0].args.p_limit,50);assert.equal(result.headers['Cache-Control'],'private, no-store');
});

test('history rejects invalid new navigation rather than clamping it or calling legacy history',async()=>{
 for(const extra of [{firstUnread:true,limit:201},{firstUnread:true,limit:0},{firstUnread:true,limit:1.5},{anchorMessageId:message,after:stamp,afterId:message}]){
  const f=fixture();const result=await f.history({conversationId:conversation,...extra});assert.equal(result.statusCode,400);assert.equal(f.calls.length,0);
 }
});
