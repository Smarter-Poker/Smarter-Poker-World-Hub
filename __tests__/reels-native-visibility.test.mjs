import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeReelVisibility } from '../src/lib/nativeReelVisibility.mjs';

function setup({ paused = false } = {}) {
  const doc = new EventTarget(), win = new EventTarget(); doc.hidden = false;
  let identity = 'account-a:clip-a';
  let pauses = 0, plays = 0;
  const video = { src:'a.mp4', currentSrc:'a.mp4', paused, ended:false,
    pause(){this.paused=true;pauses++;}, play(){this.paused=false;plays++;return Promise.resolve();} };
  const cleanup = createNativeReelVisibility({getVideo:()=>video,getIdentity:()=>identity,document:doc,window:win});
  return {doc,win,video,cleanup,changeIdentity:value=>identity=value,
    hide(){doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));},
    show(){doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));},
    counts:()=>({pauses,plays})};
}
test('hidden native media stops once and resumes the same formerly playing clip once',()=>{
  const s=setup();s.hide();s.hide();assert.deepEqual(s.counts(),{pauses:1,plays:0});
  s.show();s.show();assert.deepEqual(s.counts(),{pauses:1,plays:1});s.cleanup();
});
test('manual pause, changed account, changed clip and changed resource never resume',()=>{
  const paused=setup({paused:true});paused.hide();paused.show();assert.equal(paused.counts().plays,0);paused.cleanup();
  for(const change of [s=>s.changeIdentity('account-b:clip-a'),s=>s.changeIdentity('account-a:clip-b'),s=>s.video.currentSrc='b.mp4']) {
    const s=setup();s.hide();change(s);s.show();assert.equal(s.counts().plays,0);s.cleanup();
  }
});
test('pagehide suspends without visibilitychange and disposal removes resume authority',()=>{
  const s=setup();s.win.dispatchEvent(new Event('pagehide'));assert.equal(s.video.paused,true);
  s.win.dispatchEvent(new Event('pageshow'));assert.equal(s.counts().plays,1);
  s.hide();s.cleanup();s.show();assert.equal(s.counts().plays,1);
});

test('late hidden play events are paused without granting a new resume authority',()=>{
  const s=setup({paused:true});s.hide();
  s.video.paused=false;
  const event=new Event('play');Object.defineProperty(event,'target',{value:s.video});s.doc.dispatchEvent(event);
  assert.equal(s.video.paused,true);s.show();assert.equal(s.counts().plays,0);s.cleanup();
});
test('pagehide holds playback while document visibility still says visible',()=>{
  const s=setup({paused:true});s.win.dispatchEvent(new Event('pagehide'));
  assert.equal(s.doc.hidden,false);
  s.video.paused=false;
  const event=new Event('play');Object.defineProperty(event,'target',{value:s.video});s.doc.dispatchEvent(event);
  assert.equal(s.video.paused,true);s.win.dispatchEvent(new Event('pageshow'));assert.equal(s.counts().plays,0);s.cleanup();
});
