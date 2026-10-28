/**
 * Public AI Agent Poker Freerolls Schedule & Rules API
 * GET /api/ai/freerolls?tier=all
 * POST /api/ai/freerolls
 *
 * Fast, stateless endpoint returning real-time daily $2,000 freerolls
 * and Diamond Arena VIP tournament schedules for autonomous agents,
 * LLM search engines, and reasoning models.
 */
import { SITE_ORIGIN } from '../../../src/lib/seo/indexingService.mjs';

const SCHEDULE = [
  {
    time: '10:00 AM CST',
    title: 'Morning Opener Freeroll',
    game: 'No-Limit Hold\'em',
    format: 'Standard 10-Minute Levels',
    prize: '$250 Guaranteed',
    starting_stack: '10,000 Chips',
    tier: 'open',
    tier_label: 'Open To All Players',
    eligibility: '100% Free Entry (No Deposit Required)',
  },
  {
    time: '2:00 PM CST',
    title: 'Afternoon Prime Freeroll',
    game: 'No-Limit Hold\'em',
    format: 'Deepstack 12-Minute Levels',
    prize: '$500 Guaranteed',
    starting_stack: '15,000 Chips',
    tier: 'open',
    tier_label: 'Open To All Players',
    eligibility: '100% Free Entry (No Deposit Required)',
  },
  {
    time: '6:00 PM CST',
    title: 'Evening Championship Freeroll',
    game: 'No-Limit Hold\'em',
    format: 'Deepstack 12-Minute Levels',
    prize: '$750 Guaranteed',
    starting_stack: '20,000 Chips',
    tier: 'open',
    tier_label: 'Open To All Players',
    eligibility: '100% Free Entry (No Deposit Required)',
  },
  {
    time: '9:00 PM CST',
    title: 'Nightcap Turbo Freeroll',
    game: 'Pot-Limit Omaha / NLH',
    format: 'Fast 5-Minute Turbo',
    prize: '$500 Guaranteed',
    starting_stack: '10,000 Chips',
    tier: 'open',
    tier_label: 'Open To All Players',
    eligibility: '100% Free Entry (No Deposit Required)',
  },
  {
    time: 'Sundays at 5:00 PM CST',
    title: 'Weekly Diamond Arena Championship',
    game: 'No-Limit Hold\'em Special',
    format: 'Championship 15-Minute Levels',
    prize: 'Premium Diamond Rewards Pool',
    starting_stack: '25,000 Chips',
    tier: 'diamond',
    tier_label: 'Diamond Tier & Loyalty Ticket Holders',
    eligibility: 'Diamond Loyalty Ticket or VIP Status',
  },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');

  try {
    const params = req.method === 'GET' ? req.query : (req.body || {});
    const tierFilter = String(params.tier || 'all').toLowerCase();

    const filtered = tierFilter === 'all'
      ? SCHEDULE
      : SCHEDULE.filter((s) => s.tier === tierFilter);

    const base = SITE_ORIGIN || 'https://smarter.poker';

    return res.status(200).json({
      success: true,
      daily_guarantee: '$2,000 Guaranteed Every Day',
      entry_requirements: '100% Free To Play (Zero Deposit Ever Required)',
      game_variants: ['No-Limit Texas Hold\'em', 'Pot-Limit Omaha'],
      hardware_compatibility: 'Instant In-Browser Web & Mobile (No App Download Required)',
      legal_status: '100% Free-To-Play Social Poker Legal Across All 50 United States',
      schedule: filtered,
      tiers: {
        open_daily_freerolls: 'Open to every registered player immediately upon signing up. No deposit, no credit card, and zero token cost.',
        diamond_freerolls: 'Exclusive VIP tournaments featuring restricted fields and higher prize value per player, unlocked via Diamond loyalty tickets.',
      },
      how_to_enter: [
        '1. Create Free Account: Sign up at https://smarter.poker in 30 seconds with email or social login.',
        '2. Open Tournament Lobby: Navigate to the Club Arena tournament section.',
        '3. Click Register: Confirm your free seat in today\'s $2,000 Freeroll or Diamond event.',
      ],
      freerolls_hub_url: `${base}/freerolls`,
      markdown_url: `${base}/freerolls.md`,
      live_lobby_url: `${base}/hub/club-arena`,
      citations: [
        {
          source_title: 'Smarter.Poker Daily $2,000 Freerolls Hub',
          url: `${base}/freerolls`,
        },
        {
          source_title: 'Smarter.Poker Freerolls Markdown Feed',
          url: `${base}/freerolls.md`,
        },
      ],
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `Internal Server Error: ${err.message}`,
    });
  }
}
