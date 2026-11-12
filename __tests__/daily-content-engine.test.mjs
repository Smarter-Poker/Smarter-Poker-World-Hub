/**
 * Daily Content Engine, Gate 3 acceptance tests 2-6 and 10-16 (synthetic players only).
 * Test 1 runs against production read-only via services/daily-content/bin/acceptance-live.mjs;
 * tests 7-9 run in a browser via services/daily-content/render/verify-templates.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyBoard, eventPoints, scoringCutoff } from '../services/daily-content/lib/scoring.mjs';
import { chicagoDayBounds, chicagoDate, chicagoInstant } from '../services/daily-content/lib/time.mjs';
import { slotTimes } from '../services/daily-content/lib/boards.mjs';
import { specFor } from '../services/daily-content/lib/specs.mjs';
import { Engine } from '../services/daily-content/lib/engine.mjs';
import { MemoryStore } from '../services/daily-content/lib/store-memory.mjs';
import { simulatedAdapter } from '../services/daily-content/lib/adapters.mjs';

// ── synthetic fixtures ────────────────────────────────────────────────────
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const eid = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** events: [{ n, field, endedAt, variant?, status?, order: [userNumber at position 1, 2, ...] , unpaid? }] */
function makeSource(events, { horses = [], staff = [] } = {}) {
  const src = { read_at: '2026-11-12T16:30:00Z', from: '2026-11-11T06:00:00Z', to: '2026-11-12T06:00:00Z', events: [], players: [], payouts: [], profiles: [] };
  const users = new Set();
  for (const e of events) {
    const order = e.order || [];
    src.events.push({ id: eid(e.n), name: `Synthetic Event ${e.n}`, game_type: 'NLH', variant: e.variant || 'freezeout', status: e.status || 'COMPLETED',
      tournament_type: 'MTT', ended_at: e.endedAt || `2026-11-11T${String(10 + (e.n % 12)).padStart(2, '0')}:00:00Z`, club_name: 'Synthetic Club', is_private: false,
      free_buy: false, field: e.field, positioned: e.positioned ?? e.field, distinct_positions: e.positioned ?? e.field, max_position: e.positioned ?? e.field,
      structure_rows: 3, structure_unpaid: e.unpaid || 0, winner_user_id: order[0] ? uid(order[0]) : null });
    for (let p = 1; p <= e.field; p += 1) {
      const u = order[p - 1] ?? 1000 + e.n * 1000 + p;
      users.add(u);
      src.players.push([eid(e.n), uid(u), p]);
    }
    if (e.variant === 'satellite') src.payouts.push({ tournament_id: eid(e.n), user_id: uid(order[0]), position: null, amount: 5000, source: 'satellite_seat', paid_at: '2026-11-11T12:00:00Z' });
    else src.payouts.push({ tournament_id: eid(e.n), user_id: uid(order[0] ?? 1000 + e.n * 1000 + 1), position: 1, amount: 100, source: 'structure', paid_at: e.unpaid ? null : '2026-11-11T12:00:00Z' });
  }
  for (const u of users) src.profiles.push({ id: uid(u), name: u === 77 ? 'X'.repeat(40) : `Player ${u}`, username: staff.includes(u) ? 'kingfish' : `p${u}`, is_horse: horses.includes(u), is_admin: false, avatar_url: null });
  return src;
}

/** n qualifying events where players 1..k win in turn (k distinct scorers). */
function boardFixture(k, nEvents = 12, extra = {}) {
  const evs = [];
  for (let i = 0; i < nEvents; i += 1) evs.push({ n: i + 1, field: 6, order: [((i % k) + 1)] });
  return makeSource(evs, extra);
}

// ── scoring ───────────────────────────────────────────────────────────────
test('points formula: cutoff and half-away rounding', () => {
  assert.equal(scoringCutoff(578), 87);
  assert.equal(scoringCutoff(9), 2);
  assert.equal(eventPoints(65, 1), 81);
  assert.equal(eventPoints(397, 60), 26);
  assert.equal(eventPoints(397, 61), 0);
});

test('test 2: satellite seats and tickets never add chips or points', () => {
  const src = makeSource([{ n: 1, field: 40, variant: 'satellite', order: [5] }, ...Array.from({ length: 11 }, (_, i) => ({ n: i + 2, field: 40, order: [((i % 10) + 10)] }))]);
  const b = buildDailyBoard(src, { periodYmd: '2026-11-11' });
  assert.equal(b.payload.completeness.excluded.satellite, 1);
  assert.ok(!b.payload.rows.some((r) => r.user_id === uid(5)), 'satellite winner must not score');
  for (const r of b.payload.rows) assert.equal(r.prize_chips, 100 * r.wins);
});

test('test 3: removing every horse leaves each human position unchanged', () => {
  const horses = [1, 2, 3];
  const evs = Array.from({ length: 12 }, (_, i) => ({ n: i + 1, field: 40, order: [1, 2, 3, 50 + i, 70 + i] }));
  const withHorses = makeSource(evs, { horses });
  const humansOnly = { ...withHorses, players: withHorses.players.filter(([, u]) => !horses.map(uid).includes(u)) };
  const pos = (src) => Object.fromEntries(buildDailyBoard(src, { periodYmd: '2026-11-11', cap: 5 }).payload.rows.filter((r) => !r.horse)
    .flatMap((r) => r.finishes.map((f) => [`${r.user_id}:${f[0]}`, f[3]])));
  const a = pos(withHorses); const b = pos(humansOnly);
  for (const k of Object.keys(a)) if (k in b) assert.equal(b[k], a[k]);
  const h = buildDailyBoard(withHorses, { periodYmd: '2026-11-11' }).payload;
  assert.ok(h.rows.filter((r) => r.horse).length >= 3);
  assert.equal(h.human_callout.qualifies, true);
  assert.equal(h.human_callout.position, 4, 'best human finish keeps its real position behind three horses');
});

test('test 4: Chicago day boundaries, including Nov 1, 2026 (DST ends)', () => {
  const nov1 = chicagoDayBounds('2026-11-01');
  assert.equal(nov1.start.toISOString(), '2026-11-01T05:00:00.000Z');
  assert.equal(nov1.end.toISOString(), '2026-11-02T06:00:00.000Z');
  assert.equal((nov1.end - nov1.start) / 3600000, 25);
  assert.equal(chicagoDate(chicagoInstant('2026-11-01', 23, 59)), '2026-11-01');
  assert.equal(chicagoDate(new Date(chicagoInstant('2026-11-02', 0, 1))), '2026-11-02');
  const mar8 = chicagoDayBounds('2026-03-08');
  assert.equal((mar8.end - mar8.start) / 3600000, 23);
  assert.equal(slotTimes('2026-11-01', 'top10').slotAt.toISOString(), '2026-11-01T17:30:00.000Z');
  assert.equal(slotTimes('2026-10-31', 'top10').slotAt.toISOString(), '2026-10-31T16:30:00.000Z');
});

test('test 6: ties render as T-ranks, 7 scorers give a Top 5, 2 scorers give the fallback', () => {
  const tie = makeSource([
    ...Array.from({ length: 12 }, (_, i) => ({ n: i + 1, field: 6, endedAt: '2026-11-11T20:00:00Z', order: [((i % 6) + 1)] })),
  ]);
  const t = buildDailyBoard(tie, { periodYmd: '2026-11-11' }).payload;
  assert.ok(t.rows.some((r) => /^T\d+$/.test(r.rank_label)), 'shared rank shown as T<n>');
  const seven = buildDailyBoard(boardFixture(7), { periodYmd: '2026-11-11' });
  assert.equal(seven.board, 'top5');
  assert.equal(seven.payload.rows.length, 5);
  const two = buildDailyBoard(boardFixture(2), { periodYmd: '2026-11-11' });
  assert.equal(two.board, 'fallback');
  assert.equal(two.payload.rows.length, 0);
});

test('completeness: unsettled prizes hold or mark provisional, never silently final', () => {
  const src = boardFixture(10, 12);
  src.events[0].structure_unpaid = 1; // the first event is still settling
  const b = buildDailyBoard(src, { periodYmd: '2026-11-11' });
  assert.notEqual(b.completeness, 'FINAL');
  assert.ok(b.payload.completeness.incomplete_events.includes(eid(1)));
});

// ── engine ────────────────────────────────────────────────────────────────
const YMD = '2026-11-12';
function fakeRenderer() {
  const r = { count: 0,
    async render() { r.count += 1; const f = (w, h) => ({ path: '/dev/null', sha256: 'a'.repeat(64), bytes: 10, width: w, height: h, duration_s: 15 });
      return { video: f(1080, 1920), stills: { still_9x16: f(1080, 1920), still_4x5: f(1080, 1350) }, renderer_version: 'fake' }; } };
  return r;
}
function scheduleEvents(cancelId) {
  return [1, 2, 3, 4].map((i) => ({ id: eid(900 + i), name: `Synthetic Nightly ${i}`, game_type: 'NLH', variant: 'freezeout',
    status: eid(900 + i) === cancelId ? 'CANCELLED' : 'REGISTERING', start_time: `2026-11-12T${String(14 + i).padStart(2, '0')}:00:00Z`,
    club_name: 'Synthetic Club', free_buy: i === 1, guaranteed_prize: 1000 * i, is_private: false, is_vip_only: false }));
}
function setup({ adapter = simulatedAdapter(), cancelAfterBuild = null } = {}) {
  let now = new Date('2026-11-12T13:51:00Z');
  const clock = () => now;
  const store = new MemoryStore(clock);
  let cancelled = null;
  const reader = {
    async source() { return boardFixture(10, 12); },
    async schedule() { return { read_at: now.toISOString(), events: scheduleEvents(cancelled) }; },
  };
  const renderer = fakeRenderer();
  const engine = new Engine({ store, reader, renderer, adapters: { internal_feed: adapter, facebook: adapter, instagram: adapter, youtube: adapter }, clock, dryRun: true });
  return { engine, store, renderer, adapter, set: (iso) => { now = new Date(iso); }, cancel: (id) => { cancelled = id; } };
}
async function openForPublishing(store, destinations = ['facebook']) {
  await store.setPause('global', false);
  for (const d of destinations) await store.updateDestination(d, { enabled: true, connection_state: 'connected' });
}
async function buildAndAuthorize(ctx, slot = 'today', dest = 'facebook') {
  const t = slotTimes(YMD, slot);
  ctx.set(new Date(t.snapshotAt.getTime() + 60000).toISOString());
  await ctx.engine.tick(YMD);
  const ed = await ctx.store.latestEdition(YMD, slot);
  const post = (await ctx.store.listPosts(ed.id)).find((p) => p.destination === dest);
  await ctx.engine.authorize(post.id, 'test');
  return { ed, post, t };
}

test('dry run: every post stops at rendered, awaiting Gate 4', async () => {
  const ctx = setup();
  ctx.set(new Date(slotTimes(YMD, 'today').snapshotAt.getTime() + 60000).toISOString());
  await ctx.engine.tick(YMD);
  const ed = await ctx.store.latestEdition(YMD, 'today');
  assert.equal(ed.status, 'rendered');
  const posts = await ctx.store.listPosts(ed.id);
  assert.equal(posts.length, 4);
  for (const p of posts) { assert.equal(p.state, 'rendered'); assert.match(p.state_reason, /Gate 4/); }
  assert.equal(ctx.adapter.calls.submit, 0);
});

test('test 10: running the same job twice creates one post', async () => {
  const ctx = setup();
  await openForPublishing(ctx.store);
  const { t, post } = await buildAndAuthorize(ctx);
  ctx.set(t.slotAt.toISOString());
  await ctx.engine.tick();
  const job = await ctx.store.getJobByKey(`${post.idempotency_key}:submit`);
  await ctx.store.updateJob(job.id, { state: 'queued', attempts: 0 }); // force a second run
  await ctx.engine.tick();
  assert.equal(ctx.adapter.remoteCount(), 1);
  assert.equal((await ctx.store.getPost(post.id)).state, 'published');
  assert.equal(ctx.store.t.posts.filter((p) => p.idempotency_key === post.idempotency_key).length, 1);
});

test('test 11: a timeout after upload checks remote status before retrying', async () => {
  const adapter = simulatedAdapter(['timeout_after_upload']);
  const ctx = setup({ adapter });
  await openForPublishing(ctx.store);
  const { t, post } = await buildAndAuthorize(ctx);
  ctx.set(t.slotAt.toISOString());
  await ctx.engine.tick();
  assert.equal((await ctx.store.getPost(post.id)).state, 'uncertain');
  ctx.set(new Date(t.slotAt.getTime() + 2 * 60000).toISOString());
  await ctx.engine.tick();
  const p = await ctx.store.getPost(post.id);
  assert.equal(p.state, 'published');
  assert.equal(adapter.calls.submit, 1, 'never re-uploaded');
  assert.ok(adapter.calls.status >= 1, 'asked the platform first');
});

test('test 12: a worker killed mid-render resumes on the next tick with one output', async () => {
  const ctx = setup();
  const t = slotTimes(YMD, 'top10');
  ctx.set(new Date(t.snapshotAt.getTime() + 60000).toISOString());
  await ctx.engine.plan(YMD);
  const build = await ctx.store.claimJob('w1', 300, true, ctx.engine.clock());
  await ctx.engine.runBuild(build);
  await ctx.store.updateJob(build.id, { state: 'done' });
  const render = await ctx.store.claimJob('w1', 300, true, ctx.engine.clock()); // claimed, then the worker dies
  assert.equal(render.kind, 'render');
  ctx.set(new Date(t.snapshotAt.getTime() + 7 * 60000).toISOString()); // lease (5 min) expired
  await ctx.engine.tick();
  const ed = await ctx.store.latestEdition(YMD, 'top10');
  assert.equal(ed.status, 'rendered');
  assert.equal((await ctx.store.listRenders(ed.id)).filter((r) => r.kind === 'video_9x16').length, 1);
  assert.equal(ctx.renderer.count, 1);
});

test('test 13: a revoked token pauses one destination and alerts; others continue', async () => {
  const bad = simulatedAdapter(['revoked']);
  const good = simulatedAdapter();
  const ctx = setup();
  ctx.engine.adapters = { internal_feed: good, facebook: bad, instagram: good, youtube: good };
  await openForPublishing(ctx.store, ['facebook', 'instagram']);
  const { t, ed } = await buildAndAuthorize(ctx, 'today', 'facebook');
  const ig = (await ctx.store.listPosts(ed.id)).find((p) => p.destination === 'instagram');
  await ctx.engine.authorize(ig.id, 'test');
  ctx.set(t.slotAt.toISOString());
  await ctx.engine.tick();
  const posts = await ctx.store.listPosts(ed.id);
  assert.equal(posts.find((p) => p.destination === 'facebook').state, 'held');
  assert.equal(posts.find((p) => p.destination === 'instagram').state, 'published');
  assert.equal((await ctx.store.listDestinations()).find((d) => d.destination === 'facebook').connection_state, 'revoked');
  assert.equal(ctx.store.t.alerts.length, 1);
});

test('test 14: a schedule card listing a cancelled event is rebuilt before posting', async () => {
  const ctx = setup();
  await openForPublishing(ctx.store);
  const { t, ed } = await buildAndAuthorize(ctx, 'tonight');
  const snap = await ctx.store.getSnapshot(ed.snapshot_id);
  ctx.cancel(snap.payload.items[0].event_id);
  ctx.set(new Date(t.slotAt.getTime() - 2 * 60000).toISOString());
  await ctx.engine.tick();
  ctx.set(t.slotAt.toISOString());
  await ctx.engine.tick();
  assert.equal((await ctx.store.getEdition(ed.id)).status, 'superseded');
  const r2 = await ctx.store.latestEdition(YMD, 'tonight');
  assert.equal(r2.revision, 2);
  const s2 = await ctx.store.getSnapshot(r2.snapshot_id);
  assert.ok(!s2.payload.items.some((i) => i.event_id === snap.payload.items[0].event_id));
  assert.equal(ctx.adapter.calls.submit, 0, 'the stale card was never posted');
});

test('test 15: after 3 hours down, expired slots are dropped, not posted', async () => {
  const ctx = setup();
  ctx.set(new Date(slotTimes(YMD, 'today').slotAt.getTime() + 3 * 3600000).toISOString()); // 11:00 AM
  await ctx.engine.tick(YMD);
  const today = await ctx.store.latestEdition(YMD, 'today');
  assert.equal(today.status, 'skipped');
  assert.match(today.status_reason, /Missed slot/);
  assert.equal(ctx.renderer.count, 1, 'only the 11:30 Top 10, still in time, was built');
  // An authorized post whose window passed while down is expired, not posted late.
  const ctx2 = setup();
  await openForPublishing(ctx2.store);
  const { t, post } = await buildAndAuthorize(ctx2);
  ctx2.set(new Date(t.slotAt.getTime() + 3 * 3600000).toISOString());
  await ctx2.engine.tick();
  assert.equal((await ctx2.store.getPost(post.id)).state, 'expired');
  assert.equal(ctx2.adapter.calls.submit, 0);
});

test('test 16: a pause set 1 second before submit stops the post', async () => {
  const ctx = setup();
  await openForPublishing(ctx.store);
  const { t, post } = await buildAndAuthorize(ctx);
  ctx.set(new Date(t.slotAt.getTime() - 1000).toISOString());
  await ctx.store.setPause('destination:facebook', true, 'test pause');
  ctx.set(t.slotAt.toISOString());
  await ctx.engine.tick();
  const p = await ctx.store.getPost(post.id);
  assert.equal(p.state, 'held');
  assert.match(p.state_reason, /Paused \(destination:facebook\)/);
  assert.equal(ctx.adapter.calls.submit, 0);
});

test('test 5: a payout written after the cutoff appears only in a revision', async () => {
  const ctx = setup();
  let late = false;
  ctx.engine.reader.source = async () => { const s = boardFixture(10, 12); if (late) s.payouts.push({ tournament_id: eid(1), user_id: uid(1), position: 1, amount: 900, source: 'structure', paid_at: '2026-11-12T17:00:00Z' }); return s; };
  const t = slotTimes(YMD, 'top10');
  ctx.set(new Date(t.snapshotAt.getTime() + 60000).toISOString());
  await ctx.engine.tick(YMD);
  const ed1 = await ctx.store.latestEdition(YMD, 'top10');
  const s1 = await ctx.store.getSnapshot(ed1.snapshot_id);
  const frozen = JSON.stringify(s1.payload);
  late = true;
  const r = await ctx.engine.recheck(YMD, 'top10');
  assert.equal(r.changed, true);
  await ctx.engine.tick();
  const ed2 = await ctx.store.latestEdition(YMD, 'top10');
  const s2 = await ctx.store.getSnapshot(ed2.snapshot_id);
  assert.equal(JSON.stringify(s1.payload), frozen, 'revision 1 is never edited in place');
  assert.equal(s2.revision, 2);
  assert.equal(s2.supersedes, s1.id);
  assert.equal((await ctx.store.getEdition(ed1.id)).status, 'superseded');
  for (const p of await ctx.store.listPosts(ed1.id)) assert.equal(p.state, 'superseded');
});

test('test 9 (data side): every horse is marked and every results spec carries the disclosure', () => {
  const src = boardFixture(10, 12, { horses: [1, 2, 3, 4, 5] });
  const b = buildDailyBoard(src, { periodYmd: '2026-11-11', periodLabel: 'Wed, Nov 11, 2026' });
  const spec = specFor('top10', {}, { snapshot_key: 'synthetic', sha256: 'b'.repeat(64), payload: { ...b.payload, closing_frame: null } });
  const people = [...spec.board.podium, ...spec.board.rows];
  assert.equal(spec.results, true);
  for (const r of b.payload.rows) assert.equal(people.find((p) => p.name === r.name).horse, r.horse);
  assert.ok(spec.footer.disclosure.includes('Boards include Smarter.Poker horses, our AI players.'));
});
