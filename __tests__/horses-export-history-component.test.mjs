import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as client from '../src/components/horses/exportArtifactClient.js';
import * as pagerModel from '../src/components/horses/pagerModel.js';
const require=createRequire(import.meta.url), React=require('react'), {act,create}=require('react-test-renderer');
function compile(file,imports) {
 const source=fs.readFileSync(new URL(`../src/components/horses/${file}`,import.meta.url),'utf8');
 const code=require('@babel/core').transformSync(source,{filename:file,babelrc:false,configFile:false,presets:[require.resolve('next/babel')]}).code;
 const module={exports:{}};vm.runInThisContext(`(function(require,module,exports){${code}\n})`)(name=>name==='react'?React:name.endsWith('.css')?{}:imports[name]||require(name),module,module.exports);return module.exports;
}
const Pager=compile('Pager.jsx',{'./pagerModel':pagerModel});
const Center=compile('ExportArtifactCenter.jsx',{'./Pager':Pager,'./exportArtifactClient':client}).default;
const actor='11111111-1111-4111-8111-111111111111', originalId='22222222-2222-4222-8222-222222222222';
const job=(id,surface='stable-live-floor')=>({id,requester_id:actor,surface,state:'queued',expires_at:'2099-01-01T00:00:00Z'});
async function mount({direct,delayed=false,readFailure,listResult}={}) {
 const oldWindow=globalThis.window;globalThis.window={addEventListener(){},removeEventListener(){}};
 const calls=[];let current=true,finish;const authFetch=async(url,options={})=>{
 calls.push({url,options});const q=new URL(url,'http://fixture').searchParams;
 if(q.has('id')){if(readFailure)throw readFailure;if(delayed)return new Promise(resolve=>{finish=resolve;});return direct??{job:job(originalId,'Older Accepted Job')};}
 const offset=Number(q.get('offset')||0);const rows=Array.from({length:25},(_,i)=>job(`page-${offset+i}`));
 return listResult??{rows,jobs:rows,total:125,offset,limit:25,hasMore:offset<100};};
 authFetch.captureScope=()=>({operatorId:actor,isCurrent:()=>current});let view;
 await act(async()=>{view=create(React.createElement(Center,{authFetch}));});
 const button=label=>view.root.findAllByType('button').find(b=>b.children.join('')===label);
 await act(async()=>{await button('Export Files').props.onClick();});
 const text=()=>JSON.stringify(view.toJSON());
 const read=async()=>{const input=view.root.findAllByType('input').find(i=>i.props.id==='original-export-job-id');assert.ok(input,'original job UUID input');await act(async()=>input.props.onChange({target:{value:originalId}}));await act(async()=>{await button('Read Original Job').props.onClick();});};
 return {view,calls,button,text,read,loseScope:()=>{current=false;},finish:value=>finish(value),close:async()=>{await act(async()=>view.unmount());globalThis.window=oldWindow;}};
}
test('mounted export history pages beyond 100 with exact server totals',async()=>{const m=await mount();try{assert.match(m.text(),/Showing 1-25 Of 125 Jobs/);for(let i=0;i<4;i++)await act(async()=>{await m.button('Next').props.onClick();});assert.match(m.text(),/Showing 101-125 Of 125 Jobs/);assert.equal(m.button('Next').props.disabled,true);assert.ok(m.calls.some(c=>c.url.includes('offset=100')));}finally{await m.close();}});
test('a retained older job UUID is read directly without a new export or mutation',async()=>{const m=await mount();try{await m.read();assert.match(m.text(),/Older Accepted Job/);assert.ok(m.calls.some(c=>c.url===`/api/horses/export-artifacts?id=${originalId}`));assert.equal(m.calls.filter(c=>c.options.method==='POST').length,0);}finally{await m.close();}});
test('direct job read refuses a mismatched requester instead of offering actions',async()=>{const m=await mount({direct:{job:{...job(originalId,'Foreign Job'),requester_id:'foreign'}}});try{await m.read();assert.doesNotMatch(m.text(),/Foreign Job/);assert.match(m.text(),/Original Export Receipt Could Not Be Confirmed/);assert.equal(m.calls.filter(c=>c.options.method==='POST').length,0);}finally{await m.close();}});
test('late direct receipt after account scope change cannot render the original job',async()=>{const m=await mount({delayed:true});try{const input=m.view.root.findAllByType('input').find(i=>i.props.id==='original-export-job-id');assert.ok(input);await act(async()=>input.props.onChange({target:{value:originalId}}));let read;await act(async()=>{read=m.button('Read Original Job').props.onClick();});assert.match(m.text(),/Loading Original Export Job/);m.loseScope();await act(async()=>{m.finish({job:job(originalId,'Stale Job')});await read;});assert.doesNotMatch(m.text(),/Stale Job/);}finally{await m.close();}});
test('permission refusal reading an original receipt remains visible without a mutation',async()=>{const m=await mount({readFailure:Object.assign(new Error('Permission Required'),{status:403})});try{await m.read();await act(async()=>{await m.button('Refresh Export Status').props.onClick();});assert.match(m.text(),/Permission Required/);assert.equal(m.calls.filter(c=>c.options.method==='POST').length,0);assert.equal(m.view.root.findByProps({id:'original-export-job-id'}).props.value,originalId);}finally{await m.close();}});
test('an unmounted direct read cannot refresh or mutate after its original response',async()=>{const m=await mount({delayed:true});const input=m.view.root.findByProps({id:'original-export-job-id'});await act(async()=>input.props.onChange({target:{value:originalId}}));let read;await act(async()=>{read=m.button('Read Original Job').props.onClick();});const calls=m.calls.length;await m.close();await act(async()=>{m.finish({job:job(originalId)});await read;});assert.equal(m.calls.length,calls);assert.equal(m.calls.filter(c=>c.options.method==='POST').length,0);});
test('explicit recovery of an older queued job keeps its accepted job identity',async()=>{const m=await mount();try{await m.read();const card=m.view.root.findAllByType('article').find(a=>JSON.stringify(a.children.map(c=>typeof c==='string'?c:c.props)).includes('Older Accepted Job'));assert.ok(card);const resume=card.findAllByType('button').find(b=>b.children.join('')==='Resume Original Job');await act(async()=>{await resume.props.onClick();});const posts=m.calls.filter(c=>c.options.method==='POST');assert.equal(posts.length,1);assert.deepEqual(JSON.parse(posts[0].options.body),{action:'resume',id:originalId});assert.equal(posts[0].options.expectedOperatorId,actor);}finally{await m.close();}});
test('missing history count cannot be displayed as an authoritative empty page',async()=>{const m=await mount({listResult:{jobs:[]}});try{assert.match(m.text(),/Export History Could Not Be Confirmed/);assert.doesNotMatch(m.text(),/No Private Export Jobs Were Returned/);}finally{await m.close();}});
