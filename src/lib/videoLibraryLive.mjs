// Fresh, public YouTube channel-live evidence. A title containing "LIVE" is
// never evidence; only provider identity and structured current-live signals are.
export const LIVE_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;
export const LIVE_CACHE_MS = 45_000;

export function youtubeChannelLiveUrl(channel) {
    if (!/^UC[A-Za-z0-9_-]{22}$/.test(String(channel?.providerSourceId || ''))) return null;
    const handle = String(channel?.handle || '');
    if (/^@[A-Za-z0-9_.-]{1,100}$/.test(handle)) return `https://www.youtube.com/${handle}/live`;
    return `https://www.youtube.com/channel/${channel.providerSourceId}/live`;
}

export function extractPlayerResponse(html) {
    return extractAssignedJson(html, 'ytInitialPlayerResponse');
}

export function extractInitialData(html) {
    return extractAssignedJson(html, 'ytInitialData');
}

function extractAssignedJson(html, name) {
    const source = String(html || '');
    const marker = new RegExp(`\\b${name}\\s*=\\s*`).exec(source);
    if (!marker) return null;
    const start = marker.index + marker[0].length;
    if (source[start] !== '{') return null;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let i = start; i < source.length; i += 1) {
        const char = source[i];
        if (quoted) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') quoted = false;
        } else if (char === '"') quoted = true;
        else if (char === '{') depth += 1;
        else if (char === '}' && --depth === 0) {
            try { return JSON.parse(source.slice(start, i + 1)); } catch { return null; }
        }
    }
    return null;
}

export function youtubeChannelStreamsUrl(channel) {
    return youtubeChannelLiveUrl(channel)?.replace(/\/live$/, '/streams') || null;
}

function attributionChannelIds(value, ids = new Set()) {
    if (!value || typeof value !== 'object') return ids;
    const id = value.browseEndpoint?.browseId;
    if (typeof id === 'string' && /^UC[A-Za-z0-9_-]{22}$/.test(id)) ids.add(id);
    for (const child of Object.values(value)) attributionChannelIds(child, ids);
    return ids;
}

// A public channel listing proves the provider labels this stream LIVE now.
// It does not prove embed availability or supply a broadcast start timestamp.
export function verifiedChannelLiveListing(data, channel, now = Date.now()) {
    const streamsUrl = youtubeChannelStreamsUrl(channel);
    if (!streamsUrl) return { status: 'unknown' };
    const metadata = data?.metadata?.channelMetadataRenderer;
    if (metadata?.externalId !== channel?.providerSourceId) return { status: 'unknown' };
    const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || data?.contents?.singleColumnBrowseResultsRenderer?.tabs;
    if (!Array.isArray(tabs)) return { status: 'unknown' };
    const selected = tabs.filter(item => item.tabRenderer?.selected === true);
    if (selected.length !== 1) return { status: 'unknown' };
    const tab = selected[0].tabRenderer;
    const endpoint = tab.endpoint;
    const expectedPath = new URL(streamsUrl).pathname;
    if (endpoint?.browseEndpoint?.browseId !== channel.providerSourceId
        || endpoint?.commandMetadata?.webCommandMetadata?.url !== expectedPath) return { status: 'unknown' };
    const grid = tab.content?.richGridRenderer || tab.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0]?.gridRenderer;
    if (!Array.isArray(grid?.contents) && !Array.isArray(grid?.items)) return { status: 'unknown' };
    const found = new Map();
    let invalidLive = false;
    for (const item of (grid.contents || grid.items)) {
        const content = item.richItemRenderer?.content || item;
        const video = content.videoRenderer || content.gridVideoRenderer;
        const lockup = content.lockupViewModel;
        const id = video?.videoId || lockup?.contentId;
        const title = video?.title?.simpleText || video?.title?.runs?.map(run => run.text || '').join('') || lockup?.metadata?.lockupMetadataViewModel?.title?.content;
        const watchId = video?.navigationEndpoint?.watchEndpoint?.videoId || lockup?.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.videoId;
        const live = video
            ? video.thumbnailOverlays?.some(overlay => overlay.thumbnailOverlayTimeStatusRenderer?.style === 'LIVE')
            : lockup?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && lockup.contentImage?.thumbnailViewModel?.overlays?.some(overlay =>
                overlay.thumbnailBottomOverlayViewModel?.badges?.some(badge => badge.thumbnailBadgeViewModel?.badgeStyle === 'THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE'));
        if (!live || video?.upcomingEventData || video?.isUpcoming === true) continue;
        const ownerIds = new Set();
        for (const attribution of [video?.ownerText, video?.shortBylineText, video?.longBylineText,
            lockup?.metadata?.lockupMetadataViewModel?.metadata]) attributionChannelIds(attribution, ownerIds);
        if (!/^[A-Za-z0-9_-]{11}$/.test(String(id || '')) || watchId !== id || !String(title || '').trim()
            || [...ownerIds].some(ownerId => ownerId !== channel.providerSourceId)) { invalidLive = true; continue; }
        found.set(id, { status: 'live', videoId: id, title: String(title).trim(), channelId: channel.id,
            channelName: String(metadata.title || channel.name), thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            watchUrl: `https://www.youtube.com/watch?v=${id}`, evidence: 'public_channel_live_listing', asOf: new Date(now).toISOString() });
    }
    return found.size ? found.values().next().value : { status: invalidLive ? 'unknown' : 'offline' };
}

export function verifiedLiveBroadcast(player, channel, now = Date.now()) {
    const video = player?.videoDetails;
    const playable = player?.playabilityStatus;
    const broadcast = player?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
    if (!video || video.channelId !== channel?.providerSourceId || !/^[A-Za-z0-9_-]{11}$/.test(String(video.videoId || ''))
        || video.isPrivate !== false || playable?.status !== 'OK' || playable.playableInEmbed !== true) return { status: 'unknown' };
    if (video.isLiveContent === false || broadcast?.isLiveNow === false || broadcast?.endTimestamp) return { status: 'offline' };
    const started = Date.parse(broadcast?.startTimestamp || '');
    if (video.isLiveContent !== true || broadcast?.isLiveNow !== true || !Number.isFinite(started) || started > now
        || !String(video.title || '').trim() || video.isMadeForKids === true || video.isKidsContent === true) return { status: 'unknown' };
    return { status: 'live', videoId: video.videoId, title: video.title, channelId: channel.id, channelName: channel.name,
        thumbnail: `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
        watchUrl: `https://www.youtube.com/watch?v=${video.videoId}`, startedAt: broadcast.startTimestamp };
}

export async function readBoundedProviderHtml(response) {
    if (!response.ok || !response.body) throw new Error('Provider response unavailable');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > LIVE_RESPONSE_MAX_BYTES) throw new Error('Provider response exceeds limit');
            chunks.push(value);
        }
    } finally { await reader.cancel().catch(() => {}); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder().decode(bytes);
}

export async function checkChannelLive(channel, fetcher = fetch) {
    const url = youtubeChannelStreamsUrl(channel);
    if (!url) return { status: 'unknown' };
    try {
        const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(8000),
            headers: { 'Cache-Control': 'no-cache', 'Accept': 'text/html', 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9' } });
        return verifiedChannelLiveListing(extractInitialData(await readBoundedProviderHtml(response)), channel);
    } catch { return { status: 'unknown' }; }
}

export async function checkLiveChannels(channels, checker = checkChannelLive) {
    const bounded = channels.slice(0, 24);
    const results = new Array(bounded.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(6, bounded.length) }, async () => {
        for (;;) {
            const index = next++;
            if (index >= bounded.length) return;
            try { results[index] = await checker(bounded[index]); } catch { results[index] = { status: 'unknown' }; }
        }
    }));
    const data = results.filter(result => result.status === 'live');
    return { data, checkedAt: new Date().toISOString(), channelsChecked: bounded.length,
        unavailableChannels: results.filter(result => result.status === 'unknown').length };
}
