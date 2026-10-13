import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPlayerResponse, extractInitialData, verifiedChannelLiveListing, checkChannelLive, verifiedLiveBroadcast, youtubeChannelLiveUrl, youtubeChannelStreamsUrl, readBoundedProviderHtml, checkLiveChannels, LIVE_RESPONSE_MAX_BYTES } from '../src/lib/videoLibraryLive.mjs';

const channel = { id: '2abde3a3-86b6-4552-9600-e4256aae0c47', name: 'Hustler Casino Live', providerSourceId: 'UCQe7wB0o_cZgv1miyYB9TMA', handle: '@HustlerCasinoLive' };
const player = () => ({ videoDetails: { videoId: 'AYAHmmQSDQI', channelId: channel.providerSourceId, isPrivate: false, isLiveContent: true, title: 'A Poker Stream' }, playabilityStatus: { status: 'OK', playableInEmbed: true }, microformat: { playerMicroformatRenderer: { liveBroadcastDetails: { isLiveNow: true, startTimestamp: '2026-01-01T00:00:00Z' } } } });
test('channel-live provider URLs cannot accept arbitrary hosts or path injection', () => {
    assert.equal(youtubeChannelLiveUrl(channel), 'https://www.youtube.com/@HustlerCasinoLive/live');
    assert.equal(youtubeChannelLiveUrl({ ...channel, handle: '@bad/../../evil' }), `https://www.youtube.com/channel/${channel.providerSourceId}/live`);
    assert.equal(youtubeChannelLiveUrl({ ...channel, providerSourceId: 'https://evil.invalid/' }), null);
});

const listing = () => ({ metadata: { channelMetadataRenderer: { externalId: channel.providerSourceId, title: channel.name } }, contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: {
    selected: true, endpoint: { browseEndpoint: { browseId: channel.providerSourceId }, commandMetadata: { webCommandMetadata: { url: '/@HustlerCasinoLive/streams' } } },
    content: { richGridRenderer: { contents: [{ richItemRenderer: { content: { lockupViewModel: {
        contentId: 'AYAHmmQSDQI', contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', metadata: { lockupMetadataViewModel: { title: { content: 'Poker } And " LIVE' } } },
        rendererContext: { commandContext: { onTap: { innertubeCommand: { watchEndpoint: { videoId: 'AYAHmmQSDQI' } } } } },
        contentImage: { thumbnailViewModel: { overlays: [{ thumbnailBottomOverlayViewModel: { badges: [{ thumbnailBadgeViewModel: { badgeStyle: 'THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE' } }] } }] } }
    } } } }] } }
} }] } } });
const listingLockup = data => data.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.richGridRenderer.contents[0].richItemRenderer.content.lockupViewModel;
test('selected public streams tab requires exact identity, structured badge and matching watch ID', () => {
    const value = listing();
    assert.deepEqual(extractInitialData(`var ytInitialData = ${JSON.stringify(value)};`), value);
    assert.equal(extractInitialData('ytInitialData = {broken'), null);
    const verified = verifiedChannelLiveListing(value, channel, 1000);
    assert.equal(verified.status, 'live'); assert.equal(verified.asOf, '1970-01-01T00:00:01.000Z');
    assert.equal(verified.startedAt, undefined); assert.equal(verified.playableInEmbed, undefined);
    for (const patch of [data => { data.metadata.channelMetadataRenderer.externalId = 'other'; },
        data => { data.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.selected = false; },
        data => { data.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.endpoint.commandMetadata.webCommandMetadata.url = '/@HustlerCasinoLive/featured'; },
        data => { listingLockup(data).rendererContext.commandContext.onTap.innertubeCommand.watchEndpoint.videoId = 'other'; }]) {
        const data = listing(); patch(data); assert.equal(verifiedChannelLiveListing(data, channel).status, 'unknown');
    }
});

test('title LIVE, ended and upcoming badges and unselected recommendations cannot create a live listing', () => {
    for (const style of ['THUMBNAIL_OVERLAY_BADGE_STYLE_DEFAULT', 'THUMBNAIL_OVERLAY_BADGE_STYLE_UPCOMING']) {
        const data = listing(); listingLockup(data).contentImage.thumbnailViewModel.overlays[0].thumbnailBottomOverlayViewModel.badges[0].thumbnailBadgeViewModel = { text: 'LIVE', badgeStyle: style };
        data.contents.twoColumnBrowseResultsRenderer.tabs.push(listing().contents.twoColumnBrowseResultsRenderer.tabs[0]);
        data.contents.twoColumnBrowseResultsRenderer.tabs[1].tabRenderer.selected = false;
        assert.equal(verifiedChannelLiveListing(data, channel).status, 'offline');
    }
    const duplicate = listing(); const grid = duplicate.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.richGridRenderer;
    grid.contents.push(structuredClone(grid.contents[0])); assert.equal(verifiedChannelLiveListing(duplicate, channel).videoId, 'AYAHmmQSDQI');
});

test('legacy video renderer supports structured LIVE only and rejects foreign explicit owner', () => {
    const data = listing(); const content = data.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.richGridRenderer.contents[0].richItemRenderer.content;
    delete content.lockupViewModel;
    content.videoRenderer = { videoId: 'AYAHmmQSDQI', title: { runs: [{ text: 'Poker Stream' }] }, navigationEndpoint: { watchEndpoint: { videoId: 'AYAHmmQSDQI' } }, thumbnailOverlays: [{ thumbnailOverlayTimeStatusRenderer: { style: 'LIVE' } }] };
    assert.equal(verifiedChannelLiveListing(data, channel).status, 'live');
    content.videoRenderer.ownerText = { runs: [{ navigationEndpoint: { browseEndpoint: { browseId: 'UCaaaaaaaaaaaaaaaaaaaaaa' } } }] };
    assert.equal(verifiedChannelLiveListing(data, channel).status, 'unknown');
    delete content.videoRenderer.ownerText; content.videoRenderer.upcomingEventData = {};
    assert.equal(verifiedChannelLiveListing(data, channel).status, 'offline');
});

test('candidate attribution rejects foreign modern command runs and later legacy owner runs', () => {
    const foreign = 'UCaaaaaaaaaaaaaaaaaaaaaa';
    const endpoint = id => ({ browseEndpoint: { browseId: id } });
    const modern = listing();
    const lockup = listingLockup(modern);
    lockup.metadata.lockupMetadataViewModel.metadata = { contentMetadataViewModel: { metadataRows: [{ metadataParts: [{ text: {
        content: 'Channel Name', commandRuns: [{ onTap: { innertubeCommand: endpoint(channel.providerSourceId) } }, { onTap: { innertubeCommand: endpoint(foreign) } }]
    } }] }] } };
    assert.equal(verifiedChannelLiveListing(modern, channel).status, 'unknown');
    const commands = lockup.metadata.lockupMetadataViewModel.metadata.contentMetadataViewModel.metadataRows[0].metadataParts[0].text.commandRuns;
    commands.pop(); assert.equal(verifiedChannelLiveListing(modern, channel).status, 'live');
    // Menu references are not attribution and cannot contaminate channel identity.
    lockup.metadata.lockupMetadataViewModel.menuButton = { onTap: endpoint(foreign) };
    assert.equal(verifiedChannelLiveListing(modern, channel).status, 'live');
    const legacy = listing();
    const content = legacy.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.richGridRenderer.contents[0].richItemRenderer.content;
    delete content.lockupViewModel;
    const video = content.videoRenderer = { videoId: 'AYAHmmQSDQI', title: { simpleText: 'Poker Stream' }, navigationEndpoint: { watchEndpoint: { videoId: 'AYAHmmQSDQI' } }, thumbnailOverlays: [{ thumbnailOverlayTimeStatusRenderer: { style: 'LIVE' } }] };
    for (const key of ['ownerText', 'shortBylineText', 'longBylineText']) {
        video[key] = { runs: [{ navigationEndpoint: endpoint(channel.providerSourceId) }, { navigationEndpoint: endpoint(foreign) }] };
        assert.equal(verifiedChannelLiveListing(legacy, channel).status, 'unknown'); delete video[key];
    }
});

test('provider channel check uses one bounded public streams fetch without claiming player access', async () => {
    let calls = 0;
    const result = await checkChannelLive(channel, async (url, options) => {
        calls++; assert.equal(url, youtubeChannelStreamsUrl(channel)); assert.equal(options.redirect, 'error');
        assert.equal(options.headers.Accept, 'text/html'); assert(options.signal);
        return new Response(`var ytInitialData = ${JSON.stringify(listing())};`);
    });
    assert.equal(calls, 1); assert.equal(result.status, 'live'); assert.equal(result.startedAt, undefined);
    assert.equal((await checkChannelLive(channel, async () => new Response('LOGIN_REQUIRED'))).status, 'unknown');
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
