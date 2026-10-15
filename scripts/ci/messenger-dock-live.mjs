// Explicit finite verification; owns only newly created disposable accounts.
// Never discovers recipients or uses an existing person's session or data.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_FALLBACK, SUPABASE_URL_FALLBACK } from '../../src/lib/supabaseKeys.js';
assert.equal(process.env.MESSENGER_DOCK_LIVE, '1', 'Explicit one-run fixture verification required');
assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY, 'Configured service credential is required');
const output=process.env.MESSENGER_DOCK_EVIDENCE;
assert.ok(output?.startsWith('/Volumes/SmarterArchives/agent-evidence/'), 'Owned archive directory required');
const runId=randomUUID(), conversationId=randomUUID(), title=`Messenger Dock Verification Only ${runId}`;
const admin=createClient(SUPABASE_URL_FALLBACK,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const clients=[],users=[],channels=[],events=[],outsiderEvents=[];
const report={runId,conversationId,title,observedAt:new Date().toISOString(),passed:false,cleanup:false,cases:[]};
const check=(value,message)=>assert.ok(value,message);
async function api(client,path,body){
 const {data,error}=await client.auth.getSession();assert.ifError(error);check(data.session,'Fixture session missing');
 const response=await fetch(`https://smarter.poker/api/messenger/${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});
 return {status:response.status,body:await response.json()};
}
try{
 report.health=await fetch('https://smarter.poker/api/health',{cache:'no-store',signal:AbortSignal.timeout(15000)}).then(r=>r.json());
 if(process.env.MESSENGER_DOCK_EXPECTED_SHA) assert.equal(report.health.commitSha,process.env.MESSENGER_DOCK_EXPECTED_SHA,'Serving Revision Changed');
 for(let index=0;index<3;index++){
  const email=`messenger-dock-${runId}-${index}@example.invalid`,password=randomUUID()+randomUUID();
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{agent_fixture:runId,full_name:`Messenger Dock Verification ${index}`}});assert.ifError(created.error);check(created.data.user?.id,'Fixture user was not created');
  const user=created.data.user;users.push(user);
  const client=createClient(SUPABASE_URL_FALLBACK,SUPABASE_PUBLISHABLE_FALLBACK,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(client);
  const login=await client.auth.signInWithPassword({email,password});assert.ifError(login.error);assert.equal(login.data.user.id,user.id);
 }
 // Each identity and the entire conversation were created by this one run.
 let result=await admin.from('social_conversations').insert({id:conversationId,is_group:true,group_name:title,is_request:false});assert.ifError(result.error);
 result=await admin.from('social_conversation_participants').insert(users.slice(0,2).map(user=>({conversation_id:conversationId,user_id:user.id})));assert.ifError(result.error);
 const requestId=randomUUID();
 const watch=async(client,bucket)=>{
  const channel=client.channel(`dock-proof:${runId}:${bucket===events?'recipient':'outsider'}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'social_messages',filter:`conversation_id=eq.${conversationId}`},event=>bucket.push(event.new));channels.push({client,channel});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Realtime Subscription Did Not Become Ready')),20000);channel.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){clearTimeout(timer);reject(new Error('Realtime Subscription Failed'));}});});
 };
 await Promise.all([watch(clients[1],events),watch(clients[2],outsiderEvents)]);
 const started=Date.now();
 const send=await api(clients[0],'send-message',{conversationId,requestId,content:`Messenger Dock Verification Only ${runId}`,message_type:'text',media_metadata:{}});
 report.sendStatus=send.status; if(send.status!==200)report.sendError=send.body?.error;
 assert.equal(send.status,200);assert.equal(send.body.success,true);
 await new Promise((resolve,reject)=>{const end=Date.now()+15000;const inspect=()=>{if(events.some(row=>row.request_id===requestId)){resolve();return;}if(Date.now()>=end){reject(new Error('Recipient Did Not Receive Committed Message'));return;}setTimeout(inspect,50);};inspect();});
 report.deliveryMs=Date.now()-started;assert.equal(events.filter(row=>row.request_id===requestId).length,1);
 report.cases.push('recipient-receives-committed-realtime-insert');
 const access=await api(clients[1],'get-conversations',{workspace:'resolve',conversationId});assert.equal(access.status,200);assert.equal(access.body.conversation.id,conversationId);assert.equal(access.body.conversation.title,title);report.cases.push('recipient-authorized-workspace-resolution');
 const denied=await api(clients[2],'get-conversations',{workspace:'resolve',conversationId});assert.equal(denied.status,403);assert.equal(outsiderEvents.length,0);report.cases.push('outsider-no-realtime-content-or-conversation-access');
 const history=await api(clients[1],'get-messages',{conversationId,limit:50});assert.equal(history.status,200);assert.equal(history.body.messages.length,1);assert.equal(history.body.messages[0].id,send.body.msgId);report.cases.push('protected-reader-confirms-persisted-message');
 const replay=await api(clients[0],'send-message',{conversationId,requestId,content:`Messenger Dock Verification Only ${runId}`,message_type:'text',media_metadata:{}});assert.equal(replay.body.msgId,send.body.msgId);assert.equal(replay.body.replayed,true);report.cases.push('retry-keeps-one-persisted-message');
 const read=await api(clients[1],'mark-read',{conversationId,throughMessageId:send.body.msgId});assert.equal(read.status,200);assert.equal(read.body.success,true);report.cases.push('displayed-message-read-persists');
 report.passed=true;
}catch(error){report.error=error.message;process.exitCode=1;}
finally{
 for(const {client,channel} of channels)await client.removeChannel(channel);
 for(const client of clients)await client.auth.signOut({scope:'local'});
 try{
  const fixture=await admin.from('social_conversations').select('id,group_name').eq('id',conversationId).maybeSingle();assert.ifError(fixture.error);
  if(fixture.data){assert.equal(fixture.data.group_name,title);const removed=await admin.from('social_conversations').delete().eq('id',conversationId).eq('group_name',title);assert.ifError(removed.error);}
  for(const user of users){assert.equal(user.user_metadata.agent_fixture,runId);const removed=await admin.auth.admin.deleteUser(user.id);assert.ifError(removed.error);}
  for(const table of ['social_conversations','social_messages','social_conversation_participants']){
   const result=await admin.from(table).select('id',{count:'exact',head:true}).eq(table==='social_conversations'?'id':'conversation_id',conversationId);assert.ifError(result.error);assert.equal(result.count,0,`Fixture Remains In ${table}`);
  }
  report.cleanup=true;
 }catch(error){report.cleanupError=error.message;process.exitCode=1;}
 await mkdir(output,{recursive:true});await writeFile(`${output}/backend-realtime.json`,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:report.passed,cleanup:report.cleanup,cases:report.cases,deliveryMs:report.deliveryMs,error:report.error,sendStatus:report.sendStatus,sendError:report.sendError,cleanupError:report.cleanupError}));
}
