import { test } from 'node:test';
import assert from 'node:assert/strict';
import engine from '../pages/api/alerts/engine.js';
process.env.ALERT_WEBHOOK_SECRET='test-engine-secret';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-key';
const id='34ca4349-6ccc-44dc-a95b-c07b6fa4227d';
const alert=()=>({status:'firing',fingerprint:'Fault:table',labels:{alertname:'Fault',severity:'critical',component:'table',engine_alert_event_id:id},annotations:{summary:'failed'},startsAt:'2026-09-13T00:00:00Z'});
const request=(a=alert())=>({method:'POST',headers:{'x-alert-secret':'test-engine-secret'},body:{alerts:[a]}});
const response=()=>({code:200,body:null,setHeader(){},status(n){this.code=n;return this;},json(b){this.body=b;return this;}});
function stub(t,fn){const old=globalThis.fetch;globalThis.fetch=fn;t.after(()=>{globalThis.fetch=old;});}
test('engine returns matching persisted IDs and passes full immutable evidence to the RPC',async(t)=>{
 stub(t,async(url,init)=>{assert.match(url,/\/rpc\/fn_record_engine_alerts$/);assert.deepEqual(JSON.parse(init.body),{p_alerts:[alert()]});return {ok:true,json:async()=>[{id:17,event_id:id}]};});
 const r=response();await engine(request(),r);assert.equal(r.code,200);assert.deepEqual(r.body,{ok:true,recorded:1,db:'ok',destination:'codex',receipts:[{id:17,event_id:id}]});
});
test('missing, mismatched, nonpositive and unsafe receipts stay retryable',async(t)=>{
 for(const data of [[],[{id:17}],[{id:17,event_id:'different'}],[{id:0,event_id:id}],[{id:2**53,event_id:id}],[{id:'17',event_id:id}],null]){
  stub(t,async()=>({ok:true,json:async()=>data}));const r=response();await engine(request(),r);assert.equal(r.code,503);assert.equal(r.body.recorded,0);
 }
});
test('payload collision is explicit and never acknowledged',async(t)=>{
 stub(t,async()=>({ok:false,status:409,json:async()=>({code:'23505'})}));const r=response();await engine(request(),r);assert.equal(r.code,409);assert.equal(r.body.recorded,0);
});
test('malformed IDs and unauthorized calls cannot write',async(t)=>{
 stub(t,async()=>assert.fail('no write allowed'));
 for(const v of [null,'not-a-uuid',{},17]){const a=alert();a.labels.engine_alert_event_id=v;const r=response();await engine(request(a),r);assert.equal(r.code,400);}
 const r=response();await engine({...request(),headers:{'x-alert-secret':'wrong'}},r);assert.equal(r.code,401);
});
test('legacy callers receive null event IDs',async(t)=>{
 const a=alert();delete a.labels.engine_alert_event_id;stub(t,async()=>({ok:true,json:async()=>[{id:18,event_id:null}]}));const r=response();await engine(request(a),r);assert.equal(r.code,200);assert.deepEqual(r.body.receipts,[{id:18,event_id:null}]);
});
test('database, transport and invalid-input errors never produce receipt success',async(t)=>{
 for(const result of [{ok:false,status:503,json:async()=>({code:'unavailable'})},{ok:false,status:400,json:async()=>({code:'22007'})}]){
  stub(t,async()=>result);const r=response();await engine(request(),r);assert.equal(r.code,result.status);assert.equal(r.body.recorded,0);
 }
 stub(t,async()=>{throw new Error('offline');});const r=response();await engine(request(),r);assert.equal(r.code,503);
});
