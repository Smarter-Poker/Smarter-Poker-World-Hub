/**
 * WIKIDATA ENTITY REGISTRY & DISAMBIGUATION (Phase 2 of AEO)
 *
 * Provides authoritative Wikidata knowledge graph identifiers (Q-IDs) and Wikipedia
 * article URLs for poker tournament series, venues, industry brands, and players.
 * Used to populate `sameAs` structured data properties in Schema.org JSON-LD graphs,
 * enabling AI answer engines (Google AI Overviews, Perplexity, OpenAI Search, Claude)
 * to deterministically resolve and disambiguate entities without hallucination.
 */

/**
 * Verified Wikidata Entities Map
 */
export const WIKIDATA_ENTITIES = {
  // Major Tournament Series and Tours
  'world-series-of-poker': {
    qid: 'Q819961',
    name: 'World Series of Poker',
    wikipedia: 'https://en.wikipedia.org/wiki/World_Series_of_Poker',
    wikidata: 'https://www.wikidata.org/wiki/Q819961',
  },
  'wsop': {
    qid: 'Q819961',
    name: 'World Series of Poker',
    wikipedia: 'https://en.wikipedia.org/wiki/World_Series_of_Poker',
    wikidata: 'https://www.wikidata.org/wiki/Q819961',
  },
  'wsop-circuit': {
    qid: 'Q1586978',
    name: 'World Series of Poker Circuit',
    wikipedia: 'https://en.wikipedia.org/wiki/World_Series_of_Poker_Circuit',
    wikidata: 'https://www.wikidata.org/wiki/Q1586978',
  },
  'world-poker-tour': {
    qid: 'Q1137849',
    name: 'World Poker Tour',
    wikipedia: 'https://en.wikipedia.org/wiki/World_Poker_Tour',
    wikidata: 'https://www.wikidata.org/wiki/Q1137849',
  },
  'wpt': {
    qid: 'Q1137849',
    name: 'World Poker Tour',
    wikipedia: 'https://en.wikipedia.org/wiki/World_Poker_Tour',
    wikidata: 'https://www.wikidata.org/wiki/Q1137849',
  },
  'european-poker-tour': {
    qid: 'Q1351144',
    name: 'European Poker Tour',
    wikipedia: 'https://en.wikipedia.org/wiki/European_Poker_Tour',
    wikidata: 'https://www.wikidata.org/wiki/Q1351144',
  },
  'ept': {
    qid: 'Q1351144',
    name: 'European Poker Tour',
    wikipedia: 'https://en.wikipedia.org/wiki/European_Poker_Tour',
    wikidata: 'https://www.wikidata.org/wiki/Q1351144',
  },

  // Prominent Casinos & Card Rooms
  'bellagio': {
    qid: 'Q25007',
    name: 'Bellagio (resort)',
    wikipedia: 'https://en.wikipedia.org/wiki/Bellagio_(resort)',
    wikidata: 'https://www.wikidata.org/wiki/Q25007',
  },
  'aria': {
    qid: 'Q654279',
    name: 'Aria Resort and Casino',
    wikipedia: 'https://en.wikipedia.org/wiki/Aria_Resort_and_Casino',
    wikidata: 'https://www.wikidata.org/wiki/Q654279',
  },
  'horseshoe-las-vegas': {
    qid: 'Q805467',
    name: 'Horseshoe Las Vegas',
    wikipedia: 'https://en.wikipedia.org/wiki/Horseshoe_Las_Vegas',
    wikidata: 'https://www.wikidata.org/wiki/Q805467',
  },
  'paris-las-vegas': {
    qid: 'Q691491',
    name: 'Paris Las Vegas',
    wikipedia: 'https://en.wikipedia.org/wiki/Paris_Las_Vegas',
    wikidata: 'https://www.wikidata.org/wiki/Q691491',
  },
  'venetian-las-vegas': {
    qid: 'Q1049209',
    name: 'The Venetian Las Vegas',
    wikipedia: 'https://en.wikipedia.org/wiki/The_Venetian_Las_Vegas',
    wikidata: 'https://www.wikidata.org/wiki/Q1049209',
  },
  'wynn-las-vegas': {
    qid: 'Q1309059',
    name: 'Wynn Las Vegas',
    wikipedia: 'https://en.wikipedia.org/wiki/Wynn_Las_Vegas',
    wikidata: 'https://www.wikidata.org/wiki/Q1309059',
  },
  'commerce-casino': {
    qid: 'Q5152421',
    name: 'Commerce Casino',
    wikipedia: 'https://en.wikipedia.org/wiki/Commerce_Casino',
    wikidata: 'https://www.wikidata.org/wiki/Q5152421',
  },
  'the-bicycle-hotel-and-casino': {
    qid: 'Q4903744',
    name: 'The Bicycle Hotel & Casino',
    wikipedia: 'https://en.wikipedia.org/wiki/The_Bicycle_Hotel_%26_Casino',
    wikidata: 'https://www.wikidata.org/wiki/Q4903744',
  },
  'seminole-hard-rock-hollywood': {
    qid: 'Q7449511',
    name: 'Seminole Hard Rock Hotel & Casino Hollywood',
    wikipedia: 'https://en.wikipedia.org/wiki/Seminole_Hard_Rock_Hotel_%26_Casino_Hollywood',
    wikidata: 'https://www.wikidata.org/wiki/Q7449511',
  },
  'borgata': {
    qid: 'Q2910840',
    name: 'Borgata',
    wikipedia: 'https://en.wikipedia.org/wiki/Borgata',
    wikidata: 'https://www.wikidata.org/wiki/Q2910840',
  },
  'foxwoods': {
    qid: 'Q8565258',
    name: 'Foxwoods Resort Casino',
    wikipedia: 'https://en.wikipedia.org/wiki/Foxwoods_Resort_Casino',
    wikidata: 'https://www.wikidata.org/wiki/Q8565258',
  },
  'mohegan-sun': {
    qid: 'Q4305041',
    name: 'Mohegan Sun',
    wikipedia: 'https://en.wikipedia.org/wiki/Mohegan_Sun',
    wikidata: 'https://www.wikidata.org/wiki/Q4305041',
  },
  'winstar-world-casino': {
    qid: 'Q8023608',
    name: 'WinStar World Casino',
    wikipedia: 'https://en.wikipedia.org/wiki/WinStar_World_Casino',
    wikidata: 'https://www.wikidata.org/wiki/Q8023608',
  },
  'golden-nugget-las-vegas': {
    qid: 'Q1535018',
    name: 'Golden Nugget Las Vegas',
    wikipedia: 'https://en.wikipedia.org/wiki/Golden_Nugget_Las_Vegas',
    wikidata: 'https://www.wikidata.org/wiki/Q1535018',
  },
  'caesars-palace': {
    qid: 'Q569978',
    name: 'Caesars Palace',
    wikipedia: 'https://en.wikipedia.org/wiki/Caesars_Palace',
    wikidata: 'https://www.wikidata.org/wiki/Q569978',
  },
  'mgm-grand': {
    qid: 'Q713960',
    name: 'MGM Grand Las Vegas',
    wikipedia: 'https://en.wikipedia.org/wiki/MGM_Grand_Las_Vegas',
    wikidata: 'https://www.wikidata.org/wiki/Q713960',
  },
  'mandalay-bay': {
    qid: 'Q1368043',
    name: 'Mandalay Bay',
    wikipedia: 'https://en.wikipedia.org/wiki/Mandalay_Bay',
    wikidata: 'https://www.wikidata.org/wiki/Q1368043',
  },

  // Game Variants & Disciplines
  'texas-holdem': {
    qid: 'Q214536',
    name: 'Texas hold \'em',
    wikipedia: 'https://en.wikipedia.org/wiki/Texas_hold_%27em',
    wikidata: 'https://www.wikidata.org/wiki/Q214536',
  },
  'omaha-holdem': {
    qid: 'Q649282',
    name: 'Omaha hold \'em',
    wikipedia: 'https://en.wikipedia.org/wiki/Omaha_hold_%27em',
    wikidata: 'https://www.wikidata.org/wiki/Q649282',
  },

  // Industry Authorities, Media, & Databases
  'pokergo': {
    qid: 'Q105834585',
    name: 'PokerGO',
    wikipedia: 'https://en.wikipedia.org/wiki/PokerGO',
    wikidata: 'https://www.wikidata.org/wiki/Q105834585',
  },
  'pokernews': {
    qid: 'Q17116322',
    name: 'PokerNews',
    wikipedia: 'https://en.wikipedia.org/wiki/PokerNews',
    wikidata: 'https://www.wikidata.org/wiki/Q17116322',
  },
  'card-player': {
    qid: 'Q1035635',
    name: 'Card Player',
    wikipedia: 'https://en.wikipedia.org/wiki/Card_Player',
    wikidata: 'https://www.wikidata.org/wiki/Q1035635',
  },
  'hendon-mob': {
    qid: 'Q1604980',
    name: 'The Hendon Mob',
    wikipedia: 'https://en.wikipedia.org/wiki/The_Hendon_Mob',
    wikidata: 'https://www.wikidata.org/wiki/Q1604980',
  },
  'global-poker-index': {
    qid: 'Q18220131',
    name: 'Global Poker Index',
    wikipedia: 'https://en.wikipedia.org/wiki/Global_Poker_Index',
    wikidata: 'https://www.wikidata.org/wiki/Q18220131',
  },

  // Prominent Poker Figures & Card Club Owners
  'daniel-negreanu': {
    qid: 'Q317104',
    name: 'Daniel Negreanu',
    wikipedia: 'https://en.wikipedia.org/wiki/Daniel_Negreanu',
    wikidata: 'https://www.wikidata.org/wiki/Q317104',
  },
  'phil-ivey': {
    qid: 'Q318464',
    name: 'Phil Ivey',
    wikipedia: 'https://en.wikipedia.org/wiki/Phil_Ivey',
    wikidata: 'https://www.wikidata.org/wiki/Q318464',
  },
  'phil-hellmuth': {
    qid: 'Q375966',
    name: 'Phil Hellmuth',
    wikipedia: 'https://en.wikipedia.org/wiki/Phil_Hellmuth',
    wikidata: 'https://www.wikidata.org/wiki/Q375966',
  },
  'doyle-brunson': {
    qid: 'Q313139',
    name: 'Doyle Brunson',
    wikipedia: 'https://en.wikipedia.org/wiki/Doyle_Brunson',
    wikidata: 'https://www.wikidata.org/wiki/Q313139',
  },
  'doug-polk': {
    qid: 'Q18637764',
    name: 'Doug Polk',
    wikipedia: 'https://en.wikipedia.org/wiki/Doug_Polk',
    wikidata: 'https://www.wikidata.org/wiki/Q18637764',
  },
  'andrew-neeme': {
    qid: 'Q66992584',
    name: 'Andrew Neeme',
    wikipedia: 'https://en.wikipedia.org/wiki/Andrew_Neeme',
    wikidata: 'https://www.wikidata.org/wiki/Q66992584',
  },
};

/**
 * Normalizes an entity string for dictionary lookup.
 */
function normalizeEntityKey(raw) {
  if (!raw) return '';
  return String(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Resolves Wikidata and Wikipedia disambiguation links for a venue.
 */
export function resolveVenueWikidataLinks(venue) {
  if (!venue || !venue.name) return [];
  const nameKey = normalizeEntityKey(venue.name);
  const links = [];

  // Direct exact match
  if (WIKIDATA_ENTITIES[nameKey]) {
    links.push(WIKIDATA_ENTITIES[nameKey].wikidata, WIKIDATA_ENTITIES[nameKey].wikipedia);
    return links;
  }

  // Partial substring matches for famous casinos
  const searchName = String(venue.name).toLowerCase();
  const candidates = [
    ['bellagio', 'bellagio'],
    ['aria', 'aria'],
    ['horseshoe', 'horseshoe-las-vegas'],
    ['paris las vegas', 'paris-las-vegas'],
    ['venetian', 'venetian-las-vegas'],
    ['wynn', 'wynn-las-vegas'],
    ['commerce casino', 'commerce-casino'],
    ['bicycle', 'the-bicycle-hotel-and-casino'],
    ['hard rock hollywood', 'seminole-hard-rock-hollywood'],
    ['borgata', 'borgata'],
    ['foxwoods', 'foxwoods'],
    ['mohegan sun', 'mohegan-sun'],
    ['winstar', 'winstar-world-casino'],
    ['golden nugget', 'golden-nugget-las-vegas'],
    ['caesars palace', 'caesars-palace'],
    ['mgm grand', 'mgm-grand'],
    ['mandalay bay', 'mandalay-bay'],
  ];

  for (const [needle, key] of candidates) {
    if (searchName.includes(needle) && WIKIDATA_ENTITIES[key]) {
      links.push(WIKIDATA_ENTITIES[key].wikidata, WIKIDATA_ENTITIES[key].wikipedia);
      break;
    }
  }

  return links;
}

/**
 * Resolves Wikidata and Wikipedia disambiguation links for a tournament series.
 */
export function resolveSeriesWikidataLinks(series) {
  if (!series || !series.name) return [];
  const nameKey = normalizeEntityKey(series.name);
  const links = [];

  // Direct exact match
  if (WIKIDATA_ENTITIES[nameKey]) {
    links.push(WIKIDATA_ENTITIES[nameKey].wikidata, WIKIDATA_ENTITIES[nameKey].wikipedia);
    return links;
  }

  // Substring matches for major tour series
  const searchName = String(series.name).toLowerCase();
  if (searchName.includes('wsop circuit') || searchName.includes('wsop-c') || searchName.includes('wsopc')) {
    links.push(WIKIDATA_ENTITIES['wsop-circuit'].wikidata, WIKIDATA_ENTITIES['wsop-circuit'].wikipedia);
  } else if (searchName.includes('world series of poker') || searchName.includes('wsop')) {
    links.push(WIKIDATA_ENTITIES['world-series-of-poker'].wikidata, WIKIDATA_ENTITIES['world-series-of-poker'].wikipedia);
  } else if (searchName.includes('world poker tour') || searchName.includes('wpt')) {
    links.push(WIKIDATA_ENTITIES['world-poker-tour'].wikidata, WIKIDATA_ENTITIES['world-poker-tour'].wikipedia);
  } else if (searchName.includes('european poker tour') || searchName.includes('ept')) {
    links.push(WIKIDATA_ENTITIES['european-poker-tour'].wikidata, WIKIDATA_ENTITIES['european-poker-tour'].wikipedia);
  }

  return links;
}
