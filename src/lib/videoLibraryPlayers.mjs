/**
 * Public player browsing is an index of names in the published catalog.
 * These full names were read from actual catalog titles on 2026-10-13.
 * A title/tag mention does not establish participation, biography or results.
 * Never infer a person from a surname, channel owner, nickname or partial name.
 */
export const VIDEO_LIBRARY_PLAYERS = Object.freeze([
    ['andrew-neeme', 'Andrew Neeme'],
    ['brad-owen', 'Brad Owen'],
    ['chance-kornuth', 'Chance Kornuth'],
    ['daniel-negreanu', 'Daniel Negreanu'],
    ['doug-polk', 'Doug Polk'],
    ['garrett-adelstein', 'Garrett Adelstein'],
    ['jason-koon', 'Jason Koon'],
    ['lex-veldhuis', 'Lex Veldhuis'],
    ['phil-hellmuth', 'Phil Hellmuth'],
    ['phil-ivey', 'Phil Ivey'],
    ['tom-dwan', 'Tom Dwan'],
].map(([id, name]) => Object.freeze({ id, name, path: `/hub/video-library/players/${id}` })));

const byId = new Map(VIDEO_LIBRARY_PLAYERS.map(player => [player.id, player]));
const normalizedText = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();

export function getVideoLibraryPlayer(playerId) {
    if (typeof playerId !== 'string') return null;
    return byId.get(playerId.trim().toLowerCase()) || null;
}

export function matchesVideoPlayer(video, playerOrId) {
    const player = getVideoLibraryPlayer(typeof playerOrId === 'string' ? playerOrId : playerOrId?.id);
    if (!player || !video || !['cash', 'tournament'].includes(video.type)) return false;
    const name = player.name.toLowerCase();
    if ((Array.isArray(video.tags) ? video.tags : []).some(tag => typeof tag === 'string' && normalizedText(tag).toLowerCase() === name)) return true;
    const title = normalizedText(video.rawTitle ?? video.title).toLowerCase();
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'u').test(title);
}

export function getVideoPlayers(video) {
    return VIDEO_LIBRARY_PLAYERS.filter(player => matchesVideoPlayer(video, player));
}

/** Only a validated registry name can reach the PostgREST expression. */
export function playerCatalogFilter(playerOrId) {
    const player = getVideoLibraryPlayer(typeof playerOrId === 'string' ? playerOrId : playerOrId?.id);
    if (!player) return null;
    const tags = [player.name, player.name.toLowerCase(), player.name.toUpperCase()];
    return [`title.ilike.%${player.name}%`, ...tags.map(tag => `tags.cs.${JSON.stringify([tag])}`)].join(',');
}
