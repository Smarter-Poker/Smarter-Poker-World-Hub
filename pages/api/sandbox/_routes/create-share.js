/**
 * /api/sandbox/create-share
 * W6-2: Short-link records for a sandbox state.
 * Table: sandbox_shared_scenarios (id, creator_id, state_json, view_count)
 *
 * Methods:
 *   POST   — create a share link for the posted state_json (auth optional).
 *   DELETE — revoke a link the CALLER created. Scoped to creator_id; a link
 *            that exists but belongs to somebody else answers 404, not 403,
 *            so the endpoint cannot be used to probe which ids are real.
 *   PATCH  — view-count beacon. Public (anyone holding the link can open it),
 *            never authoritative, and never fatal: it prefers the
 *            increment_share_view(share_id) RPC and degrades quietly when the
 *            RPC or the column is not deployed. It always answers the constant
 *            `{ success: true }` so the response cannot reveal whether an id
 *            exists. Note the primary counter is pages/sandbox/[id].js
 *            getServerSideProps, which calls the same RPC on every render.
 *
 * The view beacon lives here rather than in its own _routes file so that no
 * new entry is needed in the [...path].js ROUTES map — an unregistered route
 * is a 404, i.e. a control that silently does nothing.
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// Shared scenarios are rendered verbatim on /sandbox/[id] — keep the payload
// small enough that an unauthenticated caller cannot use it as free storage.
const MAX_STATE_BYTES = 50_000;

// Must stay in sync with SHARE_ID_RE in pages/sandbox/[id].js — ids that the
// public route would refuse to resolve are not worth a DB round-trip here.
const SHARE_ID_RE = /^[A-Za-z0-9]{4,16}$/;

const READ_LIMIT = { max: 120, windowMs: 60_000 };

function generateShortId(length = 6) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

/**
 * Identity comes from the Bearer token ONLY. A creator_id taken from the body
 * or the query string would let anyone revoke anyone else's link.
 */
async function resolveUserId(supabase, req) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return null;
    const token = authHeader.replace('Bearer ', '');
    try {
        const { data: authData } = await supabase.auth.getUser(token);
        return authData?.user?.id || null;
    } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
        return null;
    }
}

/**
 * Share id from (in order) ?id=, the body, or a trailing path segment
 * (/api/sandbox/create-share/<id>). Returns null when it is not a plausible id.
 */
function readShareId(req) {
    const segments = Array.isArray(req.query?.path) ? req.query.path : [];
    const candidate =
        req.query?.id ||
        req.query?.shareId ||
        req.body?.id ||
        req.body?.shareId ||
        segments[1] ||
        null;
    if (typeof candidate !== 'string') return null;
    const trimmed = candidate.trim();
    return SHARE_ID_RE.test(trimmed) ? trimmed : null;
}

// ── POST: create ───────────────────────────────────────────────────────────
async function handleCreate(req, res, supabase) {
    const userId = await resolveUserId(supabase, req);

    const { state_json } = req.body || {};
    if (!state_json || typeof state_json !== 'object' || Array.isArray(state_json)) {
        return res.status(400).json({ success: false, error: 'Valid state_json object required' });
    }

    let stateSize = 0;
    try {
        stateSize = JSON.stringify(state_json).length;
    } catch (_e) {
        return res.status(400).json({ success: false, error: 'state_json must be serializable JSON' });
    }
    if (stateSize > MAX_STATE_BYTES) {
        return res.status(413).json({ success: false, error: 'Scenario too large' });
    }

    // A 6-char id collides eventually — retry rather than 500.
    let data = null;
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        const shortId = generateShortId();
        const result = await supabase
            .from('sandbox_shared_scenarios')
            .insert({
                id: shortId,
                creator_id: userId,
                state_json,
            })
            .select('id')
            .maybeSingle();

        if (!result.error) { data = result.data; lastError = null; break; }
        lastError = result.error;
        if (result.error.code !== '23505') break; // not a duplicate-key clash
    }

    if (lastError) {
        if (lastError.code === '42P01') {
            console.warn('[create-share] sandbox_shared_scenarios table missing — run migration to restore');
        }
        console.warn('[create-share] Insert error:', lastError.message);
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }

    // `revocable` tells the client whether a Revoke control is worth showing:
    // guest-created rows have a null creator_id and can never be taken back.
    return res.status(200).json({ success: true, shareId: data?.id, revocable: !!userId });
}

// ── DELETE: revoke ─────────────────────────────────────────────────────────
async function handleRevoke(req, res, supabase) {
    const userId = await resolveUserId(supabase, req);
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const shareId = readShareId(req);
    // A malformed id cannot name a real row — answer exactly as we do for
    // "someone else's link" so the two cases are indistinguishable.
    if (!shareId) {
        return res.status(404).json({ success: false, error: 'Share link not found' });
    }

    // The creator_id filter is the whole authorisation check: a row owned by
    // another user simply does not match, so it deletes nothing and 404s.
    const { data, error } = await supabase
        .from('sandbox_shared_scenarios')
        .delete()
        .eq('id', shareId)
        .eq('creator_id', userId)
        .select('id');

    if (error) {
        // Table not deployed — there is nothing to revoke, which is what the
        // caller wanted to hear. Degrading here keeps the control from
        // erroring on environments that never ran the migration.
        if (error.code === '42P01') {
            console.warn('[create-share] sandbox_shared_scenarios table missing — nothing to revoke');
            return res.status(404).json({ success: false, error: 'Share link not found' });
        }
        console.warn('[create-share] Delete error:', error.message);
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }

    if (!Array.isArray(data) || data.length === 0) {
        // Either the id does not exist or it is not this user's. Same answer
        // for both — a 403 here would confirm that the id is real.
        return res.status(404).json({ success: false, error: 'Share link not found' });
    }

    return res.status(200).json({ success: true, revoked: data[0]?.id || shareId });
}

// ── PATCH: view beacon ─────────────────────────────────────────────────────
//
// SECONDARY PATH. The primary view counter is pages/sandbox/[id].js
// getServerSideProps, which calls the same `increment_share_view` RPC on every
// render of a shared link; nothing in the tree currently issues this PATCH.
// It is kept as an explicit client-side beacon hook (e.g. a client-navigated
// open that never re-runs getServerSideProps) — anything wiring one up should
// call PATCH /api/sandbox/create-share/<id>.
//
// RESPONSE IS A CONSTANT. Every path answers 200 `{ success: true }` with no
// per-id detail: a public, unauthenticated beacon that reported whether the row
// was found would be an existence oracle, letting anyone brute-force the 6-char
// slug space by diffing responses. A failed metric must also never look like a
// failed page load. Outcomes go to the logs, not to the caller.
async function handleViewIncrement(req, res, supabase) {
    const shareId = readShareId(req);
    const ack = () => res.status(200).json({ success: true });

    if (!shareId) return ack();

    // Preferred path — atomic, so concurrent opens cannot lose counts.
    try {
        const { error: rpcError } = await supabase.rpc('increment_share_view', { share_id: shareId });
        if (!rpcError) return ack();
        console.warn('[create-share] increment_share_view unavailable:', rpcError.message);
    } catch (e) {
        console.warn('[create-share] increment_share_view threw:', e?.message || e);
    }

    // Fallback for environments where the RPC was never deployed. Read-modify-
    // write races can undercount, which is acceptable for a view metric; every
    // error is swallowed so the beacon stays non-fatal.
    try {
        const { data: row, error: readErr } = await supabase
            .from('sandbox_shared_scenarios')
            .select('view_count')
            .eq('id', shareId)
            .maybeSingle();

        if (readErr || !row) return ack();

        const next = (Number(row.view_count) || 0) + 1;
        const { error: writeErr } = await supabase
            .from('sandbox_shared_scenarios')
            .update({ view_count: next })
            .eq('id', shareId);

        if (writeErr) console.warn('[create-share] view_count update failed:', writeErr.message);
        return ack();
    } catch (e) {
        console.warn('[create-share] view_count fallback threw:', e?.message || e);
        return ack();
    }
}

export default async function handler(req, res) {
  try {
      const method = req.method;

      // Writes (create/revoke) get the strict bucket; the public view beacon
      // gets the read bucket so a busy shared link cannot exhaust it.
      const limit = method === 'PATCH' ? (LIMITS.read || READ_LIMIT) : LIMITS.write;
      if (!applyRateLimit(req, res, limit)) return;

      if (method !== 'POST' && method !== 'DELETE' && method !== 'PATCH') {
          res.setHeader('Allow', 'POST, DELETE, PATCH');
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          let supabase;
          try {
              supabase = getSupabase();
          } catch (err) {
              console.warn('[create-share] Initialization error:', err);
              return res.status(500).json({ success: false, error: 'Database initialization failed' });
          }

          if (method === 'DELETE') return handleRevoke(req, res, supabase);
          if (method === 'PATCH') return handleViewIncrement(req, res, supabase);
          return handleCreate(req, res, supabase);
      } catch (err) {
          console.warn('[create-share] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal Server Error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
