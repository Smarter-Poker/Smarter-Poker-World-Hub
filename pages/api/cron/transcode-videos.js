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
// Use require() for ffmpeg/ffprobe via the parent packages — webpack marks them
// external via serverExternalPackages so no static module resolution is attempted.
// At runtime on Vercel (linux-x64) the parent packages return the linux-x64 binary
// path automatically. The prune-platform-bins.sh script removes non-linux platform
// directories before build to keep the Lambda bundle small.

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
const FFMPEG_BIN = _binPath(require('@ffmpeg-installer/ffmpeg'));
const FFPROBE_BIN = _binPath(require('@ffprobe-installer/ffprobe'));

// Map source URL (full public URL) to its storage bucket + path.
// Returns `{ bucket, path }` or null if unparseable.
//
// LIVE-REPLAY FIX (2026-05-05 per Dan): live stream recordings live in
// `live-recordings/` bucket as .webm files. The previous version only
// matched `social-media/` bucket URLs, so live-replay posts (queued by
// the extended fn_queue_video_transcode trigger) failed
// `srcBucketPath = null` → marked 'failed' immediately. Now handles BOTH
// buckets: source can be either, OUTPUT always lands in social-media so
// the public feed-card render path stays unchanged.
function parseStorageUrl(url) {
    const s = String(url || '');
    // social-media bucket (most uploads go here)
    let m = s.match(/\/storage\/v1\/object\/public\/social-media\/(.+?)(?:\?|$)/);
    if (m) return { bucket: 'social-media', path: m[1] };
    // live-recordings bucket (live stream replays)
    m = s.match(/\/storage\/v1\/object\/public\/live-recordings\/(.+?)(?:\?|$)/);
    if (m) return { bucket: 'live-recordings', path: m[1] };
    return null;
}
// Legacy single-bucket helper for callers that only want the path.
function urlToBucketPath(url) {
    return parseStorageUrl(url)?.path || null;
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

// Probe duration in seconds (float) for the input. Used to compute evenly-spaced
// timestamps for the 8-frame cover_frames extraction.
async function probeDurationSec(file) {
    return new Promise((resolve) => {
        const p = spawn(FFPROBE_BIN, [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'csv=p=0',
            file,
        ]);
        let out = '';
        p.stdout.on('data', d => { out += d.toString(); });
        p.on('close', () => {
            const n = parseFloat(out.trim());
            resolve(isFinite(n) && n > 0 ? n : 0);
        });
        p.on('error', () => resolve(0));
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

// PHASE-C (2026-05-03): full ffprobe validation BEFORE we waste compute on a
// re-encode. Returns { valid: true } for shippable videos or
// { valid: false, reason: '...' } for files we should reject. Catches:
//   • Truncated MP4s (no streams visible)
//   • Audio-only files mislabeled as video (no video stream)
//   • Broken HEVC headers (ffprobe exits non-zero)
//   • Zero-duration files (no playable content)
//   • Silly tiny files that snuck past the size cap (< 1KB usually = failed
//     upload that wrote a partial object)
//
// Failure mode is non-blocking on probe-tool errors — if ffprobe itself errors
// we let the transcode attempt anyway, because the underlying ffmpeg run will
// surface the real problem. We only reject on POSITIVE evidence of corruption.
async function validateVideoSource(file) {
    const inSize = (await stat(file)).size;
    if (inSize < 1024) {
        return { valid: false, reason: `Source file is only ${inSize} bytes — likely a failed/truncated upload` };
    }
    // Run ffprobe -show_format -show_streams to get a comprehensive view
    const probe = await new Promise((resolve) => {
        const p = spawn(FFPROBE_BIN, [
            '-v', 'error',
            '-show_format',
            '-show_streams',
            '-of', 'json',
            file,
        ]);
        let out = '';
        let err = '';
        p.stdout.on('data', d => { out += d.toString(); });
        p.stderr.on('data', d => { err += d.toString(); });
        p.on('close', code => resolve({ code, stdout: out, stderr: err }));
        p.on('error', e => resolve({ code: -1, stdout: '', stderr: e?.message || 'spawn error' }));
    });

    if (probe.code !== 0) {
        // Probe failed — could be missing binary, corrupt input, or unknown format.
        // Don't reject just because probe failed — the transcode might still work
        // (ffmpeg sometimes handles things ffprobe trips on). But log the diagnostic.
        console.warn('[transcode] ffprobe non-zero exit:', probe.code, probe.stderr.slice(0, 300));
        return { valid: true, reason: null, warning: `ffprobe exit ${probe.code} — proceeding optimistically` };
    }

    let parsed = null;
    try {
        parsed = JSON.parse(probe.stdout || '{}');
    } catch (_) {
        return { valid: true, reason: null, warning: 'ffprobe stdout not parseable as JSON — proceeding' };
    }

    const streams = Array.isArray(parsed?.streams) ? parsed.streams : [];
    const videoStreams = streams.filter(s => s?.codec_type === 'video');
    if (videoStreams.length === 0) {
        return { valid: false, reason: 'No video stream found in source — file is audio-only or corrupt' };
    }

    // Format-level duration. Some streams (esp. HEVC) report duration only at
    // format level, not stream level. Accept either.
    const fmtDuration = parseFloat(parsed?.format?.duration);
    const streamDuration = parseFloat(videoStreams[0]?.duration);
    const durationSec = isFinite(fmtDuration) && fmtDuration > 0
        ? fmtDuration
        : (isFinite(streamDuration) && streamDuration > 0 ? streamDuration : 0);
    if (durationSec === 0) {
        return { valid: false, reason: 'Source has zero duration — likely a corrupt file' };
    }

    // Reject single-frame "videos" (< 0.1s) — almost certainly corrupt.
    if (durationSec < 0.1) {
        return { valid: false, reason: `Source duration ${durationSec}s is below playable threshold` };
    }

    return {
        valid: true,
        reason: null,
        codec: videoStreams[0]?.codec_name || 'unknown',
        durationSec,
        width: videoStreams[0]?.width || 0,
        height: videoStreams[0]?.height || 0,
    };
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

    // 1. Pick ONE queued post (oldest first — fairness). Also pull metadata
    //    so we can back-prop the transcoded URL to social_page_posts when a
    //    post is a club-page mirror (metadata.source_post_id points to the
    //    original social_page_posts row).
    const { data: queue, error: qErr } = await supa
        .from('social_posts')
        .select('id, author_id, media_urls, original_media_url, content_type, metadata, thumbnail_url, cover_frame_index')
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

    // LIVE-REPLAY FIX (2026-05-05): parse source URL to handle both
    // social-media and live-recordings buckets. Output always lands in
    // social-media so the feed-card render path is unchanged.
    const parsed = parseStorageUrl(srcUrl);
    if (!parsed) {
        await supa.from('social_posts').update({
            transcode_status: 'failed',
            transcode_error: 'Source URL is not a parseable public storage URL',
        }).eq('id', post.id);
        return res.status(200).json({ processed: 0, error: 'unparseable_url', post_id: post.id });
    }
    const srcBucket = parsed.bucket;
    const srcBucketPath = parsed.path;
    // For live-recordings sources, build a parallel path in social-media/videos/
    // (output always lives in social-media so the feed-card render is unchanged).
    // For social-media sources, swap extension to .mp4 in place.
    const _liveSlug = (srcBucketPath.split('/').pop() || 'recording').replace(/\.[^.]+$/, '');
    const dstBucketPath = srcBucket === 'live-recordings'
        ? `videos/${post.author_id}/live_${_liveSlug}_${Date.now()}.mp4`
        : toMp4Path(srcBucketPath);

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

        // PHASE-C (2026-05-03): server-side validation BEFORE we burn 60-90s of
        // ffmpeg compute. Catches corrupt uploads (truncated MP4, audio-only
        // files mislabeled video, broken HEVC headers, zero-duration). Mark the
        // post 'invalid' so the feed renders an error tile instead of a black
        // box that never plays. Cheaper to fail here than after the transcode.
        const validation = await validateVideoSource(inFile);
        if (!validation.valid) {
            console.warn('[transcode] source validation failed for post', post.id, ':', validation.reason);
            await supa.from('social_posts').update({
                transcode_status: 'invalid',
                transcode_error: validation.reason,
                transcoded_at: new Date().toISOString(),
            }).eq('id', post.id);
            try { await rm(work, { recursive: true, force: true }); } catch (_) {}
            return res.status(200).json({
                processed: 0,
                error: 'invalid_source',
                post_id: post.id,
                reason: validation.reason,
            });
        }

        // 4. Probe — choose fast remux vs full re-encode.
        const codec = validation.codec || await probeCodec(inFile);
        const isAlreadyH264 = codec === 'h264';

        // PHASE-C.1 (2026-05-01): cap output at 1080p when re-encoding.
        // iPhone records 4K HEVC by default — re-encoding to 4K H.264 produces
        // a ~400 MB file for a 60s clip, which is wasteful (no phone or
        // laptop displays the difference between 1080p and 4K at typical
        // viewing distances on a feed video).
        //
        // AUDIT-PASS-MAX (2026-05-01 final sweep): the previous filter
        //   `scale='min(1920,iw)':'-2'`
        // ONLY capped width. For iPhone portrait 4K (2160×3840) the output
        // came out 1920×3413 — width capped, but height proportionally
        // ballooned, leaving files ~2.5× the target size. The proper rule
        // is "cap the LONGER edge at 1920, scale the shorter edge to keep
        // aspect, force even dimensions (libx264 requirement)."
        //
        // Branch on orientation:
        //   landscape (iw > ih) → width = min(1920, iw), height = -2 (auto)
        //   portrait/square     → width = -2 (auto),     height = min(1920, ih)
        //
        // Result:
        //   3840×2160 → 1920×1080  ✓
        //   2160×3840 → 1080×1920  ✓
        //   1280×720  → 1280×720   ✓ (no upscale)
        //   720×1280  → 720×1280   ✓ (no upscale)
        //
        //   • level 4.0 (was 3.1) — required for 1080p; 3.1 caps at 720p
        //   • profile main (was baseline) — better quality at 1080p without
        //                                    sacrificing universal device support
        const SCALE_1080P =
            "scale='if(gt(iw,ih), min(1920,iw), -2)':'if(gt(iw,ih), -2, min(1920,ih))'";
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
                '-vf', SCALE_1080P,
                '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
                '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-level', '4.0',
                '-c:a', 'aac', '-b:a', '128k',
                '-movflags', '+faststart',
                outFile,
            ];

        await runFfmpeg(ffArgs);
        const outSize = (await stat(outFile)).size;

        // ─── 4b. COVER-FRAMES EXTRACTION (AUDIT-21, 2026-05-01 — Compose V2)
        // Replaces the single-frame thumbnail extraction (AUDIT-20) with an
        // 8-frame ladder so the new "Edit cover" UI can offer a real scrubber.
        //
        // What we do here:
        //   1. Probe duration. Compute 8 timestamps evenly spaced across the
        //      middle 90% of the video (skipping the first/last 5% to avoid
        //      black fade-in/out frames).
        //   2. Extract each frame to <work>/frame_<i>.jpg using ffmpeg with
        //      -ss-before-i fast-seek (keyframe-accurate, 10-50× faster than
        //      post-decode seek; perfectly fine for cover thumbnails).
        //   3. Upload each frame to social-media bucket as a public URL.
        //   4. Persist all 8 URLs in social_posts.cover_frames TEXT[].
        //   5. If post.cover_frame_index is set (user picked a specific
        //      frame on the Edit cover screen BEFORE the cron ran), use that
        //      one as thumbnail_url. Otherwise use frame 0.
        //
        // Failure mode: if any individual frame extraction throws, we log and
        // skip that index — the array can have nulls. The post is never
        // blocked by cover-frame extraction failures.
        let coverFrameUrls = [];
        let chosenThumbUrl = null;
        try {
            const durationSec = await probeDurationSec(inFile);
            const FRAME_COUNT = 8;
            const timestamps = Array.from({ length: FRAME_COUNT }, (_, i) => {
                if (durationSec > 0) {
                    return Math.max(0.1, (durationSec * 0.05) + (durationSec * 0.9 * i) / Math.max(FRAME_COUNT - 1, 1));
                }
                // Fallback: 1 second per frame for unknown-duration files
                return 1 + i;
            });

            const thumbBaseName = dstBucketPath
                .replace(/^videos\//, 'thumbnails/')
                .replace(/\.mp4$/, '');
            const tsStamp = Date.now();

            for (let i = 0; i < FRAME_COUNT; i++) {
                const t = timestamps[i];
                const localFrame = join(work, `frame_${i}.jpg`);
                try {
                    await runFfmpeg([
                        '-y', '-hide_banner', '-loglevel', 'error',
                        '-ss', String(t),
                        '-i', inFile,
                        '-vframes', '1',
                        '-vf', "scale='if(gt(iw,ih),480,-2)':'if(gt(iw,ih),-2,480)'",
                        '-q:v', '2',
                        localFrame,
                    ]);
                    const frameBuf = await readFile(localFrame);
                    if (!frameBuf || frameBuf.length < 100) {
                        coverFrameUrls.push(null);
                        continue;
                    }
                    const bucketPath = `${thumbBaseName}_frame${i}_${tsStamp}.jpg`;
                    const upUrl = `${SUPABASE_URL}/storage/v1/object/social-media/${bucketPath}`;
                    const upRes = await fetch(upUrl, {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${SERVICE_KEY}`,
                            apikey: SERVICE_KEY,
                            'Content-Type': 'image/jpeg',
                            'x-upsert': 'true',
                        },
                        body: frameBuf,
                    });
                    if (upRes.ok) {
                        coverFrameUrls.push(`${SUPABASE_URL}/storage/v1/object/public/social-media/${bucketPath}`);
                    } else {
                        const txt = await upRes.text().catch(() => '');
                        console.warn(`[transcode] cover frame ${i} upload failed ${upRes.status}: ${txt.slice(0, 200)}`);
                        coverFrameUrls.push(null);
                    }
                } catch (frameErr) {
                    console.warn(`[transcode] cover frame ${i} extraction skipped:`, frameErr?.message || frameErr);
                    coverFrameUrls.push(null);
                }
            }

            // Pick the chosen frame for thumbnail_url. Prefer post.cover_frame_index
            // if the user selected one on the Edit cover screen; else use frame 0.
            const idx = (typeof post.cover_frame_index === 'number' && post.cover_frame_index >= 0 && post.cover_frame_index < FRAME_COUNT)
                ? post.cover_frame_index
                : 0;
            chosenThumbUrl = coverFrameUrls[idx] || coverFrameUrls.find(u => !!u) || null;
        } catch (coverErr) {
            console.warn('[transcode] cover-frames extraction skipped:', coverErr?.message || coverErr);
        }
        // Legacy single-thumb name kept so the AUDIT-20 update payload below
        // still finds a value when cover_frames extraction succeeded.
        const thumbPublicUrl = chosenThumbUrl;

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

        // AUDIT-20/21: include thumbnail_url + cover_frames in the row update.
        // thumbnail_url ONLY if we don't already have one OR the user picked a
        // specific frame on the Edit cover screen (post.cover_frame_index set);
        // cover_frames always overwrites any prior value since it's the
        // canonical post-transcode state.
        const updatePayload = {
            media_urls: newMediaUrls,
            transcode_status: 'done',
            transcode_error: null,
            transcoded_at: new Date().toISOString(),
            original_media_url: srcUrl,
        };
        if (Array.isArray(coverFrameUrls) && coverFrameUrls.some(u => !!u)) {
            updatePayload.cover_frames = coverFrameUrls;
        }
        if (thumbPublicUrl) {
            // If the user picked a specific frame index in the composer, the
            // thumbnail should reflect that even if the row already had one.
            const userPicked = typeof post.cover_frame_index === 'number';
            if (userPicked || !post.thumbnail_url) {
                updatePayload.thumbnail_url = thumbPublicUrl;
            }
        }
        await supa.from('social_posts').update(updatePayload).eq('id', post.id);

        await supa.from('social_reels')
            .update({ video_url: newPublicUrl })
            .eq('source_post_id', post.id);

        // Back-prop to social_page_posts when this row is a club-page mirror
        // — without this, viewers ON the club page still see the broken HEVC
        // URL even though the global feed has the H.264 MP4. Source post ID
        // lives in the mirror's metadata.source_post_id.
        const sourcePostId = post.metadata?.source_post_id;
        if (sourcePostId) {
            try {
                // Fetch existing social_page_posts row to compute new media_urls.
                // AUDIT-3 FIX (2026-04-30): only fetch + update media_urls. The
                // previous version selected only `id, media_urls` but then wrote
                // `thumbnail_url: spp.thumbnail_url || null` — since
                // thumbnail_url wasn't in the SELECT, spp.thumbnail_url was
                // ALWAYS undefined, so every transcode silently NULLed the
                // existing thumbnail on the source club-page row. Removed the
                // thumbnail_url update entirely; this back-prop only cares
                // about the new H.264 MP4 URL.
                const { data: spp } = await supa
                    .from('social_page_posts')
                    .select('id, media_urls')
                    .eq('id', sourcePostId)
                    .maybeSingle();
                if (spp) {
                    const sppNewUrls = Array.isArray(spp.media_urls) && spp.media_urls.length > 0
                        ? [newPublicUrl, ...spp.media_urls.slice(1)]
                        : [newPublicUrl];
                    await supa.from('social_page_posts')
                        .update({ media_urls: sppNewUrls })
                        .eq('id', sourcePostId);
                }
            } catch (e) {
                // Don't fail the whole transcode just because back-prop failed
                console.warn('[transcode] social_page_posts back-prop failed:', e?.message || e);
            }
        }

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
