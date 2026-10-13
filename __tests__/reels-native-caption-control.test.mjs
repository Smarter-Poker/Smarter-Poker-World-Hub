import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import * as captions from '../src/lib/reelNativeCaptions.mjs';
const require=createRequire(import.meta.url),storageUrl='https://kuklfnapbkmacvwxktbh.supabase.co';
const owner='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
const url=reelId=>`${storageUrl}/storage/v1/object/public/social-media/reels/${owner}/caption-${reelId}-${'a'.repeat(64)}.vtt`;
const vtt='WEBVTT\n\n00:00.000 --> 00:01.500\nOriginal Test Tone\n';
const response=value=>({ok:true,json:async()=>({success:true,url:value})});
async function fixture({fetcher=async()=>response(url(id)),creator=true}={}){
 const React=require('react'),{create,act}=require('react-test-renderer'),ts=require('typescript');
 const calls=[],timers=new Map();let next=0,chooser=0,toggles=0;
 const video={children:[],duration:5,appendChild(element){this.children.push(element);},textTracks:[]};
 const doc={createElement(kind){assert.equal(kind,'track');const events=new Map();const element={track:{mode:'disabled'},readyState:0,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:(name,fn)=>{if(events.get(name)===fn)events.delete(name);},remove(){video.children=video.children.filter(value=>value!==element);},fire:name=>events.get(name)?.()};return element;}};
 const input={click(){chooser++;}};
 const path='../src/components/reels/ReelCaptionControl.jsx';const source=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{fileName:path,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const mod={exports:{}};new Function('require','module','exports','document','setTimeout','clearTimeout',source)(name=>name.endsWith('reelNativeCaptions.mjs')?captions:require(name),mod,mod.exports,doc,(fn,ms)=>{timers.set(++next,{fn,ms});return next;},value=>timers.delete(value));
 const uploadCommandRef={current:null};let props={native:true,reel:{id,author_id:owner},ownerId:creator?owner:other,videoRef:{current:video},requested:true,onToggle:()=>toggles++,getAccessToken:()=> 'test-fixture-token',uploadCommandRef,storageUrl,fetcher:async(address,options)=>{calls.push({address,options});return fetcher(address,options);}},tree;
 await act(async()=>{tree=create(React.createElement(mod.exports.default,props),{createNodeMock:element=>element.type==='input'?input:null});});
 return{act,tree,video,calls,timers,uploadCommandRef,chooser:()=>chooser,toggles:()=>toggles,
  update:async values=>{props={...props,...values};await act(async()=>tree.update(React.createElement(mod.exports.default,props)));},
  select:async file=>act(async()=>tree.root.findByType('input').props.onChange({target:{files:[file],value:'selected'}})),
  close:async()=>act(async()=>tree.unmount())};
}
test('native CC attaches only the verified API track and waits for actual browser load before availability',async()=>{
 const f=await fixture();assert.equal(f.calls[0].address,`/api/reels/captions?id=${id}`);assert.equal(f.tree.root.findByType('button').props['data-reel-caption-status'],'loading');assert.equal(f.tree.root.findByType('button').props.disabled,true);assert.equal(f.video.children[0].src,url(id));
 await f.act(async()=>f.video.children[0].fire('load'));assert.equal(f.tree.root.findByType('button').props['data-reel-caption-status'],'available');assert.equal(f.video.children[0].track.mode,'showing');await f.update({requested:false});assert.equal(f.video.children[0].track.mode,'disabled');await f.close();assert.equal(f.video.children.length,0);
});
test('a metadata read failure is an explicit retry state, never claimed missing captions',async()=>{
 let attempts=0;const f=await fixture({fetcher:async()=>{attempts++;if(attempts===1)throw new Error('Service Unavailable');return response(null);}});assert.equal(f.tree.root.findByType('button').props['data-reel-caption-status'],'error');assert.equal(attempts,1);
 await f.act(async()=>f.tree.root.findByType('button').props.onClick());assert.equal(attempts,2);assert.equal(f.tree.root.findByType('button').props['data-reel-caption-status'],'unavailable');await f.close();
});
test('clip/account transitions abort old metadata and cannot attach a stale caption track',async()=>{
 let resolveOld;const old=new Promise(resolve=>resolveOld=resolve);let count=0;const f=await fixture({fetcher:async()=>++count===1?old:response(null)});await f.update({reel:{id:other,author_id:owner},ownerId:other});assert.equal(f.calls[0].options.signal.aborted,true);
 await f.act(async()=>resolveOld(response(url(id))));assert.equal(f.video.children.length,0);assert.equal(f.tree.root.findByType('button').props['data-reel-caption-status'],'unavailable');assert.equal(f.uploadCommandRef.current,null);await f.close();
});
test('only the current creator command can open the hidden bounded VTT chooser',async()=>{
 const visitor=await fixture({creator:false});assert.equal(visitor.uploadCommandRef.current,null);await visitor.close();
 const f=await fixture();f.uploadCommandRef.current();assert.equal(f.chooser(),1);await f.select({name:'not-caption.txt',size:10,text:async()=>vtt});assert.equal(f.calls.filter(value=>value.options.method==='POST').length,0);await f.select({name:'huge.vtt',size:102401,text:async()=>vtt});assert.equal(f.calls.filter(value=>value.options.method==='POST').length,0);await f.close();
});
test('verified creator upload replaces only its owned track and still waits for browser caption load',async()=>{
 const f=await fixture();await f.act(async()=>f.video.children[0].fire('load'));const previous=f.video.children[0];await f.select({name:'captions.vtt',size:vtt.length,text:async()=>vtt});assert.equal(f.calls.filter(value=>value.options.method==='POST').length,1);assert.equal(f.video.children.length,1);assert.notEqual(f.video.children[0],previous);assert.equal(f.tree.root.findByType('button').props['data-reel-caption-status'],'loading');await f.act(async()=>f.video.children[0].fire('error'));assert.equal(f.tree.root.findByType('button').props['data-reel-caption-status'],'error');await f.close();
});
test('a delayed file read cannot upload to the next clip or a switched account',async()=>{
 let resolveText;const text=new Promise(resolve=>resolveText=resolve);const f=await fixture();await f.select({name:'captions.vtt',size:80,text:()=>text});await f.update({reel:{id:other,author_id:owner},ownerId:other});await f.act(async()=>resolveText(vtt));assert.equal(f.calls.filter(value=>value.options.method==='POST').length,0);await f.close();
});
test('an unknown upload outcome requires metadata readback before any additional upload command',async()=>{
 const f=await fixture({fetcher:async(_address,options)=>options.method==='POST'?new Promise(()=>{}):response(url(id))});await f.select({name:'captions.vtt',size:vtt.length,text:async()=>vtt});const timeout=[...f.timers.values()].filter(value=>value.ms===15000).at(-1);assert.ok(timeout);await f.act(async()=>timeout.fn());assert.equal(f.tree.root.findByType('button').props['data-reel-caption-status'],'error');const before=f.chooser();await f.act(async()=>f.uploadCommandRef.current());assert.equal(f.chooser(),before,'unknown POST outcome triggers readback, not another chooser/write');assert.equal(f.calls.filter(value=>value.options.method==='POST').length,1);assert.ok(f.calls.filter(value=>!value.options.method).length>=2);await f.close();
});
test('a browser track that never settles exposes retry and clears its deadline on disposal',async()=>{
 const f=await fixture();assert.equal(f.timers.size,1);await f.act(async()=>[...f.timers.values()][0].fn());assert.equal(f.tree.root.findByType('button').props['data-reel-caption-status'],'error');assert.equal(f.video.children[0].track.mode,'disabled');assert.equal(f.timers.size,0);await f.close();
});
test('all three viewers keep Back before CC, attach authenticated ownership, creator More upload and native CORS',()=>{
 for(const path of ['../pages/hub/reels.js','../src/components/social/Reels.jsx','../src/components/social/ReelsFeedCarousel.jsx']){
 const source=readFileSync(new URL(path,import.meta.url),'utf8');const header=source.slice(source.indexOf('data-reels-topbar'),source.indexOf('</header>',source.indexOf('data-reels-topbar')));assert.ok(header.indexOf('name="back"')>=0||header.indexOf('icon="back"')>=0);assert.ok(Math.max(header.indexOf('name="back"'),header.indexOf('icon="back"'))<header.indexOf('<ReelCaptionControl'));assert.match(source,/<ReelCaptionControl[^>]+reel=\{currentReel\}[^>]+ownerId=[^>]+getAccessToken=\{getAccessToken\}[^>]+uploadCommandRef=\{captionUploadRef\}/);assert.match(source,/<video\s+crossOrigin="anonymous"/);assert.match(source,/author_id ===[^?]+\?[^\n]+Add Or Replace Spoken Captions/);
 }
});

test('loaded native default cues clear the controls while explicit creator placement and genuine text remain unchanged',async()=>{
 const f=await fixture();
 const auto={line:'auto',snapToLines:true,position:'auto',size:100,align:'center',text:'Original Spoken Caption',startTime:0,endTime:1.5};
 const authored={line:92,snapToLines:false,position:25,size:40,align:'start',text:'Creator Placement',startTime:1.5,endTime:3};
 const authoredHorizontal={line:'auto',snapToLines:true,position:20,size:45,align:'start',text:'Creator Width',startTime:3,endTime:5};
 const element=f.video.children[0];element.track.cues=[auto,authored,authoredHorizontal];
 const before={...authored};
 assert.equal(auto.line,'auto','placement changes only after actual track load');
 await f.act(async()=>element.fire('load'));
 assert.equal(auto.line,70);assert.equal(auto.snapToLines,false);assert.equal(auto.size,70);assert.equal(auto.position,'auto');assert.equal(auto.align,'center');
 assert.equal(auto.text,'Original Spoken Caption');assert.equal(auto.startTime,0);assert.equal(auto.endTime,1.5);
 assert.deepEqual(authored,before);
 assert.equal(authoredHorizontal.line,70);assert.equal(authoredHorizontal.snapToLines,false);assert.equal(authoredHorizontal.position,20);assert.equal(authoredHorizontal.size,45);assert.equal(authoredHorizontal.align,'start');
 await f.update({requested:false});assert.equal(element.track.mode,'disabled');assert.equal(auto.line,70);
 await f.close();assert.equal(f.video.children.length,0);assert.equal(f.timers.size,0);
 element.track.cues.push({line:'auto',snapToLines:true,size:100,position:'auto',align:'center'});element.fire('load');assert.equal(element.track.cues.at(-1).line,'auto','disposed track cannot mutate cues');
});
