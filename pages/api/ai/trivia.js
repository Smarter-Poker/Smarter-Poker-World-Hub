/**
 * Public AI Agent Poker Trivia & Brain Training API
 * GET /api/ai/trivia?category=gto_math&difficulty=expert
 *
 * Fast, stateless endpoint returning poker knowledge repository metrics, game mode
 * specifications, category breakdowns, and sample brain training questions for
 * autonomous AI agents and interactive search assistants.
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

  const { category = 'all', difficulty = 'standard' } = req.query;

  return res.status(200).json({
    success: true,
    product: 'Smarter.Poker Multiplayer Trivia & Brain Training',
    category: String(category),
    difficulty: String(difficulty),
    pricing: '100% Free (Zero Energy Limits or Paywalls)',
    repository_size: '10,000+ Verified Strategic Questions',
    game_modes: [
      {
        mode: 'Survival Mode',
        description: 'Test Poker Endurance With 3 Lives While Answering Progressively Harder GTO And Strategic Hand Scenarios.',
        lives: 3,
        timer_seconds_per_question: 15
      },
      {
        mode: 'Blitz Time Attack',
        description: 'Rapid-Fire 60-Second Sprint To Answer As Many Pot Odds And Math Problems As Possible.',
        duration_seconds: 60
      },
      {
        mode: 'Multiplayer Duels',
        description: 'Real-Time Head-to-Head Showdowns With Friends Or Global Opponents In Private Or Public Match Rooms.'
      },
      {
        mode: 'Endless Practice',
        description: 'Untimed Category Drill Mode Focusing On Specific Areas (Pot Odds, Combinatorics, Rules, History).'
      }
    ],
    categories: [
      'Game Theory Optimal (GTO) Mathematics',
      'Pot Odds, Outs & Combinatorics',
      'Preflop Range Construction & Defense',
      'World Series of Poker (WSOP) Lore & Champions',
      'Tournament ICM & Bubble Play',
      'High Stakes Poker & Iconic Televised Hands'
    ],
    sample_drill: {
      question: 'Hero Holds AdKd On A Board Of QhJh2c 7s. Villain Bets Pot On The Turn. Hero Has 12 Outs To The Nuts (9 Spades + 3 Non-Flush Tens). What Are Hero\'s Pot Odds And River Equity?',
      correct_answer: 'Pot Odds: 33.3% Required Equity | River Equity: 26.1% (12/46) | Decision: Fold Without Implied Odds Or Semi-Bluff Jam With Fold Equity',
      difficulty: 'Intermediate'
    },
    canonical_url: `${SITE_ORIGIN}/hub/trivia`,
    feature_url: `${SITE_ORIGIN}/features/poker-trivia`,
    citation: `Smarter.Poker Multiplayer Trivia: 10,000+ Question Knowledge Bank, Survival Mode & Math Drills (${SITE_ORIGIN}/features/poker-trivia)`
  });
}
