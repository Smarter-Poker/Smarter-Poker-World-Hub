import { reelYouTubeFrameHtml } from '../src/lib/reelsSeo.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

async function fixture(props={}) {
  const React=require('react'),{create,act}=require('react-test-renderer'),ts=require('typescript');
  const calls=[],instances=[],captions=[],events=[],timers=new Map(),listeners=new Map();let nextTimer=0;
  const add=(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);};
  const doc={hidden:false,visibilityState:'visible',createElement:()=>({style:{},contentWindow:{}}),addEventListener:add,removeEventListener:(name,fn)=>listeners.get(name)?.delete(fn)};
  const win={location:{origin:'https://smarter.poker'},addEventListener:add,removeEventListener:(name,fn)=>listeners.get(name)?.delete(fn),requestAnimationFrame:()=>1,cancelAnimationFrame(){}};
  const YT={Player:class {
    constructor(frame,options){this.frame=frame;this.events=options.events;this.state=2;this.seconds=0;this.videoId=new URL(frame.src).pathname.split('/').pop();this.modules=[];instances.push(this);}
    getIframe(){return this.frame;} getPlayerState(){return this.state;} getCurrentTime(){return this.seconds;}getVideoData(){return{video_id:this.videoId};}
    getOptions(module){return module==='captions'?['fontSize','reload']:this.modules;}
    setOption(...args){calls.push(['option',...args]);}mute(){calls.push(['mute']);}unMute(){calls.push(['unmute']);}setVolume(){}
    playVideo(){calls.push(['play']);this.state=1;}pauseVideo(){calls.push(['pause']);this.state=2;}seekTo(seconds){calls.push(['seek',seconds]);this.seconds=seconds;}
    loadVideoById(value){this.videoId=value.videoId;this.state=1;calls.push(['load',value.videoId]);}cueVideoById(value){this.videoId=value.videoId;this.state=5;calls.push(['cue',value.videoId]);}destroy(){calls.push(['destroy']);if(this.frame.parentNode)this.frame.parentNode.frame=null;}
  }};
  const path='../src/components/reels/ReelYouTubePlayer.jsx';
  const source=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{fileName:path,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const mod={exports:{}};
  new Function('require','module','exports','window','document','setTimeout','clearTimeout',source)(name=>name.endsWith('loadReelYouTubeAPI.mjs')?{loadReelYouTubeAPI:()=>Promise.resolve(YT)}:name.endsWith('reelGestureNavigation.mjs')?{reelSeekSeconds:()=>null}:name.endsWith('reelsSeo.mjs')?{reelYouTubeFrameHtml}:require(name),mod,mod.exports,win,doc,(fn,ms)=>{timers.set(++nextTimer,{fn,ms});return nextTimer;},id=>timers.delete(id));
  const commandRef={current:null},iframeRef={current:null};
  let current={videoId:'AAAAAAAAAAA',playbackScopeKey:'account-a',commandRef,iframeRef,eventRef:{current:event=>events.push({...event,frameAtDelivery:iframeRef.current})},onCaptionsStateChange:value=>captions.push(value),...props},tree;
  await act(async()=>{tree=create(React.createElement(mod.exports.default,current),{createNodeMock:()=>({frame:null,querySelector(){return this.frame;},appendChild(frame){this.frame=frame;frame.parentNode=this;}})});});
  return {calls,instances,captions,events,timers,doc,commandRef,iframeRef,act,tree,
    ready:async()=>act(async()=>instances.at(-1).events.onReady()),
    update:async values=>{current={...current,...values};await act(async()=>tree.update(React.createElement(mod.exports.default,current)));},
    hidden:async value=>{doc.hidden=value;doc.visibilityState=value?'hidden':'visible';await act(async()=>{for(const fn of listeners.get('visibilitychange')||[])fn();});},
    close:async()=>act(async()=>tree.unmount())};
}

test('spoken captions use the official request and font-size API without claiming track availability',async()=>{
  const f=await fixture({captionsRequested:true,captionsFontSize:2});
  assert.equal(new URL(f.iframeRef.current.src).searchParams.get('cc_load_policy'),'1');
  await f.ready();assert.equal(f.captions.at(-1).status,'provider-managed');
  const player=f.instances[0];player.modules=['captions'];await f.act(async()=>player.events.onApiChange());
  assert.deepEqual(f.calls.find(value=>value[0]==='option'),['option','captions','fontSize',2]);
  assert.equal(f.captions.at(-1).status,'module-ready');assert.equal(f.captions.at(-1).availability,'provider-managed');
  player.seconds=17.25;f.commandRef.current('pauseVideo');await f.update({captionsRequested:false});
  assert.equal(f.instances.length,2);assert.equal(f.calls.filter(value=>value[0]==='destroy').length,1);
  assert.equal(new URL(f.iframeRef.current.src).searchParams.has('cc_load_policy'),false,'provider preference is not falsely forced off');
  const count=f.calls.filter(value=>value[0]==='play').length;await f.ready();
  assert.equal(f.instances[1].seconds,17.25);assert.equal(f.calls.filter(value=>value[0]==='play').length,count,'caption request changes preserve manual pause');
  await f.close();assert.equal(f.timers.size,0);
});

test('caption changes while hidden preserve lifecycle suspension and same-clip resume authority',async()=>{
  const f=await fixture();await f.ready();f.instances[0].seconds=12.5;await f.hidden(true);await f.update({captionsRequested:true});
  const count=f.calls.filter(value=>value[0]==='play').length;await f.ready();
  assert.equal(f.calls.filter(value=>value[0]==='play').length,count);assert.equal(f.instances[1].seconds,12.5);
  await f.hidden(false);assert.equal(f.instances[1].state,1);await f.close();
});

test('ready failure is bounded and late callbacks cannot autoplay before explicit recovery',async()=>{
  const f=await fixture();const deadline=[...f.timers.values()].find(value=>value.ms===15000);
  assert.ok(deadline,'an iframe whose SDK loaded but never became ready must reach a bounded error');
  await f.act(async()=>deadline.fn());
  assert.equal(f.tree.root.findByProps({'data-reel-youtube-api':'error'}).type,'div');
  const count=f.calls.filter(value=>value[0]==='play').length;await f.ready();await f.act(async()=>f.instances[0].events.onStateChange({data:1}));
  assert.equal(f.calls.filter(value=>value[0]==='play').length,count);
  await f.act(async()=>f.tree.root.findByType('button').props.onClick());await f.ready();assert.equal(f.instances.length,2);
  await f.close();
});

test('rapid clip changes reject late provider errors from the previous clip and late playing after manual pause',async()=>{
  const f=await fixture();await f.ready();const player=f.instances[0];await f.update({videoId:'BBBBBBBBBBB'});
  player.videoId='AAAAAAAAAAA';const errors=f.events.filter(value=>value.data.event==='onError').length;
  player.events.onError({data:100});assert.equal(f.events.filter(value=>value.data.event==='onError').length,errors);
  player.videoId='BBBBBBBBBBB';f.commandRef.current('pauseVideo');const count=f.events.filter(value=>value.data.event==='onStateChange'&&value.data.info===1).length;
  player.events.onStateChange({data:1});assert.equal(player.state,2);assert.equal(f.events.filter(value=>value.data.event==='onStateChange'&&value.data.info===1).length,count);
  await f.close();
});

test('owned disposal and readiness failures reach validated consumers before the iframe disappears',async()=>{
 const f=await fixture();await f.ready();const departing=f.iframeRef.current;await f.update({captionsRequested:true});
 const disposed=f.events.filter(value=>value.data.event==='onPlayerDisposed');assert.equal(disposed.length,1);assert.equal(disposed[0].source,departing.contentWindow);assert.equal(disposed[0].frameAtDelivery,departing);assert.equal(disposed[0].data.videoId,'AAAAAAAAAAA');
 const current=f.iframeRef.current;await f.act(async()=>[...f.timers.values()].find(value=>value.ms===15000).fn());
 const unavailable=f.events.find(value=>value.data.event==='onPlayerUnavailable');assert.ok(unavailable);assert.equal(unavailable.source,current.contentWindow);assert.equal(unavailable.frameAtDelivery,current);assert.equal(unavailable.origin,'https://www.youtube-nocookie.com');
 await f.close();assert.equal(f.events.filter(value=>value.data.event==='onPlayerDisposed').length,2);
});
