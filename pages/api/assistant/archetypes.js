/**
 * GET /api/assistant/archetypes
 * Returns the 7 canonical villain archetypes.
 *
 * Contract: archetype id values are exactly the keys of ARCHETYPE_CONFIG
 * (nit, tag, lag, fish, calling_station, maniac, gto_neutral) so ids flow
 * unchanged from this API -> villain select -> analyze API villainArchetype
 * -> getArchetypeRangeString / exploit tips.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { ARCHETYPE_CONFIG } from '../../../src/lib/sandbox/VillainArchetypeRanges';

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

// Curated presentation order (GTO Neutral first, then tight -> loose).
const CANONICAL_ORDER = ['gto_neutral', 'nit', 'tag', 'lag', 'fish', 'calling_station', 'maniac'];

// Bluff tendency per archetype — display metadata not carried in ARCHETYPE_CONFIG.
const BLUFF_FREQUENCY = {
  gto_neutral: 'balanced',
  nit: 'very_low',
  tag: 'moderate',
  lag: 'high',
  fish: 'low',
  calling_station: 'very_low',
  maniac: 'very_high',
};

// Single source of truth: derive the default list from ARCHETYPE_CONFIG so the
// API and the sandbox range/exploit engine always share one id vocabulary.
const DEFAULT_ARCHETYPES = CANONICAL_ORDER
  .filter(id => ARCHETYPE_CONFIG[id])
  .map(id => ({
    id,
    name: ARCHETYPE_CONFIG[id].name,
    description: ARCHETYPE_CONFIG[id].description,
    color: ARCHETYPE_CONFIG[id].color,
    bluff_frequency: BLUFF_FREQUENCY[id] || 'balanced',
  }));

function canonicalIndex(id) {
  const i = CANONICAL_ORDER.indexOf(id);
  return i === -1 ? CANONICAL_ORDER.length : i;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // Rate limit before the DB read. The edge cache below is not a substitute:
    // a unique query string per request bypasses the CDN and reaches this
    // handler — and this endpoint needs no auth at all.
    if (!applyRateLimit(req, res, LIMITS.read || { max: 60, windowMs: 60_000 })) return;

    // Villain archetypes are static reference data — safe to cache 1 hour at edge
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');

    try {
      const { data: archetypes, error } = await getSupabase()
        .from('villain_archetypes')
        .select('*')
        .limit(100);

      const rows = (archetypes || []).filter(a => a && a.id);

      if (error || rows.length === 0) {
        return res.status(200).json({
          success: true,
          archetypes: DEFAULT_ARCHETYPES
        });
      }

      // Preserve curated order: use a sort_order column when every row has
      // one, otherwise fall back to the canonical presentation order.
      const hasSortOrder = rows.every(a => typeof a.sort_order === 'number');
      const sorted = [...rows].sort((a, b) => {
        if (hasSortOrder) return a.sort_order - b.sort_order;
        const diff = canonicalIndex(a.id) - canonicalIndex(b.id);
        if (diff !== 0) return diff;
        return String(a.id).localeCompare(String(b.id));
      });

      // Transform to match frontend format, with per-field fallbacks so a
      // schema mismatch never produces blank labels.
      const formatted = sorted.map(a => {
        const fallback = DEFAULT_ARCHETYPES.find(d => d.id === a.id) || {};
        return {
          id: a.id,
          name: a.display_name || a.name || fallback.name || a.id,
          description: a.description || fallback.description || '',
          color: a.color || fallback.color || '#6b7280',
          bluff_frequency: a.bluff_frequency || fallback.bluff_frequency || 'balanced'
        };
      });

      return res.status(200).json({
        success: true,
        archetypes: formatted
      });

    } catch (error) {
      console.warn('Archetypes error:', error);
      return res.status(200).json({
        success: true,
        archetypes: DEFAULT_ARCHETYPES
      });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
