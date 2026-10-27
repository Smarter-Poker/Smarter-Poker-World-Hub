import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildVideoObject,
  normaliseVideoRow,
  parseVideoChapters,
} from '../src/lib/videoLibraryWatch.mjs';

const ROOT = process.cwd();

const SAMPLE_ROW = {
  youtube_video_id: 'dQw4w9WgXcQ',
  source_id: 'HCL',
  type: 'cash',
  title: 'HUGE POT vs NEGREANU!',
  duration: '18:42',
  published_at: '2026-10-01T12:00:00Z',
  views_count: 65000,
  availability_status: 'verified',
  embeddable: true,
};

test('buildVideoObject includes SeekToAction potentialAction for Google Key Moments', () => {
  const video = normaliseVideoRow(SAMPLE_ROW);
  const obj = buildVideoObject(video, {
    channelName: 'Hustler Casino Live',
    description: 'Watch Huge Pot vs Negreanu.',
  });
  assert.ok(obj.potentialAction);
  assert.equal(obj.potentialAction['@type'], 'SeekToAction');
  assert.equal(
    obj.potentialAction.target,
    'https://smarter.poker/hub/video-library/watch/dQw4w9WgXcQ/huge-pot-vs-negreanu?t={seek_to_second_number}'
  );
  assert.equal(
    obj.potentialAction['startOffset-input'],
    'required name=seek_to_second_number'
  );
});

test('parseVideoChapters extracts monotonically increasing timestamp chapters into Clip entities', () => {
  const chaptersText = [
    '0:00 Table Lineup And Stacks',
    '2:30 Preflop 4-Bet Pot',
    '8:15 River All-In Decision',
  ].join('\n');
  const baseUrl = 'https://smarter.poker/hub/video-library/watch/dQw4w9WgXcQ/huge-pot-vs-negreanu';
  const clips = parseVideoChapters(chaptersText, baseUrl, 1122);

  assert.equal(clips.length, 3);
  assert.deepEqual(clips[0], {
    '@type': 'Clip',
    '@id': `${baseUrl}#clip-0`,
    name: 'Table Lineup And Stacks',
    startOffset: 0,
    endOffset: 150,
    url: `${baseUrl}?t=0`,
  });
  assert.deepEqual(clips[1], {
    '@type': 'Clip',
    '@id': `${baseUrl}#clip-150`,
    name: 'Preflop 4-Bet Pot',
    startOffset: 150,
    endOffset: 495,
    url: `${baseUrl}?t=150`,
  });
  assert.deepEqual(clips[2], {
    '@type': 'Clip',
    '@id': `${baseUrl}#clip-495`,
    name: 'River All-In Decision',
    startOffset: 495,
    endOffset: 1122,
    url: `${baseUrl}?t=495`,
  });
});

test('buildVideoObject omits hasPart when fewer than 2 valid timestamp chapters exist', () => {
  const video = normaliseVideoRow(SAMPLE_ROW);
  const obj = buildVideoObject(video, {
    channelName: 'Hustler Casino Live',
    description: 'Watch Huge Pot vs Negreanu.',
    chaptersText: '0:00 Single Chapter Only',
  });
  assert.equal(obj.hasPart, undefined);
});

test('watch page and WatchPlaybackTools wire ?t= deep-link seek support', () => {
  const watchPageSrc = fs.readFileSync(
    path.join(ROOT, 'pages/hub/video-library/watch/[videoId]/[[...slug]].js'),
    'utf8'
  );
  const toolsSrc = fs.readFileSync(
    path.join(ROOT, 'src/components/video-library/WatchPlaybackTools.jsx'),
    'utf8'
  );
  assert.match(watchPageSrc, /initialSeekSeconds/);
  assert.match(toolsSrc, /initialSeekSeconds/);
  assert.match(toolsSrc, /command\('seekTo',\s*\[target,\s*true\]\)/);
});
