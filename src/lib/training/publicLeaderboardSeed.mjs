/**
 * The server-rendered seed for /hub/training/leaderboard.
 *
 * A Googlebot crawl measured this page at 130 words: the rankings were fetched
 * in the browser, so the HTML carried a heading, filter buttons and a skeleton,
 * and no leaders. The page now reads the same anonymous API a signed-out
 * visitor's browser reads and renders its first view on the server.
 *
 * Only what the page already shows a signed-out visitor goes into the HTML:
 * rank, public username, avatar, questions answered, correct answers and
 * accuracy. User ids, the viewer's private rank and every other field the API
 * returns are dropped here, before the data reaches page props.
 */

/** Must equal the SWR key the page builds for its default filters
 *  (timeframe all-time, view global), or the seed is never used. */
export const TRAINING_LEADERBOARD_DEFAULT_KEY = '/api/training/leaderboard?period=alltime&limit=100';

const PUBLIC_FIELDS = ['rank', 'username', 'avatarUrl', 'accuracy', 'questionsAnswered', 'questionsCorrect'];

/**
 * Turn the API envelope into the exact shape the page's SWR fetcher returns,
 * keeping only public fields. Returns null for anything unusable, so the page
 * falls back to its normal client fetch.
 */
export function publicTrainingLeaderboardSeed(json) {
  if (!json || json.success !== true || !Array.isArray(json.leaderboard)) return null;
  const leaderboard = json.leaderboard
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const out = {};
      for (const field of PUBLIC_FIELDS) {
        if (entry[field] !== undefined) out[field] = entry[field];
      }
      return out;
    });
  return { leaderboard, myRank: null, myEntry: null };
}
