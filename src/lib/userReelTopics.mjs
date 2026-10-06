/**
 * userReelTopics.mjs
 * The Reel topics a player can attest when sharing a video to Reels.
 *
 * Horses publish Poker and Sports Reels. A player must be able to publish the
 * same two, so a Reel never reveals who made it by its topic. The database
 * owns the list (public.user_reel_topics(), the same list
 * publish_user_video_reel enforces). The composer asks for it and offers only
 * what the database accepts, so this client is correct before and after the
 * migration that adds Sports: until the function exists the answer is Poker.
 */

import { USER_REEL_TOPICS } from './userReelPublicationRecovery.mjs';

export const DEFAULT_USER_REEL_TOPIC = 'poker';

export const USER_REEL_TOPIC_LABELS = Object.freeze({
  poker: 'Poker',
  sports: 'Sports',
});

// Never trust a value the composer did not offer: anything else is Poker.
export function normalizeUserReelTopic(value) {
  if (value === true) return DEFAULT_USER_REEL_TOPIC;
  return USER_REEL_TOPICS.includes(value) ? value : null;
}

// Reduce whatever the database returned to the known topics, in the fixed
// order, always including Poker.
export function acceptedUserReelTopics(value) {
  const supplied = Array.isArray(value) ? value : [];
  return USER_REEL_TOPICS.filter(
    (topic) => topic === DEFAULT_USER_REEL_TOPIC || supplied.includes(topic),
  );
}

let pending = null;

export async function loadUserReelTopics(supabase) {
  if (!supabase || typeof supabase.rpc !== 'function') return [DEFAULT_USER_REEL_TOPIC];
  if (!pending) {
    pending = Promise.resolve()
      .then(() => supabase.rpc('user_reel_topics'))
      .then(({ data, error } = {}) => {
        if (error) throw error;
        return acceptedUserReelTopics(data);
      })
      .catch(() => {
        // Not installed yet or unreachable: offer only what is known to work,
        // and ask again next time rather than caching the failure.
        pending = null;
        return [DEFAULT_USER_REEL_TOPIC];
      });
  }
  return pending;
}

export function resetUserReelTopicsCacheForTests() {
  pending = null;
}
