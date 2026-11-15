import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import * as seatsModule from '../src/components/ui/activePokerSeats.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { activePokerSeats } from '../src/components/ui/activePokerSeats.mjs';
const seat = { id: 'occupancy', table_id: 'table', left_at: null, tables: { name: 'PLO 1/2', lifecycle: 'running' } };
test('returns live cash or tournament chairs including an all-in zero stack', () => {
  assert.deepEqual(activePokerSeats([{ ...seat, stack: 0 }], []), [{ id: 'table', name: 'PLO 1/2', gameId: 'table:table', href: '/hub/club-arena/table/table' }]);
});
test('returns the authenticated Lightning RPC room and suppresses its physical anchor', () => {
  const anchor = {...seat,tables:{...seat.tables,cluster_id:'cluster'}};
  assert.deepEqual(activePokerSeats([anchor], [{pool_session_id:'room',cluster_id:'cluster',name:'Lightning PLO'}]), [{id:'room',name:'Lightning PLO',gameId:'cluster:cluster',href:'/hub/club-arena/table/room'}]);
  assert.equal(activePokerSeats([anchor], [])[0].id,'table');
});
test('the browser reads the authenticated RPC rather than the protected pool table', async () => {
  const {readFileSync} = await import('node:fs');
  const source=readFileSync('src/components/ui/ActivePokerSeatLink.jsx','utf8');
  assert.match(source,/rpc\('fn_lightning_my_sessions'\)/);
  assert.doesNotMatch(source,/from\('lightning_pool_session'\)/);
});
test('never resurrects a left or closed seat, and deduplicates room links', () => {
  assert.deepEqual(activePokerSeats([{ ...seat, left_at: 'now' }, { ...seat, tables: { lifecycle: 'closed' } }], []), []);
  assert.equal(activePokerSeats([seat, seat], []).length, 1);
});

const require = createRequire(import.meta.url);
const React = require('react');
const renderer = require('react-test-renderer');
const ts = require('typescript');
const compiled = ts.transpileModule(readFileSync('src/components/ui/ActivePokerSeatLink.jsx','utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
});
const chair = (table = 'old', event = 'event') => ({id:'occupancy',table_id:table,left_at:null,tables:{name:'Tournament',lifecycle:'running',tournament_id:event}});
const deferred = () => { let resolve; const promise = new Promise(r => {resolve=r;}); return {promise,resolve}; };
async function setup(t) {
  let rows=[chair()], error=null, nextRead=null, auth, status, tree, reads=0;
  const navigations=[];
  const listeners=new Map();
  const client={
    from(name) { assert.equal(name,'table_seats'); reads++; const reply=nextRead; nextRead=null;
      const value=reply || Promise.resolve({data:structuredClone(rows),error});
      const query={select(){return query;},eq(){return query;},is(){return value;}}; return query;
    },
    rpc(name){assert.equal(name,'fn_lightning_my_sessions');return Promise.resolve({data:[],error:null});},
    auth:{onAuthStateChange(cb){auth=cb;return {data:{subscription:{unsubscribe(){}}}};}},
    channel(){const c={on(){return c;},subscribe(cb){status=cb;if(cb)cb('SUBSCRIBED');return c;}};return c;},
    async removeChannel(){},
  };
  const browser={location:{assign:href=>navigations.push(href)},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener(){}};
  const doc={visibilityState:'visible',addEventListener(){},removeEventListener(){}};
  const module={exports:{}};
  vm.runInNewContext(compiled.outputText, {
    require:name=>name==='react'?React:name.endsWith('/supabase')?{supabase:client}:name.endsWith('/authUtils')?{getAuthUser:()=>Promise.resolve({id:'viewer'})}:name.endsWith('activePokerSeats.mjs')?seatsModule:name.endsWith('.css')?{default:{dock:'dock'}}:require(name),
    module,exports:module.exports,window:browser,document:doc,console:{error(){}},Promise,
  });
  await renderer.act(async()=>{tree=renderer.create(React.createElement(module.exports.default));});
  t.after(()=>renderer.act(()=>tree.unmount()));
  return {get tree(){return tree;},navigations,listeners,get reads(){return reads;},setRows(value){rows=value;},fail(){error=new Error('offline');},block(){const d=deferred();nextRead=d.promise;return d;},auth:id=>auth('SIGNED_IN',{user:{id}}),reconnect:()=>status('SUBSCRIBED'),link:()=>tree.root.findAllByType('button').find(b=>/^Sit Down:|^Checking Seat/.test(b.children.join(''))),unmount(){renderer.act(()=>tree.unmount());},async click(){await renderer.act(async()=>{await this.link().props.onClick();});}};
}

test('a cached link is revalidated at the press and never navigates to a departed seat',async t=>{
  const app=await setup(t);assert.match(app.link().children.join(''),/Sit Down:/);
  app.setRows([]);await app.click();
  assert.deepEqual(app.navigations,[]);assert.equal(app.tree.root.findAllByType('button').filter(b=>/^Sit Down:/.test(b.children.join(''))).length,0);
  assert.match(JSON.stringify(app.tree.toJSON()),/Your Previous Seat Is No Longer Active/);
});
test('a moved tournament seat opens its current table through the same explicit press',async t=>{
  const app=await setup(t);app.setRows([chair('new')]);await app.click();
  assert.deepEqual(app.navigations,['/hub/club-arena/table/new']);
});
test('a different game is offered without silently selecting it',async t=>{
  const app=await setup(t);app.setRows([chair('other','another-event')]);await app.click();
  assert.deepEqual(app.navigations,[]);assert.ok(app.link());
  await app.click();assert.deepEqual(app.navigations,['/hub/club-arena/table/other']);
});
test('a read failure is visible and a retry does not navigate on cached authority',async t=>{
  const app=await setup(t);app.fail();await app.click();
  assert.deepEqual(app.navigations,[]);assert.match(JSON.stringify(app.tree.toJSON()),/Could Not Check Your Active Seats/);
  assert.ok(app.tree.root.findAllByType('button').some(b=>b.children.join('')==='Retry'));
});
test('a reconnected subscription refreshes events missed while the page slept',async t=>{
  const app=await setup(t);app.setRows([]);await renderer.act(async()=>{app.reconnect();});
  assert.equal(app.tree.root.findAllByType('button').filter(b=>/^Sit Down:/.test(b.children.join(''))).length,0);
});
test('repeated presses share the original pending return instead of duplicating navigation',async t=>{
  const app=await setup(t);const blocked=app.block();const before=app.reads;let first;
  await renderer.act(async()=>{first=app.link().props.onClick();});
  await renderer.act(async()=>{await app.link().props.onClick();});
  assert.equal(app.reads,before+1);
  await renderer.act(async()=>{blocked.resolve({data:[chair()],error:null});await first;});
  assert.deepEqual(app.navigations,['/hub/club-arena/table/old']);
});
test('an account change fences an earlier return response',async t=>{
  const app=await setup(t);const blocked=app.block();let pending;
  await renderer.act(async()=>{pending=app.link().props.onClick();});
  app.setRows([]);await renderer.act(async()=>{app.auth('another-viewer');});
  await renderer.act(async()=>{blocked.resolve({data:[chair()],error:null});await pending;});
  assert.deepEqual(app.navigations,[]);assert.equal(app.tree.root.findAllByType('button').filter(b=>/^Sit Down:/.test(b.children.join(''))).length,0);
});

test('a newer seat refresh prevents an earlier return snapshot from navigating',async t=>{
  const app=await setup(t);const blocked=app.block();let pending;
  await renderer.act(async()=>{pending=app.link().props.onClick();});
  app.setRows([]);await renderer.act(async()=>{app.reconnect();});
  await renderer.act(async()=>{blocked.resolve({data:[chair()],error:null});await pending;});
  assert.deepEqual(app.navigations,[]);
  assert.match(JSON.stringify(app.tree.toJSON()),/Your Seats Changed/);
});
test('leaving the Hub fences a pending return response',async t=>{
  const app=await setup(t);const blocked=app.block();let pending;
  await renderer.act(async()=>{pending=app.link().props.onClick();});
  app.unmount();blocked.resolve({data:[chair()],error:null});await pending;
  assert.deepEqual(app.navigations,[]);
});

test('closed status is excluded even when an older table lacks lifecycle',()=>{
  assert.deepEqual(activePokerSeats([{...seat,tables:{...seat.tables,lifecycle:null,status:'closed'}}],[]),[]);
});
test('a cluster keeps one return identity across its physical and Lightning rooms',()=>{
  const anchor={...seat,tables:{...seat.tables,cluster_id:'cluster'}};
  assert.equal(activePokerSeats([anchor],[])[0].gameId,activePokerSeats([], [{pool_session_id:'room',cluster_id:'cluster'}])[0].gameId);
});
