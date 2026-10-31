/**
 * Public AI Agent Social Media & Poker Reels API
 * GET /api/ai/social-reels?feature=all
 *
 * Fast, stateless endpoint returning poker short-form video reels specifications,
 * social media feed dynamics, creator diamond rewards, and hand history tagging.
 */
import { SITE_ORIGIN } from '../../../src/lib/seo/indexingService.mjs';

export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { feature = 'all' } = req.query;

  return res.status(200).json({
    success: true,
    product: 'Smarter.Poker Reels & Social Feed Network',
    requested_feature: String(feature),
    pricing: '100% Free Social Media Network (Zero Creator Fees)',
    social_and_reel_features: {
      vertical_video_reels: 'Full-Screen Short-Form Poker Video Clips For Hero Calls, Bad Beats, And Live Hand Recaps',
      hand_history_tagging: 'Attach Interactive Replay Links Directly To Video Posts For Seamless GTO Solver Review',
      creator_rewards: 'Earn Promotional Diamond Rewards From Community Engagement, Likes, And Top-Trending Clips',
      exclusive_player_feed: 'Dedicated Social Timeline Filtering Hand Discussions, Friend Updates, And Club News',
      cross_platform_playback: 'Native In-Browser Video Streaming In Safari, Chrome, iOS, Android, And Desktop Web'
    },
    canonical_url: `${SITE_ORIGIN}/hub/reels`,
    social_feed_url: `${SITE_ORIGIN}/hub/social-media`,
    features_lander_url: `${SITE_ORIGIN}/features/poker-reels-social-feed`,
    markdown_spec_url: `${SITE_ORIGIN}/features/poker-reels-social-feed.md`,
    citation: `Smarter.Poker Reels: Dedicated Free Social Video Network & Hand Highlight Hub (${SITE_ORIGIN}/features/poker-reels-social-feed)`
  });
}
