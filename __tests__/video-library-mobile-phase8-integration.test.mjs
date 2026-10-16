import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const library = readFileSync(new URL('../pages/hub/video-library.js', import.meta.url), 'utf8');
const watch = readFileSync(new URL('../pages/hub/video-library/watch/[videoId]/[[...slug]].js', import.meta.url), 'utf8');
test('Phase 8 entries are actually mounted and canonical tracking owns only one save path', () => {
 assert.match(library, /<MemberClipUpload \/>/);
 // Owner update 2026-10-15: no Control Panel in public browsing navigation.
 assert.doesNotMatch(library, /href="\/hub\/video-library\/owner"|Control Panel/);
 assert.match(watch, /const tracking = useVideoLibraryWatchTracking\(/);
 assert.match(watch, /<WatchTracking tracking=\{tracking\}/);
 assert.doesNotMatch(watch, /updateWatchDuration\(|flushWatchDuration\(/);
});
test('canonical iframe is discoverable without autoplay and resume commands preserve its source', () => {
 assert.doesNotMatch(watch, /resumeSnapshot|start=\$\{tracking\.|onClick=\{startWatching\}/);
 assert.match(watch, /autoplay=0/);
 assert.match(watch, /onClick=\{resumeWatching\}/);
 const start=watch.indexOf('    const commandPlayer =');
 const end=watch.indexOf('    // The library menu',start);
 assert.ok(start>=0 && end>start,'actual watch command handlers exist');
 const sent=[],iframe={contentWindow:{postMessage:(body,origin)=>sent.push({data:JSON.parse(body),origin})}};
 const document={hidden:false},tracking={resumeSeconds:120};let mini=true;
 const handlers=new Function('iframeRef','PLAYER_ORIGIN','document','tracking','setMiniPlayer',`${watch.slice(start,end)};return {resumeWatching,closePlayer};`)({current:iframe},'https://www.youtube-nocookie.com',document,tracking,value=>{mini=value;});
 handlers.resumeWatching();
 assert.deepEqual(sent.map(item=>item.data),[{event:'command',func:'seekTo',args:[120,true]},{event:'command',func:'playVideo',args:[]}]);
 assert.ok(sent.every(item=>item.origin==='https://www.youtube-nocookie.com'));
 handlers.closePlayer();assert.equal(sent.at(-1).data.func,'pauseVideo');assert.equal(mini,false);
 document.hidden=true;handlers.resumeWatching();assert.equal(sent.length,3,'hidden tabs cannot start a resume');
 document.hidden=false;tracking.resumeSeconds=0;handlers.resumeWatching();assert.equal(sent.length,3,'missing saved position cannot seek');
 assert.equal(iframe.src,undefined,'resume/close handlers never replace the iframe source');
});
test('library totals and current seek position reflect authoritative acknowledgment instead of local elapsed estimates', () => {
 const body = library.slice(library.indexOf('const saveWatchSession ='), library.indexOf('saveWatchSessionRef.current ='));
 assert.match(body, /totalWatchedSeconds: persistedTotal/);
 assert.match(body, /watchedSeconds: nextProgress/);
 assert.match(body, /const confirmedTotal = persistedTotal/);
 assert.doesNotMatch(body, /Math\.max\(totalWatched|previousWatched \+ watchedSeconds/);
 assert.match(body, /Watch Progress Could Not Be Confirmed/);
});
test('saved zero seek position is retained instead of falling back to cumulative viewing time', () => {
 const service=readFileSync(new URL('../src/services/videoWatchHistory.js',import.meta.url),'utf8');
 const expression=service.match(/watchedSeconds:\s*([^\n]+),/)[1];
 const project=new Function('v',`return ${expression};`);
 assert.equal(project({progress_seconds:0,watch_duration_seconds:120}),0);
 assert.equal(project({progress_seconds:30,watch_duration_seconds:120}),30);
 assert.equal(project({progress_seconds:null,watch_duration_seconds:120}),120);
});

function libraryLifecycle() {
 const video={id:'abcdefghijk',videoId:'abcdefghijk'};
 const refs={watchStartTimeRef:{current:1000},currentWatchingVideoRef:{current:video},isPlayerPlayingRef:{current:true},watchSessionUserIdRef:{current:'owner'},pendingFlushRef:{current:false},playerPositionRef:{current:12},saveWatchSessionRef:{current:()=>{}}};
 let clock=11000;
 const document={visibilityState:'visible',hidden:false,addEventListener(){},removeEventListener(){}};
 const calls=[];
 const values={...refs,document,window:{addEventListener(){},removeEventListener(){}},Date:{now:()=>clock},userId:'owner',selectedVideo:video,ownerScopeRef:{current:{capture:()=>({}),isCurrent:()=>true}},flushWatchDuration:(...args)=>{calls.push(args);return Promise.resolve(true);},parseDuration:()=>600,reportVideoLibraryIssue(){},setTimeout:()=>0};
 const names=Object.keys(values);
 const evaluate=body=>new Function(...names,body)(...Object.values(values));
 const stateBody=library.slice(library.indexOf('const handlePlayerStateChange = useCallback((state) => {')+'const handlePlayerStateChange = useCallback((state) => {'.length,library.indexOf('}, [userId]);',library.indexOf('const handlePlayerStateChange =')));
 const state=evaluate(`return state=>{${stateBody}}`);
 const start=library.indexOf('const flushWatchTime = () => {');
 const end=library.indexOf("document.addEventListener('visibilitychange', onVisibilityChange);",start);
 const lifecycle=evaluate(`${library.slice(start,end)};return {flushWatchTime,onVisibilityChange};`);
 return {refs,calls,state,hide(){document.hidden=true;document.visibilityState='hidden';lifecycle.onVisibilityChange();},show(){document.hidden=false;document.visibilityState='visible';lifecycle.onVisibilityChange();},advance(ms){clock+=ms;},flush:lifecycle.flushWatchTime};
}
test('actual library handlers resume tracking after a hidden pause without crediting hidden playback',()=>{
 const h=libraryLifecycle();h.hide();
 assert.equal(h.calls.length,1);
 h.state(2);h.advance(30000);h.show();h.state(1);
 assert.ok(h.refs.currentWatchingVideoRef.current,'the mounted viewer retains its video identity');
 assert.equal(h.refs.watchStartTimeRef.current,41000,'resume starts a fresh visible credit segment');
 h.advance(5000);h.hide();assert.equal(h.calls.length,2);assert.equal(h.calls[1][1],5);
 h.state(1);assert.equal(h.refs.watchStartTimeRef.current,null,'hidden PLAYING cannot restart credited time');
 h.advance(30000);h.flush();assert.equal(h.calls.length,2,'duplicate lifecycle events cannot resubmit a segment');
 h.show();assert.equal(h.refs.watchStartTimeRef.current,76000);
 h.advance(2000);h.hide();assert.equal(h.calls.length,3,'a distinct short visible segment is not lost to a debounce');assert.equal(h.calls[2][1],2);
});
