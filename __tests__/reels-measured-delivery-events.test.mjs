import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { nativeDeliveryPolicy } from '../src/lib/reelsDeliveryContract.mjs';
const contract = await readFile(new URL('../src/lib/reelsDeliveryContract.mjs', import.meta.url), 'utf8');
const source = (await readFile(new URL('../src/lib/reelsDeliveryMetrics.js', import.meta.url), 'utf8')).replace('./reelsDeliveryContract.mjs', `data:text/javascript;base64,${Buffer.from(contract).toString('base64')}`);
const { createReelsPlaybackMeasurement, finiteMeasurement, observableTransferredBytes } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('unknown timing and invisible cross-origin byte counts never become zero', () => {
  for (const value of [undefined, null, '', NaN, -1, '0']) assert.equal(finiteMeasurement(value), null);
  assert.equal(finiteMeasurement(0), 0);
  assert.equal(observableTransferredBytes([], 'url'), null);
  assert.equal(observableTransferredBytes([{name:'url',startTime:1,transferSize:0,decodedBodySize:0}], 'url'), null);
  assert.equal(observableTransferredBytes([{name:'url',startTime:1,transferSize:512,decodedBodySize:400}], 'url'), 512);
});
test('actual playback events measure startup, swipe and one bounded stall interval', () => {
  let clock = 10; const events = [];
  const measure = createReelsPlaybackMeasurement({now:()=>clock,onMetric:event=>events.push(event)});
  measure.select({reelId:'one',playbackType:'native'});
  clock=110; measure.playing('wrong'); assert.equal(events.length,0);
  measure.playing('one'); measure.playing('one'); assert.equal(events.length,1);
  assert.equal(events[0].startupMs,100);
  clock=150; measure.waiting('one'); measure.waiting('one');
  clock=250; measure.playing('one');
  const summary=measure.finish('one'); assert.equal(summary.stallCount,1);assert.equal(summary.stallMs,100);
  assert.equal(measure.finish('one'),null);
  clock=300;measure.select({reelId:'two',transition:true});clock=450;measure.playing('two');
  assert.equal(events.at(-1).swipeMs,150);
});
test('unplayed clips keep unknown startup and Saver never invents rendition URLs', () => {
  const measurement=createReelsPlaybackMeasurement({now:()=>10});measurement.select({reelId:'never'});
  assert.equal(measurement.finish('never').startupMs,null);
  assert.equal(nativeDeliveryPolicy({dataSaver:true}).prefetchBytes,0);
  assert.equal(nativeDeliveryPolicy({connection:{effectiveType:'3g'}}).prefetchBytes,300000);
});


test('app Saver off cannot override browser Saver or slow-2g intent',()=>{
 assert.equal(nativeDeliveryPolicy({dataSaver:false,connection:{saveData:true,effectiveType:'4g'}}).prefetchBytes,0);
 assert.equal(nativeDeliveryPolicy({dataSaver:false,connection:{saveData:false,effectiveType:'2g'}}).prefetchBytes,0);
 assert.equal(nativeDeliveryPolicy({dataSaver:false,connection:{saveData:false,effectiveType:'4g'}}).prefetchBytes,1500000);
});
