import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as gate from '../src/lib/push/push-gate.js';

// Execute the actual production modules with only their network boundaries replaced.
function load(path, modules) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports = {};
    new Function('require', 'exports', code)(id => {
        assert.ok(id in modules, `Unexpected dependency ${id}`);
        return modules[id];
    }, exports);
    return exports;
}
const sender = load('../src/lib/push/tournament-reminder-delivery.js', {
    './send-push': { sendPush: () => { throw new Error('Unstubbed provider'); }, SUBSCRIPTION_COLUMNS: 'id,endpoint,transport' },
    './push-deliver': { recordSendFailure: async () => false }, './push-gate.js': gate,
});
const now = Date.parse('2026-09-09T12:00:00Z');
function fixture() {
    const row = { id: 'outbox-1', recipient_user_id: 'user-1', event: 'tournament_reminder_2m',
        title: 'Tournament Starting Soon', body: 'Reminder', url: '/hub/club-arena/tournaments/t1', tag: 'tr:t1:2m',
        status: 'processing', claimed_at: new Date(now).toISOString(), created_at: new Date(now).toISOString(), attempts: 1 };
    const state = { rows: [row], subscriptions: [{id:'sub-1',user_id:'user-1',is_active:true,endpoint:'private-fixture',transport:'webpush'}],
        prefs: [], legacy: [], fail: null, ackFails: false, reads: 0, skip: null, expire: now + 60_000, sent: [] };
    function query(table) {
        const filters = []; let patch = null; let single = false;
        const builder = {
            select() {return this;}, update(value) {patch=value;return this;},
            eq(k,v) {filters.push(x=>x[k]===v);return this;}, in(k,v) {filters.push(x=>v.includes(x[k]));return this;},
            gte() {return this;}, maybeSingle() {single=true;return this;},
            then(resolve,reject) {
                return Promise.resolve().then(()=>{
                    if(state.fail===table || (patch && table==='push_outbox' && state.ackFails)) return {data:null,error:{message:'Injected read/write failure'}};
                    const source = table==='push_outbox'?state.rows:table==='push_subscriptions'?state.subscriptions:table==='notification_preferences'?state.prefs:state.legacy;
                    const rows=source.filter(x=>filters.every(fn=>fn(x)));
                    if(patch) for(const x of rows) Object.assign(x,patch);
                    return {data: single ? rows[0]||null : rows.map(x=>({...x})),error:null};
                }).then(resolve,reject);
            },
        };
        return builder;
    }
    const db = {from:query, async rpc(name,args) {
        if(name==='get_tournament_reminder_delivery') {
            state.reads++;
            if(state.fail==='intent') return {data:null,error:{message:'unavailable'}};
            return {data: [{outbox_id:args.p_outbox_ids[0],expires_at:new Date(state.expire).toISOString(),
                skip_reason:typeof state.skip==='function'?state.skip(state.reads):state.skip}],error:null};
        }
        assert.equal(name,'claim_tournament_reminder_pushes');
        return {data: state.rows.map(x=>({...x})),error:null};
    }};
    const send=async (sub,payload,opts)=>{state.sent.push({sub,payload,opts});return {ok:true};};
    return {state,db,row,send,run:()=>sender.deliverTournamentReminder(db,{...row},{send,now:()=>now})};
}

test('current intent uses the remaining deadline as TTL and records provider acceptance',async()=>{
    const f=fixture(),result=await f.run();
    assert.equal(result.sent,1);assert.equal(f.row.status,'sent');assert.equal(f.state.reads,2);
    assert.equal(f.state.sent[0].opts.ttl,60);assert.equal(f.state.sent[0].payload.data.expiresAt,now+60_000);
    assert.equal(f.state.sent[0].payload.data.outboxId,f.row.id);
});
for(const reason of ['reminder_canceled','reminder_rescheduled','reminder_unregistered','reminder_seated','reminder_expired','reminder_unversioned']) {
    test(`does not send ${reason}`,async()=>{const f=fixture();f.state.skip=reason;const result=await f.run();
        assert.equal(result.skipped,1);assert.equal(f.row.failure_reason,reason);assert.equal(f.state.sent.length,0);});
}
test('cancellation during subscription lookup is rechecked',async()=>{
    const f=fixture();f.state.skip=n=>n===2?'reminder_canceled':null;
    assert.equal((await f.run()).skipped,1);assert.equal(f.state.sent.length,0);
});
for(const table of ['push_subscriptions','notification_preferences','user_notification_preferences','intent']) {
    test(`${table} lookup failure stays retryable instead of becoming no subscription`,async()=>{
        const f=fixture();f.state.fail=table;const result=await f.run();
        assert.equal(result.failed,1);assert.equal(f.row.status,'pending');assert.notEqual(f.row.failure_reason,'no_subscription');assert.equal(f.state.sent.length,0);
    });
}
test('a real empty subscription result is explicitly skipped',async()=>{const f=fixture();f.state.subscriptions=[];
    assert.equal((await f.run()).skipped,1);assert.equal(f.row.failure_reason,'no_subscription');});
test('muted recipients are not sent a push',async()=>{const f=fixture();f.state.prefs=[{user_id:'user-1',mute_all:true}];
    assert.equal((await f.run()).skipped,1);assert.equal(f.state.sent.length,0);});
test('expiry during reads prevents the provider call',async()=>{const f=fixture();f.state.expire=now-1;
    assert.equal((await f.run()).skipped,1);assert.equal(f.state.sent.length,0);});
test('an old claimant cannot send or overwrite the new claim',async()=>{const f=fixture();const old={...f.row};f.row.claimed_at=new Date(now+1000).toISOString();
    const result=await sender.deliverTournamentReminder(f.db,old,{send:f.send,now:()=>now});
    assert.equal(result.uncertain,1);assert.equal(f.state.sent.length,0);assert.equal(f.row.status,'processing');});
test('provider accepted but acknowledgment failed remains explicitly uncertain',async()=>{const f=fixture();f.state.ackFails=true;
    assert.equal((await f.run()).uncertain,1);assert.equal(f.row.status,'processing');assert.equal(f.state.sent.length,1);});
test('known provider refusal is retried without changing intent identity',async()=>{const f=fixture();
    const result=await sender.deliverTournamentReminder(f.db,{...f.row},{send:async()=>({ok:false,error:'temporary'}),now:()=>now});
    assert.equal(result.failed,1);assert.equal(f.row.status,'pending');assert.equal(f.row.id,'outbox-1');});
test('last attempt is terminal and explicit',async()=>{const f=fixture();f.row.attempts=5;f.state.fail='push_subscriptions';
    assert.equal((await f.run()).failed,1);assert.equal(f.row.status,'failed');});
test('devices are sent in bounded groups with the same stable outbox identity',async()=>{const f=fixture();f.state.subscriptions=Array.from({length:11},(_,i)=>({id:`sub-${i}`,user_id:'user-1',is_active:true}));
    let active=0,peak=0;
    const result=await sender.deliverTournamentReminder(f.db,{...f.row},{now:()=>now,send:async()=>{
        peak=Math.max(peak,++active);await new Promise(r=>setImmediate(r));active--;return {ok:true};}});
    assert.equal(result.sent,1);assert.equal(peak,4);
});
test('old cron uses the same reminder sender and never digests separate deadlines',()=>{
    const src=readFileSync(new URL('../pages/api/cron/push-dispatch.js',import.meta.url),'utf8');
    assert.match(src,/if \(!row.event \|\| isTournamentReminder\(row\)\) continue/);
    assert.match(src,/await deliverTournamentReminder\(supabase, row\)/);
});
test('endpoint requires auth and GET readiness performs no claim or send',async()=>{
    let dispatches=0;
    const route=load('../pages/api/internal/tournament-reminders.js',{
        '../../../src/lib/supabaseServerClient':{createClient:()=>({})},
        '../../../src/utils/cron-auth':{validateCronAuth:req=>req.headers.authorization==='fixture-only'},
        '../../../src/lib/push/tournament-reminder-delivery':{dispatchTournamentReminders:async()=>{dispatches++;return {ok:true};}},
    });
    const response=()=>({code:0,body:null,status(n){this.code=n;return this;},json(body){this.body=body;return this;}});
    let res=response();await route.default({method:'POST',headers:{}},res);assert.equal(res.code,401);
    res=response();await route.default({method:'GET',headers:{authorization:'fixture-only'}},res);
    assert.equal(res.body.reminderProtocol,1);assert.equal(dispatches,0);
    res=response();await route.default({method:'POST',headers:{authorization:'fixture-only'}},res);assert.equal(dispatches,1);
});
