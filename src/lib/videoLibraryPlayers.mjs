import { buildVideoLibraryBreadcrumbs } from './videoLibraryBreadcrumbs.mjs';
import { watchUrl } from './videoLibraryWatch.mjs';

/**
 * Public player browsing is an index of names in the published catalog.
 * These full names were read from actual catalog titles on 2026-10-13.
 * A title/tag mention does not establish participation, biography or results.
 * Never infer a person from a surname, channel owner, nickname or partial name.
 */
export const VIDEO_LIBRARY_PLAYERS = Object.freeze([
    ['andrew-neeme', 'Andrew Neeme', 'https://www.wikidata.org/wiki/Q65029855'],
    ['brad-owen', 'Brad Owen', 'https://www.wikidata.org/wiki/Q113585258'],
    ['chance-kornuth', 'Chance Kornuth', 'https://www.wikidata.org/wiki/Q20740748'],
    ['daniel-negreanu', 'Daniel Negreanu', 'https://www.wikidata.org/wiki/Q296401'],
    ['doug-polk', 'Doug Polk', 'https://www.wikidata.org/wiki/Q17306386'],
    ['garrett-adelstein', 'Garrett Adelstein', 'https://www.wikidata.org/wiki/Q64010282'],
    ['jason-koon', 'Jason Koon', 'https://www.wikidata.org/wiki/Q28037447'],
    ['lex-veldhuis', 'Lex Veldhuis', 'https://www.wikidata.org/wiki/Q1822211'],
    ['phil-hellmuth', 'Phil Hellmuth', 'https://www.wikidata.org/wiki/Q311442'],
    ['phil-ivey', 'Phil Ivey', 'https://www.wikidata.org/wiki/Q312013'],
    ['tom-dwan', 'Tom Dwan', 'https://www.wikidata.org/wiki/Q459049'],
].map(([id, name, wikidataUrl]) => Object.freeze({ id, name, path: `/hub/video-library/players/${id}`, wikidataUrl })));

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

export function buildPlayerJsonLd(player, videos = []) {
    if (!player) return null;
    const url = `https://smarter.poker${player.path}`;
    const person = {
        '@type': 'Person',
        '@id': `${url}#person`,
        name: player.name,
        description: `Poker Player Named In Published Video Titles Or Tags.`,
        url,
        ...(player.wikidataUrl ? { sameAs: [player.wikidataUrl] } : {}),
    };
    const breadcrumbs = buildVideoLibraryBreadcrumbs([
        ['World Hub', '/hub'],
        ['Video Library', '/hub/video-library'],
        ['Poker Players', '/hub/video-library/players'],
        [player.name, url],
    ]);
    const itemList = {
        '@type': 'ItemList',
        name: `Videos Naming ${player.name}`,
        numberOfItems: videos.length,
        itemListElement: videos.map((video, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            item: {
                '@type': 'WebPage',
                '@id': `${watchUrl(video)}#page`,
                name: video.title,
                url: watchUrl(video),
            },
        })),
    };
    return [person, breadcrumbs, itemList];
}

