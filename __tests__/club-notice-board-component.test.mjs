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
 const channel={on(type,filter,fn){handlers[filter.table || type]=fn;return channel;},subscribe(fn){subscribed=fn;return channel;}};
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
 }}),'../../lib/clubNoticeBoard.mjs':synthetic(board), './CashoutRequestActions':synthetic({default:()=>null})};
 const source=transformSync(readFileSync('src/components/messenger/NoticeBoard.jsx','utf8'),{loader:'jsx',format:'esm'}).code;
 const module=new vm.SourceTextModule(source,{context});await module.link(name=>modules[name]);await module.evaluate();
 const scrollBox={scrollTop:0,scrollHeight:1000,clientHeight:100,getBoundingClientRect:()=>({top:0}),querySelectorAll:()=>[]};
 const Component=module.namespace.default;
 const theme={text:'#fff',textSec:'#aaa',border:'#333',blue:'#08f',card:'#111',bg:'#000'};let root;
 await act(async()=>{root=create(React.createElement(Component,{club,userId:'actor',theme,onBack(){}}),{createNodeMock:element=>element.props['aria-label']==='Notice History'?scrollBox:null});});
 const text=()=>JSON.stringify(root.toJSON());
 assert.match(text(),/Initial Payout/);assert.match(text(),/Unpin/);
 scrollBox.scrollTop=100;
 await act(async()=>{handlers.club_notice_board({new:{...row,version:2,status:'paid',is_pinned:false}});});
 assert.doesNotMatch(text(),/Latest Notices/,'editing an existing entry is not a new notice');
 assert.doesNotMatch(text(),/Unpin/);assert.match(text(),/Marked Paid/);assert.match(text(),/Reopen Payout/,'paid annotation must be correctable by an admin');
 await act(async()=>{handlers.club_notice_board({new:{...row,id:'20000000-0000-4000-8000-000000000002',created_at:'2026-10-15T10:01:00Z',content:'New Incoming Notice'}});});
 assert.match(text(),/Latest Notices/,'a genuinely new entry offers navigation to the bottom');
 records=[{...row,version:2,status:'paid',is_pinned:false}];
 await act(async()=>{root.root.findAllByType('button').find(b=>b.props.children==='Reopen Payout').props.onClick();});
 assert.deepEqual(mutations[0],{method:'PATCH',payload:{id:row.id,version:2,status:'pending_payout',is_pinned:true}});
 assert.match(text(),/Unpin/);
 await act(async()=>{root.root.findAllByType('button').find(b=>b.props.children==='Edit').props.onClick();});
 assert.match(text(),/Editing Notice/);
 await act(async()=>{handlers.club_notice_board({new:{...row,version:4,is_deleted:true,is_pinned:false}});});
 assert.doesNotMatch(text(),/Editing Notice/,'a deleted notice cannot remain an active editor target');
 assert.equal(root.root.findByType('textarea').props.value,'');
 assert.doesNotMatch(text(),/Initial Payout/);
 await act(async()=>{handlers.club_notice_board({new:{...row,version:2}});});
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
 allow=false;await act(async()=>{handlers.club_notice_access_events({new:{club_id:club.id,user_id:'actor',can_access:false}});});
 assert.doesNotMatch(text(),/Saved While Reconnecting/,'role revocation clears saved history immediately without waiting for focus');
 await act(async()=>{await listeners.focus();});assert.doesNotMatch(text(),/Notice Actions/);assert.doesNotMatch(text(),/Reconnect Snapshot/);
 await act(async()=>{handlers.club_notice_board({new:{...row,version:5,content:'Revoked Leak'}});});assert.doesNotMatch(text(),/Revoked Leak/);
 allow=true;wait=true;await act(async()=>{subscribed('SUBSCRIBED');});
 const oldHandler=handlers.club_notice_board;
 await act(async()=>root.unmount());await act(async()=>{pending();await Promise.resolve();oldHandler({new:{...row,version:6,content:'Old Account'}});});
 assert.equal(root.toJSON(),null);
});

test('notice API forwards manager notes with verified actor and returns database access denial',async()=>{
 const context=vm.createContext({process:{env:{SUPABASE_SERVICE_ROLE_KEY:'local-fixture-only'}},console});
 const calls=[];let denied=false;
 const db={rpc:async(name,args)=>{calls.push({name,args});return denied?{data:null,error:{code:'42501',message:'Club Management Required'}}:{data:{id:args.p_payload.id},error:null};}};
 const synthetic=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});
 const modules={
  '../../../src/lib/supabaseServerClient':synthetic({createClient:()=>db}),
  '../../../src/lib/serverAuth':synthetic({getServerUserWithFallback:async()=>({user:{id:'verified-actor'}})}),
  '../../../src/lib/apiRateLimit':synthetic({applyRateLimit:()=>true,LIMITS:{read:{},write:{}}}),
  '../../../src/lib/clubNoticeBoard.mjs':synthetic(board),
 };
 const mod=new vm.SourceTextModule(readFileSync('pages/api/messenger/notice-board.js','utf8'),{context});await mod.link(name=>modules[name]);await mod.evaluate();
 const headers={};let status,body;const res={setHeader:(key,value)=>{headers[key]=value;},status:n=>{status=n;return res;},json:value=>{body=value;return res;}};
 const payload={id:'20000000-0000-4000-8000-000000000001',version:1,note:'Payout Help',op_id:'30000000-0000-4000-8000-000000000001'};
 const req={method:'PATCH',body:{clubId:'10000000-0000-4000-8000-000000000001',action:'add_note',actorId:'spoofed',payload}};
 await mod.namespace.default(req,res);assert.equal(status,200);assert.equal(calls[0].args.p_actor,'verified-actor');assert.equal(calls[0].args.p_action,'add_note');assert.equal(calls[0].args.p_payload.note,'Payout Help');assert.equal(headers['Cache-Control'],'private, no-store');
 denied=true;await mod.namespace.default(req,res);assert.equal(status,403);assert.equal(body.success,false);
});

test('Telegram-style Notice Board renders member counts, role badges, pinned club notices, unread divider, reactions, overdue actions, and roster dialog',async()=>{
 const handlers={};
 const club={id:'10000000-0000-4000-8000-000000000001',name:'KINGS CLUB'};
 const notice={
  id:'20000000-0000-4000-8000-000000000010',club_id:club.id,author_id:'u1',content:'Weekly Settlement Rules',status:'notice',is_pinned:true,version:1,
  created_at:'2026-11-24T12:00:00Z',author_name:'KingFish',author_role:'owner',
  seen_count:41,reactions:{ack:12,thumbs_up:4,fire:0,eyes:2},my_reactions:[],ack_users:['Butter'],
  attachments:[{url:'https://cdn.example/rules.png',name:'Rules.png',mime:'image/png'}],
 };
 const channel={on(type,filter,fn){handlers[filter.table||type]=fn;return channel;},subscribe(){return channel;}};
 const supabase={channel:()=>channel,removeChannel:()=>Promise.resolve(),rpc:async()=>({data:{success:true},error:null})};
 const context=vm.createContext({console,setTimeout,clearTimeout,crypto:globalThis.crypto,window:{confirm:()=>true,addEventListener(){},removeEventListener(){}},document:{visibilityState:'visible',addEventListener(){},removeEventListener(){}}});
 const synthetic=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});
 const requests=[];
 const modules={
  react:synthetic({default:React,...React}),
  '../../lib/supabase':synthetic({supabase}),
  '../../lib/authUtils':synthetic({getAccessToken:()=>null,authedFetch:async(_url,opts)=>{
   const body=JSON.parse(opts.body||'{}');
   requests.push({method:opts.method,action:body.action||null,payload:body.payload||{}});
   if(body.action==='mark_read') return {status:200,ok:true,json:async()=>({success:true,markedRead:true})};
   if(body.action==='toggle_reaction') return {status:200,ok:true,json:async()=>({success:true,entry:{...notice,reactions:{...notice.reactions,ack:13},my_reactions:['ack']}})};
   return {
    status:200,ok:true,json:async()=>({
     success:true,
     entries:[notice],
     pinned:[notice],
     canManage:true,
     viewerRole:'owner',
     memberCount:55,
     roleCounts:{owner:1,co_owner:1,admin:2,super_agent:40,agent:10,sub_agent:1,management:4,agents:51,online:2,total:55},
     members:[
      {user_id:'u1',display_name:'KingFish',username:'kingfish',role:'owner',is_online:true},
      {user_id:'u2',display_name:'Butter',username:'Butter',role:'super_agent',is_online:true},
     ],
     overduePayouts:[{cashout_id:'c1',agent_id:'u2',player_name:'Breezy',agent_name:'Butter',amount:'200.00',hours_pending:10,is_escalated:false}],
     alertSettings:{overdue_threshold_hours:4,followup_threshold_hours:12,notify_admins:false,auto_escalate_hours:null},
     previousLastReadAt:'2026-11-24T11:00:00Z',
     unreadCount:1,
     hasMore:false,cursor:null,
    }),
   };
  }}),
  '../../lib/clubNoticeBoard.mjs':synthetic(board),
  './CashoutRequestActions':synthetic({default:()=>null}),
 };
 const source=transformSync(readFileSync('src/components/messenger/NoticeBoard.jsx','utf8'),{loader:'jsx',format:'esm'}).code;
 const mod=new vm.SourceTextModule(source,{context});await mod.link(name=>modules[name]);await mod.evaluate();
 const Component=mod.namespace.default;
 const theme={text:'#fff',textSec:'#aaa',border:'#333',blue:'#08f',card:'#111',bg:'#000'};let root;
 const dmCalls=[];
 await act(async()=>{root=create(React.createElement(Component,{club,userId:'u3',theme,onBack(){},onMessageMember:(m,txt)=>dmCalls.push({m,txt})}));});
 const out=()=>JSON.stringify(root.toJSON());
 assert.match(out(),/55 Members · 4 Admins · 51 Agents · 2 Online/);
 assert.match(out(),/Staff \(55\)/);
 assert.match(out(),/Pinned Message/);
 assert.match(out(),/Weekly Settlement Rules/);
 assert.match(out(),/KingFish/);
 assert.match(out(),/Unfulfilled Over 4 Hours/);
 assert.match(out(),/Unread Messages/);
 assert.match(out(),/41\/55 Seen/);
 assert.match(out(),/https:\/\/cdn\.example\/rules\.png/);
 assert.ok(requests.some(r=>r.action==='mark_read'));
 await act(async()=>{root.root.findAllByType('button').find(b=>String(b.props['aria-label']||'').startsWith('Confirm Notice')).props.onClick();});
 assert.ok(requests.some(r=>r.action==='toggle_reaction'&&r.payload.reaction==='ack'));
 assert.match(out(),/Confirmed/);
 await act(async()=>{root.root.findAllByType('button').find(b=>b.props.children==='Details').props.onClick();});
 assert.match(out(),/Escalate To Bank/);
 await act(async()=>{root.root.findAllByType('button').find(b=>b.props.children==='Message Agent').props.onClick();});
 assert.equal(dmCalls.length,1);
 assert.equal(dmCalls[0].m.user_id,'u2');
 assert.match(dmCalls[0].txt,/Breezy/);
 // Open roster dialog and verify auto-enrolled agent appears.
 await act(async()=>{root.root.findAllByType('button').find(b=>b.props['aria-label']==='View Staff And Agents').props.onClick();});
 assert.match(out(),/Butter/);
 assert.match(out(),/Super Agent/);
 await act(async()=>root.unmount());
});
