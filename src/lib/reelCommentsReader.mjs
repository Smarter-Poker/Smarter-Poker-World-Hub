const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const REEL_COMMENT_FIELDS = 'id,post_id,author_id,content,parent_id,media_url,media_type,created_at';

/** Read through the caller's authenticated/RLS client without an assumed FK. */
export async function readReelComments(client, reelId, { page = 0, oldest = false, signal } = {}) {
  if (!UUID.test(String(reelId || '')) || !Number.isSafeInteger(page) || page < 0 || page > 10000) {
    throw new Error('Invalid Reel comments request');
  }
  signal?.throwIfAborted();
  let query = client.from('social_comments').select(REEL_COMMENT_FIELDS)
    .eq('post_id', reelId)
    .order('created_at', { ascending: oldest })
    .order('id', { ascending: oldest })
    .range(page * 50, page * 50 + 49);
  if (signal && typeof query.abortSignal === 'function') query = query.abortSignal(signal);
  const { data, error } = await query;
  signal?.throwIfAborted();
  if (error) throw error;
  const comments = Array.isArray(data) ? data : [];
  const authors = [...new Set(comments.map(row => row.author_id).filter(id => UUID.test(String(id || ''))))];
  let profiles = [];
  if (authors.length) {
    try {
      let profileQuery = client.from('profiles').select('id,username,avatar_url').in('id', authors);
      if (signal && typeof profileQuery.abortSignal === 'function') profileQuery = profileQuery.abortSignal(signal);
      const result = await profileQuery;
      if (result.error) throw result.error;
      profiles = result.data || [];
    } catch (profileError) {
      signal?.throwIfAborted();
      console.warn('[ReelComments] Author profiles unavailable:', profileError?.code || 'profile-read-failed');
    }
  }
  signal?.throwIfAborted();
  const profileById = new Map(profiles.map(profile => [profile.id, profile]));
  return comments.map(comment => ({ ...comment, profiles: profileById.get(comment.author_id) || null }));
}
