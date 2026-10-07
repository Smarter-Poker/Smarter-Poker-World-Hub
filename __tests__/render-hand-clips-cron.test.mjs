// The Phase 9 render cron through its deps (contract C6): a fake service
// client, a fake browser whose page hands over a plan, follows seek(i) with
// data-clip-step and answers Page.captureScreenshot, a fake ffmpeg that writes
// files, a fake storage upload and a fake clock drive the whole
// claim -> render -> finish -> publish path. Every failure reason ends in
// fn_hand_clip_finish(failed, reason) and never in a thrown error; the publish
// call is made only for a horse job the fleet marked auto_publish; /tmp/<job id>
// is removed on every path; every fire writes one cron_execution_log row, the
// empty queue included.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createHandler } from '../pages/api/cron/render-hand-clips.js';
import {
  CLIP_PAGE_URL,
  JOB_NAME,
  PAINT_WAIT_MS,
  SETTLE_WAIT_MS,
  SETTLE_POLL_MS,
  STILL_PARAMS,
  pageScripts,
  publicUrlFor,
  renderClipJob,
  storagePathsFor,
} from '../src/lib/server/handClipRender.js';

process.env.CRON_SECRET = 'test-cron-secret';

const HERO = '44444444-4444-4444-8444-444444444444';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const NULL_ROW = { id: null, hand_id: null, author_id: null, kind: null, state: null };
/* Eleven frames: deal, three streets, seven actions; 11,900 ms of beats and an
   8,100 ms hold make the 20,000 ms the page planned. */
const BEATS = [1400, 900, 900, 1400, 900, 900, 1400, 900, 900, 900, 1400];
const HOLD_MS = 8100;
const PLANNED_MS = 20000;

function makeJob(overrides = {}) {
  return {
    id: 'a1b2c3d4-0000-4000-8000-00000000000a',
    hand_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    author_id: HERO,
    kind: 'user',
    style: 'felt-720p',
    state: 'rendering',
    auto_publish: false,
    publication_key: null,
    caption: null,
    ...overrides,
  };
}

function makeHand(overrides = {}) {
  return {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    table_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    hand_number: 8,
    game_variant: 'omaha',
    players: [{ userId: HERO, seat: 1 }, { userId: OTHER, seat: 2 }],
    hole_cards: {},
    ...overrides,
  };
}

/** A fake service client: rpc calls and log inserts are recorded. */
function makeSupa({ claim = NULL_ROW, claimError = null, finishError = null, publishError = null, publishState = 'published', logError = null } = {}) {
  const calls = { rpc: [], inserts: [] };
  return {
    calls,
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      if (name === 'fn_hand_clip_claim') return claimError ? { data: null, error: { message: claimError } } : { data: claim, error: null };
      if (name === 'fn_hand_clip_finish') {
        if (finishError) return { data: null, error: { message: finishError } };
        return { data: { ...(claim || {}), state: args.p_state, error: args.p_error }, error: null };
      }
      if (name === 'fn_p9_publish_hand_clip') {
        if (publishError) return { data: null, error: { message: publishError } };
        return { data: { ...(claim || {}), state: publishState, social_post_id: 'post-1', social_reel_id: 'reel-1' }, error: null };
      }
      return { data: null, error: { message: `unexpected rpc ${name}` } };
    },
    from: (table) => ({
      insert: async (row) => {
        calls.inserts.push({ table, row });
        return { data: null, error: logError ? { message: logError } : null };
      },
    }),
  };
}

/**
 * A fake browser. `states` is the sequence [data-clip-state] reports on each
 * read (the last value repeats); `plan` is what window.__spClip hands over;
 * seek(i) answers `seekReturns` and, when `stepFollows`, data-clip-step reports
 * the last sought frame; Page.captureScreenshot answers `shotData` (base64).
 */
function makeBrowser({
  states = ['loading', 'ready'],
  plan = { frames: BEATS.length, rate: 1, beats: BEATS, holdMs: HOLD_MS, plannedMs: PLANNED_MS },
  seekReturns = true,
  stepFollows = true,
  shotData = (i) => Buffer.from(`still-${i}`).toString('base64'),
} = {}) {
  const rec = { injected: null, gotos: [], cdp: [], shots: 0, seeks: [], settles: [], paints: [], order: [], closed: 0, stateReads: 0, stepReads: 0 };
  let reads = 0;
  let step = 0;
  const session = {
    on: () => {},
    send: async (method, params) => {
      rec.cdp.push({ method, params });
      if (method === 'Page.captureScreenshot') {
        rec.order.push('shot');
        const n = rec.shots;
        rec.shots += 1;
        return { data: shotData(n) };
      }
      return {};
    },
  };
  const page = {
    evaluateOnNewDocument: async (fn, payload) => { rec.injected = { fn, payload }; },
    goto: async (url, opts) => { rec.gotos.push({ url, opts }); },
    createCDPSession: async () => session,
    evaluate: async (fn, arg, arg2) => {
      if (fn === pageScripts.clipState) {
        rec.stateReads += 1;
        const state = states[Math.min(reads, states.length - 1)];
        reads += 1;
        return state;
      }
      if (fn === pageScripts.plan) return plan;
      if (fn === pageScripts.seek) {
        rec.seeks.push(arg);
        if (seekReturns && stepFollows) step = arg;
        return seekReturns;
      }
      if (fn === pageScripts.clipStep) { rec.stepReads += 1; return step; }
      if (fn === pageScripts.settled) { rec.settles.push([arg, arg2]); rec.order.push('settled'); return true; }
      if (fn === pageScripts.painted) { rec.paints.push(arg); rec.order.push('painted'); return true; }
      throw new Error('unexpected page script');
    },
  };
  const browser = { newPage: async () => page, close: async () => { rec.closed += 1; }, process: () => null };
  return { rec, launch: async () => browser };
}

function makeDeps({ supa, browser, hand = makeHand(), facts = null, discard = null, table = { name: 'Main Street' }, ffmpegFails = false, uploadFails = false, nowStepMs = 10, tmpRoot } = {}) {
  const rec = { ffmpeg: [], uploads: [], logs: [], listFiles: [] };
  let t = 1700000000000;
  const deps = {
    supa,
    launch: browser.launch,
    runFfmpeg: async (args) => {
      rec.ffmpeg.push(args);
      if (ffmpegFails) throw new Error('ffmpeg exit 1: Invalid data found when processing input');
      const out = args[args.length - 1];
      const listIndex = args.indexOf('-i') + 1;
      const input = args[listIndex];
      if (input.endsWith('.txt')) rec.listFiles.push({ text: readFileSync(input, 'utf8'), frames: readdirSync(join(input, '..')).filter((f) => /^f_\d+\.jpg$/.test(f)).length });
      writeFileSync(out, Buffer.from(`fake-${out.endsWith('.mp4') ? 'mp4' : 'jpg'}`));
    },
    upload: async (path, body, contentType) => {
      rec.uploads.push({ path, bytes: body.length, contentType });
      if (uploadFails) throw new Error('upload 503: storage unavailable');
    },
    fetchHand: async () => ({ hand, facts, discard, table }),
    now: () => { t += nowStepMs; return t; },
    sleep: async () => {},
    log: (msg) => rec.logs.push(String(msg)),
    tmpRoot,
    supabaseUrl: SUPABASE_URL,
  };
  return { deps, rec };
}

function makeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

const authedReq = () => ({ headers: { authorization: 'Bearer test-cron-secret' } });

let tmpRoot;
test.before(() => { tmpRoot = mkdtempSync(join(tmpdir(), 'p9-render-')); });
test.after(() => { rmSync(tmpRoot, { recursive: true, force: true }); });

const finishCalls = (supa) => supa.calls.rpc.filter((c) => c.name === 'fn_hand_clip_finish');
const publishCalls = (supa) => supa.calls.rpc.filter((c) => c.name === 'fn_p9_publish_hand_clip');
const logRows = (supa) => supa.calls.inserts.filter((i) => i.table === 'cron_execution_log').map((i) => i.row);

test('the handler refuses a caller without the CRON_SECRET bearer and writes nothing', async () => {
  const supa = makeSupa();
  const res = makeRes();
  await createHandler({ supa })({ headers: {} }, res);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(supa.calls.rpc, []);
  assert.deepEqual(supa.calls.inserts, []);
});

test('an empty queue answers 200 { ok, rendered: 0 } and writes one cron_execution_log row', async () => {
  for (const claim of [NULL_ROW, null, []]) {
    const supa = makeSupa({ claim });
    const res = makeRes();
    await createHandler({ supa, launch: async () => { throw new Error('no browser on an empty queue'); } })(authedReq(), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true, rendered: 0 });
    assert.deepEqual(supa.calls.rpc.map((c) => c.name), ['fn_hand_clip_claim']);
    const rows = logRows(supa);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].job_name, JOB_NAME);
    assert.equal(rows[0].status, 'success');
    assert.deepEqual(rows[0].result, { rendered: 0 });
    assert.equal(rows[0].error, null);
    assert.ok(typeof rows[0].duration_ms === 'number' && rows[0].duration_ms >= 0);
    assert.ok(rows[0].started_at && rows[0].completed_at);
  }
});

test('a claim error answers 500 and writes an error row, never a throw', async () => {
  const supa = makeSupa({ claimError: 'relation hand_clip_jobs does not exist' });
  const res = makeRes();
  await createHandler({ supa })(authedReq(), res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.ok, false);
  assert.match(res.body.error, /fn_hand_clip_claim: relation hand_clip_jobs does not exist/);
  const rows = logRows(supa);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'error');
  assert.match(rows[0].error, /fn_hand_clip_claim/);
});

test('a user job: claim, inject C1, goto, one still per frame at its beat, encode, upload, finish ready; no publish; /tmp cleaned; one log row', async () => {
  const job = makeJob();
  const supa = makeSupa({ claim: job });
  const browser = makeBrowser();
  const { deps, rec } = makeDeps({ supa, browser, tmpRoot, facts: { hole_cards: [{ rank: 'A', suit: 's' }] } });
  const res = makeRes();
  await createHandler(deps)(authedReq(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.rendered, 1);
  assert.equal(res.body.job.state, 'ready');
  assert.equal(res.body.job.frames, 11);
  assert.equal(res.body.job.duration_ms, PLANNED_MS);

  // C1 injected before any script, then the live clip page.
  assert.equal(browser.rec.injected.fn, pageScripts.inject);
  assert.deepEqual(browser.rec.injected.payload, {
    v: 1, style: 'felt-720p', heroId: HERO, row: makeHand(), tableName: 'Main Street',
    privateHoleCards: { [HERO]: [{ rank: 'A', suit: 's' }] }, discardedCards: {}, minMs: 15000, maxMs: 40000,
  });
  assert.deepEqual(browser.rec.gotos, [{ url: CLIP_PAGE_URL, opts: { waitUntil: 'networkidle2', timeout: 60000 } }]);

  // The camera: every frame sought in order, each commit confirmed, the card squeeze settled, painted, one still each.
  assert.deepEqual(browser.rec.seeks, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.ok(browser.rec.stepReads >= 11, 'data-clip-step is read for every frame');
  assert.deepEqual(browser.rec.settles, new Array(11).fill([SETTLE_WAIT_MS, SETTLE_POLL_MS]));
  assert.deepEqual(browser.rec.paints, new Array(11).fill(PAINT_WAIT_MS));
  assert.deepEqual(browser.rec.order, new Array(11).fill(['settled', 'painted', 'shot']).flat(), 'a still is taken only after the squeeze settled and a paint');
  assert.equal(browser.rec.shots, 11);
  assert.ok(browser.rec.cdp.every((c) => c.method === 'Page.captureScreenshot'), 'no screencast, nothing else over CDP');
  assert.deepEqual(browser.rec.cdp[0].params, { ...STILL_PARAMS });
  assert.equal(browser.rec.closed, 1);

  // The encode: the concat list carried every still for its beat, the last with the hold; the exact C6 step 5 commands ran in order.
  assert.equal(rec.ffmpeg.length, 2);
  assert.equal(rec.listFiles.length, 1);
  assert.equal(rec.listFiles[0].frames, 11, 'eleven still files were on disk when ffmpeg ran');
  assert.equal((rec.listFiles[0].text.match(/^file '/gm) || []).length, 12, 'eleven stills plus the repeated last file');
  const durations = [...rec.listFiles[0].text.matchAll(/^duration (\d+\.\d{3})$/gm)].map((m) => Math.round(Number(m[1]) * 1000));
  assert.deepEqual(durations, [1400, 900, 900, 1400, 900, 900, 1400, 900, 900, 900, 1400 + HOLD_MS]);
  assert.ok(rec.listFiles[0].text.includes(`${job.id}/f_0.jpg'`) && rec.listFiles[0].text.includes(`${job.id}/f_10.jpg'`));
  const [encode, poster] = rec.ffmpeg;
  assert.deepEqual(encode.slice(0, 4), ['-y', '-hide_banner', '-loglevel', 'error']);
  assert.ok(encode.includes('libx264') && encode.includes('veryfast') && encode.includes('+faststart') && encode.includes('-an'));
  assert.ok(encode[encode.length - 1].endsWith(`${job.id}/clip.mp4`));
  assert.ok(poster.includes('-ss') && poster.includes('-frames:v') && poster[poster.length - 1].endsWith(`${job.id}/poster.jpg`));

  // The upload: both objects under videos/<author_id>/.
  const paths = storagePathsFor(job);
  assert.deepEqual(rec.uploads, [
    { path: paths.video, bytes: 8, contentType: 'video/mp4' },
    { path: paths.poster, bytes: 8, contentType: 'image/jpeg' },
  ]);

  // The finish call: ready with the measurement, exactly what the page planned.
  const finishes = finishCalls(supa);
  assert.equal(finishes.length, 1);
  assert.deepEqual(finishes[0].args, {
    p_job_id: job.id,
    p_state: 'ready',
    p_video_url: publicUrlFor(SUPABASE_URL, paths.video),
    p_poster_url: publicUrlFor(SUPABASE_URL, paths.poster),
    p_duration_ms: PLANNED_MS,
    p_width: 1080,
    p_height: 1350,
    p_frames: 11,
    p_render_ms: finishes[0].args.p_render_ms,
    p_error: null,
  });
  assert.ok(Number.isInteger(finishes[0].args.p_render_ms) && finishes[0].args.p_render_ms > 0);

  // Never a publish call for a user job; the work directory is gone; one log row.
  assert.equal(publishCalls(supa).length, 0);
  assert.equal(existsSync(join(tmpRoot, job.id)), false);
  const rows = logRows(supa);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'success');
  assert.equal(rows[0].result.rendered, 1);
  assert.equal(rows[0].result.state, 'ready');
  assert.equal(rows[0].result.job_id, job.id);
});

test('the stills are what the page sent: each file holds that frame\'s screenshot', async () => {
  const job = makeJob();
  const supa = makeSupa({ claim: job });
  const browser = makeBrowser();
  const seen = [];
  const { deps } = makeDeps({ supa, browser, tmpRoot });
  deps.runFfmpeg = async (args) => {
    const input = args[args.indexOf('-i') + 1];
    if (input.endsWith('.txt')) {
      const dir = join(input, '..');
      for (let i = 0; i < 11; i += 1) seen.push(readFileSync(join(dir, `f_${i}.jpg`), 'utf8'));
    }
    writeFileSync(args[args.length - 1], Buffer.from('x'));
  };
  const summary = await renderClipJob(job, deps);
  assert.equal(summary.state, 'ready');
  assert.deepEqual(seen, new Array(11).fill(0).map((_, i) => `still-${i}`));
});

test('a horse job with auto_publish is handed to fn_p9_publish_hand_clip after the ready finish', async () => {
  const job = makeJob({ kind: 'horse', auto_publish: true, caption: 'Hand review: omaha at 1 big blinds.' });
  const supa = makeSupa({ claim: job });
  const { deps } = makeDeps({ supa, browser: makeBrowser(), tmpRoot });
  const summary = await renderClipJob(job, deps);
  assert.equal(summary.state, 'published');
  assert.equal(summary.published, true);
  assert.equal(summary.social_post_id, 'post-1');
  assert.equal(summary.social_reel_id, 'reel-1');
  const names = supa.calls.rpc.map((c) => c.name);
  assert.deepEqual(names, ['fn_hand_clip_finish', 'fn_p9_publish_hand_clip']);
  assert.deepEqual(publishCalls(supa)[0].args, { p_job_id: job.id });
});

test('a horse job without auto_publish, and a user job, are never published', async () => {
  for (const job of [makeJob({ kind: 'horse', auto_publish: false }), makeJob({ kind: 'user', auto_publish: true })]) {
    const supa = makeSupa({ claim: job });
    const { deps } = makeDeps({ supa, browser: makeBrowser(), tmpRoot });
    const summary = await renderClipJob(job, deps);
    assert.equal(summary.state, 'ready');
    assert.equal(summary.published, false);
    assert.equal(publishCalls(supa).length, 0, `${job.kind} auto_publish=${job.auto_publish}`);
  }
});

test('the switch stays with the function: a publish that returns the row unchanged leaves the job ready', async () => {
  const job = makeJob({ kind: 'horse', auto_publish: true });
  const supa = makeSupa({ claim: job, publishState: 'ready' });
  const { deps } = makeDeps({ supa, browser: makeBrowser(), tmpRoot });
  const summary = await renderClipJob(job, deps);
  assert.equal(summary.state, 'ready');
  assert.equal(summary.published, false);
  assert.equal(publishCalls(supa).length, 1);
});

test('a publish error is logged, the clip stays ready, nothing throws and the fire still logs success', async () => {
  const job = makeJob({ kind: 'horse', auto_publish: true });
  const supa = makeSupa({ claim: job, publishError: 'hand clip caption must not contain an emoji' });
  const { deps, rec } = makeDeps({ supa, browser: makeBrowser(), tmpRoot });
  const res = makeRes();
  await createHandler(deps)(authedReq(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.job.state, 'ready');
  assert.equal(res.body.job.published, false);
  assert.match(res.body.job.publish_error, /must not contain an emoji/);
  assert.equal(finishCalls(supa).length, 1, 'no second finish: the job is ready and stays ready');
  assert.ok(rec.logs.some((l) => /publish call failed/.test(l)));
  const rows = logRows(supa);
  assert.equal(rows[0].status, 'success');
  assert.equal(rows[0].result.rendered, 1);
});

const noCamera = (b) => { assert.equal(b.rec.shots, 0, 'no still was taken'); assert.deepEqual(b.rec.seeks, []); };

const failureCases = [
  {
    name: 'clip_too_long from the page (too_long before any capture)',
    reason: 'clip_too_long',
    browser: () => makeBrowser({ states: ['loading', 'too_long'] }),
    check: noCamera,
  },
  {
    name: 'clip_not_ready after the 30 s ready wait',
    reason: 'clip_not_ready',
    browser: () => makeBrowser({ states: ['loading'] }),
    nowStepMs: 2000,
    check: (b) => { noCamera(b); assert.ok(b.rec.stateReads > 1); },
  },
  {
    name: 'clip_plan_unreadable when the page hands over no plan',
    reason: 'clip_plan_unreadable',
    browser: () => makeBrowser({ plan: null }),
    check: noCamera,
  },
  {
    name: 'no_frames when the plan has a single frame',
    reason: 'no_frames',
    browser: () => makeBrowser({ plan: { frames: 1, rate: 1, beats: [1400], holdMs: 13600, plannedMs: 15000 } }),
    check: noCamera,
  },
  {
    name: 'clip_too_long from the plan guard (beats past 40 s) before any still',
    reason: 'clip_too_long',
    browser: () => makeBrowser({ plan: { frames: 2, rate: 2, beats: [20000, 20000], holdMs: 1500, plannedMs: 41500 } }),
    check: noCamera,
    checkDeps: (r) => { assert.equal(r.ffmpeg.length, 0, 'nothing is encoded'); assert.equal(r.uploads.length, 0); },
  },
  {
    name: 'clip_too_short from the plan guard (beats and hold under 15 s) before any still',
    reason: 'clip_too_short',
    browser: () => makeBrowser({ plan: { frames: 2, rate: 1, beats: [1400, 900], holdMs: 1500, plannedMs: 3800 } }),
    check: noCamera,
    checkDeps: (r) => { assert.equal(r.ffmpeg.length, 0); },
  },
  {
    name: 'clip_seek_refused when the page refuses a frame',
    reason: 'clip_seek_refused',
    browser: () => makeBrowser({ seekReturns: false }),
    check: (b) => { assert.deepEqual(b.rec.seeks, [0]); assert.equal(b.rec.shots, 0); assert.equal(b.rec.closed, 1); },
  },
  {
    name: 'clip_seek_timeout when data-clip-step never shows the sought frame',
    reason: 'clip_seek_timeout',
    browser: () => makeBrowser({ stepFollows: false }),
    nowStepMs: 2000,
    check: (b) => { assert.deepEqual(b.rec.seeks, [0, 1], 'frame 0 was already on the felt; frame 1 never arrived'); assert.equal(b.rec.shots, 1); assert.equal(b.rec.closed, 1); },
  },
  {
    name: 'still_empty when the screenshot has no data',
    reason: 'still_empty',
    browser: () => makeBrowser({ shotData: (i) => (i === 4 ? '' : Buffer.from('ok').toString('base64')) }),
    check: (b) => { assert.equal(b.rec.shots, 5); },
    checkDeps: (r) => { assert.equal(r.ffmpeg.length, 0); },
  },
  {
    name: 'an ffmpeg failure',
    reason: /^ffmpeg exit 1: Invalid data found/,
    browser: () => makeBrowser(),
    ffmpegFails: true,
    checkDeps: (r) => { assert.equal(r.uploads.length, 0, 'nothing is uploaded'); },
  },
  {
    name: 'an upload failure',
    reason: /^upload 503: storage unavailable/,
    browser: () => makeBrowser(),
    uploadFails: true,
  },
  {
    name: 'hero_not_in_hand when the author is not one of the players',
    reason: 'hero_not_in_hand',
    browser: () => makeBrowser(),
    hand: makeHand({ players: [{ userId: OTHER, seat: 2 }] }),
    check: (b) => { assert.equal(b.rec.gotos.length, 0, 'no browser work'); },
  },
  {
    name: 'hand_not_found when the hand row is gone',
    reason: 'hand_not_found',
    browser: () => makeBrowser(),
    hand: null,
    check: (b) => { assert.equal(b.rec.gotos.length, 0); },
  },
];

for (const c of failureCases) {
  test(`failure: ${c.name} ends in finish(failed, reason), never a throw, with /tmp cleaned and a log row`, async () => {
    const job = makeJob({ kind: 'horse', auto_publish: true });
    const supa = makeSupa({ claim: job });
    const browser = c.browser();
    const { deps, rec } = makeDeps({ supa, browser, tmpRoot, hand: c.hand === undefined ? makeHand() : c.hand, ffmpegFails: !!c.ffmpegFails, uploadFails: !!c.uploadFails, nowStepMs: c.nowStepMs || 10 });
    const res = makeRes();
    await createHandler(deps)(authedReq(), res);
    assert.equal(res.statusCode, 200, 'the function never throws to Vercel');
    assert.equal(res.body.rendered, 0);
    assert.equal(res.body.job.state, 'failed');
    const finishes = finishCalls(supa);
    assert.equal(finishes.length, 1, 'exactly one finish');
    assert.equal(finishes[0].args.p_state, 'failed');
    if (c.reason instanceof RegExp) assert.match(finishes[0].args.p_error, c.reason);
    else assert.equal(finishes[0].args.p_error, c.reason);
    assert.equal(finishes[0].args.p_video_url, null);
    assert.equal(publishCalls(supa).length, 0, 'a failed horse job is never published');
    assert.equal(existsSync(join(tmpRoot, job.id)), false, 'the work directory is removed');
    if (browser.rec.gotos.length > 0) assert.equal(browser.rec.closed, 1, 'the browser is closed once');
    const rows = logRows(supa);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'success', 'the fire completed and recorded the failure');
    assert.equal(rows[0].result.rendered, 0);
    assert.equal(rows[0].result.state, 'failed');
    if (c.check) c.check(browser);
    if (c.checkDeps) c.checkDeps(rec);
  });
}

test('render_deadline: the clock running out between stills fails the job and closes the browser', async () => {
  const job = makeJob();
  const supa = makeSupa({ claim: job });
  const browser = makeBrowser();
  const { deps } = makeDeps({ supa, browser, tmpRoot, nowStepMs: 10 });
  /* The fake clock moves 10 ms per read and each still reads it twice: a
     150 ms deadline runs out around the sixth frame. */
  deps.deadlineMs = 150;
  const summary = await renderClipJob(job, deps);
  assert.equal(summary.state, 'failed');
  assert.equal(summary.reason, 'render_deadline');
  assert.ok(browser.rec.shots < 11, 'the camera stopped short');
  assert.equal(browser.rec.closed, 1);
  assert.equal(finishCalls(supa)[0].args.p_error, 'render_deadline');
});

test('a browser that cannot launch, and a finish call that fails, still resolve with the reason recorded', async () => {
  const job = makeJob();
  const supa = makeSupa({ claim: job });
  const { deps } = makeDeps({ supa, browser: { launch: async () => { throw new Error('chromium: executablePath refused'); } }, tmpRoot });
  const summary = await renderClipJob(job, deps);
  assert.equal(summary.state, 'failed');
  assert.match(summary.reason, /chromium: executablePath refused/);
  assert.equal(existsSync(join(tmpRoot, job.id)), false);

  const broken = makeSupa({ claim: job, finishError: 'connection reset' });
  const second = makeDeps({ supa: broken, browser: makeBrowser({ states: ['too_long'] }), tmpRoot });
  const result = await renderClipJob(job, second.deps);
  assert.equal(result.state, 'failed');
  assert.equal(result.reason, 'clip_too_long');
  assert.match(result.finish_error, /fn_hand_clip_finish: connection reset/);
  assert.ok(second.rec.logs.some((l) => /finish call failed too/.test(l)));
});

test('the cron_execution_log row is written before the response and a log failure never breaks the fire', async () => {
  const supa = makeSupa({ claim: NULL_ROW, logError: 'permission denied for table cron_execution_log' });
  const logs = [];
  const res = makeRes();
  let insertedBeforeResponse = false;
  const original = supa.from;
  supa.from = (table) => {
    const api = original(table);
    return { insert: async (row) => { insertedBeforeResponse = res.statusCode === null; return api.insert(row); } };
  };
  await createHandler({ supa, log: (m) => logs.push(m) })(authedReq(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(insertedBeforeResponse, true);
  assert.ok(logs.some((l) => /cron_execution_log insert failed: permission denied/.test(l)));
});

test('the real handler module exports the Vercel config and a wrapped default handler', async () => {
  const mod = await import('../pages/api/cron/render-hand-clips.js');
  assert.deepEqual(mod.config, { maxDuration: 300 });
  assert.equal(typeof mod.default, 'function');
  const source = readFileSync(new URL('../pages/api/cron/render-hand-clips.js', import.meta.url), 'utf8');
  assert.match(source, /withCronHealth\('render-hand-clips', createHandler\(\)\)/);
  assert.match(source, /executablePath,\s*args: chromium\.args/);
  assert.match(source, /args: chromium\.args/);
  assert.match(source, /headless: chromium\.headless === undefined \? 'shell' : chromium\.headless/, 'the v153 package ships chrome-headless-shell');
  assert.match(source, /defaultViewport: \{ width: CLIP_WIDTH, height: CLIP_HEIGHT, deviceScaleFactor: 1 \}/);
  // The share page's transport glyphs and the owner's clock: the font folder is copied into
  // the fontconfig directory after executablePath() and before launch; the browser runs on CLIP_TIMEZONE.
  assert.match(source, /const executablePath = await chromium\.executablePath\(\);\s*await provisionClipFonts\(\);\s*return puppeteer\.launch\(/);
  assert.match(source, /CLIP_FONTS_DIR\.split\('\/'\)/);
  assert.match(source, /process\.env\.FONTCONFIG_PATH \|\| join\(tmpdir\(\), 'fonts'\)/);
  assert.match(source, /env: \{ \.\.\.process\.env, TZ: CLIP_TIMEZONE \}/);
  // @sparticuz/chromium 153 is an ES module: the real adapter must load it with
  // a dynamic import (a require() of an ESM external fails the webpack build).
  assert.match(source, /await import\('@sparticuz\/chromium'\)/);
  assert.doesNotMatch(source, /require\('@sparticuz\/chromium'\)/);
  assert.match(source, /require\('puppeteer-core'\)/);
  assert.match(source, /require\('@ffmpeg-installer\/ffmpeg'\)/);
  assert.match(source, /'x-upsert': 'true'/);
  assert.match(source, /\.from\('ca_hand_facts'\)[\s\S]*\.eq\('hand_id', job\.hand_id\)[\s\S]*\.eq\('user_id', job\.author_id\)/);
  assert.match(source, /\.from\('hand_discards'\)[\s\S]*\.eq\('table_id', hand\.table_id\)[\s\S]*\.eq\('hand_number', hand\.hand_number\)[\s\S]*\.eq\('user_id', job\.author_id\)/);
  assert.match(source, /\.from\('tables'\)[\s\S]*\.select\('name'\)[\s\S]*\.eq\('id', hand\.table_id\)/, 'the table name is read for the share header');
  const code = source.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.doesNotMatch(code, /setInterval|retry|is_horse/i, 'no watcher, no retry, no horse filter in the code');
  const lib = readFileSync(new URL('../src/lib/server/handClipRender.js', import.meta.url), 'utf8');
  assert.doesNotMatch(lib, /startScreencast|screencastFrame/i, 'the camera reads the plan, never a wall-clock screencast');
});
