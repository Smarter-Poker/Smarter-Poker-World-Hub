import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as engine from '../src/lib/bankroll/sessionInsights.mjs';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const range = engine.analysisWindow(7, new Date('2026-05-07T23:59:00Z'));
const row = (id, entry_date, net_result, extra = {}) => ({
  id: String(id).padStart(4, '0'), user_id: 'owner', is_revision: false,
  entry_date, category: 'poker_cash', net_result, ...extra,
});

test('calendar windows include exactly the requested days, including leap day and rollover', () => {
  assert.deepEqual(range, { days: 7, start: '2026-05-01', end: '2026-05-07', previousStart: '2026-04-24', previousEnd: '2026-04-30' });
  assert.equal(engine.analysisWindow(7, new Date('2024-03-06T04:00Z')).start, '2024-02-29');
  assert.equal(engine.analysisWindow(7, new Date('2026-01-01T04:00Z')).start, '2025-12-26');
  assert.throws(() => engine.analysisWindow(8));
});

test('uses cents, ledger dates, matched time coverage and daily closes independent of input order', () => {
  const records = [
    row(1, '2026-05-01', '100.20', { start_time: '2026-05-01T23:00Z', end_time: '2026-05-02T01:00Z' }),
    row(2, '2026-05-02', '-80.15'), row(3, '2026-05-02', '50'), row(4, '2026-05-03', '0'),
    row(5, '2026-05-04', '-15.05', { start_time: '2026-05-04T01:00Z', end_time: '2026-05-04T00:00Z' }),
    row(6, '2026-05-05', '999', { category: 'withdrawal' }), row(7, '2026-05-06', '888', { is_revision: true }),
    row(8, '2026-05-08', 777), ...Array.from({ length: 5 }, (_,i) => row(10+i, '2026-04-25', '-20')),
  ];
  const result = engine.analyzeSessionRecords(records, range);
  assert.deepEqual(result, engine.analyzeSessionRecords([...records].reverse(), range));
  assert.deepEqual(result.metrics, { totalSessions: 5, netPL: 55, avgSession: 11, wins: 2, losses: 2, even: 1,
    winRate: 40, timedSessions: 1, hours: 2, timedNet: 100.2, hourlyRate: 50.1, dailyDrawdown: 45.2 });
  assert.match(result.findings.find(f => f.title === 'Change Per Session').evidence, /\$11\.00.*5 sessions.*-\$20\.00.*5.*2026-04-24/);
  assert.match(result.findings.find(f => f.title === 'Time Coverage').evidence, /1 of 5/);
});

test('empty, limited and missing observations stay distinct, including a genuine zero', () => {
  const report = values => engine.analyzeSessionRecords(values.map((v,i) => row(i, range.start, v)), range);
  assert.equal(report([]).state, 'empty');
  assert.equal(report([]).metrics.netPL, null);
  assert.equal(report([0]).state, 'small');
  assert.equal(report([0]).metrics.netPL, 0);
  const partial = report([null, '', 'invalid', -200]);
  assert.equal(partial.state, 'incomplete');
  assert.equal(partial.sample.missing, 3);
  assert.equal(partial.metrics.netPL, -200);
  assert.equal(partial.metrics.dailyDrawdown, null);
  assert.equal(partial.findings.some(f => f.title === 'Change Per Session'), false);
  assert.equal(report([null]).metrics.winRate, null);
});

test('a format observation explains its minimum sample and exact ledger loss', () => {
  const result = engine.analyzeSessionRecords([
    ...Array.from({ length: 5 }, (_,i) => row(10+i, range.end, -3.21, {category:'slots'})),
    row(1, range.start, -700), row(2, range.start, 2, {category:'poker_mtt'}),
  ],range);
  assert.match(result.findings[0].evidence, /5 sessions totaled -\$16\.05/);
  assert.equal(result.formats[0].name, 'Cash Games');
  assert.equal(result.findings[0].title, 'Slots Results');
});

function fixture(records, options = {}) {
  const calls = [];
  const db = { from(table) {
    calls.push(table);
    if (table === 'profiles') return { select() { return this; }, eq(field,id) {
      assert.equal(field,'id');assert.equal(id,'owner');return this;
    }, async maybeSingle() {return options.profileError ? { error: true } : { data: options.profile ?? { is_vip: true, vip_tier: 'lifetime' } };} };
    assert.equal(table, 'bankroll_ledger');
    let filtered = records.slice();
    let countRequested = false;
    const query = {
      select(fields, settings) { assert.doesNotMatch(fields, /notes|user_id|\*/); countRequested = !!settings.count; return this; },
      eq(key, value) { filtered = filtered.filter(r => r[key] === value); return this; },
      in(key, values) { filtered = filtered.filter(r => values.includes(r[key])); return this; },
      gte(key, value) { filtered = filtered.filter(r => r[key] >= value); return this; },
      lte(key, value) { filtered = filtered.filter(r => r[key] <= value); return this; },
      gt(key, value) { filtered = filtered.filter(r => r[key] > value); return this; },
      order(key) { filtered.sort((a,b) => a[key].localeCompare(b[key])); return this; },
      limit() { return this; },
      then(resolve) { return Promise.resolve(options.readError ? { error: true } : { data: filtered.slice(0, 2), count: countRequested ? filtered.length + (options.changedCount || 0) : null }).then(resolve); },
    };
    return query;
  }};
  return { db, calls };
}

test('owner-bound keyset reads cross a smaller provider page cap, exclude revisions and reject a partial read', async () => {
  const entries = [row(1,range.end,17),row(2,range.end,-5),row(3,range.end,1),row(4,range.end,80,{user_id:'other'}),
    row(5,range.end,200,{is_revision:true}),row(6,range.end,300,{category:'deposit'}),row(7,'2026-06-01',700)];
  const f=fixture(entries);
  const report=await engine.readSessionInsights(f.db,'owner',range);
  assert.equal(f.calls.length,2);assert.equal(report.metrics.netPL,13);
  await assert.rejects(engine.readSessionInsights(fixture(entries,{changedCount:1}).db,'owner',range),/changed/);
  await assert.rejects(engine.readSessionInsights(fixture(entries,{readError:true}).db,'owner',range),/unavailable/);
});

const apiSource = fs.readFileSync(new URL('../pages/api/jarvis/bankroll-analysis.js', import.meta.url),'utf8');
const compiled = transformSync(apiSource, { babelrc:false, configFile:false, filename:'api.js',presets:[require.resolve('next/babel')] }).code;
async function request(options = {}) {
  const f = fixture(options.records || [], options), m={exports:{}};
  const imports={
    '../../../src/lib/supabaseServerClient':{createClient(_url,_key,settings){assert.equal(settings.global.headers.Authorization,'Bearer test');return f.db;}},
    '../../../src/lib/serverAuth':{getServerUserWithFallback:async()=>options.auth??{ user:{id:'owner'} }},
    '../../../src/lib/supabaseKeys':{resolveAnonKey:()=>({key:'local-fixture'})},
    '../../../src/lib/apiRateLimit':{applyRateLimit:()=>true,LIMITS:{write:1}}, '../../../src/lib/apiErrorHandler':{reportApiError(){}},
    '../../../src/lib/bankroll/sessionInsights.mjs':engine,
  };
  vm.runInThisContext('(function(require,module,exports){'+compiled+'\n})')(name=>imports[name]??require(name),m,m.exports);
  const result = {headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(body){this.body=body;return this;}};
  await m.exports.default({method:options.method??'POST',headers:options.headers??{authorization:'Bearer test'},body:options.body??{days:7,userId:'other'}},result);
  return { code:result.code,body:result.body,headers:result.headers,calls:f.calls };
}

test('actual route preserves membership, ownership, no-store and an honest unavailable response', async () => {
  const denied=await request({profile:{is_vip:true,vip_tier:'monthly',vip_expires_at:'2020-01-01'}});
  assert.equal(denied.code,403);assert.deepEqual(denied.calls,['profiles']);
  assert.equal((await request({headers:{}})).code,401);
  assert.equal((await request({auth:{user:null,error:'SESSION_CHECK_UNAVAILABLE',status:503}})).code,503);
  assert.equal((await request({body:{days:8}})).code,400);
  assert.equal((await request({method:'GET'})).code,405);
  assert.equal((await request({profileError:true})).code,503);
  assert.equal((await request({readError:true})).code,503);
  const today=new Date().toISOString().slice(0,10);
  const own=await request({records:[row(1,today,36),row(2,today,800,{user_id:'other'})]});
  assert.equal(own.code,200);assert.equal(own.body.insights.metrics.netPL,36);assert.equal(own.headers['Cache-Control'],'private, no-store');
  assert.doesNotMatch(apiSource, /grokClient|chat\.completions|openai|buildAnalysisPrompt/);
});
