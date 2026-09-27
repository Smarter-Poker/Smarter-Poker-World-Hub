#!/usr/bin/env node
'use strict';

/**
 * RETIRED: the former utility queued every third-party YouTube Reel for a
 * download/transcode. That bypassed provenance, rights, availability, and the
 * atomic publisher, so even a dry-looking maintenance run could repopulate an
 * unsafe production queue.
 *
 * Video-library content now remains an embed and must enter the feed through
 * `publish_video_library_reel` after fail-closed availability verification.
 * Owned/licensed native media uses the rights-gated worker pipeline instead.
 */

console.error('[backfill-youtube-reels] RETIRED: bulk YouTube transcoding is disabled.');
console.error('[backfill-youtube-reels] Use the verified video-library publisher or the rights-gated native pipeline.');
process.exitCode = 1;
