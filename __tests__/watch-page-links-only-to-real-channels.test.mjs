import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../pages/hub/video-library/watch/[videoId]/[[...slug]].js', import.meta.url), 'utf8');

test('watch page never links a raw video.source (legacy key) as a channel URL', () => {
  assert.equal(/channelPath\(video\.source\)/.test(src), false);
});

test('watch page links the channel only through the canonical resolved channelHref', () => {
  assert.match(src, /loadVideoLibraryChannels\(\{ channelId: video\.source/);
  assert.match(src, /channelHref = resolved\?\.channel\?\.path \|\| null/);
  assert.equal((src.match(/\{channelHref \?/g) || []).length, 2);
});
