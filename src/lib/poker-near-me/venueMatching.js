/**
 * Deterministic cross-source venue identity matching shared by server
 * aggregation and every Poker Near Me card consumer.
 *
 * Keep this module browser-safe: it is imported by the public UI as well as
 * API routes. Exact source slugs should always be tried before these name
 * fallbacks, and ambiguous normalized keys are rejected by the caller.
 */
const VENUE_ALIASES = Object.freeze({
  Bellagio: ['Bellagio Hotel & Casino', 'Bellagio Poker Room', 'Bellagio Casino'],
  'ARIA Resort & Casino': ['Aria', 'ARIA', 'Aria Resort', 'Aria Casino'],
  'Wynn Las Vegas': ['Wynn', 'Wynn Poker Room'],
  'The Venetian Resort': ['Venetian', 'The Venetian', 'Venetian Poker Room'],
  'MGM Grand': ['MGM Grand Hotel & Casino', 'MGM Grand Poker Room'],
  'Commerce Casino': ['Commerce', 'Commerce Casino & Hotel'],
  'Bicycle Hotel & Casino': ['The Bike', 'Bicycle Casino', 'The Bicycle Hotel'],
  'Seminole Hard Rock Hollywood': ['Hard Rock Hollywood', 'Seminole Hard Rock Hotel & Casino'],
  'Borgata Hotel Casino & Spa': ['Borgata', 'Borgata Poker Room', 'Borgata Hotel Casino'],
  'Parx Casino': ['Parx', 'Parx Casino and Racing'],
  'Foxwoods Resort Casino': ['Foxwoods', 'Foxwoods Poker Room'],
  'Mohegan Sun': ['Mohegan Sun Casino', 'Mohegan Sun Poker Room'],
  'Turning Stone Resort Casino': ['Turning Stone', 'Turning Stone Poker Room'],
  'Rivers Casino Pittsburgh': ['Rivers Casino', 'Rivers Pittsburgh'],
  'PokerGO Studio': ['PokerGO', 'ARIA PokerGO Studio'],
  'Potawatomi Casino': ['Potawatomi Hotel & Casino', 'Potawatomi Casino Resort', 'Potawatomi Casino Hotel', 'Potawatomi Hotel and Casino'],
  'Greektown Casino': ['Hollywood Casino Greektown'],
  "Bally's Twin River Lincoln": ['Bally Twin River'],
  'Palm Beach Kennel Club': ['Palm Beach Kennel Club Poker Series'],
  'Daytona Beach Racing and Card Club': ['Daytona Racing & Card Club'],
  'Wind Creek Bethlehem': ['Sands Bethlehem'],
  'bestbet Jacksonville': ['Jacksonville Poker Room'],
  // The checked-in directory historically called the Austin room “Lodge
  // Poker Club”; PokerAtlas and saved history use the card-club spelling.
  'The Lodge Card Club': [
    'Lodge Poker Club', 'Lodge Card Club', 'The Lodge Poker Club', 'Lodge Card Club Austin',
  ],
});

const ALIAS_LOOKUP = {};
Object.entries(VENUE_ALIASES).forEach(([canonical, aliases]) => {
  aliases.forEach((alias) => { ALIAS_LOOKUP[alias.toLowerCase()] = canonical; });
  ALIAS_LOOKUP[canonical.toLowerCase()] = canonical;
});

const GENERIC_SUFFIXES = [
  'poker room', 'poker club', 'card club', 'card room', 'cardroom',
  'hotel and casino', 'hotel casino and spa', 'hotel casino', 'casino and hotel',
  'casino hotel', 'casino resort', 'resort and casino', 'resort casino',
  'casino and racing', 'racing and card club', 'and racing',
  'resort', 'casino', 'hotel', 'poker',
];

/** Lowercase, punctuation-free identity used for exact normalized matching. */
export function normalizeForMatch(name) {
  if (!name) return '';
  let out = String(name).toLowerCase()
    .replace(/&/g, 'and')
    .replace(/'/g, '')
    .replace(/-/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  out = out.replace(/^(?:pa|bravo) /, '');
  out = out.replace(/(^| )amp( |$)/g, '$1and$2');
  return out.replace(/\s+/g, ' ').trim();
}

/** Alias-resolved name with trailing generic room/casino descriptors removed. */
export function normalizeVenueName(name) {
  const alias = name ? ALIAS_LOOKUP[String(name).toLowerCase()] : null;
  let core = normalizeForMatch(alias || name);
  if (!core) return '';

  core = core.replace(/^the /, '');
  let changed = true;
  while (changed) {
    changed = false;
    if (core.endsWith(' and')) {
      const trimmed = core.slice(0, -4).trim();
      if (trimmed.length >= 4) {
        core = trimmed;
        changed = true;
        continue;
      }
    }
    for (const suffix of GENERIC_SUFFIXES) {
      if (!core.endsWith(` ${suffix}`)) continue;
      const stripped = core.slice(0, -(suffix.length + 1)).trim();
      if (stripped.length >= 4) {
        core = stripped;
        changed = true;
        break;
      }
    }
  }
  return core;
}

export function resolveVenueName(name) {
  if (!name) return name;
  return ALIAS_LOOKUP[String(name).toLowerCase()] || name;
}

export const venueAliasRegistrySize = Object.keys(VENUE_ALIASES).length;
