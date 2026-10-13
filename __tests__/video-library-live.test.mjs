import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPlayerResponse, verifiedLiveBroadcast, youtubeChannelLiveUrl, readBoundedProviderHtml, checkLiveChannels, LIVE_RESPONSE_MAX_BYTES } from '../src/lib/videoLibraryLive.mjs';

const channel = { id: '2abde3a3-86b6-4552-9600-e4256aae0c47', name: 'Hustler Casino Live', providerSourceId: 'UCQe7wB0o_cZgv1miyYB9TMA', handle: '@HustlerCasinoLive' };
const player = () => ({ videoDetails: { videoId: 'AYAHmmQSDQI', channelId: channel.providerSourceId, isPrivate: false, isLiveContent: true, title: 'A Poker Stream' }, playabilityStatus: { status: 'OK', playableInEmbed: true }, microformat: { playerMicroformatRenderer: { liveBroadcastDetails: { isLiveNow: true, startTimestamp: '2026-01-01T00:00:00Z' } } } });
test('channel-live provider URLs cannot accept arbitrary hosts or path injection', () => {
    assert.equal(youtubeChannelLiveUrl(channel), 'https://www.youtube.com/@HustlerCasinoLive/live');
    assert.equal(youtubeChannelLiveUrl({ ...channel, handle: '@bad/../../evil' }), `https://www.youtube.com/channel/${channel.providerSourceId}/live`);
    assert.equal(youtubeChannelLiveUrl({ ...channel, providerSourceId: 'https://evil.invalid/' }), null);
});
test('provider player parsing respects quoted braces and refuses malformed data', () => {
    const value = player(); value.videoDetails.title = 'Brace } And "; Literal';
    assert.deepEqual(extractPlayerResponse(`<script>var ytInitialPlayerResponse = ${JSON.stringify(value)}; unrelated();</script>`), value);
    assert.equal(extractPlayerResponse('ytInitialPlayerResponse = {bad};'), null);
    assert.equal(extractPlayerResponse('LIVE NOW title only'), null);
});
test('current live proof requires exact channel, current flag, public embed and started time', () => {
    assert.equal(verifiedLiveBroadcast(player(), channel, Date.parse('2026-10-13')).status, 'live');
    for (const patch of [p => { p.videoDetails.channelId = 'other'; }, p => { p.videoDetails.isPrivate = true; }, p => { p.playabilityStatus.playableInEmbed = false; }, p => { p.playabilityStatus.status = 'LOGIN_REQUIRED'; }, p => { p.videoDetails.isMadeForKids = true; }, p => { p.microformat.playerMicroformatRenderer.liveBroadcastDetails.startTimestamp = '2099-01-01'; }, p => { delete p.microformat; }]) {
        const value = player(); patch(value); assert.equal(verifiedLiveBroadcast(value, channel).status, 'unknown');
    }
    const ended = player(); ended.microformat.playerMicroformatRenderer.liveBroadcastDetails.endTimestamp = '2026-01-02';
    assert.equal(verifiedLiveBroadcast(ended, channel).status, 'offline');
    const replay = player(); replay.microformat.playerMicroformatRenderer.liveBroadcastDetails.isLiveNow = false;
    assert.equal(verifiedLiveBroadcast(replay, channel).status, 'offline');
});
test('provider response is bounded and upstream errors remain unknown', async () => {
    await assert.rejects(readBoundedProviderHtml(new Response('denied', { status: 403 })));
    await assert.rejects(readBoundedProviderHtml(new Response(new Uint8Array(LIVE_RESPONSE_MAX_BYTES + 1))), /limit/);
    assert.equal(await readBoundedProviderHtml(new Response('ok')), 'ok');
});
test('live status scans a finite 24 sources with six in flight and retains partial failures', async () => {
    let inFlight = 0; let maximum = 0; let called = 0;
    const result = await checkLiveChannels(Array.from({ length: 30 }, (_, id) => ({ id })), async item => {
        called += 1; inFlight += 1; maximum = Math.max(maximum, inFlight); await new Promise(resolve => setTimeout(resolve, 1)); inFlight -= 1;
        if (item.id === 1) throw new Error('upstream');
        return item.id === 0 ? { status: 'live', videoId: 'AYAHmmQSDQI' } : { status: 'offline' };
    });
    assert.equal(called, 24); assert(maximum <= 6); assert.equal(result.channelsChecked, 24); assert.equal(result.unavailableChannels, 1); assert.equal(result.data.length, 1);
});
