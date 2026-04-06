/**
 * API: /api/poker/venue-dedup
 * Provides merged venue data by resolving aliases across multiple data sources.
 * Used by the live-tables API to combine data from both sources for matching venues.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';

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
};

// Build reverse lookup
const ALIAS_LOOKUP = {};
Object.entries(VENUE_ALIASES).forEach(([canonical, aliases]) => {
  aliases.forEach(alias => {
    ALIAS_LOOKUP[alias.toLowerCase()] = canonical;
  });
  ALIAS_LOOKUP[canonical.toLowerCase()] = canonical;
});

export function resolveVenueName(name) {
  if (!name) return name;
  return ALIAS_LOOKUP[name.toLowerCase()] || name;
}

export function mergeVenueData(tables) {
  // Group tables by canonical venue name
  const merged = {};
  
  tables.forEach(table => {
    const canonical = resolveVenueName(table.venue_name);
    if (!merged[canonical]) {
      merged[canonical] = {
        venue_name: canonical,
        original_names: new Set(),
        sources: new Set(),
        games: [],
        total_tables: 0,
      };
    }
    
    merged[canonical].original_names.add(table.venue_name);
    merged[canonical].sources.add(table.source);
    merged[canonical].games.push(table);
    merged[canonical].total_tables += (table.tables_running || 1);
  });
  
  // Convert Sets to arrays for JSON serialization
  Object.values(merged).forEach(v => {
    v.original_names = [...v.original_names];
    v.sources = [...v.sources];
  });
  
  return merged;
}

export default async function handler(req, res) {
  const supabase = getSupabase();
  
  try {
    // Get all live tables
    const { data, error } = await supabase
      .from('venue_live_tables')
      .select('venue_name, game_name, source, tables_running, players_waiting')
      .limit(5000);
    
    if (error) {
      console.warn('Venue dedup: live tables query failed:', error.message);
      return res.status(200).json({ total_venues_raw: 0, total_venues_after_dedup: 0, duplicates_resolved: 0, resolved: [], alias_registry_size: Object.keys(VENUE_ALIASES).length });
    }
    
    const merged = mergeVenueData(data || []);
    
    // Find duplicates that were resolved
    const resolvedDups = Object.values(merged).filter(v => v.original_names.length > 1);
    
    res.status(200).json({
      total_venues_raw: new Set((data || []).map(t => t.venue_name)).size,
      total_venues_after_dedup: Object.keys(merged).length,
      duplicates_resolved: resolvedDups.length,
      resolved: resolvedDups.map(v => ({
        canonical: v.venue_name,
        aliases: v.original_names,
        sources: v.sources,
      })),
      alias_registry_size: Object.keys(VENUE_ALIASES).length,
    });
  } catch (err) {
    console.error('Venue dedup error:', err);
    res.status(500).json({ error: err.message });
  }
}
