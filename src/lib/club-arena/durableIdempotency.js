/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  DURABLE IDEMPOTENCY — shared across serverless instances.
 *
 *  src/lib/club-arena/idempotency.js keeps keys in a per-process Map. On Vercel
 *  each lambda instance has its own, so two rapid requests that land on
 *  different instances BOTH miss the cache and both execute. The header
 *  promises a guarantee the transport cannot keep.
 *
 *  This wraps fn_idempotency_begin / fn_idempotency_finish, which claim a key
 *  with a single INSERT ... ON CONFLICT so Postgres decides the race.
 *
 *  This BACKSTOPS the schema invariants; it does not replace them. The partial
 *  unique index on club_shop_inventory is what actually makes a double purchase
 *  impossible, because the client mints a fresh key on every click.
 *
 *  Fails OPEN: if the store is unreachable the request proceeds rather than
 *  blocking a purchase on a caching layer.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const TTL_SECONDS = 300;

/**
 * Claim the request's idempotency key.
 *
 * @returns {Promise<{ proceed: boolean }>} proceed=false means a response has
 *          already been sent (replayed result, or 409 while the first attempt
 *          is still running).
 */
async function beginIdempotent(supabase, req, res, route) {
    const key = req.headers['x-idempotency-key'];
    if (!key || typeof key !== 'string' || key.length < 8) {
        res.status(400).json({ success: false, error: 'X-Idempotency-Key header required' });
        return { proceed: false };
    }

    let claim;
    try {
        const { data, error } = await supabase.rpc('fn_idempotency_begin', {
            p_key: key,
            p_route: route,
            p_ttl_seconds: TTL_SECONDS,
        });
        if (error) throw error;
        claim = data;
    } catch (err) {
        // Fail open — a caching layer must not be able to block a purchase.
        console.warn('[idempotency] store unavailable, proceeding:', err?.message || err);
        return { proceed: true };
    }

    if (claim?.claimed) {
        // Cache the response on the way out.
        const originalJson = res.json.bind(res);
        res.json = (body) => {
            const status = res.statusCode || 200;
            supabase
                .rpc('fn_idempotency_finish', { p_key: key, p_status: status, p_body: body })
                .then(({ error }) => {
                    if (error) console.warn('[idempotency] finish failed:', error.message);
                })
                .catch((e) => console.warn('[idempotency] finish threw:', e?.message || e));
            return originalJson(body);
        };
        return { proceed: true };
    }

    if (claim?.state === 'done') {
        res.status(claim.status || 200).json(claim.body || { success: false, error: 'Replayed' });
        return { proceed: false };
    }

    if (claim?.state === 'processing') {
        res.status(409).json({
            success: false,
            error: 'Duplicate request is currently processing. Please wait.',
            duplicate: true,
        });
        return { proceed: false };
    }

    // 'invalid' or anything unexpected.
    res.status(400).json({ success: false, error: 'X-Idempotency-Key header required' });
    return { proceed: false };
}

module.exports = { beginIdempotent, TTL_SECONDS };
