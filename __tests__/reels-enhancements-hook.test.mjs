import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import * as feedback from '../src/lib/reelsFeedback.mjs';
import * as storage from '../src/lib/reelsWatchedStorage.mjs';
import * as state from '../src/lib/reelsEnhancementState.mjs';
const require=createRequire(import.meta.url);
test('mounted enhancement hook measures actual native playback, excludes hidden/seek time, and ignores stale owner events',async()=>{
 const React=require('react'),{create,act}=require('react-test-renderer'),ts=require('typescript');
 const listeners=new Map(),windowListeners=new Map(),videoListeners=new Map(),values=new Map();let clock=0;
 const original={document:globalThis.document,window:globalThis.window,localStorage:globalThis.localStorage,performance:globalThis.performance};
 globalThis.document={hidden:false,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name)=>listeners.delete(name)};
 globalThis.window={addEventListener:(name,fn)=>windowListeners.set(name,fn),removeEventListener:name=>windowListeners.delete(name)};
 globalThis.localStorage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>clock}});
 const metrics=[];
 const measurement=()=>({select(){},playing(){},pause(){},waiting(){},finish(){}});
 const module={exports:{}};
 const source=ts.transpileModule(readFileSync(new URL('../src/hooks/useReelsEnhancements.js',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const deps={'react':React,'../lib/reelsFeedback.mjs':feedback,'../lib/reelsWatchedStorage.mjs':storage,'../lib/reelsEnhancementState.mjs':state,'../lib/reelsDeliveryMetrics':{createReelsPlaybackMeasurement:measurement,recordReelsDeliveryMetric:metric=>metrics.push(metric)}};
 new Function('require','module','exports',source)(name=>deps[name]||require(name),module,module.exports);
 const video={duration:20,playbackRate:1,paused:true,seeking:false,readyState:4,addEventListener:(name,fn)=>videoListeners.set(name,fn),removeEventListener:name=>videoListeners.delete(name)};
 const completed=[];let api;let props={reels:[{id:'a',source_id:'a',canonical_asset_key:'a',playback_type:'native'}],currentIndex:0,ownerId:'owner-a',videoRef:{current:video},onCompleted:id=>completed.push(id)};
 function Probe(input){api=module.exports.default(input);return null;}
 let tree;
 try {
 await act(async()=>{tree=create(React.createElement(Probe,props));});
 await act(async()=>videoListeners.get('playing')());clock=1000;await act(async()=>videoListeners.get('seeking')());
 clock=20000;await act(async()=>videoListeners.get('timeupdate')());assert.deepEqual(completed,[]);
 await act(async()=>videoListeners.get('playing')());clock=22000;globalThis.document.hidden=true;await act(async()=>listeners.get('visibilitychange')());
 clock=50000;await act(async()=>videoListeners.get('timeupdate')());assert.deepEqual(completed,[]);
 globalThis.document.hidden=false;await act(async()=>listeners.get('visibilitychange')());clock=60000;assert.deepEqual(completed,[]);
 await act(async()=>videoListeners.get('playing')());clock=75000;await act(async()=>videoListeners.get('timeupdate')());assert.deepEqual(completed,['a']);
 await act(async()=>videoListeners.get('timeupdate')());assert.deepEqual(completed,['a']);
 const stale=videoListeners.get('playing');
 props={...props,ownerId:'owner-b'};await act(async()=>tree.update(React.createElement(Probe,props)));stale();clock=99000;await act(async()=>videoListeners.get('timeupdate')());assert.deepEqual(completed,['a']);
 video.playbackRate=2;
 props={...props,reels:[{id:'fast',source_id:'fast',canonical_asset_key:'fast',playback_type:'native'}]};
 await act(async()=>tree.update(React.createElement(Probe,props)));
 video.currentTime=20;await act(async()=>videoListeners.get('seeking')());await act(async()=>videoListeners.get('timeupdate')());assert.deepEqual(completed,['a']);
 await act(async()=>videoListeners.get('playing')());clock=108000;await act(async()=>videoListeners.get('timeupdate')());assert.deepEqual(completed,['a','fast']);
 await act(async()=>api.toggleCaptions());assert.equal(api.captionRequested,true);
 props={...props,ownerId:'owner-a'};await act(async()=>tree.update(React.createElement(Probe,props)));assert.equal(api.captionRequested,false);
 } finally {
 if(tree)await act(async()=>tree.unmount());
 for(const key of ['document','window','localStorage']){if(original[key]===undefined)delete globalThis[key];else globalThis[key]=original[key];}
 Object.defineProperty(globalThis,'performance',{configurable:true,value:original.performance});
 }
 assert.equal(videoListeners.size,0);assert.equal(listeners.size,0);assert.equal(windowListeners.size,0);
});

test('actual collector attributes departing summary to its captured native video after ref swap',async()=>{
 const React=require('react'),{create,act}=require('react-test-renderer'),ts=require('typescript');
 const saved=new Map(['document','window','navigator','performance','fetch'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const collected=[];let clock=0;
 const compile=path=>ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const contract=await import('../src/lib/reelsDeliveryContract.mjs');
 const metricModule={exports:{}};new Function('require','module','exports',compile('../src/lib/reelsDeliveryMetrics.js'))(name=>name==='./reelsDeliveryContract.mjs'?contract:require(name),metricModule,metricModule.exports);
 const module={exports:{}};const deps={'react':React,'../lib/reelsFeedback.mjs':feedback,'../lib/reelsWatchedStorage.mjs':storage,'../lib/reelsEnhancementState.mjs':state,'../lib/reelsDeliveryMetrics':metricModule.exports};
 new Function('require','module','exports',compile('../src/hooks/useReelsEnhancements.js'))(name=>deps[name]||require(name),module,module.exports);
 const videos=[1,2].map(n=>({duration:20,paused:true,playbackRate:1,currentSrc:`https://media.example/${n}.mp4`,addEventListener(){},removeEventListener(){},getVideoPlaybackQuality:()=>({droppedVideoFrames:n,totalVideoFrames:n*100})}));
 const ref={current:videos[0]};let props={reels:[{id:'departing',playback_type:'native'}],ownerId:'collector-owner',videoRef:ref};let tree;
 function Probe(input){module.exports.default(input);return null;}
 try{
 Object.defineProperties(globalThis,{document:{configurable:true,value:{hidden:false,addEventListener(){},removeEventListener(){}}},window:{configurable:true,value:{innerWidth:390,addEventListener(){},removeEventListener(){}}},navigator:{configurable:true,value:{}},performance:{configurable:true,value:{now:()=>clock,getEntriesByType:()=>[{name:videos[0].currentSrc,startTime:1,transferSize:1024,decodedBodySize:1024},{name:videos[1].currentSrc,startTime:1,transferSize:2048,decodedBodySize:2048}]}},fetch:{configurable:true,value:async(_url,options)=>{collected.push(JSON.parse(options.body));return{ok:true};}}});
 await act(async()=>{tree=create(React.createElement(Probe,props));});clock=1000;ref.current=videos[1];props={...props,reels:[{id:'next',playback_type:'native'}]};await act(async()=>tree.update(React.createElement(Probe,props)));
 const departing=collected[0];assert.equal(departing.event_kind,'summary');assert.equal(departing.dropped_frames,1);assert.equal(departing.decoded_frames,100);assert.equal(departing.transferred_kb,1);
 ref.current=videos[1];props={...props,reels:[{id:'provider',playback_type:'youtube',youtube_video_id:'abcdefghijk'}]};await act(async()=>tree.update(React.createElement(Probe,props)));await act(async()=>tree.unmount());tree=null;
 const provider=collected.at(-1);assert.equal(provider.playback_type,'youtube');assert.equal(provider.dropped_frames,null);assert.equal(provider.transferred_kb,null);
 }finally{if(tree)await act(async()=>tree.unmount());for(const[key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});

test('actual played hook cannot complete during SDK recreation, readiness failure, error or blocked autoplay',async()=>{
 const React=require('react'),{create,act}=require('react-test-renderer'),ts=require('typescript');let clock=0,api,tree;
 const saved=new Map(['document','window','performance'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const completed=[],measurementStops=[];
 const module={exports:{}},source=ts.transpileModule(readFileSync(new URL('../src/hooks/useReelsEnhancements.js',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const deps={'react':React,'../lib/reelsFeedback.mjs':feedback,'../lib/reelsWatchedStorage.mjs':storage,'../lib/reelsEnhancementState.mjs':state,'../lib/reelsDeliveryMetrics':{createReelsPlaybackMeasurement:()=>({select(){},playing(){},pause:id=>measurementStops.push(id),waiting(){},finish(){}}),recordReelsDeliveryMetric(){}}};
 new Function('require','module','exports',source)(name=>deps[name]||require(name),module,module.exports);
 const row={id:'sdk-owned',youtube_video_id:'AAAAAAAAAAA',playback_type:'youtube',canonical_asset_key:'sdk-owned'};
 function Probe(){api=module.exports.default({reels:[row],ownerId:'timing-owner',videoRef:{current:null},onCompleted:id=>completed.push(id)});return null;}
 const send=(event,info)=>act(async()=>api.youtubeEvent({data:{event,info,videoId:row.youtube_video_id}}));
 try{
 Object.defineProperties(globalThis,{document:{configurable:true,value:{hidden:false,addEventListener(){},removeEventListener(){}}},window:{configurable:true,value:{addEventListener(){},removeEventListener(){}}},performance:{configurable:true,value:{now:()=>clock}}});
 await act(async()=>{tree=create(React.createElement(Probe));});
 for(const event of ['onPlayerDisposed','onPlayerUnavailable','onError','onAutoplayBlocked']){
 await send('onStateChange',1);clock+=1000;await send(event);clock+=20000;await send('infoDelivery',{duration:10});assert.deepEqual(completed,[],event+' must not count an unavailable interval');
 }
 assert.equal(measurementStops.length,4);await send('onStateChange',1);clock+=6000;await send('infoDelivery',{duration:10});assert.deepEqual(completed,['sdk-owned'],'only actual resumed playing finishes the clip');
 }finally{if(tree)await act(async()=>tree.unmount());for(const[key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
