/** Stable links and public channel metadata. Follow identity is the registry UUID. */
export const CHANNEL_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CHANNEL_KEY_RE = /^[A-Za-z0-9_-]{1,80}$/;
export function channelPath(channelOrId) {
    const id = String(typeof channelOrId === 'object' ? channelOrId?.id : channelOrId || '');
    return `/hub/video-library/channels/${encodeURIComponent(id)}`;
}
export function safeChannelExternalUrl(value) {
    try {
        const url = new URL(String(value || ''));
        return url.protocol === 'https:' && ['youtube.com', 'www.youtube.com'].includes(url.hostname) ? url.href : null;
    } catch { return null; }
}
export function publicVideoChannel(row, aliases = [], compatibility = []) {
    const known = compatibility.find(item => aliases.includes(item.id));
    const name = String(row?.name || '').trim();
    return { id: row.id, name, description: `Verified Videos From ${name}.`, logo: known?.logo || null,
        providerChannelId: row.provider_source_id || null, providerSourceId: row.provider_source_id || null,
        handle: row.handle || null, attributionUrl: safeChannelExternalUrl(row.attribution_url),
        externalUrl: safeChannelExternalUrl(row.attribution_url) || (String(row.provider_source_id || '').match(/^UC[A-Za-z0-9_-]{22}$/) ? `https://www.youtube.com/channel/${row.provider_source_id}` : null),
        aliases, sourceKeys: [...new Set([row.id, ...aliases])], legacyIds: aliases.filter(key => !CHANNEL_ID_RE.test(key) && !key.startsWith('UC')),
        path: channelPath(row.id), topic: row.ingest_topic || 'poker', active: row.is_active === true, lifecycleStatus: row.lifecycle_status || null };
}
export function canonicalVideoChannelId(video, channels = []) {
    const source = String(video?.source || '');
    return channels.find(channel => channel.id === source || (channel.aliases || []).some(alias => alias.toUpperCase() === source.toUpperCase()))?.id || null;
}
