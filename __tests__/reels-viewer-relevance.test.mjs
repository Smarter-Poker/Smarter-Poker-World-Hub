import assert from 'node:assert/strict';
import test from 'node:test';
import * as feedback from '../src/lib/reelsFeedback.mjs';
import * as storage from '../src/lib/reelsWatchedStorage.mjs';
const row = (id, source, asset = id) => ({ id, source_id: source, canonical_asset_key: asset });
test('viewer source identity uses the canonical attributed creator before the sharing player', () => {
  assert.equal(feedback.reelSourceKey({source_id:'channel-A', author_id:'sharing-player'}), 'channel-a');
});
test('relevance interleaves sources, removes canonical copies, and defers watched and rapid skips without losing rows', () => {
  const rows = [row('a1','a'), row('a2','a'), row('a-copy','b','a1'), row('b1','b'), row('c1','c'), row('b2','b')];
  const ranked = feedback.rankReelsForViewer(rows, {watchedReelIds:new Set(['c1']), skippedAssetKeys:new Set(['b2'])});
  assert.deepEqual(ranked.map(r=>r.id), ['a1','b1','a2','c1','b2']);
  assert.deepEqual(feedback.rankReelsForViewer(rows, {}, {activeId:'a2'}).map(r=>r.id).slice(0,2), ['a2','b1']);
  assert.deepEqual(feedback.rankReelsForViewer(rows, {}, {chronological:true}).map(r=>r.id), rows.map(r=>r.id));
});
test('explicit hide source survives owner reload without leaking to another account', () => {
  const values = new Map();
  globalThis.localStorage = { getItem:key=>values.get(key), setItem:(key,value)=>values.set(key,value), removeItem:key=>values.delete(key) };
  try {
    const next=feedback.applyReelFeedbackState({},'hide-source',row('x','source-a'));
    storage.persistReelFeedbackState(next,'account-a');
    assert.equal(feedback.reelMatchesFeedback(row('new','source-a'),storage.loadReelFeedbackState('account-a')),true);
    assert.equal(feedback.reelMatchesFeedback(row('new','source-a'),storage.loadReelFeedbackState('account-b')),false);
    assert.equal(feedback.reelMatchesFeedback(row('new','source-a'),storage.loadReelFeedbackState()),false);
  } finally { delete globalThis.localStorage; }
});
test('completion and rapid skip are finite actual observations, not tap or seek guesses', () => {
  assert.equal(feedback.classifyReelEngagement({playedSeconds:1,duration:20}), 'skipped');
  assert.equal(feedback.classifyReelEngagement({playedSeconds:18,duration:20}), 'completed');
  assert.equal(feedback.classifyReelEngagement({playedSeconds:0,duration:20}), null);
  assert.equal(feedback.classifyReelEngagement({playedSeconds:2,duration:NaN}), null);
  assert.equal(feedback.classifyReelEngagement({playedSeconds:2,duration:2}), 'completed');
});
test('all creators get a turn, repeated canonical assets stay deferred across aliases, and feedback does not mutate input', () => {
  const rows=[row('a1','a'),row('a2','a'),row('a3','a'),row('b1','b'),row('b2','b'),row('c1','c')];
  const state={watchedAssetKeys:new Set(['a1']),skippedAssetKeys:new Set(['b2'])};
  const original=rows.slice();
  assert.deepEqual(feedback.rankReelsForViewer(rows,state).map(r=>r.id), ['a2','b1','c1','a3','a1','b2']);
  assert.deepEqual(rows,original);
  assert.deepEqual([...state.watchedAssetKeys],['a1']);
  const watched=feedback.applyReelFeedbackState({},'already-watched',row('first','a','youtube:shared'));
  assert.deepEqual(feedback.rankReelsForViewer([row('alias','a','youtube:shared'),row('fresh','b')],watched).map(r=>r.id), ['fresh','alias']);
});
test('feedback storage bounds valid keys and tolerates malformed or unavailable storage', () => {
  const values=new Map();
  globalThis.localStorage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  try {
    const state=storage.persistReelFeedbackState({hiddenSourceKeys:new Set(Array.from({length:900},(_,i)=>`source-${i}`)),watchedAssetKeys:['',null,'x'.repeat(257),'valid']},'a');
    assert.equal(state.hiddenSourceKeys.size,500);
    assert.equal(state.hiddenSourceKeys.has('source-899'),true);
    assert.deepEqual([...state.watchedAssetKeys],['valid']);
    assert.deepEqual([...storage.loadReelFeedbackState('a').hiddenSourceKeys],[...state.hiddenSourceKeys]);
    for(const key of values.keys()) values.set(key,'{');
    assert.equal(storage.loadReelFeedbackState('a').hiddenSourceKeys.size,0);
    globalThis.localStorage={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};
    assert.equal(storage.loadReelFeedbackState('a').hiddenSourceKeys.size,0);
    assert.equal(storage.persistReelFeedbackState({watchedAssetKeys:['valid']},'a').watchedAssetKeys.size,1);
  } finally {delete globalThis.localStorage;}
});
test('a completion replaces a prior skip and later partial replays do not downgrade it', () => {
  const reel=row('a','creator','youtube:a');
  const skipped=feedback.applyReelEngagementState({},reel,{playedSeconds:1,duration:20});
  assert.equal(skipped.skippedAssetKeys.has('youtube:a'),true);
  const complete=feedback.applyReelEngagementState(skipped,reel,{playedSeconds:18,duration:20});
  assert.equal(complete.skippedAssetKeys.has('youtube:a'),false);
  assert.equal(complete.watchedAssetKeys.has('youtube:a'),true);
  assert.equal(feedback.applyReelEngagementState(complete,reel,{playedSeconds:1,duration:20}).skippedAssetKeys.size,0);
  assert.equal(skipped.watchedAssetKeys.size,0);
});
