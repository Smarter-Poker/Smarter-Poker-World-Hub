// A PostgREST `.in(column, list)` filter travels in the request URL, and past
// ~25KB the database gateway answers a plain 400 (measured 2026-11-06: 25.0KB
// passed, 26.5KB failed; a UUID costs ~39 bytes). One hundred UUIDs is ~4KB,
// which leaves room for every other filter on the same request.
//
// These helpers split a caller-sized list into requests that always fit, and
// return the same { data, error } a single query does so call sites keep their
// existing error handling. scripts/ci/check-unbatched-in-lists.mjs recognises
// `selectInBatches` / `idBatches` as bounded.

export const IN_BATCH_SIZE = 100;

export function idBatches(ids, size = IN_BATCH_SIZE) {
    if (!Number.isInteger(size) || size < 1) throw new Error('batch size must be a positive integer');
    const unique = [...new Set((ids || []).filter(id => id !== null && id !== undefined && id !== ''))];
    const batches = [];
    for (let start = 0; start < unique.length; start += size) batches.push(unique.slice(start, start + size));
    return batches;
}

// build(batch) returns a query (thenable) for one batch. Batches run one after
// another so a 2,000-id list never opens 20 requests at once, and the first
// error stops the run and is returned as-is. An empty list makes no request.
export async function selectInBatches(ids, build, size = IN_BATCH_SIZE) {
    const data = [];
    for (const batch of idBatches(ids, size)) {
        const { data: rows, error } = await build(batch);
        if (error) return { data: null, error };
        if (Array.isArray(rows)) data.push(...rows);
    }
    return { data, error: null };
}

// Every conversation id a user participates in, read in pages so neither the
// row cap (PostgREST answers at most max-rows per request) nor a `.limit(500)`
// silently drops the rest. narrow(query) may add filters (identity context,
// is_group); it must not add its own range or limit. select may add an inner
// embed that narrow filters on, as long as it still selects conversation_id.
export async function listUserConversationIds(db, userId, { narrow = q => q, select = 'conversation_id', pageSize = 1000, maxRows = 20000 } = {}) {
    const ids = [];
    for (let from = 0; from < maxRows; from += pageSize) {
        const { data, error } = await narrow(
            db.from('social_conversation_participants').select(select).eq('user_id', userId),
        ).order('conversation_id', { ascending: true }).range(from, from + pageSize - 1);
        if (error) return { data: null, error };
        const rows = data || [];
        ids.push(...rows.map(row => row.conversation_id).filter(Boolean));
        if (rows.length < pageSize) return { data: ids, error: null };
    }
    return { data: ids, error: null, truncated: true };
}

// The first conversation two users share among `userId`'s conversations
// (optionally narrowed), or null. Stops at the first batch with a match.
export async function findSharedConversation(db, { userId, otherUserId, narrow, select } = {}) {
    const mine = await listUserConversationIds(db, userId, { narrow, select });
    if (mine.error) return { data: null, error: mine.error };
    for (const batch of idBatches(mine.data)) {
        const { data, error } = await db
            .from('social_conversation_participants')
            .select('conversation_id')
            .eq('user_id', otherUserId)
            .in('conversation_id', batch)
            .limit(1);
        if (error) return { data: null, error };
        if (data?.[0]?.conversation_id) return { data: data[0].conversation_id, error: null };
    }
    return { data: null, error: null };
}
