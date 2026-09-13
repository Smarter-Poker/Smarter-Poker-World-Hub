import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertEventKey, alertmanagerEvents, recordOperationalAlerts } from '../src/lib/operationalAlerts.mjs';
import pager from '../pages/api/internal/alertmanager-page.js';
import intake from '../pages/api/internal/operational-alert.js';
import engine from '../pages/api/alerts/engine.js';

process.env.CRON_SECRET = 'test-secret';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.ALERT_WEBHOOK_SECRET = 'test-engine-secret';
const response = () => ({ code: 200, body: null, setHeader() {}, status(n) { this.code=n; return this; }, json(b) { this.body=b; return this; } });
const alert = (name='HorseFleetHeartbeatStale') => ({ status:'firing', fingerprint:'fp', labels:{alertname:name,severity:'critical',page:'sms'},annotations:{summary:'stale',description:'full evidence'.repeat(100)},startsAt:'2026-09-13T00:00:00Z' });
const request = (body) => ({method:'POST',headers:{authorization:'Bearer test-secret'},body});

test('a batch stores each distinct alert and preserves the full evidence, including non-SMS alerts', () => {
  const a=alert();const b=alert('OtherIncident');delete b.labels.page;
  const events=alertmanagerEvents({alerts:[a,b]});
  assert.equal(events.length,2);assert.deepEqual(events[0].payload.alert,a);
  assert.notEqual(events[0].event_key,events[1].event_key);
  assert.equal(alertmanagerEvents({alerts:[a]})[0].event_key,events[0].event_key);
  assert.notEqual(alertmanagerEvents({alerts:[{...a,status:'resolved'}]})[0].event_key,events[0].event_key);
});
test('event identity ignores JSON key order but distinguishes a recurrence', () => {
  assert.equal(alertEventKey({b:2,a:1}),alertEventKey({a:1,b:2}));
  const a=alert();assert.notEqual(alertmanagerEvents({alerts:[a]})[0].event_key,alertmanagerEvents({alerts:[{...a,startsAt:'2026-09-14T00:00:00Z'}]})[0].event_key);
});
test('invalid or truncated batches are refused, never partly acknowledged', () => {
  for(const payload of [null,{alerts:[null]},{alerts:[{...alert(),status:'bad'}]},{alerts:[alert()],truncatedAlerts:1}]) assert.throws(()=>alertmanagerEvents(payload));
});
test('pager acknowledges only committed receipts and performs no Twilio request', async () => {
  const original=globalThis.fetch;const calls=[];
  globalThis.fetch=async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return {ok:true,json:async()=>[42,43]};};
  try {const r=response();await pager(request({alerts:[alert(),alert('TournamentOverdue')]}),r);
    assert.equal(r.code,200);assert.equal(r.body.sent,false);assert.equal(r.body.recorded,2);
    assert.equal(calls.length,1);assert.match(calls[0].url,/supabase\.co\/rest\/v1\/rpc\/fn_record_operational_alerts$/);
    assert.equal(calls[0].body.p_events.length,2);
  } finally {globalThis.fetch=original;}
});
test('DB error, timeout and malformed acknowledgement stay retryable with no SMS fallback', async () => {
  const original=globalThis.fetch;
  try {for (const fn of [async()=>({ok:false,status:503}),async()=>{throw new Error('timeout');},async()=>({ok:true,json:async()=>[]})]) {
    globalThis.fetch=fn;const r=response();await pager(request({alerts:[alert()]}),r);assert.equal(r.code,503);assert.equal(r.body.recorded,0);
  }} finally {globalThis.fetch=original;}
});
test('unauthorized callers and malformed input cannot write', async () => {
  const original=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('must not call');};
  try {for(const handler of [pager,intake]){const r=response();await handler({...request({}),headers:{authorization:'Bearer wrong'}},r);assert.equal(r.code,401);}
    const r=response();await intake(request({source:'worker',alertname:'fault',status:'firing',payload:[]}),r);assert.equal(r.code,400);
  } finally {globalThis.fetch=original;}
});
test('missing inbox configuration never claims success', async () => {
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {await assert.rejects(recordOperationalAlerts(alertmanagerEvents({alerts:[alert()]})),/not configured/);} finally {process.env.SUPABASE_SERVICE_ROLE_KEY=key;}
});
test('engine receiver preserves legacy history and refuses to acknowledge failed persistence', async () => {
  const original=globalThis.fetch;
  const req={...request({alerts:[alert()]}),headers:{'x-alert-secret':'test-engine-secret'}};
  try {
    for(const result of [{ok:false,status:503},{ok:true,json:async()=>[]}]) {
      globalThis.fetch=async()=>result;const r=response();await engine(req,r);assert.equal(r.code,503);assert.equal(r.body.recorded,0);
    }
    globalThis.fetch=async(url,init)=>{assert.match(url,/\/rest\/v1\/engine_alerts$/);assert.equal(JSON.parse(init.body)[0].alertname,'HorseFleetHeartbeatStale');return {ok:true,json:async()=>[{id:17}]};};
    const r=response();await engine(req,r);assert.equal(r.code,200);assert.equal(r.body.recorded,1);
  } finally {globalThis.fetch=original;}
});
