const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const COMMENT_COLUMNS = 'id,post_id,author_id,content,parent_id,media_url,media_type,created_at';
function failure(message, code) { const error = new Error(message); error.code = code; return error; }

/** No timers or retries: an unresolved write continues to own its slot. */
export function createReelMutationGuard({ maxPending = 64 } = {}) {
  const pending = new Map();
  const limit = Math.min(128, Math.max(1, Math.trunc(maxPending) || 64));
  function begin({ ownerRequest, kind, target } = {}) {
    if (!ownerRequest?.ownerId || !ownerRequest.isCurrent?.()) throw failure('Your account changed. Try again from the current account.', 'REEL_MUTATION_STALE');
    if (!kind || !target) throw failure('The action has no target.', 'REEL_MUTATION_INVALID');
    const key = JSON.stringify([ownerRequest.ownerId, ownerRequest.revision ?? ownerRequest.epoch ?? ownerRequest.generation ?? 0, kind, target]);
    if (pending.has(key)) return null;
    if (pending.size >= limit) throw failure('Other actions are still pending. Please wait.', 'REEL_MUTATION_CAPACITY');
    const token = Symbol(key);
    pending.set(key, token);
    let finished = false;
    return {
      isCurrent: () => !finished && pending.get(key) === token && ownerRequest.isCurrent(),
      finish() { if (finished) return; finished = true; if (pending.get(key) === token) pending.delete(key); },
    };
  }
  return {
    begin,
    get size() { return pending.size; },
    async run(request, task) {
      const operation = begin(request);
      if (!operation) throw failure('This action is already pending.', 'REEL_MUTATION_PENDING');
      try {
        if (!operation.isCurrent()) throw failure('Your account changed.', 'REEL_MUTATION_STALE');
        const result = await task(operation);
        if (!operation.isCurrent()) throw failure('Your account changed while the action was pending.', 'REEL_MUTATION_STALE');
        return result;
      } finally { operation.finish(); }
    },
  };
}

function matchesComment(row, expected) {
  return row && ['id', 'post_id', 'author_id', 'content', 'parent_id', 'media_url', 'media_type'].every((key) => (row[key] ?? null) === (expected[key] ?? null));
}

/** One insert identity and at most one readback; unknown acknowledgment never retries the write. */
export async function postReelComment(client, payload) {
  const expected = {
    id: payload?.id || globalThis.crypto?.randomUUID?.(),
    post_id: payload?.post_id,
    author_id: payload?.author_id,
    content: typeof payload?.content === 'string' ? payload.content.trim() : '',
    parent_id: payload?.parent_id || null,
    media_url: payload?.media_url || null,
    media_type: payload?.media_type || null,
  };
  if (![expected.id, expected.post_id, expected.author_id].every((id) => UUID.test(String(id || ''))) || (expected.parent_id && !UUID.test(expected.parent_id)) || (!expected.content && !expected.media_url)) throw failure('The comment is incomplete.', 'REEL_COMMENT_INVALID');
  const identity = await client.auth.getUser();
  if (identity?.error || identity?.data?.user?.id !== expected.author_id) throw failure('Sign in to the current account before commenting.', 'REEL_COMMENT_UNAUTHORIZED');
  let insertError;
  try {
    const response = await client.from('social_comments').insert(expected).select(COMMENT_COLUMNS).maybeSingle();
    if (!response.error && matchesComment(response.data, expected)) return { comment: response.data };
    if (!response.error && response.data) throw failure('The returned comment does not match this operation.', 'REEL_COMMENT_MISMATCH');
    insertError = response.error || failure('The comment acknowledgment was empty.', 'REEL_COMMENT_UNKNOWN');
  } catch (error) { if (error.code === 'REEL_COMMENT_MISMATCH') throw error; insertError = error; }
  try {
    const readback = await client.from('social_comments').select(COMMENT_COLUMNS).eq('id', expected.id).eq('author_id', expected.author_id).maybeSingle();
    if (!readback.error && matchesComment(readback.data, expected)) return { comment: readback.data };
    if (readback.data) throw failure('This comment identity belongs to a different operation.', 'REEL_COMMENT_MISMATCH');
  } catch (error) { if (error.code === 'REEL_COMMENT_MISMATCH') throw error; }
  const error = failure('The comment could not be confirmed. Refresh comments before trying again.', 'REEL_COMMENT_UNKNOWN');
  error.operationId = expected.id;
  error.cause = insertError;
  throw error;
}
/** Delete one owned comment; repeat requests read the same durable outcome. */
export async function removeReelComment(client, { id, postId, ownerId }) {
  if (![id, postId, ownerId].every(value => UUID.test(String(value || '')))) throw new TypeError('Invalid comment deletion target');
  const auth = await client.auth.getUser();
  if (auth.error || auth.data?.user?.id !== ownerId) throw new Error('Comment ownership is unavailable');
  let deletion;
  try { deletion = await client.from('social_comments').delete().eq('id', id).eq('post_id', postId).eq('author_id', ownerId).select('id'); }
  catch (error) { deletion = { error }; }
  if (deletion.error) {
    let observed;
    try { observed = await client.from('social_comments').select('id').eq('id', id).eq('post_id', postId).eq('author_id', ownerId).maybeSingle(); }
    catch (error) { observed = { error }; }
    if (observed.error) { const error = new Error('Comment deletion outcome is unknown. Refresh before trying again.'); error.code = 'REEL_COMMENT_DELETE_UNKNOWN'; throw error; }
    if (observed.data) throw new Error('Comment could not be deleted');
  }
  let count;
  try { count = await client.from('social_reels').select('comment_count').eq('id', postId).maybeSingle(); }
  catch (error) { count = { error }; }
  return { deleted: true, commentCount: !count.error && Number.isInteger(count.data?.comment_count) && count.data.comment_count >= 0 ? count.data.comment_count : null };
}

/** One owned edit and one outcome readback; no replacement insert or retry. */
export async function editReelComment(client, { id, postId, ownerId, content }) {
  if (![id, postId, ownerId].every(value => UUID.test(String(value || ''))) || typeof content !== 'string' || !content.trim()) throw new TypeError('Invalid comment edit');
  const auth = await client.auth.getUser();
  if (auth.error || auth.data?.user?.id !== ownerId) throw new Error('Comment ownership is unavailable');
  let edited;
  try { edited = await client.from('social_comments').update({ content }).eq('id', id).eq('post_id', postId).eq('author_id', ownerId).select('id,content').maybeSingle(); }
  catch (error) { edited = { error }; }
  if (!edited.error && edited.data?.id === id && edited.data.content === content) return edited.data;
  let observed;
  try { observed = await client.from('social_comments').select('id,content').eq('id', id).eq('post_id', postId).eq('author_id', ownerId).maybeSingle(); }
  catch (error) { observed = { error }; }
  if (!observed.error && observed.data?.id === id && observed.data.content === content) return observed.data;
  if (observed.error) throw failure('Comment edit outcome is unknown. Refresh before trying again.', 'REEL_COMMENT_EDIT_UNKNOWN');
  throw new Error('Comment edit could not be confirmed');
}
