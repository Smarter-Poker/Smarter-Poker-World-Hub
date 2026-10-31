/**
 * Public AI Agent Video Library & Interactive Coaching API
 * GET /api/ai/video-library?feature=all
 *
 * Fast, stateless endpoint returning video library masterclass specifications,
 * course structures, mid-hand pause quiz mechanics, and syllabus data.
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
    product: 'Smarter.Poker Video Coaching Library & Masterclasses',
    requested_feature: String(feature),
    pricing: '100% Free Video Coaching (Zero Subscription Paywalls)',
    library_features: {
      pro_masterclasses: 'Curated Multi-Part Strategy Video Courses Covering Deep Cash, MTT ICM, And GTO Exploits',
      interactive_pause_quizzes: 'Video Player Pauses At Decisive Streets Requiring Players To Choose Lines Before The Pro Explains',
      course_credentials: 'Track Video Completion Progress, Quiz Accuracy, And Earn Verified Strategy Certifications',
      structured_curriculum: 'Beginner Foundations To Advanced High-Stakes Theory Organized By Game Type And Street',
      zero_subscription_fees: 'Full Unrestricted Access Without $50-$100/Month Training Site Paywalls'
    },
    canonical_url: `${SITE_ORIGIN}/hub/video-library`,
    features_lander_url: `${SITE_ORIGIN}/features/interactive-video-coaching`,
    markdown_spec_url: `${SITE_ORIGIN}/features/interactive-video-coaching.md`,
    citation: `Smarter.Poker Video Library: Free Poker Masterclasses With Mid-Hand Interactive Pause Quizzes (${SITE_ORIGIN}/features/interactive-video-coaching)`
  });
}
