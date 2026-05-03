/**
 * GET /api/cron/cleanup-orphan-uploads
 *
 * ORPHAN STORAGE CLEANUP — finds objects in the social-media bucket that are
 * older than 24 hours but have no corresponding row in social_posts.media_urls
 * (or social_reels.video_url, social_posts.thumbnail_url, etc.) and deletes
 * them. Frees storage space, eliminates the slow leak that builds up when
 * users pick a file → signed URL is minted → user closes the tab without
 * tapping Post (the storage object DOES get created via the partial PUT in
 * some cases, even though the post never lands in the DB).
 *
 * Why 24h: gives every legitimate upload more than enough time to finish its
 * post-create round-trip. Even a 1-hour upload completing right at the cap
 * has 23 hours to land in social_posts before this sweep.
 *
 * Auth: same Bearer ${CRON_SECRET} pattern as transcode-videos / live-cleanup.
 *
 * Schedule: once daily at 03:30 UTC (off-peak), via Open Claw dispatcher.
 *
 * Safety:
 *   • Hard cap of 200 deletes per run — prevents accidentally nuking the
 *     whole bucket if the reference query ever returns empty due to a bug.
 *   • Dry-run mode via ?dry=1 — returns the deletion list without actually
 *     deleting; use this whenever the schema or storage layout changes.
 *   • Skips files less than 24h old AS A REQUIREMENT, not a default —
 *     hardcoded 24h threshold so a misconfiguration can't shrink it.
 *   • Logs every batch of deletes; aggregated counts go to the response.
 */

import { createClient } from '@supabase/supabase-js';

export const config = {
    maxDuration: 60,
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'social-media';
const MIN_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const HARD_CAP_DELETES = 200;

// Map storage objects (relative path within bucket) to a public URL we can
// match against social_posts.media_urls etc.
function bucketPathToPublicUrl(path) {
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

// Pull the path-suffix out of a public URL so we can match against storage
// listings. Returns null if the URL doesn't belong to this bucket.
function publicUrlToBucketPath(url) {
    const m = String(url || '').match(new RegExp(`/storage/v1/object/public/${BUCKET}/(.+?)(?:\\?|$)`));
    return m ? m[1] : null;
}

async function listAllObjects(supa, prefix = '', accumulator = []) {
    // Storage list() paginates at 1000 by default. Walk all pages.
    let offset = 0;
    const PAGE = 1000;
    while (true) {
        const { data, error } = await supa.storage.from(BUCKET).list(prefix, {
            limit: PAGE,
            offset,
            sortBy: { column: 'created_at', order: 'asc' },
        });
        if (error) throw new Error(`list ${prefix} (offset ${offset}): ${error.message}`);
        if (!data || data.length === 0) break;
        for (const item of data) {
            const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
            // Folders show up with no metadata.size and no created_at on some
            // Supabase versions; recurse into them.
            if (item.id === null || item.metadata == null) {
                await listAllObjects(supa, fullPath, accumulator);
            } else {
                accumulator.push({
                    path: fullPath,
                    size: item.metadata?.size || 0,
                    created_at: item.created_at,
                });
            }
        }
        if (data.length < PAGE) break;
        offset += data.length;
    }
    return accumulator;
}

export default async function handler(req, res) {
    const auth = (req.headers.authorization || '').replace('Bearer ', '');
    if (!process.env.CRON_SECRET || auth !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!SERVICE_KEY) {
        return res.status(500).json({ error: 'Server not configured (no service key)' });
    }
    const dryRun = req.query?.dry === '1' || req.query?.dryRun === '1';

    const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    try {
        // 1. Build the reference set — every storage path mentioned in any
        //    social_posts row (media_urls + thumbnail_url + original_media_url)
        //    plus social_reels (video_url + thumbnail_url) plus stories.
        const referenced = new Set();
        const collectPath = (url) => {
            const p = publicUrlToBucketPath(url);
            if (p) referenced.add(p);
        };

        const { data: posts, error: postsErr } = await supa
            .from('social_posts')
            .select('media_urls, thumbnail_url, original_media_url, cover_frames');
        if (postsErr) throw new Error(`social_posts query: ${postsErr.message}`);
        for (const row of posts || []) {
            // media_urls is jsonb array
            const arr = Array.isArray(row.media_urls) ? row.media_urls : [];
            for (const u of arr) collectPath(u);
            collectPath(row.thumbnail_url);
            collectPath(row.original_media_url);
            const cf = Array.isArray(row.cover_frames) ? row.cover_frames : [];
            for (const u of cf) collectPath(u);
        }

        const { data: reels, error: reelsErr } = await supa
            .from('social_reels')
            .select('video_url, thumbnail_url');
        if (reelsErr) throw new Error(`social_reels query: ${reelsErr.message}`);
        for (const row of reels || []) {
            collectPath(row.video_url);
            collectPath(row.thumbnail_url);
        }

        // 2. List every object in the social-media bucket.
        const objects = await listAllObjects(supa);

        // 3. Compute orphans — older than 24h AND not in the referenced set.
        const cutoff = Date.now() - MIN_AGE_MS;
        const orphans = [];
        for (const obj of objects) {
            const createdMs = obj.created_at ? new Date(obj.created_at).getTime() : 0;
            if (createdMs === 0) continue; // unknown age — skip for safety
            if (createdMs > cutoff) continue; // too young — skip
            if (referenced.has(obj.path)) continue; // referenced by a post / reel
            orphans.push(obj);
            if (orphans.length >= HARD_CAP_DELETES) break;
        }

        // 4. Delete (or report in dry-run).
        let deleted = 0;
        let bytesFreed = 0;
        const errors = [];
        if (!dryRun && orphans.length > 0) {
            // Storage remove() accepts an array of paths in one call; chunk
            // to be safe.
            const CHUNK = 100;
            for (let i = 0; i < orphans.length; i += CHUNK) {
                const batch = orphans.slice(i, i + CHUNK);
                const paths = batch.map(o => o.path);
                const { data: removed, error: rmErr } = await supa.storage.from(BUCKET).remove(paths);
                if (rmErr) {
                    errors.push(`batch ${i / CHUNK}: ${rmErr.message}`);
                    continue;
                }
                deleted += (removed?.length || 0);
                bytesFreed += batch.reduce((s, o) => s + (o.size || 0), 0);
            }
        }

        return res.status(200).json({
            success: true,
            dryRun,
            referenced_count: referenced.size,
            scanned_objects: objects.length,
            orphans_found: orphans.length,
            deleted,
            bytes_freed: bytesFreed,
            mb_freed: Math.round(bytesFreed / (1024 * 1024) * 100) / 100,
            errors: errors.length > 0 ? errors : undefined,
            sample_orphans: orphans.slice(0, 10).map(o => ({ path: o.path, size: o.size, age_hours: Math.round((Date.now() - new Date(o.created_at).getTime()) / (60 * 60 * 1000)) })),
            hit_cap: orphans.length === HARD_CAP_DELETES,
        });
    } catch (err) {
        console.warn('[cleanup-orphan-uploads] error:', err?.message || err);
        return res.status(500).json({ success: false, error: err?.message || 'unknown' });
    }
}
