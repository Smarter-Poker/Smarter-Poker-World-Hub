// Fresh, public YouTube channel-live evidence. A title containing "LIVE" is
// never evidence; only the exact provider player and current broadcast flag are.
export const LIVE_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;
export const LIVE_CACHE_MS = 45_000;

export function youtubeChannelLiveUrl(channel) {
    if (!/^UC[A-Za-z0-9_-]{22}$/.test(String(channel?.providerSourceId || ''))) return null;
    const handle = String(channel?.handle || '');
    if (/^@[A-Za-z0-9_.-]{1,100}$/.test(handle)) return `https://www.youtube.com/${handle}/live`;
    return `https://www.youtube.com/channel/${channel.providerSourceId}/live`;
}

export function extractPlayerResponse(html) {
    const source = String(html || '');
    const marker = /\bytInitialPlayerResponse\s*=\s*/.exec(source);
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
    const url = youtubeChannelLiveUrl(channel);
    if (!url) return { status: 'unknown' };
    try {
        const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(8000),
            headers: { 'Cache-Control': 'no-cache', 'Accept-Language': 'en-US,en;q=0.9' } });
        return verifiedLiveBroadcast(extractPlayerResponse(await readBoundedProviderHtml(response)), channel);
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
