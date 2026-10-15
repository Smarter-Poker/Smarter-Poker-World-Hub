import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dockCapacity, dockLayout, dockNotificationLayout, restoreDock, updateDock, DOCK_MAX_CHATS } from '../src/components/messenger/dock/messengerDock.mjs';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const open = (rows,n,options={}) => updateDock(rows,{type:'open',conversation:{id:id(n),title:`Player ${n}`},...options});
test('new message opens once, keeps explicitly minimized thread minimized, and highlights unread',()=>{
 let rows=open([],1,{incoming:true}); rows=updateDock(rows,{type:'minimize',id:id(1)}); rows=open(rows,1,{incoming:true});
 assert.equal(rows.length,1);assert.equal(rows[0].minimized,true);assert.equal(rows[0].unread,true);
 rows=open(rows,1);assert.equal(rows[0].minimized,false);rows=updateDock(rows,{type:'read',id:id(1)});assert.equal(rows[0].unread,false);
});
test('incoming messages can preserve a focused composer at capacity',()=>{
 const rows=open(open([],1),2,{incoming:true,minimized:true});assert.equal(rows[0].minimized,false);assert.equal(rows[1].minimized,true);
});
test('desktop slots grow from one to three; mobile always has one slot',()=>{
 for(const width of [320,375,390,767]) assert.equal(dockCapacity(width),1);
 assert.equal(dockCapacity(800),2);assert.equal(dockCapacity(1440),3);
 const rows=[1,2,3,4].reduce((state,n)=>open(state,n),[]);
 for(const width of [320,375,390,768,1024,1440]) {
  const layout=dockLayout(rows,{width,height:844});assert.ok(layout.width<=width-16);assert.ok(layout.height<=744);
  assert.equal(layout.expanded.length+layout.bubbles.length,4);assert.ok(layout.expanded.length<=dockCapacity(width));
 }
});
test('window restore admits only bounded unique UUIDs and no content or actor identity',()=>{
 assert.deepEqual(restoreDock('broken'),[]);assert.deepEqual(restoreDock('{}'),[]);
 const rows=restoreDock(JSON.stringify([{id:id(1),content:'private',actorId:id(4),minimized:true},{id:'javascript:bad'},{id:id(1),minimized:false}]));
 assert.deepEqual(rows,[{id:id(1),minimized:false}]);
 assert.equal(restoreDock(JSON.stringify(Array.from({length:30},(_,i)=>({id:id(i+1)})))).length,DOCK_MAX_CHATS);
});
test('closing never deletes a message and bounded overflow retains newest window',()=>{
 let rows=[];for(let i=1;i<=12;i++)rows=open(rows,i);assert.equal(rows.length,DOCK_MAX_CHATS);assert.equal(rows.at(-1).id,id(12));
 rows=updateDock(rows,{type:'close',id:id(12)});assert.equal(rows.length,DOCK_MAX_CHATS-1);
});
test('durable send and continuity algorithms are exact copies of the established Messenger owners',()=>{
 for(const file of ['messengerSendOperation.mjs','messengerContinuity.mjs'])assert.equal(readFileSync(new URL(`../src/components/messenger/dock/${file}`,import.meta.url),'utf8'),readFileSync(new URL(`../src/lib/${file}`,import.meta.url),'utf8'));
});
test('native dock has no iframe bridge, polling, forced focus or alternate send path',()=>{
 const root=readFileSync(new URL('../src/components/messenger/dock/MessengerDock.jsx',import.meta.url),'utf8');
 const panel=readFileSync(new URL('../src/components/messenger/dock/MessengerChat.jsx',import.meta.url),'utf8');
 assert.doesNotMatch(root+panel,/<iframe|postMessage|setInterval|autoFocus/);
 assert.match(root,/event === 'SIGNED_OUT'.*if \(!identity.current\) \+\+generation.current/);assert.match(root,/void refresh\(true\);\s+const channel/);assert.match(root,/workspace: 'resolve'/);assert.match(root,/generation\.current !== epoch/);assert.match(root,/table: 'social_messages'/);
 assert.match(panel,/performMessengerSend/);assert.match(panel,/visibleMessageBoundary/);assert.match(panel,/clearDraftIfUnchanged/);
 assert.match(panel,/nativeEvent\.isComposing/);assert.match(panel,/pending.*ops\.current/);
});

test('notification stacks stay in the viewport above the composer on short phones and keyboards',()=>{
 for(const [height,bottom,panel] of [[568,76,468],[667,76,567],[844,76,680],[900,76,500],[568,296,180]]){
  const placement=dockNotificationLayout(height,bottom,panel);
  assert.ok(height-placement.bottom<=height-bottom-116-12);
  assert.ok(height-placement.bottom-placement.maxHeight>=0);
  assert.ok(placement.maxHeight>=60);
 }
});

test('measured footer and keyboard clearances bound the window without double counting the keyboard',()=>{
 const rows=open([],1);
 const desktop=dockLayout(rows,{width:1440,height:900,clearance:140});assert.equal(desktop.height,500);
 const short=dockLayout(rows,{width:800,height:400,clearance:140});assert.ok(short.height+140+24<=400);
 const keyboard=dockLayout(rows,{width:320,height:280,clearance:8});assert.equal(keyboard.height,248);
 const root=readFileSync(new URL('../src/components/messenger/dock/MessengerDock.jsx',import.meta.url),'utf8');
 assert.match(root,/--sp-footer-height/);assert.match(root,/--ca-bottom-chrome-h/);assert.match(root,/next !== measuredFooter/);
});


test('async token acquisition cannot send an old actor payload as the new account',async()=>{
 const {requestForDockActor}=await import('../src/components/messenger/dock/bindDockRequest.mjs');
 const actor=id(1),other=id(2);let current=actor,calls=0,release;
 const token=user=>`test.${btoa(JSON.stringify({sub:user}))}.test`;
 const pending=requestForDockActor('/api/messenger/send-message',{method:'POST',body:'immutable',actorId:actor,currentActor:()=>current},()=>new Promise(resolve=>{release=resolve;}),()=>{calls++;});
 current=other;release(token(other));await assert.rejects(pending,/Account Changed/);assert.equal(calls,0);
 current=actor;
 await requestForDockActor('/api/messenger/send-message',{method:'POST',body:'immutable',actorId:actor,currentActor:()=>current},async()=>token(actor),async(url,options)=>{calls++;assert.equal(options.body,'immutable');assert.equal(options.headers.Authorization,`Bearer ${token(actor)}`);assert.equal(options.actorId,undefined);return {ok:true};});
 assert.equal(calls,1);
 await assert.rejects(requestForDockActor('/api/messenger/continuity',{actorId:actor,currentActor:()=>actor},async()=>token(other),()=>{calls++;}),/Account Changed/);assert.equal(calls,1);
});

test('quick native unmount flushes draft for the same actor and remains invalid after an account switch',async()=>{
 const {createContinuityController}=await import('../src/components/messenger/dock/messengerContinuity.mjs');
 let actor=id(1),mounted=true,writes=0,notices=0;
 const map=new Map();const storage={getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key),get length(){return map.size;},key:index=>[...map.keys()][index]};
 const controller=createContinuityController({actorId:id(1),workspace:{workspace:'social'},storage,isCurrent:()=>actor===id(1),changed:()=>{if(mounted)notices++;},request:async body=>{writes++;return {ok:true,status:200,body:{success:true,revision:1,value:body.value}};}});
 controller.edit(id(10),'draft',{text:'Draft Before Minimize',replyToId:null});const queued=controller.write(id(10),'draft');mounted=false;const before=notices;
 await queued;assert.equal(writes,1);assert.equal(notices,before);
 actor=id(2);await controller.write(id(10),'draft');assert.equal(writes,1);
 const source=readFileSync(new URL('../src/components/messenger/dock/MessengerChat.jsx',import.meta.url),'utf8');assert.match(source,/isCurrent: \(\) => identity.current === actorId/);
});

test('an authoritative zero clears a minimized unread flag after the panel unmounts',()=>{
 let chats=open([],1,{incoming:true});chats=updateDock(chats,{type:'minimize',id:id(1)});
 chats=updateDock(chats,{type:'refresh',conversation:{id:id(1),unreadCount:0}});assert.equal(chats[0].unread,false);assert.equal(chats[0].minimized,true);
 const source=readFileSync(new URL('../src/components/messenger/dock/MessengerChat.jsx',import.meta.url),'utf8');
 const section=source.slice(source.indexOf("const result = await request('mark-read'"),source.indexOf('const prefs = await services.getPreferences'));
 assert.ok(section.indexOf("broadcastSync('smarter_poker_unread_sync'")<section.indexOf('!mounted.current'));
 assert.match(section,/identity.current !== actorId/);
});
