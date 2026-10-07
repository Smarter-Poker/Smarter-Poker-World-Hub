/**
 * GET /api/cron/render-hand-clips
 *
 * THE HAND CLIP RENDERER (Fleet Content Programme Phase 9.1, contract C6).
 *
 * Every two minutes (vercel.json crons) this function drains ONE job from
 * hand_clip_jobs: it claims the oldest queued row, opens the live Club Arena
 * replay page in clip mode inside a headless Chromium (puppeteer-core +
 * @sparticuz/chromium), takes one still per replay frame (the page hands
 * over the beat of every frame; the camera seeks each one and screenshots
 * it, so the clip is the page's plan whatever the CPU does), encodes the
 * stills with ffmpeg (@ffmpeg-installer, traced in exactly like
 * transcode-videos.js), uploads the MP4 and a poster JPEG to the public
 * social-media bucket, finishes the job as ready and, for a horse job the
 * fleet marked auto_publish, calls fn_p9_publish_hand_clip (which is the
 * switch: engine off or mode off leaves the clip ready and unpublished).
 *
 * What never happens here:
 *   - a retry: a failed job is finished as failed with its reason and stays
 *     so until a person (or the next natural request) re-queues it; stale
 *     rendering rows are finalised by fn_hand_clip_claim, not re-run;
 *   - a human's clip being posted: only kind horse with auto_publish true is
 *     handed to the publish function; a player posts from their own session;
 *   - a thrown error: every failure ends in fn_hand_clip_finish(failed) and a
 *     200, and every fire writes one cron_execution_log row (success for a
 *     completed fire, whatever the job's outcome; error when the fire itself
 *     could not claim).
 *
 * Shape: the same CRON_SECRET bearer check and service client as
 * transcode-videos.js; the decisions live in src/lib/server/handClipRender.js
 * and are driven through deps so __tests__/render-hand-clips-cron.test.mjs
 * runs the whole path with fakes. The real adapters below are required
 * lazily so that importing this module needs no browser or binary.
 */

import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withCronHealth } from '../../../src/lib/cronHealth.js';
import {
  CLIP_FONTS_DIR,
  CLIP_HEIGHT,
  CLIP_TIMEZONE,
  CLIP_WIDTH,
  HAND_COLUMNS,
  JOB_NAME,
  STORAGE_BUCKET,
  renderClipJob,
  shortReason,
} from '../../../src/lib/server/handClipRender.js';

// Vercel Pro: max 300s per function. One clip is 60 to 120 s of browser and
// encoder; the renderer's own deadline is 270 s (RENDER_DEADLINE_MS).
export const config = {
    maxDuration: 300,
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Validate binaries are strings BEFORE we hand them to spawn(), otherwise
// Node coerces an object to "[object Object]" and spawn fails with ENOENT
// (transcode-videos.js pattern).
const _binPath = (x) => {
    if (typeof x === 'string') return x;
    if (x && typeof x.path === 'string') return x.path;
    return null;
};

// The real browser: puppeteer-core driving @sparticuz/chromium. Both are
// serverExternalPackages and traced into this route by
// outputFileTracingIncludes in next.config.js. executablePath() inflates the
// packed Chromium into /tmp on first call, so it is only ever called here.
// @sparticuz/chromium 153 ships chrome-headless-shell and no longer exposes a
// `headless` getter; its README launches puppeteer with headless: "shell", so
// that is the fallback when the getter is absent.
// The transport glyph font (see CLIP_FONTS_DIR): every .ttf in the traced
// folder is copied into the fontconfig directory @sparticuz/chromium reads
// (FONTCONFIG_PATH, /tmp/fonts by default; its fonts.conf lists that folder).
// The copy happens after executablePath(), which is what creates the folder
// and sets the variable, and before launch, when fontconfig scans it. A
// missing folder renders the clip without the glyphs rather than not at all.
async function provisionClipFonts(log = console.log) {
    const source = join(process.cwd(), ...CLIP_FONTS_DIR.split('/'));
    const target = process.env.FONTCONFIG_PATH || join(tmpdir(), 'fonts');
    try {
        const names = (await readdir(source)).filter((n) => n.toLowerCase().endsWith('.ttf'));
        await mkdir(target, { recursive: true });
        for (const name of names) await copyFile(join(source, name), join(target, name));
        return names.length;
    } catch (err) {
        log(`[render-hand-clips] clip fonts not provisioned from ${source}: ${err && err.message ? err.message : err}`);
        return 0;
    }
}

async function launchChromium() {
    // @sparticuz/chromium 153 is an ES module (type: module); webpack refuses a
    // require() of an ESM external, so it is loaded with a dynamic import.
    const chromiumModule = await import('@sparticuz/chromium');
    const chromium = chromiumModule && chromiumModule.default ? chromiumModule.default : chromiumModule;
    const puppeteer = require('puppeteer-core');
    const executablePath = await chromium.executablePath();
    await provisionClipFonts();
    return puppeteer.launch({
        executablePath,
        args: chromium.args,
        headless: chromium.headless === undefined ? 'shell' : chromium.headless,
        defaultViewport: { width: CLIP_WIDTH, height: CLIP_HEIGHT, deviceScaleFactor: 1 },
        // The owner's clock for the share header's date (CLIP_TIMEZONE).
        env: { ...process.env, TZ: CLIP_TIMEZONE },
    });
}

function runFfmpeg(args) {
    const bin = _binPath(require('@ffmpeg-installer/ffmpeg'));
    if (!bin) return Promise.reject(new Error('ffmpeg binary missing in bundle'));
    return new Promise((resolve, reject) => {
        const p = spawn(bin, args);
        let stderr = '';
        p.stderr.on('data', (d) => { stderr += d.toString(); });
        p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-300)}`))));
        p.on('error', (err) => reject(new Error(`ffmpeg spawn: ${err && err.message ? err.message : err}`)));
    });
}

// Upload to storage (POST to /storage/v1/object/<bucket>/<path>, upsert), the
// transcode-videos.js pattern; a re-request overwrites the same object.
async function uploadToStorage(path, body, contentType) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${SERVICE_KEY}`,
            apikey: SERVICE_KEY,
            'Content-Type': contentType,
            'x-upsert': 'true',
        },
        body,
    });
    if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`upload ${res.status}: ${txt.slice(0, 200)}`);
    }
}

// The hand, the hero's ca_hand_facts row (hole cards), the hero's
// hand_discards row (draw variants) and the table's name (tables.name, the
// title the share page prints); every read is one indexed row.
function fetchHandWith(supa) {
    return async function fetchHand(job) {
        const { data: hand, error } = await supa
            .from('hand_history')
            .select(HAND_COLUMNS)
            .eq('id', job.hand_id)
            .maybeSingle();
        if (error) throw new Error(`hand_history: ${error.message}`);
        if (!hand) return { hand: null, facts: null, discard: null };

        const { data: facts } = await supa
            .from('ca_hand_facts')
            .select('hole_cards')
            .eq('hand_id', job.hand_id)
            .eq('user_id', job.author_id)
            .maybeSingle();

        let discard = null;
        if (hand.table_id && hand.hand_number !== null && hand.hand_number !== undefined) {
            const { data } = await supa
                .from('hand_discards')
                .select('discarded_card, seat_number')
                .eq('table_id', hand.table_id)
                .eq('hand_number', hand.hand_number)
                .eq('user_id', job.author_id)
                .limit(1)
                .maybeSingle();
            discard = data || null;
        }

        let table = null;
        if (hand.table_id) {
            const { data } = await supa
                .from('tables')
                .select('name')
                .eq('id', hand.table_id)
                .maybeSingle();
            table = data || null;
        }
        return { hand, facts: facts || null, discard, table };
    };
}

/**
 * The handler, built from deps so the test drives it with fakes. Every
 * override replaces the real adapter of the same name; `supa` replaces the
 * service client.
 */
export function createHandler(overrides = {}) {
    return async function handler(req, res) {
        const auth = (req.headers.authorization || '').replace('Bearer ', '');
        if (!process.env.CRON_SECRET || auth !== process.env.CRON_SECRET) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!SERVICE_KEY && !overrides.supa) {
            return res.status(500).json({ error: 'Server not configured (no service key)' });
        }

        const supa = overrides.supa || createClient(SUPABASE_URL, SERVICE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const deps = {
            supa,
            launch: launchChromium,
            runFfmpeg,
            upload: uploadToStorage,
            fetchHand: fetchHandWith(supa),
            now: () => Date.now(),
            log: (msg) => console.warn(msg),
            supabaseUrl: SUPABASE_URL,
            ...overrides,
        };

        const startedAt = new Date();
        // Written BEFORE the response is flushed: Vercel can freeze the
        // invocation the moment the response ends (cronHealth.js lesson).
        const writeLog = async (status, result, error) => {
            const completedAt = new Date();
            try {
                const { error: logError } = await supa.from('cron_execution_log').insert({
                    job_name: JOB_NAME,
                    status,
                    started_at: startedAt.toISOString(),
                    completed_at: completedAt.toISOString(),
                    duration_ms: completedAt.getTime() - startedAt.getTime(),
                    result,
                    error,
                });
                if (logError) deps.log(`[render-hand-clips] cron_execution_log insert failed: ${logError.message}`);
            } catch (err) {
                deps.log(`[render-hand-clips] cron_execution_log insert failed: ${shortReason(err)}`);
            }
        };

        // 1. Claim one job. RETURNS hand_clip_jobs gives a row of NULLs (or
        //    nothing) for an empty queue: only a row with an id is a job.
        let job = null;
        try {
            const { data, error } = await supa.rpc('fn_hand_clip_claim');
            if (error) throw new Error(`fn_hand_clip_claim: ${error.message}`);
            const row = Array.isArray(data) ? data[0] : data;
            job = row && row.id ? row : null;
        } catch (err) {
            const reason = shortReason(err);
            await writeLog('error', { rendered: 0 }, reason);
            return res.status(500).json({ ok: false, rendered: 0, error: reason });
        }

        if (!job) {
            await writeLog('success', { rendered: 0 }, null);
            return res.status(200).json({ ok: true, rendered: 0 });
        }

        // 2 to 8. Render, finish, publish; renderClipJob never throws.
        const summary = await renderClipJob(job, deps);
        const rendered = summary.state === 'ready' || summary.state === 'published' ? 1 : 0;
        await writeLog('success', { rendered, ...summary }, null);
        return res.status(200).json({ ok: true, rendered, job: summary });
    };
}

export default withCronHealth('render-hand-clips', createHandler());
