import test from 'node:test';
import assert from 'node:assert/strict';
import {createReelPlayedTime,rankUpcomingReels} from '../src/lib/reelsEnhancementState.mjs';
const row=(id,source,asset=id)=>({id,source_id:source,canonical_asset_key:asset});
test('upcoming ranking preserves the whole consumed prefix and cursor index',()=>{
 const rows=[row('old','a'),row('current','a'),row('a2','a'),row('a3','a'),row('b','b'),row('copy','b','old')];
 const ranked=rankUpcomingReels(rows,1,{});
 assert.deepEqual(ranked.map(r=>r.id),['old','current','a2','b','a3']);assert.equal(ranked[1],rows[1]);
 assert.deepEqual(rankUpcomingReels(ranked,1,{}).map(r=>r.id),ranked.map(r=>r.id));
 assert.deepEqual(rankUpcomingReels(rows,1,{}, {chronological:true}).map(r=>r.id),['old','current','a2','a3','b']);
});
test('explicit hide source blocks future pages without shifting the mounted active clip',()=>{
 const rows=[row('a','hidden'),row('new','hidden'),row('b','other')];
 assert.deepEqual(rankUpcomingReels(rows,0,{hiddenSourceKeys:new Set(['hidden'])}).map(r=>r.id),['a','b']);
});
test('actual played time excludes pauses buffering seeking and hidden time, never uses seek position',()=>{
 let clock=0;const timer=createReelPlayedTime({now:()=>clock});
 timer.playing();clock=1000;timer.pause();clock=10000;assert.equal(timer.seconds(),1);
 timer.playing();clock=12000;timer.visibility(false);clock=50000;timer.playing();assert.equal(timer.seconds(),3);
 timer.visibility(true);clock=51000;assert.equal(timer.seconds(),3);
 timer.playing();clock=53000;timer.pause();assert.equal(timer.seconds(),5);
});
test('rate changes count actual played media time while paused seeks contribute nothing',()=>{
 let clock=0;const timer=createReelPlayedTime({now:()=>clock});
 timer.playing();clock=2000;timer.rate(2);clock=6000;assert.equal(timer.seconds(),10);
 timer.pause();clock=20000;timer.rate(0.5);assert.equal(timer.seconds(),10);
 timer.playing();clock=24000;assert.equal(timer.seconds(),12);
 timer.rate(NaN);timer.rate(-1);timer.rate(Infinity);clock=26000;assert.equal(timer.seconds(),13);
});
