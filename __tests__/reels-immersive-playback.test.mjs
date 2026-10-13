import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { verticalReelSwipe, createReelWheelGesture, reelSeekSeconds } from '../src/lib/reelGestureNavigation.mjs';
const require = createRequire(import.meta.url);

test('deliberate vertical swipes distinguish quick flicks, diagonals and taps', () => {
  const swipe = (x,y,ms=300) => verticalReelSwipe({startX:100,startY:200,endX:100+x,endY:200+y,elapsedMs:ms});
  assert.equal(swipe(0,-60),1); assert.equal(swipe(0,60),-1);
  assert.equal(swipe(0,-30,40),1); assert.equal(swipe(0,-30,300),0);
  assert.equal(swipe(65,-60),0); assert.equal(swipe(10,-5,10),0);
  assert.equal(swipe(NaN,-100),0);
});

test('small trackpad deltas accumulate but one momentum gesture advances only one Reel', () => {
  const wheel = createReelWheelGesture();
  assert.deepEqual([wheel(20,0),wheel(20,20),wheel(20,40),wheel(100,80),wheel(80,150)], [0,0,1,0,0]);
  assert.equal(wheel(-60,400),-1);
  assert.equal(wheel(Infinity,420),0);
  assert.equal(wheel(100,440),0);
  assert.equal(wheel(60,700),1);
});

test('the actual mounted API owner preserves identity, pause intent, latest clip, mute provenance and cleanup', async () => {
  const React = require('react');
  const {create, act} = require('react-test-renderer');
  const ts = require('typescript');
  const instances = [], messages = new Set(), delivered = [], observedSound = [];
  const calls = [], frames = new Map(); let frameId = 0;
  const host = {appendChild(frame){ this.frame = frame; }};
  const frame = () => ({src:'',style:{},contentWindow:{},dataset:{}});
  const win = {requestAnimationFrame(fn){frames.set(++frameId,fn);return frameId;},cancelAnimationFrame(id){frames.delete(id);},location:{origin:'https://smarter.poker'}, addEventListener(name,fn){ if(name==='message')messages.add(fn); },removeEventListener(name,fn){messages.delete(fn);},YT:{Player: class {
    constructor(iframe,options){this.frame=iframe;this.events=options.events; instances.push(this);}
    getIframe(){return this.frame;}
    mute(){calls.push(['mute']);} unMute(){calls.push(['unMute']);} setVolume(n){calls.push(['setVolume',n]);}
    playVideo(){calls.push(['playVideo']);} pauseVideo(){calls.push(['pauseVideo']);}
    loadVideoById(value){calls.push(['load',value.videoId]);} cueVideoById(value){calls.push(['cue',value.videoId]);}
    getCurrentTime(){return 23;} getDuration(){return 92;} getPlaybackRate(){return 2;} seekTo(n){calls.push(['seekTo',n]);} destroy(){calls.push(['destroy']);}
  }}};
  const doc = {createElement:frame};
  const compile = path => ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'), {fileName:path.replace('.mjs','.js'),compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const api = {exports:{}};
  new Function('module','exports','window','document',compile('../src/lib/loadReelYouTubeAPI.mjs'))(api,api.exports,win,doc);
  const mod = {exports:{}};
  new Function('require','module','exports','window','document',compile('../src/components/reels/ReelYouTubePlayer.jsx'))(name=>name.endsWith('loadReelYouTubeAPI.mjs')?api.exports:name.endsWith('reelGestureNavigation.mjs')?{reelSeekSeconds}:require(name),mod,mod.exports,win,doc);
  const Component = mod.exports.default;
  const iframeRef={current:null},eventRef={current:event=>delivered.push(event)}, commandRef={current:null};
  const props={videoId:'AAAAAAAAAAA',iframeRef,eventRef,commandRef,onMutedChange:value=>observedSound.push(value),title:'Original Clip'};
  let tree;
  await act(async()=>{tree=create(React.createElement(Component,props),{createNodeMock:()=>host});});
  assert.equal(instances.length,1);
  const player=instances[0];
  assert.equal(new URL(iframeRef.current.src).host,'www.youtube-nocookie.com');
  assert.equal(new URL(iframeRef.current.src).searchParams.get('enablejsapi'),'1');
  assert.equal(new URL(iframeRef.current.src).searchParams.get('controls'),'0');
  // A deliberate pause before provider readiness must survive onReady.
  commandRef.current('pauseVideo');
  await act(async()=>player.events.onReady());
  assert.equal(calls.filter(c=>c[0]==='playVideo').length,0);
  assert.equal(tree.root.findByProps({'data-reel-youtube-api':'ready'}).type,'div');
  const frameIdentity=iframeRef.current;
  await act(async()=>tree.update(React.createElement(Component,{...props,title:'Metadata Refresh',muted:false})));
  assert.equal(instances.length,1); assert.equal(iframeRef.current,frameIdentity);
  assert.equal(calls.filter(c=>c[0]==='load').length,0);
  assert.equal(calls.filter(c=>c[0]==='playVideo').length,0,'metadata/sound updates cannot undo pause');
  await act(async()=>tree.update(React.createElement(Component,{...props,videoId:'BBBBBBBBBBB'})));
  assert.deepEqual(calls.filter(c=>c[0]==='load'),[['load','BBBBBBBBBBB']]);
  commandRef.current('seekToPercent',[50]);
  assert.deepEqual(calls.at(-1),['seekTo',46]);
  commandRef.current('playVideo');
  player.events.onStateChange({data:0});
  assert.ok(calls.some(c=>c[0]==='seekTo'&&c[1]===0),'ended loops current clip');
  assert.equal(instances.length,1,'switching clips keeps one iframe');
  player.events.onStateChange({data:1});
  const [id, draw] = frames.entries().next().value; frames.delete(id); draw(100);
  assert.ok(delivered.some(e=>e.data.event==='infoDelivery' && e.data.info.currentTime===23 && e.data.info.duration===92), 'progress is observed through official getters');
  assert.equal(delivered.at(-1).data.info.playbackRate,2,'played time observes the actual provider playback rate');
  player.getPlaybackRate=()=>NaN;const [invalidId,invalidDraw]=frames.entries().next().value;frames.delete(invalidId);invalidDraw(200);
  assert.equal(Object.hasOwn(delivered.at(-1).data.info,'playbackRate'),false,'unknown provider playback rate is not fabricated');
  player.events.onStateChange({data:2});
  assert.equal(frames.size,0, 'paused playback stops the presentation clock');
  player.events.onError({data:100});
  assert.equal(delivered.at(-1).data.videoId, 'BBBBBBBBBBB', 'failure reports bind the active clip, never the original iframe URL');
  await act(async()=>tree.update(React.createElement(Component,{...props,videoId:'BBBBBBBBBBB',autoplay:false})));
  commandRef.current('playVideo');
  const manual=calls.length;
  await act(async()=>tree.update(React.createElement(Component,{...props,videoId:'BBBBBBBBBBB',autoplay:false,title:'Manual Playback Metadata'})));
  assert.equal(calls.slice(manual).filter(c=>c[0]==='pauseVideo').length,0,'metadata changes cannot cancel manual playback with autoplay off');
  for(const fn of messages) {
    fn({source:{},origin:'https://www.youtube-nocookie.com',data:{event:'infoDelivery',info:{muted:false}}});
    fn({source:frameIdentity.contentWindow,origin:'https://attacker.example',data:{event:'infoDelivery',info:{muted:false}}});
  }
  assert.deepEqual(observedSound,[]);
  for(const fn of messages) fn({source:frameIdentity.contentWindow,origin:'https://www.youtube-nocookie.com',data:{event:'infoDelivery',info:{muted:false,currentTime:3,duration:10}}});
  assert.deepEqual(observedSound,[false]);
  assert.ok(delivered.some(e=>e.data.info?.currentTime===3));
  await act(async()=>tree.update(React.createElement(Component,{...props,active:false})));
  const before=calls.length, beforeEvents=delivered.length;
  player.events.onError({data:100});
  player.events.onAutoplayBlocked();
  assert.equal(delivered.length,beforeEvents,'hidden provider events cannot change the visible native clip');
  for(const fn of messages) fn({source:frameIdentity.contentWindow,origin:'https://www.youtube-nocookie.com',data:{event:'infoDelivery',info:{muted:true}}});
  assert.deepEqual(observedSound,[false], 'hidden iframe cannot overwrite visible native audio state');
  player.events.onStateChange({data:0});
  assert.deepEqual(calls.slice(before),[['pauseVideo']],'late inactive event cannot play hidden audio');
  commandRef.current('pauseVideo');
  const beforeReactivate = calls.filter(c=>c[0]==='playVideo').length;
  await act(async()=>tree.update(React.createElement(Component,{...props,videoId:'BBBBBBBBBBB',active:true})));
  assert.equal(calls.filter(c=>c[0]==='playVideo').length,beforeReactivate+1, 'returning from native media must not inherit a hidden-player pause command');
  assert.equal(instances.length,1);
  await act(async()=>tree.unmount());
  assert.equal(iframeRef.current,null);assert.equal(commandRef.current,null);assert.equal(messages.size,0);assert.equal(frames.size,0);
  const after=calls.length; player.events.onStateChange({data:1});player.events.onReady();
  assert.equal(calls.length,after,'disposed provider callbacks are ignored');
  assert.equal(calls.filter(c=>c[0]==='destroy').length,1);
});

test('the mounted provider suspends background playback and resumes only the same previously playing owner', async () => {
  const React = require('react'), {create, act} = require('react-test-renderer'), ts = require('typescript');
  const calls = [], listeners = new Map(), documentListeners = new Map();
  let player, state = 2;
  const register = (map, name, fn) => { if (!map.has(name)) map.set(name, new Set()); map.get(name).add(fn); };
  const remove = (map, name, fn) => map.get(name)?.delete(fn);
  const frame = () => ({src:'',style:{},contentWindow:{}});
  const doc = {visibilityState:'visible',hidden:false,createElement:frame,addEventListener:(name,fn)=>register(documentListeners,name,fn),removeEventListener:(name,fn)=>remove(documentListeners,name,fn)};
  const win = {location:{origin:'https://smarter.poker'},requestAnimationFrame:()=>1,cancelAnimationFrame(){},addEventListener:(name,fn)=>register(listeners,name,fn),removeEventListener:(name,fn)=>remove(listeners,name,fn),YT:{Player:class {
    constructor(iframe, options){this.frame=iframe;this.events=options.events;player=this;}
    getIframe(){return this.frame;} getPlayerState(){return state;}
    playVideo(){calls.push('play');state=1;} pauseVideo(){calls.push('pause');state=2;}
    mute(){calls.push('mute');} unMute(){calls.push('unmute');} setVolume(){}
    loadVideoById(){calls.push('load');state=1;} cueVideoById(){calls.push('cue');state=5;}
    destroy(){calls.push('destroy');}
  }}};
  const compile = path => ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{fileName:path.replace('.mjs','.js'),compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const api={exports:{}},mod={exports:{}};
  new Function('module','exports','window','document',compile('../src/lib/loadReelYouTubeAPI.mjs'))(api,api.exports,win,doc);
  new Function('require','module','exports','window','document',compile('../src/components/reels/ReelYouTubePlayer.jsx'))(name=>name.endsWith('loadReelYouTubeAPI.mjs')?api.exports:name.endsWith('reelGestureNavigation.mjs')?{reelSeekSeconds}:require(name),mod,mod.exports,win,doc);
  const commandRef={current:null}, host={appendChild(){}};
  let props={videoId:'AAAAAAAAAAA',playbackScopeKey:'owner-a',commandRef,muted:false},tree;
  const update=async values=>{props={...props,...values};await act(async()=>tree.update(React.createElement(mod.exports.default,props)));};
  const visibility=async hidden=>{doc.hidden=hidden;doc.visibilityState=hidden?'hidden':'visible';await act(async()=>{for(const fn of documentListeners.get('visibilitychange')||[])fn();});};
  await act(async()=>{tree=create(React.createElement(mod.exports.default,props),{createNodeMock:()=>host});});
  await act(async()=>player.events.onReady());
  assert.equal(state,1);
  await visibility(true);
  assert.equal(state,2,'hiding the page must pause actual provider playback');
  const hiddenAt=calls.length;
  await act(async()=>{player.events.onStateChange({data:1});player.events.onReady();});
  commandRef.current('unMute'); commandRef.current('playVideo');
  assert.equal(calls.slice(hiddenAt).filter(value=>value==='play'||value==='unmute').length,0,'late readiness, playing events and hidden commands cannot start audio');
  await visibility(false);
  assert.equal(state,1,'the same formerly playing clip resumes once');
  commandRef.current('pauseVideo');
  const pausedAt=calls.filter(value=>value==='play').length;
  await visibility(true); await visibility(false);
  assert.equal(calls.filter(value=>value==='play').length,pausedAt,'manual pause before hide survives return');
  commandRef.current('playVideo'); await visibility(true); commandRef.current('pauseVideo'); await visibility(false);
  assert.equal(state,2,'manual pause while hidden cancels lifecycle resume');
  commandRef.current('playVideo'); await visibility(true);
  await update({videoId:'BBBBBBBBBBB'});
  const changedAt=calls.filter(value=>value==='play').length;
  await visibility(false);
  assert.equal(calls.filter(value=>value==='play').length,changedAt,'a clip selected while hidden is not auto-started');
  assert.equal(state,2);
  commandRef.current('playVideo'); await visibility(true);
  await update({playbackScopeKey:'owner-b'}); await visibility(false);
  assert.equal(state,2,'changing account while hidden cannot resume prior media');
  commandRef.current('playVideo');
  await act(async()=>{for(const fn of listeners.get('pagehide')||[])fn();});
  assert.equal(state,2,'pagehide suspends even before document visibility updates');
  assert.equal(doc.hidden,false);
  const pageHideAt=calls.length;
  commandRef.current('playVideo'); commandRef.current('unMute');
  await act(async()=>{player.events.onReady();player.events.onStateChange({data:1});});
  assert.equal(calls.slice(pageHideAt).filter(value=>value==='play'||value==='unmute').length,0,'pagehide holds late commands and SDK events even while document remains visible');
  await act(async()=>{for(const fn of listeners.get('pageshow')||[])fn();});
  assert.equal(state,1);
  await act(async()=>tree.unmount());
  assert.equal([...documentListeners.values()].reduce((n,set)=>n+set.size,0),0);
  assert.equal([...listeners.values()].reduce((n,set)=>n+set.size,0),0);
  doc.hidden=true; doc.visibilityState='hidden'; state=2;
  await act(async()=>{tree=create(React.createElement(mod.exports.default,props),{createNodeMock:()=>host});});
  const startupAt=calls.length;
  await act(async()=>player.events.onReady());
  assert.equal(calls.slice(startupAt).filter(value=>value==='play'||value==='unmute').length,0,'SDK arriving after a hidden mount cannot autoplay or unmute');
  await visibility(false);
  assert.equal(state,2,'a clip that never played before hide remains paused on return');
  commandRef.current('playVideo');
  assert.equal(state,1,'explicit visible play releases the background hold');
  await act(async()=>tree.unmount());
});

test('the actual provider renders on the server without document or window globals', () => {
  const React=require('react'),ts=require('typescript'),{renderToString}=require('react-dom/server');
  const path='../src/components/reels/ReelYouTubePlayer.jsx';
  const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{fileName:path,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const mod={exports:{}};
  new Function('require','module','exports','window','document',code)(name=>name.endsWith('loadReelYouTubeAPI.mjs')?{loadReelYouTubeAPI(){throw new Error('Server rendering must never load the SDK');}}:name.endsWith('reelGestureNavigation.mjs')?{reelSeekSeconds}:require(name),mod,mod.exports,undefined,undefined);
  assert.match(renderToString(React.createElement(mod.exports.default,{videoId:'AAAAAAAAAAA'})),/data-reel-youtube-api="loading"/);
});

test('shared geometry gives mobile a full screen and desktop a portrait with accessible overlay actions', () => {
  const css=readFileSync(new URL('../src/components/reels/ImmersiveReels.module.css',import.meta.url),'utf8');
  assert.match(css,/height: 100dvh !important/);
  assert.match(css,/calc\(\(100dvh - 32px\) \* 9 \/ 16\)/);
  assert.match(css,/@media \(max-width: 759px\)[\s\S]*inset: 0 !important/);
  assert.match(css,/data-reels-actions[\s\S]*min-height: 52px !important/);
  assert.match(css,/button\):focus-visible/);
  assert.match(css,/prefers-reduced-motion/);
  assert.match(css,/\.sheet[\s\S]*background: #fff !important/);
});

test('SDK loading is single-flight, bounded, preserves prior callback and allows explicit retry after failure', async () => {
  const ts=require('typescript'); const scripts=[], deadlines=[]; let priorCalls=0;
  const previous=()=>priorCalls++;
  const win={onYouTubeIframeAPIReady:previous};
  const doc={createElement:()=>({dataset:{},remove(){this.removed=true;}}),head:{appendChild:s=>scripts.push(s)}};
  const mod={exports:{}};
  const code=ts.transpileModule(readFileSync(new URL('../src/lib/loadReelYouTubeAPI.mjs',import.meta.url),'utf8'),{fileName:'api.js',compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('module','exports','window','document','setTimeout','clearTimeout',code)(mod,mod.exports,win,doc,(fn,ms)=>{deadlines.push({fn,ms});return deadlines.length;},()=>{});
  const first=mod.exports.loadReelYouTubeAPI();
  assert.equal(mod.exports.loadReelYouTubeAPI(),first);assert.equal(scripts.length,1);
  assert.equal(scripts[0].src,'https://www.youtube.com/iframe_api');assert.equal(deadlines[0].ms,15000);
  scripts[0].onerror();await assert.rejects(first,/could not load/);
  assert.equal(scripts[0].removed,true);assert.equal(win.onYouTubeIframeAPIReady,previous);
  const retry=mod.exports.loadReelYouTubeAPI();assert.equal(scripts.length,2);
  win.YT={Player:class{}};win.onYouTubeIframeAPIReady();
  assert.equal(await retry,win.YT);assert.equal(priorCalls,1);assert.equal(win.onYouTubeIframeAPIReady,previous);
  deadlines[1].fn();assert.equal(scripts[1].removed,undefined,'late deadline cannot undo successful API readiness');
});

 test('scrubbing uses actual clip duration and clamps hostile or unknown positions', () => {
  assert.equal(reelSeekSeconds(25, 80), 20);
  assert.equal(reelSeekSeconds(150, 80), 80);
  assert.equal(reelSeekSeconds(-10, 80), 0);
  for (const duration of [undefined,0,-1,Infinity,NaN]) assert.equal(reelSeekSeconds(50,duration),null);
  assert.equal(reelSeekSeconds(NaN,80),null);
  for (const path of ['pages/hub/reels.js','src/components/social/Reels.jsx','src/components/social/ReelsFeedCarousel.jsx']) assert.match(readFileSync(new URL('../'+path,import.meta.url),'utf8'), /<ReelProgress/);
 });

test('mounted scrubber commits one drag seek, supports keyboard seeks and ignores unknown duration', async () => {
  const React=require('react'), {create,act}=require('react-test-renderer'), ts=require('typescript');
  const mod={exports:{}};
  const code=ts.transpileModule(readFileSync(new URL('../src/components/reels/ReelProgress.jsx',import.meta.url),'utf8'),{fileName:'ReelProgress.jsx',compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',code)(name=>name.endsWith('reelGestureNavigation.mjs')?{reelSeekSeconds}:require(name),mod,mod.exports);
  const videoRef={current:{duration:80,currentTime:7}},calls=[],commandRef={current:(...args)=>calls.push(args)};
  let tree;
  await act(async()=>{tree=create(React.createElement(mod.exports.default,{value:10,videoRef,commandRef}));});
  let input=tree.root.findByType('input');
  await act(async()=>input.props.onChange({target:{value:'25'}}));
  assert.equal(videoRef.current.currentTime,20);
  await act(async()=>input.props.onPointerDown({stopPropagation(){},currentTarget:{},pointerId:1}));
  await act(async()=>{tree.root.findByType('input').props.onChange({target:{value:'50'}});tree.root.findByType('input').props.onChange({target:{value:'75'}});});
  assert.equal(videoRef.current.currentTime,20,'drag movement cannot flood seek commands');
  await act(async()=>tree.root.findByType('input').props.onPointerUp({stopPropagation(){}}));
  assert.equal(videoRef.current.currentTime,60);
  videoRef.current.duration=NaN;
  await act(async()=>tree.root.findByType('input').props.onChange({target:{value:'10'}}));
  assert.equal(videoRef.current.currentTime,60,'unknown media duration does not fabricate a seek');
  await act(async()=>tree.update(React.createElement(mod.exports.default,{value:10,isYouTube:true,videoRef,commandRef})));
  await act(async()=>tree.root.findByType('input').props.onChange({target:{value:'25'}}));
  assert.deepEqual(calls,[['seekToPercent',[25]]]);
  await act(async()=>tree.unmount());
});

test('persistent Reel sheets stay open through playback and the canonical menu opens above the viewer', () => {
  const source = readFileSync(new URL('../pages/hub/reels.js', import.meta.url), 'utf8');
  const hud = source.slice(source.indexOf('  const scheduleHudHide ='), source.indexOf('  const revealOverlay ='));
  assert.doesNotMatch(hud, /setShowMoreMenu|setShowReactionPicker/);
  assert.match(source, /if \(open\) \{ setShowMoreMenu\(false\); setShowContextMenu\(false\); \}/);
  assert.match(source, /zIndex: menuOpen \? 10100 : 10001/);
});

 test('the actual navigation handler preserves Reel query updates and stops media on real exits', () => {
  const source = readFileSync(new URL('../pages/_app.js', import.meta.url), 'utf8');
  const start = source.indexOf('    const preservesReelsMedia =');
  const end = source.indexOf('    const handleComplete =', start);
  const body = source.slice(start, end) + '\nreturn handleStart;';
  function run(nextUrl, options, current = 'https://smarter.poker/hub/reels?category=poker') {
    const calls = [];
    const video = {src:'native.mp4',currentTime:7,pause(){calls.push('pause');},load(){calls.push('load');}};
    const frame = {src:'https://www.youtube-nocookie.com/embed/abcdefghijk'};
    const document = {body:{classList:{add(){calls.push('hide');}}},querySelectorAll(type){return type === 'video' ? [video] : type === 'iframe' ? [frame] : [];}};
    const window = {location:new URL(current)};
    const handler = new Function('window','document','setIsNavigating','advanceScrollLockGeneration',body)(window,document,()=>calls.push('navigating'),()=>calls.push('generation'));
    handler(nextUrl, options);
    return {calls,video,frame};
  }
  const changed = run('/hub/reels?category=sports', {shallow:true});
  assert.deepEqual(changed.calls,[]);
  assert.deepEqual(run('/hub/reels?category=sports',{shallow:false}).calls,[], 'canonical menu query navigation retains the current media');
  assert.equal(changed.video.src,'native.mp4');
  assert.equal(changed.video.currentTime,7);
  assert.match(changed.frame.src,/youtube-nocookie/);
  for (const [target, options, current] of [
    ['/hub/social-media', {shallow:true}],
    ['/hub/video-library', {shallow:false}],
    ['https://example.com/hub/reels', {shallow:true}],
    ['/hub/news?q=poker', {shallow:true}, 'https://smarter.poker/hub/news'],
  ]) {
    const exited = run(target,options,current);
    assert.ok(exited.calls.includes('pause'));
    assert.equal(exited.frame.src,'about:blank');
  }
 });

test('completion and error events preserve the active Reels viewport ownership', () => {
  const source = readFileSync(new URL('../pages/_app.js', import.meta.url), 'utf8');
  const start = source.indexOf('    const preservesReelsMedia =');
  const end = source.indexOf("    router.events.on('routeChangeStart', handleStart);", start);
  const calls = [];
  const document = {body:{classList:{remove(){calls.push('remove');}},style:{}},documentElement:{classList:{remove(){calls.push('root-remove');}}}};
  const window = {location:new URL('https://smarter.poker/hub/reels?category=poker'),scrollTo(){calls.push('scroll');}};
  const handlers = new Function('window','document','setIsNavigating','advanceScrollLockGeneration','sweepStaleScrollLocks','clearBodyScrollLockIfUnheld','setTimeout','releaseMediaStreamOnLeave','router', source.slice(start,end) + '\nreturn {handleComplete,handleError};')(window,document,()=>calls.push('navigating'),()=>{},()=>calls.push('sweep'),()=>calls.push('clear'),()=>{},()=>{},{pathname:'/hub/reels'});
  handlers.handleComplete('/hub/reels?category=sports',{shallow:true});
  handlers.handleComplete('/hub/reels?category=sports',{shallow:false});
  handlers.handleError(new Error('cancelled'),'/hub/reels?category=sports',{shallow:true});
  assert.deepEqual(calls,[]);
  handlers.handleComplete('/hub/social-media',{shallow:false});
  assert.ok(calls.includes('sweep')); assert.ok(calls.includes('root-remove'));
});

test('incoming Saved to Reels navigation reveals mounted media without clearing the incoming lock', () => {
  const source = readFileSync(new URL('../pages/_app.js', import.meta.url), 'utf8');
  const start = source.indexOf('    const preservesReelsMedia =');
  const end = source.indexOf("    router.events.on('routeChangeStart', handleStart);", start);
  for (const finish of ['complete', 'error']) {
    const calls = [];
    const classes = new Set(['reels-lock']);
    const document = {
      body: { classList: { add(value) { classes.add(value); }, remove(value) { classes.delete(value); calls.push(value); } }, style: { position: 'fixed' } },
      documentElement: { classList: { remove(value) { calls.push(`root-${value}`); } } },
      querySelectorAll() { return []; },
    };
    const window = { location: new URL('https://smarter.poker/hub/reels/saved'), scrollTo() { calls.push('scroll'); } };
    let navigating = false;
    const handlers = new Function('window', 'document', 'setIsNavigating', 'advanceScrollLockGeneration', 'sweepStaleScrollLocks', 'clearBodyScrollLockIfUnheld', 'setTimeout', 'releaseMediaStreamOnLeave', 'router', source.slice(start, end) + '\nreturn {handleStart,handleComplete,handleError};')(
      window, document, value => { navigating = value; }, () => calls.push('generation'), () => calls.push('sweep'), () => calls.push('clear'), () => {}, () => {}, { pathname: '/hub/reels/saved' },
    );
    const target = '/hub/reels?category=poker&id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    handlers.handleStart(target, { shallow: false });
    assert.equal(classes.has('page-transitioning'), true);
    assert.equal(navigating, true);
    window.location = new URL(target, window.location);
    if (finish === 'complete') handlers.handleComplete(target, { shallow: false });
    else handlers.handleError(new Error('cancelled after mount'), target, { shallow: false });
    assert.equal(classes.has('page-transitioning'), false, `${finish} must reveal the incoming video`);
    assert.equal(navigating, false);
    assert.equal(classes.has('reels-lock'), true);
    assert.equal(document.body.style.position, 'fixed');
    assert.deepEqual(calls, ['generation', 'page-transitioning']);
    handlers.handleStart('/hub/reels?category=sports', { shallow: false });
    handlers.handleComplete('/hub/reels?category=sports', { shallow: false });
    assert.deepEqual(calls, ['generation', 'page-transitioning'], 'later same-page query retains media and lock');
    handlers.handleStart('/hub/social-media', { shallow: false });
    window.location = new URL('https://smarter.poker/hub/social-media');
    handlers.handleComplete('/hub/social-media', { shallow: false });
    assert.equal(classes.has('page-transitioning'), false);
    assert.equal(classes.has('reels-lock'), false);
    assert.equal(document.body.style.position, '');
    assert.ok(calls.includes('sweep'));
    assert.ok(calls.includes('clear'));
    assert.ok(calls.includes('root-reels-lock'));
  }
});
