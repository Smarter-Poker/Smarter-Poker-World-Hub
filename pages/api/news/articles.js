/**
 * News Hub API - Get News Articles
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// Clamp an arbitrary query value to an integer within [min, max]
function clampInt(value, fallback, min, max) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

// Pagination contract: ?limit= (1..100, default 24) & ?offset= (>= 0).
// MAX_OFFSET is a sanity ceiling so a hand-typed ?offset=999999999 can't ask
// Postgres to walk the whole table; it is far above any real page count.
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;
const MAX_OFFSET = 100000;

// Shape check only (8-4-4-4-12 hex). Deliberately NOT version/variant-strict:
// the goal is to keep placeholder ids ('empty-box-1', '1'..'8', 'mspt1') and
// injection attempts out of the RPC, not to assert a particular UUID version —
// a non-v4 id in poker_news would otherwise freeze view counting silently.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PostgREST answers 416 / PGRST103 ("Requested range not satisfiable") when an
// EXACT COUNT is requested and the range starts past the end of the result set.
// Without count:'exact' the same request used to come back as an empty 200, so
// this is only reachable since pagination was added — see the GET handler.
function isRangeNotSatisfiable(error) {
    if (!error) return false;
    if (String(error.code || '') === 'PGRST103') return true;
    return /range not satisfiable/i.test(String(error.message || ''));
}

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method === 'GET') {
          try {
              const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
              const category = safeQ(req.query.category);
              const search = safeQ(req.query.search);
              // BUG FIX: limit/offset were used as raw strings — `offset + limit - 1`
              // string-concatenated (e.g. "20" + 20 - 1 = 2019) producing 2000-row
              // pages, and `?limit=abc` produced range(0, NaN) → 500. Clamp both.
              const limit = clampInt(safeQ(req.query.limit), DEFAULT_LIMIT, 1, MAX_LIMIT);
              const offset = clampInt(safeQ(req.query.offset), 0, 0, MAX_OFFSET);
              const featured = safeQ(req.query.featured);
              const source = safeQ(req.query.source);

              // Same sanitizing rationale for both: keep PostgREST filter
              // metacharacters out of the value.
              // BUG #270 FIX: Sanitize search input to prevent PostgREST filter injection.
              // Characters like commas, parentheses, and dots could break/modify the filter.
              const safeSource = (source && source !== 'all')
                  ? source.slice(0, 100).replace(/[,().]/g, ' ').trim()
                  : '';
              const safeSearch = search
                  ? search.slice(0, 100).replace(/[,().]/g, ' ').trim()
                  : '';

              // Applied identically to the row query and to the count-only
              // retry below, so `total` can never describe a different set of
              // rows than `data`.
              const applyFilters = (q) => {
                  let out = q.eq('is_published', true);
                  if (category && category !== 'all') out = out.eq('category', category);
                  if (safeSource) out = out.eq('source_name', safeSource);
                  if (safeSearch) {
                      out = out.or(`title.ilike.%${safeSearch}%,content.ilike.%${safeSearch}%`);
                  }
                  if (featured === 'true') out = out.eq('is_featured', true);
                  return out;
              };

              // count: 'exact' runs the same filters as the row query, so
              // `total` always describes THIS filtered result set (not the
              // whole table) and hasMore stays correct under search/category.
              const query = applyFilters(
                  getSupabase().from('poker_news').select('*', { count: 'exact' })
              )
                  .order('published_at', { ascending: false })
                  .range(offset, offset + limit - 1);

              const { data, error, count } = await query;

              // An ?offset= past the end of the filtered set is an empty page,
              // not a failure — and that is exactly what this route returned
              // before count:'exact' made PostgREST start answering 416. Ask
              // for the count on its own so `total` stays honest, and never
              // surface a 500 for it.
              if (error && isRangeNotSatisfiable(error)) {
                  const { count: totalOnly, error: countError } = await applyFilters(
                      getSupabase().from('poker_news').select('id', { count: 'exact', head: true })
                  );
                  if (countError) throw countError;

                  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
                  return res.status(200).json({
                      success: true,
                      data: [],
                      pagination: {
                          limit,
                          offset,
                          total: typeof totalOnly === 'number' ? totalOnly : 0,
                          hasMore: false
                      }
                  });
              }

              if (error) throw error;

              // BACKWARD COMPATIBLE: `data` keeps its exact previous meaning and
              // shape (the page of rows). `pagination` is purely additive, so
              // existing callers that only read `data` are unaffected.
              const rows = Array.isArray(data) ? data : [];
              // If the count comes back null (PostgREST can omit it), fall back
              // to a lower bound rather than inventing a number.
              const hasCount = typeof count === 'number';
              const total = hasCount ? count : offset + rows.length;
              // CONTRACT FIX: deriving hasMore from that lower-bound `total`
              // always produced `false`, which silently dead-ends the news
              // page's infinite scroll after page 1 (the client trusts a
              // boolean hasMore and only falls back when it is absent). With no
              // count to compare against, "a full page came back" is the honest
              // signal that another page probably exists.
              const hasMore = hasCount
                  ? offset + rows.length < total
                  : rows.length >= limit;

              res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      return res.status(200).json({
          success: true,
          data: rows,
          pagination: { limit, offset, total, hasMore }
      });
          } catch (error) {
              try { reportApiError(error, req); } catch (_e) { /* noop */ }
              console.warn('[News Articles API] GET error:', error?.message || error);
              return res.status(500).json({ success: false, error: 'Internal server error' });
          }
      }

      // POST - Increment view count
      if (req.method === 'POST') {
          try {
              const { id } = req.body || {};
              if (!id) return res.status(400).json({ success: false, error: 'Missing article ID' });

              // Validate UUID so placeholder ids (e.g. 'empty-box-1') and junk
              // input never reach the RPC / inflate trending counts.
              if (typeof id !== 'string' || !UUID_RE.test(id)) {
                  // The client fire-and-forgets this response, so log it —
                  // otherwise an id-format drift would freeze views silently.
                  console.warn('[News Articles API] Rejected view POST for non-UUID id:', String(id).slice(0, 64));
                  return res.status(400).json({ success: false, error: 'Invalid article ID' });
              }

              const { error } = await getSupabase().rpc('increment_news_views', { news_id: id });

              if (error) throw error;

              return res.status(200).json({ success: true });
          } catch (error) {
              try { reportApiError(error, req); } catch (_e) { /* noop */ }
              console.warn('[News Articles API] POST error:', error?.message || error);
              return res.status(500).json({ success: false, error: 'Internal server error' });
          }
      }

      return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
