/**
 * GET /api/cron/transcode-videos
 *
 * AUTO-TRANSCODE WORKER for HEVC/.mov uploads → H.264 MP4.
 *
 * Why: iPhone records video as H.265 (HEVC) in .mov containers. Chrome and
 * Firefox desktop CANNOT decode H.265 (no license). Even when the .mov is
 * already H.264, the moov atom is at the END of the file by default, which
 * means the player can't start streaming until the whole file downloads.
 * Both problems are fixed by re-muxing/re-encoding to MP4 with `-movflags
 * +faststart`. We do that here as a background worker.
 *
 * Pattern:
 *   1. Open Claw (or any external scheduler) pings this every minute with
 *      Authorization: Bearer ${CRON_SECRET}.
 *   2. Handler picks ONE post with transcode_status='queued', marks it
 *      'running', downloads the source, runs ffmpeg, uploads the .mp4 back
 *      to storage, updates social_posts.media_urls[0] + social_reels.video_url,
 *      marks 'done'.
 *   3. On error, marks 'failed' with the error message so it shows up in DB
 *      and a future debugging session can see what went wrong.
 *
 * Idempotent: if no rows are queued, returns 200 fast with `{ processed: 0 }`.
 *
 * Performance:
 *   - One post per invocation; designed for once-a-minute polling.
 *   - Fast path: if the source is already H.264, we use `-c copy` (no
 *     re-encode, just remux) — finishes in seconds even for 4K clips.
 *   - Slow path: HEVC sources need full re-encode at libx264 baseline,
 *     CRF 23, ~1× realtime. A 75s 1080p HEVC clip ≈ 60–90s on Vercel.
 *   - maxDuration set to 300s (Vercel Pro max). Files that don't finish
 *     in 5 min stay in 'running' and a follow-up safety job (TODO) can
 *     re-queue them.
 *
 * Authoring notes:
 *   - Auth pattern matches every other handler in this directory
 *     (live-cleanup.js, deploy-error-poll.js, etc.).
 *   - Uses the same SUPABASE_SERVICE_ROLE_KEY env var the rest of the
 *     project relies on.
 */

import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import ffprobePath from '@ffprobe-installer/ffprobe';

// Vercel Pro: max 300s per function. HEVC re-encode of a 1-min 1080p clip
// is ~60–90s; we leave headroom for download + upload.
export const config = {
    maxDuration: 300,
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate binaries are strings BEFORE we hand them to spawn(), otherwise
// Node coerces an object to "[object Object]" and spawn fails with ENOENT.
const _binPath = (x) => {
    if (typeof x === 'string') return x;
    if (x && typeof x.path === 'string') return x.path;
    return null;
};
const FFMPEG_BIN = _binPath(ffmpegPath);
const FFPROBE_BIN = _binPath(ffprobePath);

// Map source URL (full public URL) to its storage path within the bucket.
function urlToBucketPath(url) {
    // Pattern: https://<host>/storage/v1/object/public/social-media/<path>
    const m = String(url || '').match(/\/storage\/v1\/object\/public\/social-media\/(.+?)(?:\?|$)/);
    return m ? m[1] : null;
}

// Compute the output path: same dir, replace extension with .mp4.
function toMp4Path(srcPath) {
    return srcPath.replace(/\.(mov|hevc|heic|mkv|avi|m4v|3gpp?|3g2)$/i, '.mp4');
}

// Probe codec_name of the first video stream so we can pick fast-remux vs re-encode.
async function probeCodec(file) {
    return new Promise((resolve) => {
        const p = spawn(FFPROBE_BIN, [
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=codec_name',
            '-of', 'csv=p=0',
            file,
        ]);
        let out = '';
        p.stdout.on('data', d => { out += d.toString(); });
        p.on('close', () => resolve(out.trim()));
        p.on('error', () => resolve(''));
    });
}

async function runFfmpeg(args) {
    return new Promise((resolve, reject) => {
        const p = spawn(FFMPEG_BIN, args);
        let stderr = '';
        p.stderr.on('data', d => { stderr += d.toString(); });
        p.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`)));
        p.on('error', reject);
    });
}

export default async function handler(req, res) {
    const auth = (req.headers.authorization || '').replace('Bearer ', '');
    if (!process.env.CRON_SECRET || auth !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!SERVICE_KEY) {
        return res.status(500).json({ error: 'Server not configured (no service key)' });
    }
    if (!FFMPEG_BIN || !FFPROBE_BIN) {
        return res.status(500).json({ error: 'ffmpeg/ffprobe binaries missing in bundle' });
    }

    const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    // 0. Auto-recovery: any post stuck in 'running' for >10 minutes is a
    //    zombie (function timeout, crash, etc.). Re-queue it so this run
    //    or a later one will retry. Without this, a single Vercel timeout
    //    parks the post in 'running' forever.
    try {
        await supa.from('social_posts')
            .update({ transcode_status: 'queued' })
            .eq('transcode_status', 'running')
            .lt('transcoded_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());
    } catch (_) { /* best-effort */ }

    // 1. Pick ONE queued post (oldest first — fairness).
    const { data: queue, error: qErr } = await supa
        .from('social_posts')
        .select('id, author_id, media_urls, original_media_url, content_type')
        .eq('transcode_status', 'queued')
        .order('created_at', { ascending: true })
        .limit(1);

    if (qErr) {
        console.warn('[transcode] queue query failed:', qErr.message);
        return res.status(500).json({ error: 'queue_query_failed', detail: qErr.message });
    }
    if (!queue || queue.length === 0) {
        return res.status(200).json({ processed: 0, message: 'nothing queued' });
    }

    const post = queue[0];
    const srcUrl = post.original_media_url || (post.media_urls && post.media_urls[0]);
    if (!srcUrl) {
        await supa.from('social_posts').update({
            transcode_status: 'failed',
            transcode_error: 'No source URL on post',
        }).eq('id', post.id);
        return res.status(200).json({ processed: 0, error: 'no_source', post_id: post.id });
    }

    const srcBucketPath = urlToBucketPath(srcUrl);
    if (!srcBucketPath) {
        await supa.from('social_posts').update({
            transcode_status: 'failed',
            transcode_error: 'Source URL is not a social-media public URL',
        }).eq('id', post.id);
        return res.status(200).json({ processed: 0, error: 'unparseable_url', post_id: post.id });
    }
    const dstBucketPath = toMp4Path(srcBucketPath);

    // 2. Atomic queue claim — UPDATE only if STILL queued. Returns 0 rows if
    //    the parallel Hetzner worker already grabbed it; we bail without
    //    competing. Without this guard both workers could re-encode the same
    //    post and waste compute (output is identical so no data loss, just
    //    waste). This is the optimistic-concurrency win.
    const { data: claim, error: claimErr } = await supa
        .from('social_posts')
        .update({ transcode_status: 'running', transcoded_at: new Date().toISOString() })
        .eq('id', post.id)
        .eq('transcode_status', 'queued')
        .select('id');
    if (claimErr || !claim || claim.length === 0) {
        return res.status(200).json({
            processed: 0,
            message: 'already claimed by another worker',
            post_id: post.id,
        });
    }

    // 3. Allocate work dir INSIDE the try so /tmp pressure (mkdtemp throw)
    //    can't leave the post stuck in 'running' — the catch below will
    //    revert to 'failed' with a clear error.
    let work = null;
    try {
        work = await mkdtemp(join(tmpdir(), 'tx-'));
        const inFile = join(work, 'in' + (srcBucketPath.match(/\.[^.]+$/)?.[0] || '.mov'));
        const outFile = join(work, 'out.mp4');

        // 3. Download source (uses public URL — no auth needed for public bucket).
        const r = await fetch(srcUrl);
        if (!r.ok) throw new Error(`download status ${r.status}`);
        const buf = Buffer.from(await r.arrayBuffer());
        await writeFile(inFile, buf);
        const inSize = (await stat(inFile)).size;

        // 4. Probe — choose fast remux vs full re-encode.
        const codec = await probeCodec(inFile);
        const isAlreadyH264 = codec === 'h264';

        const ffArgs = isAlreadyH264
            ? [
                '-y', '-hide_banner', '-loglevel', 'error',
                '-i', inFile,
                '-c', 'copy',                      // remux only — no decode/encode
                '-movflags', '+faststart',
                outFile,
            ]
            : [
                '-y', '-hide_banner', '-loglevel', 'error',
                '-i', inFile,
                '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
                '-pix_fmt', 'yuv420p', '-profile:v', 'baseline', '-level', '3.1',
                '-c:a', 'aac', '-b:a', '128k',
                '-movflags', '+faststart',
                outFile,
            ];

        await runFfmpeg(ffArgs);
        const outSize = (await stat(outFile)).size;

        // 5. Upload to storage (POST to /storage/v1/object/<bucket>/<path>).
        const outBuf = await readFile(outFile);
        const uploadUrl = `${SUPABASE_URL}/storage/v1/object/social-media/${dstBucketPath}`;
        const upRes = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${SERVICE_KEY}`,
                apikey: SERVICE_KEY,
                'Content-Type': 'video/mp4',
                'x-upsert': 'true',
            },
            body: outBuf,
        });
        if (!upRes.ok) {
            const txt = await upRes.text().catch(() => '');
            throw new Error(`upload ${upRes.status}: ${txt.slice(0, 200)}`);
        }

        const newPublicUrl = `${SUPABASE_URL}/storage/v1/object/public/social-media/${dstBucketPath}`;

        // 6. Update social_posts.media_urls[0] + social_reels mirror.
        const newMediaUrls = Array.isArray(post.media_urls) && post.media_urls.length > 0
            ? [newPublicUrl, ...post.media_urls.slice(1)]
            : [newPublicUrl];

        await supa.from('social_posts').update({
            media_urls: newMediaUrls,
            transcode_status: 'done',
            transcode_error: null,
            transcoded_at: new Date().toISOString(),
            original_media_url: srcUrl,
        }).eq('id', post.id);

        await supa.from('social_reels')
            .update({ video_url: newPublicUrl })
            .eq('source_post_id', post.id);

        return res.status(200).json({
            processed: 1,
            post_id: post.id,
            from: srcBucketPath,
            to: dstBucketPath,
            codec,
            mode: isAlreadyH264 ? 'remux' : 'reencode',
            size_in: inSize,
            size_out: outSize,
        });
    } catch (err) {
        const msg = err?.message ? String(err.message).slice(0, 500) : 'unknown error';
        console.warn('[transcode] failed for post', post.id, msg);
        await supa.from('social_posts').update({
            transcode_status: 'failed',
            transcode_error: msg,
        }).eq('id', post.id);
        return res.status(500).json({ processed: 0, error: msg, post_id: post.id });
    } finally {
        try { await rm(work, { recursive: true, force: true }); } catch (_) {}
    }
}
