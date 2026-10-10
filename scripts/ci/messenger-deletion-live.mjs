#!/usr/bin/env node
// Finite verification inside the exact parent-owned, sole-participant fixture.
// The parent verifies SQL ownership before dispatch and owns guarded cleanup.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { APP_ORIGIN, AUTH_ORIGIN, validateConfiguration } from './messenger-live-configuration.mjs';
import { FIXTURE_TITLE, OFFICIAL_ACCOUNT_FINGERPRINT, validateFixture } from './messenger-send-live-check.mjs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function deletionConfiguration(env) {
 validateConfiguration(env);
 assert.equal(env.MESSENGER_VERIFY_MODE, 'isolated-deletion', 'Explicit isolated-deletion mode required');
 for (const key of ['MESSENGER_FIXTURE_CONVERSATION_ID','MESSENGER_FIXTURE_MESSAGE_ID','MESSENGER_FIXTURE_FIRST_UNREAD_ID']) assert.match(env[key] || '', UUID, 'Exact owned fixture UUID required');
 assert.notEqual(env.MESSENGER_FIXTURE_MESSAGE_ID, env.MESSENGER_FIXTURE_FIRST_UNREAD_ID, 'Deletion fixtures must differ');
 return {conversationId:env.MESSENGER_FIXTURE_CONVERSATION_ID,forMeId:env.MESSENGER_FIXTURE_MESSAGE_ID,forEveryoneId:env.MESSENGER_FIXTURE_FIRST_UNREAD_ID};
}
export function validateDeletionRows(rows, expected, actor) {
 assert.ok(Array.isArray(rows) && rows.length === 2, 'Expected exactly two fresh synthetic fixture rows');
 for(const [id,mode] of [[expected.forMeId,'for_me'],[expected.forEveryoneId,'for_everyone']]) {
  const row=rows.find(row=>row.id===id);
  assert.ok(row && row.sender_id===actor && row.conversation_id===expected.conversationId && row.message_type==='text' && row.content===`${FIXTURE_TITLE}: Delete ${mode}`, 'Deletion refuses ordinary or foreign message');
 }
}
export function allowedDeletion(body, expected) {
 return body && UUID.test(body.messageId || '') && ['for_me','for_everyone'].includes(body.deleteType) && Object.keys(body).length===2 && body.messageId===(body.deleteType==='for_me'?expected.forMeId:body.deleteType==='for_everyone'?expected.forEveryoneId:null);
}
export async function runIsolatedDeletion() {
 const dir=process.env.MESSENGER_EVIDENCE_DIR || 'test-results/messenger-deletion-live';await mkdir(dir,{recursive:true});
 const report={observedAt:new Date().toISOString(),status:'running',checks:[]};
 try {
  const expected=deletionConfiguration(process.env);report.expectedSha=process.env.MESSENGER_EXPECTED_SHA;report.conversationId=expected.conversationId;
  const health=async()=>{const response=await fetch(APP_ORIGIN+'/api/health',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});const data=await response.json();assert.ok(response.ok && data.status==='ok');assert.equal(data.commitSha,report.expectedSha,'Serving SHA changed');return data;};
  report.deploymentId=(await health()).deploymentId;
  const {createClient}=await import('@supabase/supabase-js');
  const auth=createClient(AUTH_ORIGIN,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(20000)})}});
  const signed=await auth.auth.signInWithPassword({email:process.env.TEST_USER_EMAIL,password:process.env.TEST_USER_PASSWORD});assert.ok(!signed.error && signed.data.session?.access_token,'Configured account login failed');
  const session=signed.data.session,verified=await auth.auth.getUser(session.access_token);assert.ok(!verified.error && verified.data.user?.id===session.user.id,'Account verification failed');
  report.accountFingerprint=createHash('sha256').update(session.user.id).digest('hex').slice(0,16);assert.equal(report.accountFingerprint,OFFICIAL_ACCOUNT_FINGERPRINT,'Deletion refuses a different configured identity');
  const request=async(path,body)=>{
   if(path==='/api/messenger/delete-message')assert.ok(allowedDeletion(body,expected),'Unapproved mutation');
   else assert.ok(['/api/messenger/get-conversations','/api/messenger/get-messages'].includes(path),'Unapproved route');
   const response=await fetch(APP_ORIGIN+path,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
   const result=await response.json();assert.ok(response.ok && result.success===true,`Fixture request failed: ${response.status}`);return result;
  };
  validateFixture(await request('/api/messenger/get-conversations',{workspace:'resolve',conversationId:expected.conversationId}),expected);
  const history=()=>request('/api/messenger/get-messages',{conversationId:expected.conversationId,firstUnread:false,limit:50});
  validateDeletionRows((await history()).messages,expected,session.user.id);report.checks.push('Exact two synthetic messages and configured account verified');
  for(const [messageId,deleteType] of [[expected.forMeId,'for_me'],[expected.forEveryoneId,'for_everyone']]) {
   await request('/api/messenger/delete-message',{messageId,deleteType});
   assert.ok(!(await history()).messages.some(row=>row.id===messageId),'Deleted message returned on fresh authenticated read');
   // Retry only after the durable read established the acknowledged outcome.
   await request('/api/messenger/delete-message',{messageId,deleteType});
   assert.ok(!(await history()).messages.some(row=>row.id===messageId),'Duplicate deletion resurrected a message');
   report.checks.push(`${deleteType} acknowledged, fresh read absent, duplicate idempotent`);
  }
  assert.equal((await history()).messages.length,0,'Fixture must remain empty after both deletes');
  await health();report.status='passed';
 } catch(error) {report.status='failed';report.error=error.message;throw error;}
 finally {await writeFile(dir+'/result.json',JSON.stringify(report,null,2)+'\n');}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)runIsolatedDeletion().catch(error=>{console.error(error.message);process.exitCode=1;});
