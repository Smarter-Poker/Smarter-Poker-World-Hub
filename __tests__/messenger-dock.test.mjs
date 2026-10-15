import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dockCapacity, dockLayout, restoreDock, updateDock, DOCK_MAX_CHATS } from '../src/components/messenger/dock/messengerDock.mjs';
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
 assert.match(root,/workspace: 'resolve'/);assert.match(root,/generation\.current !== epoch/);assert.match(root,/table: 'social_messages'/);
 assert.match(panel,/performMessengerSend/);assert.match(panel,/visibleMessageBoundary/);assert.match(panel,/clearDraftIfUnchanged/);
 assert.match(panel,/nativeEvent\.isComposing/);assert.match(panel,/pending.*ops\.current/);
});
