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
 * page runs, reads [data-clip-state] and calls window.__spClip.start().
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
export const CLIP_WIDTH = 1280;
export const CLIP_HEIGHT = 720;
export const GOTO_TIMEOUT_MS = 60000;
export const READY_TIMEOUT_MS = 30000;
export const DONE_GRACE_MS = 20000;
export const RENDER_DEADLINE_MS = 270000;
export const POLL_MS = 250;
export const STORAGE_BUCKET = 'social-media';
export const DEFAULT_SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';

export const SCREENCAST_PARAMS = Object.freeze({
  format: 'jpeg',
  quality: 85,
  maxWidth: CLIP_WIDTH,
  maxHeight: CLIP_HEIGHT,
  everyNthFrame: 1,
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
  plannedMs: () => (window.__spClip && typeof window.__spClip.plannedMs === 'number' ? window.__spClip.plannedMs : null),
  start: () => !!(window.__spClip && typeof window.__spClip.start === 'function' && window.__spClip.start()),
});

/** True when the hero is one of the hand's players (the hand_history RLS shape). */
export function heroInHand(handRow, heroId) {
  const players = Array.isArray(handRow && handRow.players) ? handRow.players : [];
  const hero = String(heroId || '');
  return hero.length > 0 && players.some((p) => p && typeof p === 'object' && String(p.userId) === hero);
}

/** Contract C1: the payload the page reads before any render. */
export function buildClipPayload(handRow, factsRow, discardRow, job) {
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
 * The ffmpeg concat demuxer list for timestamped screencast frames
 * ([{ path, timestamp }], timestamps in seconds since the epoch, as CDP
 * reports them). Each frame holds until the next one; the last frame holds
 * endHoldMs. The last file is listed once more because the demuxer applies
 * the final duration only when another entry follows it.
 */
export function concatListFor(frames, endHoldMs = END_HOLD_MS) {
  const sorted = (Array.isArray(frames) ? frames : [])
    .filter((f) => f && f.path)
    .map((f) => ({ path: f.path, timestamp: Number(f.timestamp) }))
    .sort((a, b) => a.timestamp - b.timestamp);
  const hold = Math.max(0.001, Number(endHoldMs) / 1000);
  const lines = ['ffconcat version 1.0'];
  let totalMs = 0;
  sorted.forEach((frame, i) => {
    const next = sorted[i + 1];
    let seconds = next ? next.timestamp - frame.timestamp : hold;
    if (!Number.isFinite(seconds) || seconds < 0.001) seconds = 0.001;
    lines.push(quoteForConcat(frame.path), `duration ${seconds.toFixed(3)}`);
    totalMs += seconds * 1000;
  });
  if (sorted.length > 0) lines.push(quoteForConcat(sorted[sorted.length - 1].path));
  return { text: `${lines.join('\n')}\n`, durationMs: Math.round(totalMs), frames: sorted.length };
}

/** The hold that brings the captured span up to what the page planned, never under END_HOLD_MS. */
export function endHoldFor(frames, plannedMs) {
  const stamps = (Array.isArray(frames) ? frames : [])
    .map((f) => Number(f && f.timestamp))
    .filter((t) => Number.isFinite(t));
  if (stamps.length === 0) return END_HOLD_MS;
  const spanMs = (Math.max(...stamps) - Math.min(...stamps)) * 1000;
  const planned = Number(plannedMs);
  if (!Number.isFinite(planned) || planned <= 0) return END_HOLD_MS;
  return Math.max(END_HOLD_MS, Math.round(planned - spanMs));
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
 *   fetchHand(job)               -> { hand, facts, discard } from the service client
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
  const frames = [];
  const pendingWrites = [];
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

  try {
    await mkdir(work, { recursive: true });

    // 2. The hand, the hero's facts row and discard row; the hero must be a player.
    const { hand, facts, discard } = (await fetchHand(job)) || {};
    if (!hand) return await fail('hand_not_found');
    if (!heroInHand(hand, job.author_id)) return await fail('hero_not_in_hand');
    const payload = buildClipPayload(hand, facts || null, discard || null, job);

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
    const plannedMs = await page.evaluate(pageScripts.plannedMs);

    // 4. The screencast: every frame to /tmp/<job id>/f_<n>.jpg with its timestamp.
    session = await page.createCDPSession();
    const cdp = session;
    cdp.on('Page.screencastFrame', (frame) => {
      const n = frames.length;
      const path = join(work, `f_${n}.jpg`);
      frames.push({ path, timestamp: Number(frame && frame.metadata ? frame.metadata.timestamp : NaN) });
      pendingWrites.push(
        writeFile(path, Buffer.from(String(frame.data || ''), 'base64'))
          .catch((err) => log(`[render-hand-clips] frame ${n} write failed: ${shortReason(err)}`)),
      );
      Promise.resolve(cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId })).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { ...SCREENCAST_PARAMS });
    const started = await page.evaluate(pageScripts.start);
    if (started !== true) return await fail('clip_start_refused');
    const done = await waitForState(['done'], CLIP_MAX_MS + DONE_GRACE_MS);
    if (done === 'deadline') return await fail('render_deadline');
    if (done !== 'done') return await fail('clip_timeout');
    try { await cdp.send('Page.stopScreencast'); } catch (_) { /* the browser closes next */ }
    await Promise.all(pendingWrites);
    await closeBrowser();

    // 5. The encode: per-frame durations, the end hold, the length guard, one MP4 and one poster.
    summary.frames = frames.length;
    if (frames.length < 2) return await fail('no_frames');
    const list = concatListFor(frames, endHoldFor(frames, plannedMs));
    summary.duration_ms = list.durationMs;
    const guard = durationGuard(list.durationMs, CLIP_MIN_MS, CLIP_MAX_MS);
    if (guard) return await fail(guard);
    const listPath = join(work, 'frames.txt');
    const outPath = join(work, 'clip.mp4');
    const posterPath = join(work, 'poster.jpg');
    await writeFile(listPath, list.text);
    await runFfmpeg(ffmpegArgsFor(listPath, outPath));
    await runFfmpeg(posterArgsFor(outPath, posterPath));

    // 6. The upload: both objects, upsert, public URLs.
    const paths = storagePathsFor(job);
    await upload(paths.video, await readFile(outPath), 'video/mp4');
    await upload(paths.poster, await readFile(posterPath), 'image/jpeg');
    const videoUrl = publicUrlFor(supabaseUrl, paths.video);
    const posterUrl = publicUrlFor(supabaseUrl, paths.poster);

    // 7. Finish ready; publish only a horse job the fleet marked for it.
    summary.render_ms = now() - startedAt;
    const finished = await finish('ready', {
      p_video_url: videoUrl,
      p_poster_url: posterUrl,
      p_duration_ms: list.durationMs,
      p_width: CLIP_WIDTH,
      p_height: CLIP_HEIGHT,
      p_frames: frames.length,
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
