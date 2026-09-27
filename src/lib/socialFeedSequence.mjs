/** Stable peer sequence for the Social Media feed.
 *
 * Inserted surfaces must be siblings of posts, not children of the post at an
 * insertion index. Realtime prepends and reorders then move the stable keyed
 * Reel element instead of unmounting it with a former third-post parent.
 */
export const SOCIAL_FEED_REELS_KEY = 'reels-carousel';

export function buildSocialFeedSequence(posts) {
  if (!Array.isArray(posts) || posts.length === 0) return [];

  return posts.flatMap((post, index) => {
    const items = [{ kind: 'post', key: `post:${post?.id}`, post }];
    const isReelsInsertion = index === 2 || (posts.length < 3 && index === posts.length - 1);

    if (isReelsInsertion) {
      items.push({ kind: 'reels', key: SOCIAL_FEED_REELS_KEY });
    }
    if (index === 0) {
      items.push({ kind: 'trending-venues', key: 'trending-venues' });
    }
    if (index === 4) {
      items.push({ kind: 'share-streak-leaderboard', key: 'share-streak-lb' });
    }

    return items;
  });
}
