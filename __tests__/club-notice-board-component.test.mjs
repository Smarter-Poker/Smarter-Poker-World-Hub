import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as board from '../src/lib/clubNoticeBoard.mjs';
const require=createRequire(import.meta.url),React=require('react'),{act,create}=require('react-test-renderer'),{transformSync}=require('esbuild');

test('rendered board hydrates socket events, removes pins/tombstones and isolates an unmounted identity',async()=>{
 const handlers={},listeners={},mutations=[];let subscribed,allow=true,wait=false,pending;
 const club={id:'10000000-0000-4000-8000-000000000001',name:'Fixture Club'};
 const row={id:'20000000-0000-4000-8000-000000000001',club_id:club.id,content:'Initial Payout',status:'pending_payout',is_pinned:true,version:1,created_at:'2026-10-15T10:00:00.123456Z'};
 let records=[row];
 const channel={on(type,filter,fn){handlers[type]=fn;return channel;},subscribe(fn){subscribed=fn;return channel;}};
 const supabase={channel:()=>channel,removeChannel:()=>Promise.resolve()};
 const context=vm.createContext({console,crypto:globalThis.crypto,window:{confirm:()=>true,addEventListener:(k,fn)=>{listeners[k]=fn;},removeEventListener(){}},document:{visibilityState:'visible',addEventListener:(k,fn)=>{listeners[k]=fn;},removeEventListener(){}}});
 const synthetic=(values)=>new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});
 const modules={react:synthetic({default:React,...React}),'../../lib/supabase':synthetic({supabase}),
 '../../lib/authUtils':synthetic({getAccessToken:()=>null,authedFetch:async(_url,options)=>{
  if(options.method!=='POST') {
   const payload=JSON.parse(options.body).payload;mutations.push({method:options.method,payload});
   records=[{...records[0],...payload,version:options.method==='PUT'?1:records[0].version+1,...(options.method==='PUT'?{created_at:'2026-10-15T10:02:00Z'}:{})}];
   return {status:200,ok:true,json:async()=>({success:true,entry:records[0]})};
  }
  const snapshot=records;
  if(wait)await new Promise(resolve=>{pending=resolve;});
  return {status:allow?200:403,ok:allow,json:async()=>allow?{success:true,entries:snapshot,pinned:snapshot.filter(r=>r.is_pinned),canManage:true,hasMore:false,cursor:null}:{success:false,error:'Active Club Membership Required'}};
 }}),'../../lib/clubNoticeBoard.mjs':synthetic(board)};
 const source=transformSync(readFileSync('src/components/messenger/NoticeBoard.jsx','utf8'),{loader:'jsx',format:'esm'}).code;
 const module=new vm.SourceTextModule(source,{context});await module.link(name=>modules[name]);await module.evaluate();
 const scrollBox={scrollTop:0,scrollHeight:1000,clientHeight:100,getBoundingClientRect:()=>({top:0}),querySelectorAll:()=>[]};
 const Component=module.namespace.default;
 const theme={text:'#fff',textSec:'#aaa',border:'#333',blue:'#08f',card:'#111',bg:'#000'};let root;
 await act(async()=>{root=create(React.createElement(Component,{club,userId:'actor',theme,onBack(){}}),{createNodeMock:element=>element.props['aria-label']==='Notice History'?scrollBox:null});});
 const text=()=>JSON.stringify(root.toJSON());
 assert.match(text(),/Initial Payout/);assert.match(text(),/Unpin/);
 scrollBox.scrollTop=100;
 await act(async()=>{handlers.postgres_changes({new:{...row,version:2,status:'paid',is_pinned:false}});});
 assert.doesNotMatch(text(),/Latest Notices/,'editing an existing entry is not a new notice');
 assert.doesNotMatch(text(),/Unpin/);assert.match(text(),/Marked Paid/);assert.match(text(),/Reopen Payout/,'paid annotation must be correctable by an admin');
 await act(async()=>{handlers.postgres_changes({new:{...row,id:'20000000-0000-4000-8000-000000000002',created_at:'2026-10-15T10:01:00Z',content:'New Incoming Notice'}});});
 assert.match(text(),/Latest Notices/,'a genuinely new entry offers navigation to the bottom');
 records=[{...row,version:2,status:'paid',is_pinned:false}];
 await act(async()=>{root.root.findAllByType('button').find(b=>b.props.children==='Reopen Payout').props.onClick();});
 assert.deepEqual(mutations[0],{method:'PATCH',payload:{id:row.id,version:2,status:'pending_payout',is_pinned:true}});
 assert.match(text(),/Unpin/);
 await act(async()=>{root.root.findAllByType('button').find(b=>b.props.children==='Edit').props.onClick();});
 assert.match(text(),/Editing Notice/);
 await act(async()=>{handlers.postgres_changes({new:{...row,version:4,is_deleted:true,is_pinned:false}});});
 assert.doesNotMatch(text(),/Editing Notice/,'a deleted notice cannot remain an active editor target');
 assert.equal(root.root.findByType('textarea').props.value,'');
 assert.doesNotMatch(text(),/Initial Payout/);
 await act(async()=>{handlers.postgres_changes({new:{...row,version:2}});});
 assert.doesNotMatch(text(),/Initial Payout/,'delayed events cannot resurrect deleted rows');
 // A real reconnect refresh rehydrates missed updates/deletes rather than
 // adding the latest page onto an obsolete local snapshot.
 records=[{...row,version:4,content:'Reconnect Snapshot',is_pinned:false,status:'paid'}];
 await act(async()=>{subscribed('SUBSCRIBED');});assert.match(text(),/Reconnect Snapshot/);
 wait=true;await act(async()=>{subscribed('SUBSCRIBED');});
 await act(async()=>{root.root.findByType('textarea').props.onChange({target:{value:'Saved While Reconnecting'}});});
 await act(async()=>{await root.root.findByType('form').props.onSubmit({preventDefault(){}});});
 assert.match(text(),/Saved While Reconnecting/);
 await act(async()=>{pending();await Promise.resolve();});wait=false;
 assert.match(text(),/Saved While Reconnecting/,'an older read cannot erase an acknowledged local mutation');
 allow=false;await act(async()=>{await listeners.focus();});assert.doesNotMatch(text(),/Notice Actions/);assert.doesNotMatch(text(),/Reconnect Snapshot/);
 await act(async()=>{handlers.postgres_changes({new:{...row,version:5,content:'Revoked Leak'}});});assert.doesNotMatch(text(),/Revoked Leak/);
 allow=true;wait=true;await act(async()=>{subscribed('SUBSCRIBED');});
 const oldHandler=handlers.postgres_changes;
 await act(async()=>root.unmount());await act(async()=>{pending();await Promise.resolve();oldHandler({new:{...row,version:6,content:'Old Account'}});});
 assert.equal(root.toJSON(),null);
});
