/**
 * API: /api/poker/venue-dedup
 * Provides merged venue data by resolving aliases across multiple data sources.
 * Used by the live-tables API to combine data from both sources for matching venues.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// Known venue name aliases (cross-source naming differences)
const VENUE_ALIASES = {
  // Format: canonical_name: [alias1, alias2, ...]
  'Bellagio': ['Bellagio Hotel & Casino', 'Bellagio Poker Room', 'Bellagio Casino'],
  'ARIA Resort & Casino': ['Aria', 'ARIA', 'Aria Resort', 'Aria Casino'],
  'Wynn Las Vegas': ['Wynn', 'Wynn Poker Room'],
  'The Venetian Resort': ['Venetian', 'The Venetian', 'Venetian Poker Room'],
  'MGM Grand': ['MGM Grand Hotel & Casino', 'MGM Grand Poker Room'],
  'Commerce Casino': ['Commerce', 'Commerce Casino & Hotel'],
  'Bicycle Hotel & Casino': ['The Bike', 'Bicycle Casino', 'The Bicycle Hotel'],
  'Seminole Hard Rock Hollywood': ['Hard Rock Hollywood', 'Seminole Hard Rock Hotel & Casino'],
  'Borgata Hotel Casino & Spa': ['Borgata', 'Borgata Poker Room'],
  'Parx Casino': ['Parx', 'Parx Casino and Racing'],
  'Foxwoods Resort Casino': ['Foxwoods', 'Foxwoods Poker Room'],
  'Mohegan Sun': ['Mohegan Sun Casino', 'Mohegan Sun Poker Room'],
  'Turning Stone Resort Casino': ['Turning Stone', 'Turning Stone Poker Room'],
  'Rivers Casino Pittsburgh': ['Rivers Casino', 'Rivers Pittsburgh'],
  'PokerGO Studio': ['PokerGO', 'ARIA PokerGO Studio'],
  'Potawatomi Casino': ['Potawatomi Hotel & Casino', 'Potawatomi Casino Resort', 'Potawatomi Casino Hotel', 'Potawatomi Hotel and Casino'],
  'Greektown Casino': ['Hollywood Casino Greektown'],
  'Bally\'s Twin River Lincoln': ['Bally Twin River'],
  'Palm Beach Kennel Club': ['Palm Beach Kennel Club Poker Series'],
  'Daytona Beach Racing and Card Club': ['Daytona Racing & Card Club'],
  'Wind Creek Bethlehem': ['Sands Bethlehem'],
  'bestbet Jacksonville': ['Jacksonville Poker Room'],
};

// Build reverse lookup
const ALIAS_LOOKUP = {};
Object.entries(VENUE_ALIASES || {}).forEach(([canonical, aliases]) => {
  aliases.forEach(alias => {
    ALIAS_LOOKUP[alias.toLowerCase()] = canonical;
  });
  ALIAS_LOOKUP[canonical.toLowerCase()] = canonical;
});

// Generic descriptors that differ between sources ("Bellagio" vs "Bellagio Poker
// Room"). Stripped only from the END of a name so distinct venues that share a
// brand but differ by city ("Golden Nugget Las Vegas") never collapse together.
const GENERIC_SUFFIXES = [
  'poker room', 'poker club', 'card club', 'card room', 'cardroom',
  'hotel and casino', 'hotel casino and spa', 'hotel casino', 'casino and hotel',
  'casino hotel', 'casino resort', 'resort and casino', 'resort casino',
  'casino and racing', 'racing and card club', 'and racing',
  'resort', 'casino', 'hotel', 'poker',
];

/** Lowercase, punctuation-free form used for cross-source matching.
 *
 * Also neutralises two artefacts of slug-derived venue names, which is what
 * made 134 of 149 live-cash venues unjoinable to poker_venues:
 *   - a leading source prefix ("pa-aria-casino" / "Pa Aria Casino" -> "aria
 *     casino"). The prefix is provenance, not part of the venue's name.
 *   - "amp" as a standalone word, the residue of an HTML-escaped "&" that was
 *     slugified ("Beau Rivage Resort Amp Casino" -> "... and ...").
 * Both are applied AFTER punctuation stripping so slug and display forms
 * converge on the same key.
 */
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

/**
 * Normalized "core" name: alias-resolved when known, otherwise the name with a
 * leading "the" and any trailing generic descriptor removed. This is the dedup
 * fallback for the ~460 venues that are not in the hand-maintained alias table.
 */
export function normalizeVenueName(name) {
  const alias = name ? ALIAS_LOOKUP[String(name).toLowerCase()] : null;
  let core = normalizeForMatch(alias || name);
  if (!core) return '';

  core = core.replace(/^the /, '');

  // Strip trailing descriptors repeatedly ("hard rock hotel and casino" -> "hard rock")
  let changed = true;
  while (changed) {
    changed = false;

    // Stripping a suffix can leave a dangling conjunction ("winstar world casino
    // and resort" -> "winstar world casino and"), which blocks every further
    // strip and made that name miss its own "winstar world casino" variant.
    if (core.endsWith(' and')) {
      const trimmed = core.slice(0, -4).trim();
      if (trimmed.length >= 4) {
        core = trimmed;
        changed = true;
        continue;
      }
    }

    for (const suffix of GENERIC_SUFFIXES) {
      if (core.endsWith(' ' + suffix)) {
        const stripped = core.slice(0, -(suffix.length + 1)).trim();
        // Never strip down to something too short to be distinctive
        if (stripped.length >= 4) {
          core = stripped;
          changed = true;
          break;
        }
      }
    }
  }

  return core;
}

export function resolveVenueName(name) {
  if (!name) return name;
  return ALIAS_LOOKUP[name.toLowerCase()] || name;
}

export function mergeVenueData(tables) {
  // Group tables by canonical venue name. Grouping used to rely purely on the
  // 22-entry alias table, so any unlisted venue whose sources spelled it
  // differently ("X" vs "X Poker Room") stayed split; the normalized core name
  // is used as the grouping key so those merge too.
  const byCore = {};

  tables.forEach(table => {
    const aliasCanonical = resolveVenueName(table.venue_name);
    const core = normalizeVenueName(table.venue_name) || normalizeForMatch(table.venue_name) || String(table.venue_name || '');

    if (!byCore[core]) {
      byCore[core] = {
        venue_name: aliasCanonical,
        _hasAlias: aliasCanonical !== table.venue_name,
        original_names: new Set(),
        sources: new Set(),
        games: [],
        total_tables: 0,
        game_rows: 0,
      };
    }

    const entry = byCore[core];
    // Prefer an alias-table canonical name; otherwise keep the longest spelling.
    const isAliasName = aliasCanonical !== table.venue_name;
    if (isAliasName && !entry._hasAlias) {
      entry.venue_name = aliasCanonical;
      entry._hasAlias = true;
    } else if (!entry._hasAlias && String(table.venue_name || '').length > String(entry.venue_name || '').length) {
      entry.venue_name = table.venue_name;
    }

    entry.original_names.add(table.venue_name);
    entry.sources.add(table.source);
    entry.games.push(table);
    // `|| 1` counted a row whose tables_running is 0 (a game listed but not
    // currently running, which the scraper does emit) as one running table,
    // padding the OBSERVED side of the count. Row count is tracked separately.
    entry.total_tables += (table.tables_running ?? 0);
    entry.game_rows += 1;
  });

  // Re-key by the display name so the returned shape stays { canonical_name: {...} }
  const merged = {};
  Object.values(byCore || {}).forEach(v => {
    delete v._hasAlias;
    v.original_names = [...v.original_names];
    v.sources = [...v.sources];
    const key = v.venue_name;
    if (merged[key]) {
      // Two cores resolved to the same display name — fold them together
      merged[key].original_names = [...new Set([...merged[key].original_names, ...v.original_names])];
      merged[key].sources = [...new Set([...merged[key].sources, ...v.sources])];
      merged[key].games = merged[key].games.concat(v.games);
      merged[key].total_tables += v.total_tables;
      merged[key].game_rows += v.game_rows;
    } else {
      merged[key] = v;
    }
  });

  return merged;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const supabase = getSupabase();
  
  try {
    // Get all live tables
    const { data, error } = await supabase
      .from('venue_live_tables')
      .select('venue_name, game_name, source, tables_running, players_waiting')
      .limit(5000);
    
    if (error) {
      console.warn('Venue dedup: live tables query failed:', error.message);
      return res.status(200).json({ total_venues_raw: 0, total_venues_after_dedup: 0, duplicates_resolved: 0, resolved: [], alias_registry_size: Object.keys(VENUE_ALIASES || {}).length });
    }
    
    const merged = mergeVenueData(data || []);
    
    // Find duplicates that were resolved
    const resolvedDups = Object.values(merged || {}).filter(v => v.original_names.length > 1);
    
    res.status(200).json({
      total_venues_raw: new Set((data || []).map(t => t.venue_name)).size,
      total_venues_after_dedup: Object.keys(merged || {}).length,
      duplicates_resolved: resolvedDups.length,
      resolved: resolvedDups.map(v => ({
        canonical: v.venue_name,
        aliases: v.original_names,
        sources: v.sources,
      })),
      alias_registry_size: Object.keys(VENUE_ALIASES || {}).length,
    });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('Venue dedup error:', err);
    res.status(500).json({ error: err.message });
  }
}
