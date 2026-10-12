const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** One desired-state transaction using the caller's authenticated client. */
export async function mutateReelReaction(client, { reelId, reaction, active } = {}) {
  if (!UUID.test(String(reelId || '')) || !['like', 'dislike'].includes(reaction) || typeof active !== 'boolean') {
    throw new TypeError('Invalid Reel reaction intent');
  }
  const { data, error } = await client.rpc('set_reel_reaction', {
    p_reel_id: reelId, p_reaction: reaction, p_active: active,
  });
  if (error) {
    const failure = new Error(error.code === '55P03' ? 'Reel Reaction Is Busy. Try Again.' : 'Reel Reaction Could Not Be Saved');
    failure.code = error.code;
    throw failure;
  }
  if (!data || typeof data.liked !== 'boolean' || typeof data.disliked !== 'boolean'
      || data.liked && data.disliked || !Number.isInteger(data.likeCount) || data.likeCount < 0) {
    throw new Error('Reel Reaction Acknowledgment Unavailable');
  }
  return data;
}
