/**
 * handClipRender: the pure and injectable pieces of /api/cron/render-hand-clips
 * (Fleet Content Programme Phase 9.1, design section 7.2, contract C6).
 *
 * The cron handler owns the auth check, the service client and the real
 * browser, ffmpeg and storage adapters. Everything that decides something
 * lives here and takes its collaborators as arguments, so the whole
 * claim -> render -> finish -> publish path runs under node --test with a
 * fake browser, a fake ffmpeg, a fake storage upload and a fake clock
 * (__tests__/render-hand-clips-cron.test.mjs).
 *
 * The clip page contract (C1 payload, C2 page, C3 state attribute) is the
 * Club Arena builder's; this file only writes window.__SP_CLIP__ before the
 * page runs, reads [data-clip-state] and [data-clip-step], and reads the plan
 * and calls seek(i) on window.__spClip.
 *
 * THE CAMERA READS THE PLAN, NEVER THE CLOCK. The first capture (2026-10-01)
 * screencast the page's own wall-clock playback; on the function's starved
 * CPU the compositor fell seconds behind the felt, frames were dropped and
 * the live sample ended on the turn with the river and the showdown never
 * captured. Now the page hands over one beat per frame and the end hold
 * (fitClipRate, animation speed 1), and the renderer takes ONE STILL PER
 * FRAME: seek(i), the stage's data-clip-step confirming the commit, two
 * animation frames for the paint, Page.captureScreenshot. Each still lasts
 * its frame's beat in the concat list, the last one its beat plus the hold,
 * so the clip is exactly what the page planned whatever the CPU did.
 *
 * Rules kept here:
 *   - one job per call; a failure ends in fn_hand_clip_finish(failed, reason)
 *     and never in a thrown error (renderClipJob resolves on every path);
 *   - no retry: a failed job is final until a person or the next natural
 *     request re-queues it;
 *   - the work directory under /tmp is removed in a finally block;
 *   - the publish call is made only for kind horse with auto_publish true,
 *     and a publish error leaves the job ready (the function is the switch).
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const JOB_NAME = '/api/cron/render-hand-clips';
export const CLIP_PAGE_URL = 'https://smarter.poker/hub/club-arena/replay?clip=1';
export const CLIP_STYLE = 'felt-720p';
export const CLIP_MIN_MS = 15000;
export const CLIP_MAX_MS = 40000;
export const END_HOLD_MS = 1500;
/**
 * THE FRAME IS THE ARENA'S HAND REPLAYER (owner, 2026-10-07). A clip is the
 * hand replayer as Club Arena shows it on a hand by id, pixel for pixel:
 * the 900px column with its header, felt, caption, street tabs, transport
 * and results strip, and no footer, because the arena's replayer has none.
 * The page is reached through the public share route (it needs no sign-in)
 * but is fed the arena's own source (Club Arena `clipSourceFrom`, the
 * archive's reconstruction straight from the record); a first cut cloned
 * the share page instead, whose wire does not carry where the pot went
 * (its last frame left the sample's winner at 119.20 where the arena
 * shows 932.70) under a footer the arena never shows. That
 * column is taller than it is wide, so the frame is the feed portrait
 * (4:5) that holds it at full size with the page background around it.
 * Nothing is scaled down and nothing is cut.
 */
export const CLIP_WIDTH = 1080;
export const CLIP_HEIGHT = 1350;
/**
 * THE OWNER'S CLOCK (2026-10-07). The replayer prints the hand's time in
 * the viewer's own time zone; a clip has no viewer at render time, so it
 * prints the owner's, which is what the owner compares it against.
 */
export const CLIP_TIMEZONE = 'America/Chicago';
/**
 * THE TRANSPORT GLYPHS (2026-10-07). The replayer draws its transport
 * buttons with text symbols (first, previous, play, pause, next) that the
 * viewer's system font supplies. The packed Chromium ships Open Sans only,
 * so the first full-page clip rendered five empty buttons. fonts/hand-clip
 * holds a subset of Noto Sans Symbols 2 (OFL) that carries them, under this
 * name; the route writes it into the fontconfig directory before the
 * browser starts.
 */
export const CLIP_FONT_FILE = 'NotoSansSymbols2-HandClip.ttf';
export const GOTO_TIMEOUT_MS = 60000;
export const READY_TIMEOUT_MS = 30000;
/** The page commits a sought frame (data-clip-step) within this. */
export const SEEK_TIMEOUT_MS = 10000;
export const SEEK_POLL_MS = 50;
/** Two animation frames are waited for after the commit, or this long. */
export const PAINT_WAIT_MS = 2000;
/**
 * A card squeeze still running on the felt (a host with data-rs-animating="on")
 * is waited out before the still, or this long. The replay profile turns a
 * new board card face up over about a second; a still taken inside that
 * second shows the card's back, which is what the first live clip did on
 * the turn and the river (2026-10-07).
 */
export const SETTLE_WAIT_MS = 4000;
export const SETTLE_POLL_MS = 50;
export const RENDER_DEADLINE_MS = 270000;
export const POLL_MS = 250;
export const STORAGE_BUCKET = 'social-media';
export const DEFAULT_SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';

/** Page.captureScreenshot for one still: the 1080x1350 frame, JPEG 85. */
export const STILL_PARAMS = Object.freeze({
  format: 'jpeg',
  quality: 85,
  captureBeyondViewport: false,
  optimizeForSpeed: true,
  clip: Object.freeze({ x: 0, y: 0, width: CLIP_WIDTH, height: CLIP_HEIGHT, scale: 1 }),
});

/** The hand_history columns the clip page reads (design section 1). */
export const HAND_COLUMNS = [
  'id', 'table_id', 'hand_number', 'game_variant', 'small_blind', 'big_blind',
  'players', 'actions', 'board', 'community_cards', 'community_cards2', 'community_cards3',
  'rit_boards', 'pots', 'pot_size', 'winners', 'winners_by_board', 'winner_name', 'showdown',
  'hole_cards', 'bomb_pot', 'kill_pot', 'rake_amount', 'bbj_amount', 'button_seat',
  'started_at', 'ended_at', 'hand_name', 'summary', 'tournament_id', 'version', 'source',
  'has_human', 'created_at',
].join(', ');

/**
 * The functions the browser runs. Each is self-contained (puppeteer serialises
 * it with toString) and is exported by identity so a fake page can answer it.
 */
export const pageScripts = Object.freeze({
  inject: (payload) => { window.__SP_CLIP__ = payload; },
  clipState: () => {
    const el = document.querySelector('[data-clip-state]');
    return el ? el.getAttribute('data-clip-state') : null;
  },
  /** The frame on the felt, as the stage root reports it, or null. */
  clipStep: () => {
    const el = document.querySelector('[data-clip-step]');
    const n = el ? Number(el.getAttribute('data-clip-step')) : NaN;
    return Number.isInteger(n) ? n : null;
  },
  /** The plan off window.__spClip: one beat per frame and the end hold, or null. */
  plan: () => {
    const h = window.__spClip;
    if (!h || typeof h !== 'object') return null;
    const beats = Array.isArray(h.beats) ? h.beats.map((b) => Number(b)) : null;
    if (!beats || beats.length === 0) return null;
    if (beats.some((b) => !Number.isFinite(b) || b <= 0)) return null;
    if (h.frames !== beats.length) return null;
    const holdMs = Number(h.holdMs);
    if (!Number.isFinite(holdMs) || holdMs < 0) return null;
    return { frames: beats.length, rate: Number(h.rate), beats, holdMs, plannedMs: Number(h.plannedMs) };
  },
  seek: (index) => !!(window.__spClip && typeof window.__spClip.seek === 'function' && window.__spClip.seek(index)),
  /** Resolves true once no card squeeze is running on the felt, false when timeoutMs passes first. */
  settled: (timeoutMs, pollMs) => new Promise((resolve) => {
    const until = Date.now() + timeoutMs;
    const check = () => {
      if (!document.querySelector('[data-rs-animating="on"]')) return resolve(true);
      if (Date.now() >= until) return resolve(false);
      return setTimeout(check, pollMs);
    };
    check();
  }),
  /** Resolves true after two animation frames, false when timeoutMs passes first. */
  painted: (timeoutMs) => new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    requestAnimationFrame(() => requestAnimationFrame(() => done(true)));
    setTimeout(() => done(false), timeoutMs);
  }),
});

/** True when the hero is one of the hand's players (the hand_history RLS shape). */
export function heroInHand(handRow, heroId) {
  const players = Array.isArray(handRow && handRow.players) ? handRow.players : [];
  const hero = String(heroId || '');
  return hero.length > 0 && players.some((p) => p && typeof p === 'object' && String(p.userId) === hero);
}

/**
 * Contract C1: the payload the page reads before any render. `tableName`
 * is the table's name from `tables` (null when the row is gone), which the
 * page prints in the share header the way the archive's share does.
 */
export function buildClipPayload(handRow, factsRow, discardRow, job, tableRow = null) {
  const heroId = String(job.author_id);
  const rowHole = handRow && handRow.hole_cards && typeof handRow.hole_cards === 'object'
    ? handRow.hole_cards[heroId]
    : null;
  const rowHasHero = Array.isArray(rowHole) && rowHole.length > 0;
  const factsHole = factsRow && Array.isArray(factsRow.hole_cards) ? factsRow.hole_cards : null;
  const privateHoleCards = !rowHasHero && factsHole && factsHole.length > 0 ? { [heroId]: factsHole } : {};
  const discard = discardRow && discardRow.discarded_card && typeof discardRow.discarded_card === 'object'
    ? discardRow.discarded_card
    : null;
  const discardedCards = discard ? { [heroId]: discard } : {};
  return {
    v: 1,
    style: job.style || CLIP_STYLE,
    heroId,
    row: handRow,
    tableName: tableRow && typeof tableRow.name === 'string' && tableRow.name.trim() ? tableRow.name : null,
    privateHoleCards,
    discardedCards,
    minMs: CLIP_MIN_MS,
    maxMs: CLIP_MAX_MS,
  };
}

function quoteForConcat(path) {
  return `file '${String(path).replace(/'/g, "'\\''")}'`;
}

/**
 * How long each still lasts, in frame order: its beat, and for the last
 * frame its beat plus the end hold. Whole milliseconds, never under one.
 */
export function stillDurationsFor(plan) {
  const beats = Array.isArray(plan && plan.beats) ? plan.beats : [];
  const last = beats.length - 1;
  const hold = Math.max(0, Math.round(Number(plan && plan.holdMs) || 0));
  return beats.map((b, i) => Math.max(1, Math.round(Number(b) || 0)) + (i === last ? hold : 0));
}

/**
 * The ffmpeg concat demuxer list for stills ([{ path, durationMs }], in
 * order). Each still holds its own duration. The last file is listed once
 * more because the demuxer applies the final duration only when another
 * entry follows it.
 */
export function concatListForStills(stills) {
  const list = (Array.isArray(stills) ? stills : []).filter((s) => s && s.path);
  const lines = ['ffconcat version 1.0'];
  let totalMs = 0;
  for (const s of list) {
    const ms = Math.max(1, Math.round(Number(s.durationMs) || 0));
    lines.push(quoteForConcat(s.path), `duration ${(ms / 1000).toFixed(3)}`);
    totalMs += ms;
  }
  if (list.length > 0) lines.push(quoteForConcat(list[list.length - 1].path));
  return { text: `${lines.join('\n')}\n`, durationMs: totalMs, frames: list.length };
}

/** Contract C6 step 5: the encode. */
export function ffmpegArgsFor(listPath, outPath) {
  return [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', listPath,
    '-vf', `scale=${CLIP_WIDTH}:${CLIP_HEIGHT}:force_original_aspect_ratio=decrease,pad=${CLIP_WIDTH}:${CLIP_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black`,
    '-r', '30',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-an',
    outPath,
  ];
}

/** Contract C6 step 5: the poster frame. */
export function posterArgsFor(inPath, outPath) {
  return [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-ss', '1',
    '-i', inPath,
    '-frames:v', '1',
    '-q:v', '3',
    outPath,
  ];
}

/** Contract C6 step 6: the two objects, upserted under the author's folder. */
export function storagePathsFor(job) {
  const base = `videos/${job.author_id}/hand-clip-${job.hand_id}-${job.style || CLIP_STYLE}`;
  return { video: `${base}.mp4`, poster: `${base}.jpg` };
}

export function publicUrlFor(supabaseUrl, path) {
  const origin = String(supabaseUrl || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
  return `${origin}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
}

/** null when the duration is inside [minMs, maxMs], else the failure reason. */
export function durationGuard(ms, minMs = CLIP_MIN_MS, maxMs = CLIP_MAX_MS) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < minMs) return 'clip_too_short';
  if (n > maxMs) return 'clip_too_long';
  return null;
}

/** A failure reason short enough for the job row and the log. */
export function shortReason(err) {
  const msg = err && err.message ? String(err.message) : (typeof err === 'string' ? err : 'unknown error');
  return msg.replace(/\s+/g, ' ').trim().slice(0, 300) || 'unknown error';
}

async function callRpc(supa, name, args) {
  const { data, error } = await supa.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message || String(error)}`);
  return data;
}

/**
 * Renders one claimed job through deps and resolves with a summary; never
 * rejects. deps = { supa, launch, runFfmpeg, upload, now, log, fetchHand }
 * plus the optional sleep, tmpRoot, supabaseUrl and deadlineMs.
 *
 *   launch()                     -> a puppeteer-style browser (newPage, close)
 *   runFfmpeg(args)              -> resolves when ffmpeg exits 0, rejects otherwise
 *   upload(path, body, type)     -> resolves when the object is stored, rejects otherwise
 *   fetchHand(job)               -> { hand, facts, discard, table } from the service client
 *   now()                        -> ms since the epoch; sleep(ms) -> a promise
 */
export async function renderClipJob(job, deps) {
  const { supa, launch, runFfmpeg, upload, fetchHand } = deps;
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const sleep = typeof deps.sleep === 'function' ? deps.sleep : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const log = typeof deps.log === 'function' ? deps.log : () => {};
  const tmpRoot = deps.tmpRoot || tmpdir();
  const supabaseUrl = deps.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const deadlineMs = Number(deps.deadlineMs) > 0 ? Number(deps.deadlineMs) : RENDER_DEADLINE_MS;

  const startedAt = now();
  const deadlineAt = startedAt + deadlineMs;
  const work = join(tmpRoot, String(job.id));
  const summary = {
    job_id: job.id,
    kind: job.kind,
    state: null,
    reason: null,
    frames: 0,
    duration_ms: null,
    render_ms: null,
    published: false,
  };
  const stills = [];
  let browser = null;
  let page = null;
  let session = null;
  let watchdog = null;

  const closeBrowser = async () => {
    if (!browser) return;
    const b = browser;
    browser = null;
    page = null;
    session = null;
    try {
      await b.close();
    } catch (err) {
      log(`[render-hand-clips] browser close failed: ${shortReason(err)}`);
      try {
        const proc = typeof b.process === 'function' ? b.process() : null;
        if (proc && typeof proc.kill === 'function') proc.kill('SIGKILL');
      } catch (_) { /* nothing left to kill */ }
    }
  };

  const finish = async (state, fields) => {
    const args = {
      p_job_id: job.id,
      p_state: state,
      p_video_url: null,
      p_poster_url: null,
      p_duration_ms: null,
      p_width: null,
      p_height: null,
      p_frames: null,
      p_render_ms: now() - startedAt,
      p_error: null,
      ...fields,
    };
    return callRpc(supa, 'fn_hand_clip_finish', args);
  };

  const fail = async (reason) => {
    summary.state = 'failed';
    summary.reason = reason;
    summary.render_ms = now() - startedAt;
    try {
      await finish('failed', { p_error: reason });
    } catch (err) {
      summary.finish_error = shortReason(err);
      log(`[render-hand-clips] job ${job.id} failed (${reason}) and the finish call failed too: ${summary.finish_error}`);
    }
    return summary;
  };

  const waitForState = async (wanted, timeoutMs) => {
    const t0 = now();
    for (;;) {
      const state = await page.evaluate(pageScripts.clipState);
      if (wanted.includes(state)) return state;
      if (now() >= deadlineAt) return 'deadline';
      if (now() - t0 >= timeoutMs) return 'timeout';
      await sleep(POLL_MS);
    }
  };

  const waitForStep = async (index, timeoutMs) => {
    const t0 = now();
    for (;;) {
      const step = await page.evaluate(pageScripts.clipStep);
      if (step === index) return 'committed';
      if (now() >= deadlineAt) return 'deadline';
      if (now() - t0 >= timeoutMs) return 'timeout';
      await sleep(SEEK_POLL_MS);
    }
  };

  try {
    await mkdir(work, { recursive: true });

    // 2. The hand, the hero's facts row and discard row, the table's name; the hero must be a player.
    const { hand, facts, discard, table } = (await fetchHand(job)) || {};
    if (!hand) return await fail('hand_not_found');
    if (!heroInHand(hand, job.author_id)) return await fail('hero_not_in_hand');
    const payload = buildClipPayload(hand, facts || null, discard || null, job, table || null);

    // 3. The browser and the clip page.
    browser = await launch();
    watchdog = setTimeout(() => { closeBrowser().catch(() => {}); }, Math.max(0, deadlineAt - now()));
    if (watchdog && typeof watchdog.unref === 'function') watchdog.unref();
    page = await browser.newPage();
    await page.evaluateOnNewDocument(pageScripts.inject, payload);
    await page.goto(CLIP_PAGE_URL, { waitUntil: 'networkidle2', timeout: GOTO_TIMEOUT_MS });
    const ready = await waitForState(['ready', 'too_long'], READY_TIMEOUT_MS);
    if (ready === 'too_long') return await fail('clip_too_long');
    if (ready === 'deadline') return await fail('render_deadline');
    if (ready !== 'ready') return await fail('clip_not_ready');

    // 4. The plan: one beat per frame and the end hold, as the page fitted them.
    const plan = await page.evaluate(pageScripts.plan);
    if (!plan) return await fail('clip_plan_unreadable');
    if (plan.frames < 2) return await fail('no_frames');
    const durations = stillDurationsFor(plan);
    const plannedMs = durations.reduce((a, b) => a + b, 0);
    const guard = durationGuard(plannedMs, CLIP_MIN_MS, CLIP_MAX_MS);
    if (guard) return await fail(guard);

    // 5. One still per frame: seek, the commit confirmed, the squeeze settled, a paint, a screenshot.
    session = await page.createCDPSession();
    for (let i = 0; i < plan.frames; i += 1) {
      if (now() >= deadlineAt) return await fail('render_deadline');
      const sought = await page.evaluate(pageScripts.seek, i);
      if (sought !== true) return await fail('clip_seek_refused');
      const committed = await waitForStep(i, SEEK_TIMEOUT_MS);
      if (committed === 'deadline') return await fail('render_deadline');
      if (committed !== 'committed') return await fail('clip_seek_timeout');
      await page.evaluate(pageScripts.settled, SETTLE_WAIT_MS, SETTLE_POLL_MS);
      await page.evaluate(pageScripts.painted, PAINT_WAIT_MS);
      const shot = await session.send('Page.captureScreenshot', { ...STILL_PARAMS });
      const data = shot && shot.data ? String(shot.data) : '';
      if (data.length === 0) return await fail('still_empty');
      const path = join(work, `f_${i}.jpg`);
      await writeFile(path, Buffer.from(data, 'base64'));
      stills.push({ path, durationMs: durations[i] });
    }
    await closeBrowser();

    // 6. The encode: each still for its beat, the end hold on the last, one MP4 and one poster.
    summary.frames = stills.length;
    const list = concatListForStills(stills);
    summary.duration_ms = list.durationMs;
    const listPath = join(work, 'frames.txt');
    const outPath = join(work, 'clip.mp4');
    const posterPath = join(work, 'poster.jpg');
    await writeFile(listPath, list.text);
    await runFfmpeg(ffmpegArgsFor(listPath, outPath));
    await runFfmpeg(posterArgsFor(outPath, posterPath));

    // 7. The upload: both objects, upsert, public URLs.
    const paths = storagePathsFor(job);
    await upload(paths.video, await readFile(outPath), 'video/mp4');
    await upload(paths.poster, await readFile(posterPath), 'image/jpeg');
    const videoUrl = publicUrlFor(supabaseUrl, paths.video);
    const posterUrl = publicUrlFor(supabaseUrl, paths.poster);

    // 8. Finish ready; publish only a horse job the fleet marked for it.
    summary.render_ms = now() - startedAt;
    const finished = await finish('ready', {
      p_video_url: videoUrl,
      p_poster_url: posterUrl,
      p_duration_ms: list.durationMs,
      p_width: CLIP_WIDTH,
      p_height: CLIP_HEIGHT,
      p_frames: stills.length,
      p_render_ms: summary.render_ms,
    });
    summary.state = (finished && finished.state) || 'ready';
    summary.video_url = videoUrl;
    summary.poster_url = posterUrl;

    if (job.kind === 'horse' && job.auto_publish === true) {
      try {
        const published = await callRpc(supa, 'fn_p9_publish_hand_clip', { p_job_id: job.id });
        const state = published && published.state;
        summary.published = state === 'published';
        if (state) summary.state = state;
        if (published && published.social_post_id) summary.social_post_id = published.social_post_id;
        if (published && published.social_reel_id) summary.social_reel_id = published.social_reel_id;
      } catch (err) {
        // The clip is ready and stays ready; the function is the switch.
        summary.publish_error = shortReason(err);
        log(`[render-hand-clips] job ${job.id} rendered but the publish call failed: ${summary.publish_error}`);
      }
    }
    return summary;
  } catch (err) {
    return await fail(shortReason(err));
  } finally {
    if (watchdog) clearTimeout(watchdog);
    await closeBrowser();
    try { await rm(work, { recursive: true, force: true }); } catch (_) { /* best effort */ }
  }
}
