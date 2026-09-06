/**
 * API: /api/poker/venue-dedup
 * Provides merged venue data by resolving aliases across multiple data sources.
 * Used by the live-tables API to combine data from both sources for matching venues.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';
import {
  normalizeForMatch,
  normalizeVenueName,
  resolveVenueName,
  venueAliasRegistrySize,
} from '../../../src/lib/poker-near-me/venueMatching';

export { normalizeForMatch, normalizeVenueName, resolveVenueName };

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
      return res.status(200).json({ total_venues_raw: 0, total_venues_after_dedup: 0, duplicates_resolved: 0, resolved: [], alias_registry_size: venueAliasRegistrySize });
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
      alias_registry_size: venueAliasRegistrySize,
    });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('Venue dedup error:', err);
    res.status(500).json({ error: 'Venue identity report unavailable' });
  }
}
