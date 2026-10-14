// Invoked only by the owning explicit Phase 8 live driver. Credentials/session
// belong to that driver; this module never creates or changes an Auth identity.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isDedicatedProbeAccount } from '../../src/lib/probeIdentity.js';

export function ownedUploadObject(value, ownerId, kind) {
    const url = new URL(value);
    assert.equal(url.origin, 'https://kuklfnapbkmacvwxktbh.supabase.co');
    assert.equal(url.search, ''); assert.equal(url.hash, '');
    const folder = kind === 'thumbnail' ? 'thumbnails' : 'reels';
    const prefix = `/storage/v1/object/public/social-media/${folder}/${ownerId}/`;
    assert(url.pathname.startsWith(prefix), 'Cleanup requires the exact canonical owned upload namespace');
    assert(!url.pathname.slice(prefix.length).includes('/'));
    return { bucket: 'social-media', objectPath: url.pathname.slice('/storage/v1/object/public/social-media/'.length) };
}

export async function runPhase8Upload({ page, client, admin, session, ownerId, email, base = 'https://smarter.poker', workRoot, report, rewardSafety, readFinancialSnapshot }) {
    assert(isDedicatedProbeAccount(email), 'Only the configured dedicated identity may publish qualification media');
    assert.equal((await client.auth.getUser(session.access_token)).data?.user?.id, ownerId);
    assert(path.isAbsolute(workRoot));
    assert(/^\/Volumes\/SmarterWork\/agent-work\//.test(workRoot) || process.env.GITHUB_ACTIONS === 'true', 'Media generation uses the owning SSD or hosted scratch');
    // Both installed reward producers must be inspected by the owning driver.
    // A private post still invokes claim_reward, so privacy is not a reward bypass.
    assert.equal(rewardSafety?.verifiedNoAward, true, 'Installed reward eligibility must prove this publication cannot issue diamonds');
    assert(rewardSafety?.source && rewardSafety?.observedAt, 'Reward refusal needs retained installed provenance');
    assert.equal(typeof readFinancialSnapshot, 'function', 'The owning driver supplies authoritative reward and balance readback');
    const missingReward = await admin.from('reward_definitions').select('id', { count: 'exact', head: true }).eq('id', 'social_post_share');
    assert(!missingReward.error && missingReward.count === 0, 'Installed social-post reward must remain absent before this qualification write');
    const financialBefore = await readFinancialSnapshot(ownerId);
    const marker = `P8-${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    assert(marker.length < 20, 'Do not cross the legacy social-post content reward floor');
    const file = path.join(workRoot, `${marker}.mp4`);
    let published, videoUrl, thumbnailUrl;
    const checked = result => { assert(!result.error, 'Owned publication readback must succeed'); return result.data; };
    const authenticatedPost = async (route, body) => {
        const response = await fetch(`${base}${route}`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
        assert(response.ok, 'Owned cleanup endpoint must succeed'); return response.json();
    };
    try {
        // A bounded original learning artifact: green poker felt and five cards.
        await promisify(execFile)('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x073b2a:s=180x320:r=10:d=3', '-vf', 'drawbox=x=15:y=120:w=26:h=42:color=white:t=fill,drawbox=x=46:y=120:w=26:h=42:color=white:t=fill,drawbox=x=77:y=120:w=26:h=42:color=white:t=fill,drawbox=x=108:y=120:w=26:h=42:color=white:t=fill,drawbox=x=139:y=120:w=26:h=42:color=white:t=fill', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', file], { timeout: 20000 });
        const original = await readFile(file);
        assert(original.length > 32 && original.length < 2 * 1024 * 1024);
        await page.goto(`${base}/hub/video-library`, { waitUntil: 'domcontentloaded' });
        await page.getByRole('link', { name: 'Upload Poker Clip', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Upload Reel', exact: true });
        await dialog.waitFor({ timeout: 30000 });
        await dialog.locator('input[type=file]').setInputFiles(file);
        await dialog.getByRole('textbox').fill(marker);
        // Consent is explicit and uses the normal enabled upload control.
        await dialog.getByText('Confirmation Required', { exact: true }).click();
        assert.equal(await dialog.getByRole('checkbox').isChecked(), true);
        const publicationResponse = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/rest/v1/rpc/publish_user_video_reel'), { timeout: 90000 });
        await dialog.getByRole('button', { name: 'Upload Reel', exact: true }).click();
        const response = await publicationResponse;
        assert(response.ok(), 'Native uploader publication must succeed');
        const payload = await response.json(); published = Array.isArray(payload) ? payload[0] : payload;
        assert(published?.social_post_id && published?.social_reel_id);
        const post = checked(await admin.from('social_posts').select('id,author_id,content,media_urls,thumbnail_url').eq('id', published.social_post_id).maybeSingle());
        assert.equal(post.author_id, ownerId); assert.equal(post.content, marker);
        videoUrl = post.media_urls?.[0]; thumbnailUrl = post.thumbnail_url;
        ownedUploadObject(videoUrl, ownerId, 'video');
        assert.equal(post.content.length, 19);
        const stored = await fetch(videoUrl, { signal: AbortSignal.timeout(20000) }); assert(stored.ok, 'Stored upload bytes must be publicly readable');
        const storedBytes = Buffer.from(await stored.arrayBuffer());
        assert.equal(createHash('sha256').update(storedBytes).digest('hex'), createHash('sha256').update(original).digest('hex'));
        const reel = checked(await admin.from('social_reels').select('id,author_id,caption,source_post_id,playback_type,rights_status,media_status,video_url').eq('id', published.social_reel_id).maybeSingle());
        assert.equal(reel.author_id, ownerId); assert.equal(reel.source_post_id, post.id); assert.equal(reel.caption, marker); assert.equal(reel.playback_type, 'native'); assert.equal(reel.rights_status, 'user_authorized'); assert.equal(reel.media_status, 'ready');
        await page.waitForURL(url => url.pathname.includes(`/hub/reels/${reel.id}`) || url.searchParams.get('id') === reel.id, { timeout: 30000 });
        const video = page.locator('video:visible').first();
        await video.waitFor();
        await page.waitForFunction(() => [...document.querySelectorAll('video')].some(video => video.offsetWidth > 0 && video.currentTime > 0 && video.readyState >= 2), null, { timeout: 30000 });
        assert.deepEqual(await readFinancialSnapshot(ownerId), financialBefore, 'Native publication must leave authoritative reward claims and balance unchanged');
        report.cases.push({ name: 'Native member upload commits actual bytes and opens its owner-attributed playable Poker Reel', status: 'passed', postId: post.id, reelId: reel.id, bytes: original.length, rewardSafety });
    } finally {
        // Lost acknowledgments are unknown outcomes. Recover only this exact
        // unique task caption and immutable owner before any possible cleanup.
        if (!published) {
            const rows = checked(await admin.from('social_posts').select('id,author_id,content,media_urls,thumbnail_url').eq('author_id', ownerId).eq('content', marker));
            assert(rows.length <= 1, 'Task publication identity must remain unambiguous');
            if (rows.length === 1) {
                const post = rows[0];
                const reels = checked(await admin.from('social_reels').select('id,author_id,source_post_id').eq('source_post_id', post.id).eq('author_id', ownerId));
                assert.equal(reels.length, 1, 'Recovered task publication must have one canonical Reel');
                published = { social_post_id: post.id, social_reel_id: reels[0].id };
                videoUrl = post.media_urls?.[0]; thumbnailUrl = post.thumbnail_url;
            }
        }
        if (published?.social_reel_id) {
            await authenticatedPost('/api/reels/remove', { reel_id: published.social_reel_id });
            await authenticatedPost('/api/posts/delete', { postId: published.social_post_id });
            assert.equal(checked(await admin.from('social_posts').select('id').eq('id', published.social_post_id).maybeSingle()), null);
            for (const [url, kind] of [[videoUrl, 'video'], [thumbnailUrl, 'thumbnail']]) {
                if (!url) continue;
                const target = ownedUploadObject(url, ownerId, kind);
                checked(await admin.storage.from(target.bucket).remove([target.objectPath]));
                const missing = await admin.storage.from(target.bucket).download(target.objectPath);
                assert(missing.error && !missing.data, 'Authenticated Storage read must confirm removal instead of a cached public response');
                const status = String(missing.error.statusCode || missing.error.status || '');
                assert(status === '404' || (status === '400' && /(?:not found|NoSuchKey|does not exist)/i.test(missing.error.message || '')), 'Storage refusal must establish absence, not permission or transport failure');
            }
            const remaining = checked(await admin.from('social_reels').select('id,is_deleted').eq('id', published.social_reel_id).maybeSingle());
            assert(!remaining || remaining.is_deleted === true, 'Task Reel must be absent or authoritatively removed');
            assert.deepEqual(await readFinancialSnapshot(ownerId), financialBefore, 'Cleanup must not modify financial history');
            report.uploadFixtureRemoved = true;
        }
        await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
}
