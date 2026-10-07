import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { normaliseReportReason } from '../src/lib/videoRightsContract.mjs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const portal = read('../pages/api/video-rights/portal.js');
const moderation = read('../pages/api/video-rights/moderation.js');
const report = read('../pages/api/reels/report.js');
const feed = read('../src/lib/server/reelsFeed.js');
const library = read('../pages/hub/video-library.js');
const viewerSources = [read('../pages/hub/reels.js'), read('../src/components/social/Reels.jsx'), read('../src/components/social/ReelsFeedCarousel.jsx')];

test('creator portal is bearer-bound, account-exact and exposes real Phase 9 operations', () => {
  assert.match(portal, /getServerUserWithFallback/);
  assert.match(portal, /expectedOwnerId !== user\.id/);
  assert.match(portal, /private, no-store/);
  for (const action of ['submit_claim', 'reserve_upload', 'submit_submission', 'request_attribution_update', 'review_clip', 'request_takedown']) {
    assert.match(portal, new RegExp(`['"]${action}['"]`));
  }
  assert.match(portal, /fn_submit_video_creator_clip_review|VIDEO_RIGHTS_ACTIONS/);
  assert.match(portal, /creator_review/);
  assert.match(portal, /video-source-masters/);
  assert.match(portal, /createSignedUploadUrl/);
});

test('moderation route verifies administrators and uses versioned authority RPCs', () => {
  assert.match(moderation, /profiles.*is_admin, role/s);
  assert.match(moderation, /isVideoAdminProfile\(profile\.data\)/);
  for (const fn of ['fn_review_video_creator_claim', 'fn_review_video_creator_submission', 'fn_review_video_attribution_update', 'fn_review_video_creator_clip', 'fn_review_video_moderation_case', 'fn_apply_video_takedown']) {
    assert.match(moderation, new RegExp(fn));
  }
  assert.match(moderation, /p_expected_version: version/);
});

test('Reels reporting no longer performs a browser-side social interaction insert', () => {
  assert.match(report, /fn_submit_video_content_report/);
  assert.match(report, /getServerUserWithFallback/);
  assert.match(report, /ownerId !== user\.id/);
  for (const source of viewerSources) {
    assert.doesNotMatch(source, /interaction_type:\s*['"]report['"]/);
    assert.match(source, /submitReelReport/);
  }
});

test('report reasons normalize to the bounded contract', () => {
  assert.equal(normaliseReportReason('Copyright Or Rights'), 'copyright_or_rights');
  assert.equal(normaliseReportReason('Spam / Scam'), 'spam_or_scam');
  assert.equal(normaliseReportReason('not-a-supported-reason'), null);
});

test('canonical feed and library surface exact trust metadata and privacy-enhanced embeds', () => {
  for (const field of ['attribution_name', 'attribution_url', 'disclosure_kind', 'sponsor_name', 'made_for_kids', 'moderation_state', 'taken_down_at']) {
    assert.match(feed, new RegExp(field));
  }
  assert.match(feed, /Creator Unavailable/);
  assert.doesNotMatch(feed, /Verified Creator/);
  assert.match(library, /youtube-nocookie\.com/);
  assert.match(library, /widget_referrer/);
  assert.match(library, /referrerPolicy="strict-origin-when-cross-origin"/);
});
