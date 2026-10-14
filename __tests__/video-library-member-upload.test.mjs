import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('member clips enter the maintained poker upload flow with a truthful publication destination', () => {
    const entry = read('src/components/video-library/MemberClipUpload.jsx');
    const reels = read('pages/hub/reels.js');
    assert.match(entry, /MEMBER_CLIP_UPLOAD_PATH = '\/hub\/reels\?category=poker&upload=1'/);
    assert.match(entry, /href=\{MEMBER_CLIP_UPLOAD_PATH\}/);
    assert.match(entry, /In Poker Reels/);
    assert.match(reels, /POKER_REEL_UPLOAD_PATH = '\/hub\/reels\?category=poker&upload=1'/);
    assert.match(reels, /router\.query\.upload !== '1'/);
    assert.match(reels, /getAuthUser\(\)\?\.id !== user\.id \|\| !getAccessToken\(\)/);
    assert.match(reels, /setShowUploadModal\(true\)/);
    assert.match(reels, /<UploadReelModal[\s\S]*?onSuccess=[\s\S]*?openPublishedPokerReel\(publication\)/);
    assert.match(reels, /<ReelPublicationRecoveryBanner user=\{user\} onRecovered=\{openPublishedPokerReel\}/);
});

test('the reused uploader retains rights consent and owner-bound durable publication', () => {
    const uploader = read('src/components/reels/UploadReelModal.jsx');
    const recovery = read('src/lib/userReelPublicationRecovery.mjs');
    assert.match(uploader, /if \(!pokerContentConfirmed\)/);
    assert.match(uploader, /assertUserReelPublicationSlot\(window\.localStorage, ownerId\)/);
    assert.match(uploader, /persistUserReelPublicationIntent/);
    assert.match(uploader, /if \(!isCurrentOwner\(ownerToken\)\) return/);
    assert.match(uploader, /publicationResult\.status !== 'published'/);
    assert.match(recovery, /supabase\.rpc\('publish_user_video_reel'/);
    assert.match(recovery, /!row\?\.social_post_id \|\| !row\?\.social_reel_id/);
});

test('live cleanup cannot target foreign owners, buckets, origins or URL variants', async () => {
    const { ownedUploadObject } = await import('../scripts/qualification/videoLibraryPhase8Upload.mjs');
    const owner = '11111111-1111-4111-8111-111111111111';
    const base = 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media';
    assert.deepEqual(ownedUploadObject(`${base}/reels/${owner}/clip.mp4`, owner, 'video'), { bucket: 'social-media', objectPath: `reels/${owner}/clip.mp4` });
    assert.deepEqual(ownedUploadObject(`${base}/thumbnails/${owner}/thumb.jpg`, owner, 'thumbnail'), { bucket: 'social-media', objectPath: `thumbnails/${owner}/thumb.jpg` });
    for (const url of [
        `${base}/reels/22222222-2222-4222-8222-222222222222/clip.mp4`,
        `${base}/reels/${owner}/clip.mp4?token=wrong`,
        `${base}/reels/${owner}/clip.mp4#wrong`,
        `${base}/reels/${owner}/extra/clip.mp4`,
        `${base.replace('social-media', 'stories')}/reels/${owner}/clip.mp4`,
        `${base.replace('kuklfnapbkmacvwxktbh.supabase.co', 'example.invalid')}/reels/${owner}/clip.mp4`,
    ]) assert.throws(() => ownedUploadObject(url, owner, 'video'));
});


test('upload modal stays above the immersive feed and its sheets in every feed state', () => {
    const upload = read('src/components/reels/UploadReelModal.module.css');
    const immersive = read('src/components/reels/ImmersiveReels.module.css');
    const uploadLayer = Number(upload.match(/\.overlay\s*\{[^}]*z-index:\s*(\d+)/s)?.[1]);
    const feedLayer = Number(immersive.match(/\.root\s*\{[^}]*z-index:\s*(\d+)/s)?.[1]);
    const sheetLayer = Number(immersive.match(/\.sheetBackdrop\s*\{[^}]*z-index:\s*(\d+)/s)?.[1]);
    assert(Number.isFinite(uploadLayer) && Number.isFinite(feedLayer) && Number.isFinite(sheetLayer));
    assert(uploadLayer > feedLayer && uploadLayer > sheetLayer);
});
