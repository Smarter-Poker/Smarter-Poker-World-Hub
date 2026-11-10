/**
 * Model Context Protocol (MCP) Server for Smarter.Poker
 *
 * Implements the standard MCP JSON-RPC protocol specification:
 * - initialize
 * - notifications/initialized
 * - ping
 * - tools/list
 * - tools/call
 *
 * Tools offered:
 * 1. search_poker_venues: Search poker rooms by city, state, or name with stakes and table counts.
 * 2. get_venue_details: Retrieve full profile, daily tournament schedules, and live action for a specific venue ID.
 * 3. search_tournament_series: Search major and regional poker tournament series and championships.
 * 4. get_series_details: Retrieve detailed tournament series schedules, buy-ins, and guarantees for a series ID.
 * 5. calculate_poker_odds: Compute exact equity, win, and tie probabilities for Texas Hold'em and Omaha.
 * 6. get_preflop_chart: Retrieve GTO preflop opening ranges and frequencies for 6-max cash games at 100BB.
 * 7. calculate_icm_payouts: Compute Malmuth-Harville Independent Chip Model tournament equity payouts.
 * 8. get_poker_term_definition: Look up official poker definitions, GTO concepts, and table rules.
 */
import { SITE_ORIGIN } from '../seo/indexingService.mjs';
import { calculateEquity, makeCard } from '../poker/pokerOddsEngine.js';
import { calculateICM } from '../../engines/ICMCalculator.js';
import { RFI } from '../../config/solverRanges.js';
import { GLOSSARY_TERMS } from '../../content/glossary/terms.js';
import { LESSONS, LEARN_CATEGORIES, trainingCta } from '../../content/learn/lessons.js';
import { STARTING_HANDS, findStartingHand, getExpandedHandMatchups } from '../../content/learn/hands.js';
import { RESEARCH_REPORTS, findResearchReport } from '../../content/research/reports.js';
import { TRAINING_LIBRARY } from '../../data/TRAINING_LIBRARY.js';
import { SCHEMA_ROUTES } from '../seo/summarySchema.js';
import { getHubPageSummaries } from '../seo/hubPageSummariesData.js';
import {
  AS_OF,
  COMPARE_PAGES,
  PRODUCTS,
  cellFor,
  getComparePage,
  pageSources,
} from '../../content/compare/pages.js';
import { getBacklinkOpportunitiesPayload } from '../seo/backlinkCatalog.mjs';
import { getDatasetCatalogPayload } from '../seo/datasetCatalog.mjs';
import { generateOutreachPackage } from '../seo/outreachEngine.mjs';
import { POKER_RULES, RULES_AS_OF, getRuleBySlug } from '../../content/rules/rules.js';
import { POKER_VARIANTS, GAMES_AS_OF, getGameVariantBySlug } from '../../content/games/variants.js';
import { POKER_MARKET_GUIDES, MARKET_GUIDES_AS_OF } from '../../content/guides/markets.js';

export function parseCardToken(str) {
  const match = String(str || '').trim().match(/^(10|[2-9TJQKA])([shdc])$/i);
  if (!match) return null;
  const rank = match[1].toUpperCase() === 'T' ? '10' : match[1].toUpperCase();
  const suits = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
  return makeCard(rank, suits[match[2].toLowerCase()]);
}

export function normalizeCardGroup(input) {
  if (Array.isArray(input)) {
    return input.map(parseCardToken).filter(Boolean);
  }
  if (typeof input === 'string') {
    const tokens = input.includes(',')
      ? input.split(',')
      : (input.includes(' ')
          ? input.split(' ')
          : input.match(/(?:10|[2-9TJQKA])[shdc]/gi) || []);
    return tokens.map(parseCardToken).filter(Boolean);
  }
  return [];
}

export const MCP_SERVER_INFO = {
  name: 'smarter-poker-mcp-server',
  version: '1.8.0',
};
export const SERVER_INFO = MCP_SERVER_INFO;

export const MCP_INSTRUCTIONS = [
  'Smarter.Poker MCP Server v1.8.0 exposes 30 read-only, deterministic quantitative poker tools, 6 Zenodo DOI datasets (10.5281/zenodo.24095049, 10.5281/zenodo.24095057, 10.5281/zenodo.24095560, 10.5281/zenodo.24095564, 10.5281/zenodo.24095597, 10.5281/zenodo.24095602), and Glama Registry metadata (https://glama.ai/mcp/servers/Smarter-Poker/smarter-poker-mcp).',
  'Tool Family Disambiguation Rules:',
  '1. Equity & Odds Family: Use calculate_poker_odds for exact Monte Carlo / enumerative multiway card-vs-card equity with specific hole cards or board cards; use lookup_hand_matchup for canonical preflop hand-vs-hand benchmarks (e.g. AA vs KK, AKs vs QQ) and flop texture shifts; use calculate_draw_outs for hypergeometric turn/river draw completion from clean out counts (1-21 outs) and Rule of 4 & 2 error; use calculate_pot_odds_and_mdf when given pot size and bet size to compute break-even calling equity and Minimum Defense Frequency (MDF).',
  '2. Preflop Strategy Family: Use get_preflop_chart to retrieve a full 100BB 6-Max positional opening range matrix (UTG, MP, HJ, CO, BTN, SB); use lookup_starting_hand to inspect a single canonical starting hand (any of the 169 hands such as AA, AKs, 87s, 72o) across all positions.',
  '3. Live Poker Venue Family: Use search_poker_venues to filter cardrooms by city, state, keyword, or venue type (casino, card_room, charity, poker_club); use get_venue_details only after obtaining a numeric venue ID.',
  '4. Tournament Series Family: Use search_tournament_series to search tours (WSOP, WPT, MSPT, RGPS, PGT) or festival names; use get_series_details only when you have a specific numeric series ID.',
  '5. Tournament Math & Bankroll Family: Use calculate_icm_payouts for Malmuth-Harville ICM equity; use calculate_tournament_chop to compare ICM Chop vs Chip Chop vs Save-Amount deals; use calculate_bounty_chip_equity for PKO/Mystery Bounty chip conversion; use calculate_bankroll_risk_of_ruin for Risk of Ruin (RoR); use simulate_poker_variance for sample confidence intervals (68%/95%/99.7%).',
].join('\n');

export const MCP_TOOLS = [
  {
    name: 'search_poker_venues',
    description: 'Search verified poker rooms and casinos by name, city, state, or venue type across North America.',
    annotations: {
      title: 'Search Live Poker Venues',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Keyword search for venue name, city, or address (e.g. "Bellagio", "Austin", "Dallas").',
        },
        state: {
          type: 'string',
          description: 'Two-letter US state code or full state name (e.g. "NV", "TX", "California").',
        },
        city: {
          type: 'string',
          description: 'City name (e.g. "Las Vegas", "Houston").',
        },
        type: {
          type: 'string',
          enum: ['casino', 'card_room', 'charity', 'poker_club'],
          description: 'Type of poker venue.',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of results to return (default: 10, max: 50).',
          default: 10,
        },
      },
    },
  },
  {
    name: 'get_venue_details',
    description: 'Retrieve detailed information, address, phone, games offered, table counts, and tournament schedules for a specific poker venue ID.',
    annotations: {
      title: 'Get Poker Venue Details By ID',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Numeric venue ID (e.g. "2499" for Bellagio Poker Room).',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'search_tournament_series',
    description: 'Search poker tournament series, championship festivals, and tours (WSOP, WPT, MSPT, RGPS, PGT, DeepStack).',
    annotations: {
      title: 'Search Poker Tournament Series',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Search query for series title, tour, or host venue (e.g. "Venetian", "World Series of Poker", "WPT").',
        },
        tour: {
          type: 'string',
          description: 'Tour abbreviation (e.g. "WSOP", "WPT", "MSPT", "RGPS", "PGT", "DSE").',
        },
        upcoming: {
          type: 'string',
          enum: ['true', 'false'],
          description: 'Filter for upcoming or active series only.',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of results to return (default: 10, max: 50).',
          default: 10,
        },
      },
    },
  },
  {
    name: 'get_series_details',
    description: 'Retrieve full details for a tournament series, including event schedules, buy-ins, guarantees, and host venue information.',
    annotations: {
      title: 'Get Tournament Series Details By ID',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Numeric series ID (e.g. "468" for DeepStack Showdown).',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'calculate_poker_odds',
    description: 'Calculate exact equity, win, and tie probabilities for Texas Hold\'em and Omaha hands with board runouts.',
    annotations: {
      title: 'Calculate Multiway Poker Hand Equity & Odds',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        game: {
          type: 'string',
          enum: ['nlhe', 'plo4', 'plo5', 'plo6'],
          description: 'Poker game variant (default: nlhe for No-Limit Texas Hold\'em).',
          default: 'nlhe',
        },
        hands: {
          type: 'array',
          items: {
            oneOf: [
              { type: 'array', items: { type: 'string' } },
              { type: 'string' },
            ],
          },
          description: 'Array of player hands (e.g. [["Ah", "Kd"], ["Qc", "Qd"]] or ["AhKd", "QcQd"]).',
        },
        board: {
          oneOf: [
            { type: 'array', items: { type: 'string' } },
            { type: 'string' },
          ],
          description: 'Optional community board cards (e.g. ["Jh", "Ts", "2c"] or "Jh,Ts,2c").',
        },
        iterations: {
          type: 'integer',
          description: 'Monte Carlo simulation iterations (default: 10000, max: 50000).',
          default: 10000,
        },
      },
      required: ['hands'],
    },
  },
  {
    name: 'get_preflop_chart',
    description: 'Retrieve GTO opening ranges and frequencies for 6-max cash games at 100BB stack depth.',
    annotations: {
      title: 'Get 100BB 6-Max GTO Preflop Chart',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        position: {
          type: 'string',
          enum: ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB'],
          description: 'Table position to inspect (default: UTG).',
          default: 'UTG',
        },
      },
    },
  },
  {
    name: 'calculate_icm_payouts',
    description: 'Calculate Independent Chip Model (ICM) tournament equity in dollars based on stack sizes and prize payouts.',
    annotations: {
      title: 'Calculate Tournament ICM Payout Equity',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        stacks: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of chip counts for each player at the table (e.g. [100000, 75000, 50000, 25000]).',
        },
        payouts: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of tournament payout prize values in order of 1st, 2nd, 3rd, etc. (e.g. [5000, 3000, 1500, 500]).',
        },
      },
      required: ['stacks', 'payouts'],
    },
  },
  {
    name: 'get_poker_term_definition',
    description: 'Look up authoritative definitions, GTO concepts, and rules from the official Smarter.Poker glossary.',
    annotations: {
      title: 'Look Up Poker Glossary Term Definition',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        term: {
          type: 'string',
          description: 'Poker term, jargon, or GTO acronym (e.g. "pot odds", "icm", "3-bet", "straddle", "equity").',
        },
      },
      required: ['term'],
    },
  },
  {
    name: 'get_freeroll_schedule',
    description: 'Retrieve the upcoming Daily $2,000 Freerolls and Diamond Arena Freerolls schedule, formats, prize values, and entry requirements on Smarter.Poker.',
    annotations: {
      title: 'Get Daily Freeroll Tournament Schedule',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        tier: {
          type: 'string',
          enum: ['all', 'open', 'diamond'],
          description: 'Filter by freeroll tier: "open" for daily open tournaments, "diamond" for Diamond Arena VIP events, or "all".',
          default: 'all',
        },
      },
    },
  },
  {
    name: 'get_platform_feature_specs',
    description: 'Retrieve comprehensive specifications, free alternatives comparisons, URLs, and Markdown specs for all 15 Smarter.Poker platform verticals (Bankroll W-2G Tax Ledger, Dealer Toke Tracker, Jarvis AI Coach, Virtual Sandbox, Club Commander, FaceTime Messenger, Trivia, GTO Training, Home Games, Video Library, Poker Near Me, Club Arena, Social Reels, Preflop Charts, and Equity Calculators).',
    annotations: {
      title: 'Get Smarter.Poker Platform Vertical Specs',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        vertical: {
          type: 'string',
          enum: [
            'all',
            'bankroll',
            'toke_tracker',
            'ai_coach',
            'sandbox',
            'club_commander',
            'messenger',
            'trivia',
            'training',
            'home_games',
            'video_library',
            'poker_near_me',
            'club_arena',
            'social_reels',
            'preflop_charts',
            'equity_calculators',
          ],
          description: 'Specific vertical to inspect, or "all" for the complete 15-vertical directory.',
          default: 'all',
        },
      },
    },
  },
  {
    name: 'search_strategy_lessons',
    description: 'Search and retrieve complete GTO poker strategy lessons, answer-first summaries, mathematical tables, and training tool recommendations from the 40-lesson Smarter.Poker curriculum.',
    annotations: {
      title: 'Search GTO Poker Strategy Lessons',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search keyword or lesson slug (e.g. "pot odds", "3-bet", "icm", "button-opening-range", "c-bet").',
        },
        category: {
          type: 'string',
          enum: ['Preflop', 'Postflop', 'Math', 'Tournaments', 'Cash', 'Bankroll', 'Mental Game', 'Theory'],
          description: 'Optional strategy category filter.',
        },
      },
    },
  },
  {
    name: 'get_competitor_comparison',
    description: 'Retrieve verified, source-cited side-by-side comparison matrices and best-of benchmarks across all 30 Smarter.Poker competitor comparisons (PokerBros, PPPoker, ClubGG, Pokerrrr 2, Bravo Poker Live, PokerAtlas, TableCaptain, GTO Wizard, DTO Poker, Sharp Poker, Pokerbase, Poker Bankroll Tracker, DownCount, Bellagio, Aria, Wynn, Venetian, Commerce, The Lodge, Texas Card House, Borgata, Seminole Hard Rock, Run It Once, Upswing Poker, PokerCoaching, Red Chip Poker, PokerTracker 4, Holdem Manager 3, PioSolver, MonkerSolver, ICMIZER, Equilab).',
    annotations: {
      title: 'Get Verified Competitor Comparison Matrix',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'Comparison slug (e.g. "best-poker-club-apps", "best-gto-poker-trainers", "smarter-poker-vs-piosolver", "smarter-poker-vs-run-it-once", "wynn-vs-venetian-las-vegas-poker") or omit to list all 30 verified comparisons.',
        },
      },
    },
  },
  {
    name: 'lookup_starting_hand',
    description: 'Look up combinatorics, 100BB 6-Max GTO positional opening ranges, 3-bet strategies, and preflop equities for any of the 169 canonical Texas Holdem starting hands (e.g. "AA", "KK", "88", "AKs", "AQo", "KJs", "87s", "65s", "J9s", "54s", "72o", "pocket-aces", "ace-king-suited").',
    annotations: {
      title: 'Look Up Canonical Starting Hand (169 Hands)',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        hand: {
          type: 'string',
          description: 'Hand code or slug (e.g. "AA", "KK", "88", "AKs", "AQo", "KJs", "87s", "65s", "J9s", "54s", "72o", "pocket-aces"). Omit to list all 169 canonical starting hand guides.',
        },
      },
    },
  },
  {
    name: 'get_research_report',
    description: 'Retrieve first-party empirical poker industry research reports and dataset benchmarks across all 15 Smarter.Poker studies (US Live Poker Room Rake & Jackpot Benchmark, Daily Tournament Buy-In Index, GTO vs Population Leak Study, Private Club Software Economics, Poker Dealer Toke & Hourly Rate Benchmark, Tournament ICM Bubble Factor & Risk Premium Study, PLO4/PLO5/PLO6 Equity & Variance Study, US Poker Tax W-2G & Session Accounting Benchmark, Cardroom Waitlist Turnover & Table Utilization Benchmark, Private Poker Club Markup & Union Settlement Study, Mystery Bounty vs PKO EV Study, Short Deck 6+ Equity Benchmark, Double-Board PLO Bomb Pot Study, Live Low-Stakes Population Tendencies, Satellite Bubble Survival Math Study).',
    annotations: {
      title: 'Get Empirical Poker Research Report',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'Research report slug (e.g. "us-live-poker-room-rake-and-jackpot-benchmark", "mystery-bounty-vs-pko-ev-and-bounty-power-factor-study") or omit to list all 15 empirical studies.',
        },
      },
    },
  },
  {
    name: 'search_training_simulators',
    description: 'Search and retrieve interactive Smarter.Poker World Hub tools, GTO solvers, ICM calculators, leak scanners, range builders, and all 107 scenario training games by skill topic, format, or slug.',
    annotations: {
      title: 'Search GTO Simulators & 107 Training Games',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keyword or slug to search (e.g. "icm", "rake", "range builder", "leak", "autopilot", "short deck", "tilt", "warmup", "push/fold"). Omit to list the full simulator and training catalog.',
        },
        category: {
          type: 'string',
          enum: ['ALL', 'SIMULATORS', 'MTT', 'CASH', 'SPINS', 'PSYCHOLOGY', 'ADVANCED'],
          description: 'Optional category filter.',
          default: 'ALL',
        },
      },
    },
  },
  {
    name: 'calculate_pot_odds_and_mdf',
    description: 'Calculate exact poker pot odds ratio, required break-even calling equity, Minimum Defense Frequency (MDF), optimal polarized river bluff ratio, and 1-card/2-card hypergeometric draw completion probabilities.',
    annotations: {
      title: 'Calculate Pot Odds & Minimum Defense Frequency',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        pot: {
          type: 'number',
          description: 'Pot size before the opponent bet (default: 100).',
          default: 100,
        },
        bet: {
          type: 'number',
          description: 'Opponent bet / call amount (default: 50).',
          default: 50,
        },
        outs: {
          type: 'integer',
          description: 'Number of clean unseen draw outs (0 to 20, default: 9).',
          default: 9,
        },
      },
    },
  },
  {
    name: 'calculate_bankroll_risk_of_ruin',
    description: 'Calculate exact Brownian motion poker Risk of Ruin (RoR) percentage and required buy-in buffers for 5% and 1% Risk of Ruin from true winrate (BB/100), standard deviation (BB/100), and bankroll buy-ins.',
    annotations: {
      title: 'Calculate Poker Bankroll Risk Of Ruin (RoR)',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        winrate_bb100: {
          type: 'number',
          description: 'True winrate in Big Blinds per 100 hands (default: 5).',
          default: 5,
        },
        std_dev_bb100: {
          type: 'number',
          description: 'Standard deviation in Big Blinds per 100 hands (e.g. 70 live NLH, 85 online 6-max NLH, 135 PLO4, default: 85).',
          default: 85,
        },
        buy_ins: {
          type: 'number',
          description: 'Current bankroll expressed in 100BB buy-ins (default: 30).',
          default: 30,
        },
      },
    },
  },
  {
    name: 'calculate_bounty_chip_equity',
    description: 'Convert a Progressive Knockout (PKO) or Mystery Bounty dollar amount into tournament chip-equivalent value and compute bounty-adjusted required calling equity.',
    annotations: {
      title: 'Calculate PKO & Mystery Bounty Chip Equity',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        bounty_dollars: {
          type: 'number',
          description: 'Immediate cash bounty prize won upon eliminating the player (default: 50).',
          default: 50,
        },
        regular_pool_buyin: {
          type: 'number',
          description: 'Regular prize pool contribution per tournament entry (default: 50).',
          default: 50,
        },
        starting_stack: {
          type: 'number',
          description: 'Tournament starting chip stack (default: 10000).',
          default: 10000,
        },
        pot_chips: {
          type: 'number',
          description: 'Current pot in chips before calling the all-in (default: 15000).',
          default: 15000,
        },
        call_chips: {
          type: 'number',
          description: 'Chips required to call the all-in shove (default: 10000).',
          default: 10000,
        },
      },
    },
  },
  {
    name: 'calculate_side_pots',
    description: 'Calculate exact Multi-Way All-In Main Pot, Side Pots, and Uncalled Bet returns for 2 to 9 players plus dead money (blinds/antes/folded bets).',
    annotations: {
      title: 'Calculate Multi-Way All-In Side Pots',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        contributions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              amount: { type: 'number' },
              folded: { type: 'boolean' },
            },
            required: ['amount'],
          },
          description: 'Array of player chip contributions (e.g. [{"name":"Player 1","amount":2500},{"name":"Player 2","amount":6000},{"name":"Player 3","amount":12000}]).',
        },
        dead_money: {
          type: 'number',
          description: 'Optional dead money from blinds, antes, or folded players (default: 0).',
          default: 0,
        },
      },
      required: ['contributions'],
    },
  },
  {
    name: 'generate_blind_structure',
    description: 'Generate a TDA-compliant poker tournament blind schedule and starting chip color distribution from starting stack, level duration, target hours, and ante format.',
    annotations: {
      title: 'Generate Tournament Blind Structure Schedule',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        starting_stack: {
          type: 'number',
          description: 'Starting tournament chip stack per player (default: 20000).',
          default: 20000,
        },
        level_minutes: {
          type: 'integer',
          description: 'Duration of each blind level in minutes (default: 20).',
          default: 20,
        },
        target_hours: {
          type: 'number',
          description: 'Target total tournament duration in hours (default: 4).',
          default: 4,
        },
        ante_format: {
          type: 'string',
          enum: ['bba', 'none'],
          description: 'Big Blind Ante ("bba") or No Ante ("none", default: "bba").',
          default: 'bba',
        },
      },
    },
  },
  {
    name: 'calculate_spr_sizing',
    description: 'Calculate exact Stack-To-Pot Ratio (SPR), Commitment Zone classification, and 1-street, 2-street, and 3-street Geometric Bet Sizing percentages.',
    annotations: {
      title: 'Calculate Stack-To-Pot Ratio & Geometric Sizing',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        effective_stack: {
          type: 'number',
          description: 'Remaining effective stack size in chips or Big Blinds (default: 90).',
          default: 90,
        },
        pot_size: {
          type: 'number',
          description: 'Current pot size on the flop or turn (default: 10).',
          default: 10,
        },
      },
    },
  },
  {
    name: 'get_citation_and_backlink_kit',
    description: 'Retrieve ready-to-paste HTML backlinks, SVG authority/award badges, Markdown/Substack citations, TwoPlusTwo/CardsChat BBCode, Wikipedia {{cite web}} templates, BibTeX academic records, Zenodo DOIs, Software Heritage SWHIDs, Glama MCP listing, all 14 Twitch/YouTube streamer chatbot commands (!odds, !potodds, !pushfold, !icm, !bounty, !winrate, !plo, !rake, !3bet, !rule, !chop, !outs, !variance, !matchup), and multilingual embeds across 7 languages (en, es, pt, de, fr, it, ja).',
    annotations: {
      title: 'Get Academic DOI Citation & Streamer Backlink Kit',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        campaign: {
          type: 'string',
          enum: [
            'all',
            'unlinked-brand',
            'competitor-404',
            'cardroom-awards',
            'cpa-tax-w2g',
            'dealer-schools',
            'edu-quant-clubs',
            'podcast-show-notes',
            'multilingual',
          ],
          description: 'Optional outreach or syndication campaign filter (default: "all").',
          default: 'all',
        },
        lang: {
          type: 'string',
          enum: ['en', 'es', 'pt', 'de', 'fr', 'it', 'ja'],
          description: 'Language code for localized HTML/Markdown/BBCode/iframe embed generation (default: "en").',
          default: 'en',
        },
        target: {
          type: 'string',
          description: 'Optional target publication, cardroom, or blog name for personalized outreach templates.',
          default: 'Your Publication',
        },
      },
    },
  },
  {
    name: 'lookup_poker_rule',
    description: 'Look up official Poker Tournament Directors Association (TDA) and Robert\'s Rules of Poker (RROP) floor rulings across all 30 Smarter.Poker rule guides (showdown order, verbal declarations, oversized chip rule, string bets, action out of turn, short all-in reopening, odd chip award, dead button, rabbit hunting, and more).',
    annotations: {
      title: 'Look Up Official TDA & RROP Floor Rule',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Rule slug or keyword (e.g. "showdown-order-who-shows-first", "oversized-chip", "string-bet", "verbal", "reopen"). Omit to list all 30 official floor rulings.',
        },
      },
    },
  },
  {
    name: 'lookup_game_variant',
    description: 'Look up dealing rules, mandatory hole-card usage, betting structures, hand ranking systems, and starting hand strategy tiers across all 15 poker variants (Texas Hold\'em, PLO4, PLO5, PLO6, Big O Hi-Lo, Short Deck 6+, Double-Board PLO Bomb Pots, Pineapple/Crazy Pineapple, 7-Card Stud, Stud Hi-Lo, Razz, 2-7 Triple Draw, NL 2-7 Single Draw, Badugi, H.O.R.S.E. & 8-Game Mix).',
    annotations: {
      title: 'Look Up Poker Game Variant Rules & Strategy',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        variant: {
          type: 'string',
          description: 'Variant slug or keyword (e.g. "pot-limit-omaha-plo4", "short-deck-six-plus", "double-board-plo-bomb-pot", "razz", "badugi"). Omit to list all 15 poker game variants.',
        },
      },
    },
  },
  {
    name: 'get_regional_market_guide',
    description: 'Retrieve live poker room counts, rake/drop/time-collection structures, buy-in caps, flagship venues, and strategic adjustments across the 12 largest US live poker markets (Las Vegas, Los Angeles, Austin, Houston, Dallas, South Florida, Tampa, Atlantic City, Pennsylvania, Connecticut/New England, Northern California, and Arizona).',
    annotations: {
      title: 'Get Regional US Live Poker Market Guide',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        market: {
          type: 'string',
          description: 'Market slug, city, or state code (e.g. "las-vegas-nevada", "los-angeles-california", "houston-texas", "TX", "FL"). Omit to list all 12 regional market guides.',
        },
      },
    },
  },
  {
    name: 'calculate_plo_max_bet_and_rake',
    description: 'Compute exact Pot-Limit Omaha (PLO) maximum raise total (3x last bet + trail calls + center pot), preflop 3-bet/4-bet MDF, and live cash game rake cost in $/hr and BB/100 drag.',
    annotations: {
      title: 'Calculate PLO Max Pot Raise & Live Rake Drag',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        previous_pot: {
          type: 'number',
          description: 'Center pot before current street betting or previous pot in BBs/dollars (default: 1.5).',
          default: 1.5,
        },
        facing_bet: {
          type: 'number',
          description: 'Current bet or raise being faced in BBs/dollars (default: 3.5).',
          default: 3.5,
        },
        trail_calls: {
          type: 'number',
          description: 'Total chips called in between the bettor and hero on this street (default: 0).',
          default: 0,
        },
        hero_already_in: {
          type: 'number',
          description: 'Chips hero has already posted on the current street (e.g. 1.0 in BB, default: 0).',
          default: 0,
        },
        big_blind_dollars: {
          type: 'number',
          description: 'Big blind dollar value for live cash rake BB/100 calculation (default: 3).',
          default: 3,
        },
        rake_cap_dollars: {
          type: 'number',
          description: 'Casino max pot rake cap in dollars (default: 5).',
          default: 5,
        },
        promo_drop_dollars: {
          type: 'number',
          description: 'Additional bad beat / high-hand promotional drop per pot (default: 1).',
          default: 1,
        },
      },
    },
  },
  {
    name: 'calculate_tournament_chop',
    description: 'Compute final-table deal payouts comparing Malmuth-Harville ICM Chop, proportional Chip Chop, and Save-Amount Chop (setting aside a trophy cash bonus for 1st place).',
    annotations: {
      title: 'Calculate Final Table ICM & Chip Chop Deal',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        stacks: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of remaining player chip stacks (e.g. [500000, 300000, 200000]).',
        },
        payouts: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of remaining tournament prize payouts from 1st place down (e.g. [10000, 6000, 4000]).',
        },
        saveAmount: {
          type: 'number',
          description: 'Optional dollar amount set aside for the eventual winner in a Save-Amount deal (default: 0).',
          default: 0,
        },
      },
      required: ['stacks', 'payouts'],
    },
  },
  {
    name: 'simulate_poker_variance',
    description: 'Calculate expected profit (EV), standard deviation in BB and buy-ins, 68%/95%/99.7% normal confidence intervals, probability of loss over a sample, and minimum hands required for 95% statistical confidence.',
    annotations: {
      title: 'Simulate Poker Variance & Confidence Intervals',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        winrateBb100: {
          type: 'number',
          description: 'True winrate in Big Blinds per 100 hands (default: 5).',
          default: 5,
        },
        stdDevBb100: {
          type: 'number',
          description: 'Standard deviation in Big Blinds per 100 hands (e.g. 70 live NLH, 85 6-max online NLH, 135 PLO4, default: 85).',
          default: 85,
        },
        handsPlayed: {
          type: 'number',
          description: 'Total sample size in hands played (default: 50000).',
          default: 50000,
        },
      },
    },
  },
  {
    name: 'calculate_draw_outs',
    description: 'Compute exact hypergeometric poker draw probabilities (Turn %, River %, Flop-to-River %), Rule of 4 and 2 approximation error, and required break-even pot odds for 1 to 21 clean outs.',
    annotations: {
      title: 'Calculate Hypergeometric Poker Draw Outs',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        outs: {
          type: 'integer',
          description: 'Number of clean unseen outs from 1 to 21 (default: 9).',
          default: 9,
        },
        street: {
          type: 'string',
          enum: ['flop', 'turn'],
          description: 'Current street: "flop" (2 cards to come, 47 unseen) or "turn" (1 card to come, 46 unseen, default: "flop").',
          default: 'flop',
        },
      },
    },
  },
  {
    name: 'lookup_hand_matchup',
    description: 'Look up exact preflop win/tie/loss equity, combinatorics, flop texture equity shifts, and 100BB vs 25BB stack-off EV notes for canonical Texas Hold\'em hand-vs-hand matchups (e.g. "aa-vs-kk", "ak-vs-qq", "jj-vs-aks", "77-vs-ak").',
    annotations: {
      title: 'Look Up Canonical Preflop Hand-Vs-Hand Matchup',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'Matchup slug (e.g. "aa-vs-kk", "ak-vs-qq", "jj-vs-aks") or omit to list all 25 canonical matchups.',
        },
        handA: {
          type: 'string',
          description: 'Optional first hand code (e.g. "AA", "AKs", "QQ").',
        },
        handB: {
          type: 'string',
          description: 'Optional second hand code (e.g. "KK", "QQ", "AKo").',
        },
      },
    },
  },
];

export const MCP_PROMPTS = [
  {
    name: 'find_live_poker_near_city',
    description: 'Search verified live poker rooms, cash game stakes, and daily tournament schedules in a target city or state.',
    arguments: [
      { name: 'city', description: 'City name (e.g. "Las Vegas", "Austin")', required: false },
      { name: 'state', description: 'Two-letter state code (e.g. "NV", "TX")', required: true },
    ],
  },
  {
    name: 'analyze_icm_final_table',
    description: 'Compute Malmuth-Harville ICM tournament equity and bubble pressure for a final table stack and payout distribution.',
    arguments: [
      { name: 'stacks', description: 'Comma-separated chip stacks (e.g. "50000,30000,20000")', required: true },
      { name: 'payouts', description: 'Comma-separated prize payouts (e.g. "5000,3000,2000")', required: true },
    ],
  },
  {
    name: 'explain_poker_strategy_concept',
    description: 'Explain a poker strategy concept or GTO preflop range using the Smarter.Poker curriculum and glossary.',
    arguments: [
      { name: 'topic', description: 'Strategy topic or glossary term (e.g. "pot-odds", "icm", "button-opening-range")', required: true },
    ],
  },
  {
    name: 'compare_poker_software',
    description: 'Compare poker training software, bankroll trackers, or club management apps using verified primary-source citations.',
    arguments: [
      { name: 'slug', description: 'Comparison slug (e.g. "best-gto-poker-trainers", "smarter-poker-vs-icmizer")', required: false },
    ],
  },
];

export const MCP_RESOURCE_TEMPLATES = [
  {
    uriTemplate: 'https://smarter.poker/learn/{slug}.md',
    name: 'Smarter.Poker Strategy Lesson Markdown',
    description: 'Raw Markdown edition of any of the 40 poker strategy lessons on Smarter.Poker.',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 'https://smarter.poker/learn/category/{category}.md',
    name: 'Smarter.Poker Strategy Category Pillar Markdown',
    description: 'Raw Markdown topic cluster guide for Preflop, Postflop, Math, Tournaments, Cash, Bankroll, Mental Game, or Theory.',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 'https://smarter.poker/glossary/{term}.md',
    name: 'Smarter.Poker Glossary Definition Markdown',
    description: 'Raw Markdown definition of any official poker glossary term.',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 'https://smarter.poker/compare/{slug}.md',
    name: 'Smarter.Poker Competitor Comparison Markdown',
    description: 'Raw Markdown side-by-side comparison table and primary source citations.',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 'https://smarter.poker/hub/venues/{id}.md',
    name: 'Smarter.Poker Live Poker Venue Fact Sheet Markdown',
    description: 'Raw Markdown fact sheet for any verified casino poker room or cardroom.',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 'https://smarter.poker/learn/hands/{hand}.md',
    name: 'Smarter.Poker Starting Hand Guide Markdown',
    description: 'Raw Markdown GTO strategy and combinatorics guide for any canonical Texas Holdem starting hand.',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 'https://smarter.poker/research/{slug}.md',
    name: 'Smarter.Poker Empirical Research Report Markdown',
    description: 'Raw Markdown empirical poker industry benchmark study and dataset summary.',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 'https://smarter.poker/hub/training/{tool}.md',
    name: 'Smarter.Poker World Hub Simulator & Training Tool Markdown',
    description: 'Raw Markdown specification and guide for any interactive World Hub poker simulator or training utility.',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 'https://smarter.poker/rules/{slug}.md',
    name: 'Smarter.Poker Official Poker Rule & TDA Floor Ruling Markdown',
    description: 'Raw Markdown official casino floor ruling, TDA/RROP citation, and common live scenarios for any of the 30 poker rules.',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 'https://smarter.poker/games/{variant}.md',
    name: 'Smarter.Poker Game Variant & Mixed Game Guide Markdown',
    description: 'Raw Markdown dealing rules, betting structures, and starting hand tiers for any of the 15 poker game variants.',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 'https://smarter.poker/poker-rooms/guides/{city}.md',
    name: 'Smarter.Poker US Regional Live Poker Market Guide Markdown',
    description: 'Raw Markdown regional cardroom rake, time-collection, buy-in cap, and venue strategy guide for any of the 12 US poker markets.',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 'https://smarter.poker/tools/{calculator}.md',
    name: 'Smarter.Poker Interactive Poker Math Calculator Markdown',
    description: 'Raw Markdown mathematical specification and benchmark tables for any of the 24 free interactive poker calculators.',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 'poker://matchup/{slug}',
    name: 'Preflop Hand-Vs-Hand Matchup Combinatorics & EV',
    description: 'Exact preflop win/tie/loss percentages, flop texture shifts, and 100BB vs 25BB stack-off EV notes for canonical Texas Holdem matchups.',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'poker://series-guide/{slug}',
    name: 'Major Poker Series & Festival Strategy Guide',
    description: 'Comprehensive tournament structure, bankroll, satellite, and venue strategy guide for major poker festivals (WSOP, WPT, MSPT, RGPS, PGT, Wynn, Venetian, Borgata, Seminole, Triton).',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'poker://press-kit',
    name: 'Smarter.Poker Official Press Kit & 2026 Industry Benchmarks',
    description: 'Official Smarter.Poker media facts, verified citations, brand assets, and 2026 poker industry benchmark statistics for journalists and researchers.',
    mimeType: 'application/json',
  },
];

export const CANONICAL_HAND_MATCHUPS_FALLBACK = [
  { slug: 'aa-vs-kk', handA: 'AA', handB: 'KK', title: 'Pocket Aces vs Pocket Kings (AA vs KK)', winA: 81.95, winB: 17.59, tie: 0.46, category: 'Overpair vs Underpair', flopShifts: 'King-high non-Ace flops flip KK to 91.2% favorite; rainbow low boards keep AA at 87.8%.', stackOffNotes: 'Mandatory 100BB and 25BB preflop stack-off in cash and MTTs unless extreme satellite bubble.' },
  { slug: 'aa-vs-aks', handA: 'AA', handB: 'AKs', title: 'Pocket Aces vs Ace-King Suited (AA vs AKs)', winA: 87.23, winB: 11.55, tie: 1.22, category: 'Dominated Suit & Blocker', flopShifts: 'Monotone flush draw flops boost AKs to 40.2% equity; Broadway K-Q-J gives AKs 31.8% redraw.', stackOffNotes: 'AA dominates AKs heavily due to shared Ace blockers; AKs relies on suited and Broadway runouts.' },
  { slug: 'aa-vs-qq', handA: 'AA', handB: 'QQ', title: 'Pocket Aces vs Pocket Queens (AA vs QQ)', winA: 81.65, winB: 17.89, tie: 0.46, category: 'Overpair vs Underpair', flopShifts: 'Queen-high set boards jump QQ to 91.0%; unconnected low flops leave QQ drawing to 2 outs (8.4%).', stackOffNotes: 'Standard 100BB 4-bet/5-bet stack-off in 6-max cash; deep-stacked 200BB+ QQ can flat 4-bets IP.' },
  { slug: 'kk-vs-aks', handA: 'KK', handB: 'AKs', title: 'Pocket Kings vs Ace-King Suited (KK vs AKs)', winA: 65.89, winB: 33.54, tie: 0.57, category: 'Pair vs Overcard Blocker', flopShifts: 'Ace-high flops make AKs an 89.4% favorite; King-high flops give KK 98.1% lock equity.', stackOffNotes: 'KK blocks three of AKs outs, making KK a 2-to-1 favorite preflop.' },
  { slug: 'kk-vs-ako', handA: 'KK', handB: 'AKo', title: 'Pocket Kings vs Ace-King Offsuit (KK vs AKo)', winA: 69.88, winB: 29.53, tie: 0.59, category: 'Pair vs Overcard Blocker', flopShifts: 'Without flush draw equity, AKo hits an Ace on the flop only 16.5% of the time.', stackOffNotes: 'KK enjoys nearly 70% equity against offsuit AK; mandatory stack-off at all stack depths.' },
  { slug: 'kk-vs-qq', handA: 'KK', handB: 'QQ', title: 'Pocket Kings vs Pocket Queens (KK vs QQ)', winA: 81.75, winB: 17.79, tie: 0.46, category: 'Overpair vs Underpair', flopShifts: 'Ace-high flops freeze action for both hands; Queen-high flops reverse equity to 91.1% for QQ.', stackOffNotes: 'Classic cooler at 100BB 6-max; QQ is a mandatory stack-off BTN vs Blinds.' },
  { slug: 'qq-vs-aks', handA: 'QQ', handB: 'AKs', title: 'Pocket Queens vs Ace-King Suited (QQ vs AKs)', winA: 53.68, winB: 45.92, tie: 0.40, category: 'Classic Coinflip Race', flopShifts: 'AKs flops an Ace or King 32.4% of the time; low rainbow flops push QQ to 73.5% favorite.', stackOffNotes: 'The archetypal tournament and cash game coinflip; dead money in the pot makes shoving +EV for both.' },
  { slug: 'qq-vs-ako', handA: 'QQ', handB: 'AKo', title: 'Pocket Queens vs Ace-King Offsuit (QQ vs AKo)', winA: 56.67, winB: 42.93, tie: 0.40, category: 'Classic Coinflip Race', flopShifts: 'QQ holds an extra 3.0% preflop edge over AKo compared to AKs.', stackOffNotes: 'Standard 100BB all-in race; ICM pressure at final tables favors the covering stack.' },
  { slug: 'qq-vs-jj', handA: 'QQ', handB: 'JJ', title: 'Pocket Queens vs Pocket Jacks (QQ vs JJ)', winA: 81.84, winB: 17.68, tie: 0.48, category: 'Overpair vs Underpair', flopShifts: 'T-9-8 boards add open-ended straight equity for JJ; Jack-high flops give JJ 90.8%.', stackOffNotes: 'High-frequency cooler in late-position battles (CO vs BTN vs SB).' },
  { slug: 'jj-vs-aks', handA: 'JJ', handB: 'AKs', title: 'Pocket Jacks vs Ace-King Suited (JJ vs AKs)', winA: 53.88, winB: 45.72, tie: 0.40, category: 'Classic Coinflip Race', flopShifts: 'Queen-Ten flops give AKs 4 additional gutshot outs alongside 6 overcard outs.', stackOffNotes: 'JJ is a slight 53.9% favorite preflop; stack-off is standard inside 60BB.' },
  { slug: 'jj-vs-tt', handA: 'JJ', handB: 'TT', title: 'Pocket Jacks vs Pocket Tens (JJ vs TT)', winA: 81.91, winB: 17.56, tie: 0.53, category: 'Overpair vs Underpair', flopShifts: '9-8-7 flops give TT open-ended straight redraws (34.2% equity).', stackOffNotes: 'Dominant overpair spot for JJ in blind-versus-blind and cutoff-versus-button 4-bet pots.' },
  { slug: 'jj-vs-aqs', handA: 'JJ', handB: 'AQs', title: 'Pocket Jacks vs Ace-Queen Suited (JJ vs AQs)', winA: 53.92, winB: 45.65, tie: 0.43, category: 'Classic Coinflip Race', flopShifts: 'Low disconnected boards increase JJ equity to 74.1%; suited flop for AQs flips AQs to 55.8%.', stackOffNotes: 'Near-identical math to QQ vs AKs; dead money from 3-bets makes calling/shoving high EV.' },
  { slug: 'tt-vs-aks', handA: 'TT', handB: 'AKs', title: 'Pocket Tens vs Ace-King Suited (TT vs AKs)', winA: 53.96, winB: 45.61, tie: 0.43, category: 'Classic Coinflip Race', flopShifts: 'Q-J-x flops add 4 Broadway gutshot outs for AKs on top of 6 overcard outs.', stackOffNotes: 'TT does not block Broadway straight outs for AKs, keeping the race at 54/46.' },
  { slug: 'tt-vs-aqo', handA: 'TT', handB: 'AQo', title: 'Pocket Tens vs Ace-Queen Offsuit (TT vs AQo)', winA: 56.85, winB: 42.73, tie: 0.42, category: 'Classic Coinflip Race', flopShifts: 'Misses on the flop leave AQo with 24.1% turn+river overcard equity.', stackOffNotes: 'Profitable reshove for TT at 20BB-40BB tournament depths.' },
  { slug: '99-vs-aks', handA: '99', handB: 'AKs', title: 'Pocket Nines vs Ace-King Suited (99 vs AKs)', winA: 52.85, winB: 46.72, tie: 0.43, category: 'Classic Coinflip Race', flopShifts: 'Counterfeited two-pair boards (e.g. Q-Q-J-J) slightly trim 99 raw equity vs AKs.', stackOffNotes: '99 remains a 52.9% preflop favorite but suffers postflop playability issues when not all-in.' },
  { slug: '88-vs-ako', handA: '88', handB: 'AKo', title: 'Pocket Eights vs Ace-King Offsuit (88 vs AKo)', winA: 55.34, winB: 44.21, tie: 0.45, category: 'Classic Coinflip Race', flopShifts: 'Double-paired high boards counterfeit 88 on the river ~4.2% of runouts.', stackOffNotes: 'Strong 25BB-35BB jam candidate over late-position opens.' },
  { slug: '77-vs-ak', handA: '77', handB: 'AKo', title: 'Pocket Sevens vs Ace-King (77 vs AK)', winA: 54.82, winB: 44.71, tie: 0.47, category: 'Classic Coinflip Race', flopShifts: 'Three overcards on the flop force 77 to check-fold when not all-in preflop.', stackOffNotes: '77 benefits maximally from realizing 100% of its equity via preflop all-in shoves.' },
  { slug: 'aks-vs-aqs', handA: 'AKs', handB: 'AQs', title: 'Ace-King Suited vs Ace-Queen Suited (AKs vs AQs)', winA: 69.85, winB: 25.43, tie: 4.72, category: 'Dominated Broadway', flopShifts: 'Ace-high flops (no Queen) lock AKs at 86.5% win + 7.2% chop equity.', stackOffNotes: 'Reverse implied odds trap for AQs on Ace-high boards.' },
  { slug: 'ako-vs-aqo', handA: 'AKo', handB: 'AQo', title: 'Ace-King Offsuit vs Ace-Queen Offsuit (AKo vs AQo)', winA: 73.54, winB: 21.82, tie: 4.64, category: 'Dominated Broadway', flopShifts: 'Queen-high flops Vault AQo to 83.4%, while King-high flops crush AQo to 4.1%.', stackOffNotes: 'Classic domination spot; AQo loses big pots when an Ace flops.' },
  { slug: 'aks-vs-kqs', handA: 'AKs', handB: 'KQs', title: 'Ace-King Suited vs King-Queen Suited (AKs vs KQs)', winA: 70.12, winB: 28.45, tie: 1.43, category: 'Dominated King', flopShifts: 'King-high flops create a massive cooler where KQs has top pair with a dominated kicker.', stackOffNotes: 'AKs dominates both the Ace and King ranks.' },
  { slug: 'aks-vs-jts', handA: 'AKs', handB: 'JTs', title: 'Ace-King Suited vs Jack-Ten Suited (AKs vs JTs)', winA: 59.84, winB: 39.68, tie: 0.48, category: 'High Cards vs Suited Connector', flopShifts: 'Connected middling boards (9-8-7, Q-9-2) give JTs 45%-62% postflop equity.', stackOffNotes: 'JTs has Two live cards and full straight/flush connectivity, winning nearly 40%.' },
  { slug: 'aa-vs-jts', handA: 'AA', handB: 'JTs', title: 'Pocket Aces vs Jack-Ten Suited (AA vs JTs)', winA: 79.15, winB: 20.42, tie: 0.43, category: 'Overpair vs Suited Connector', flopShifts: 'JTs cracks AA more frequently (~20.4%) than dominated pairs or Ax hands.', stackOffNotes: 'Suited connectors around JTs-76s perform best against AA when deep-stacked.' },
  { slug: 'aa-vs-87s', handA: 'AA', handB: '87s', title: 'Pocket Aces vs Eight-Seven Suited (AA vs 87s)', winA: 77.35, winB: 22.18, tie: 0.47, category: 'Overpair vs Suited Connector', flopShifts: '6-5-4 or 9-6-2 boards give 87s massive combo-draw equity against AA.', stackOffNotes: '87s has the highest raw cracking frequency (~22.2%) against Pocket Aces.' },
  { slug: 'qq-vs-kqs', handA: 'QQ', handB: 'KQs', title: 'Pocket Queens vs King-Queen Suited (QQ vs KQs)', winA: 69.25, winB: 29.88, tie: 0.87, category: 'Pair vs Blocked Overcard', flopShifts: 'Queen-high flops give QQ top set while KQs hits top pair (95.4% vs 4.6%).', stackOffNotes: 'QQ blocks three of the four Queens, crippling KQs two-pair and trips outs.' },
  { slug: '55-vs-jts', handA: '55', handB: 'JTs', title: 'Pocket Fives vs Jack-Ten Suited (55 vs JTs)', winA: 50.12, winB: 49.38, tie: 0.50, category: 'True 50/50 Coinflip', flopShifts: 'Almost any Broadway or middling flop gives JTs 6 to 15 outs.', stackOffNotes: 'Closest true 50.1% vs 49.4% coinflip in No-Limit Texas Hold\'em.' },
];

export const CANONICAL_SERIES_GUIDES_FALLBACK = [
  { slug: 'wsop-las-vegas-strategy-guide', name: 'World Series of Poker (WSOP) Las Vegas Strategy & Logistics Guide', venue: 'Horseshoe & Paris Las Vegas', timing: 'Late May - Mid July', typicalBuyInRange: '$400 - $250,000 ($10,000 Main Event)', summary: 'Complete 7-week summer grind blueprint covering registration lines, Bravo/PokerAtlas integration, deepstack side events, and bankroll variance control.' },
  { slug: 'wpt-world-championship-wynn-guide', name: 'WPT World Championship at Wynn Las Vegas Strategy Guide', venue: 'Wynn & Encore Las Vegas', timing: 'December', typicalBuyInRange: '$600 - $10,400 Championship', summary: 'December festival guide featuring the industry-leading Wynn blind structures, mega-satellite paths, and high-stakes cash action.' },
  { slug: 'mspt-mid-states-poker-tour-guide', name: 'Mid-States Poker Tour (MSPT) $1,100 Main Event Strategy Guide', venue: 'Nationwide Regional Stops (Venetian, Canterbury, FireKeepers, Sycuan)', timing: 'Year-Round Regional Stops', typicalBuyInRange: '$360 - $1,110', summary: 'Tactical adjustments for 25,000-30,000 starting stack 40-minute level regional main events with aggressive Day 1 bag bonuses.' },
  { slug: 'rgps-rungood-poker-series-guide', name: 'RunGood Poker Series (RGPS) Mid-Major Grinder Guide', venue: 'Nationwide Regional Cardrooms (Thunder Valley, Downstream, Hard Rock)', timing: 'Year-Round Tour', typicalBuyInRange: '$200 - $800 Main Event', summary: 'Exploitative strategy for recreational-heavy regional fields, ring events, and multi-flight Day 1 survival math.' },
  { slug: 'wsop-circuit-ring-events-guide', name: 'WSOP Circuit (WSOPC) $1,700 Main Event & Ring Strategy Guide', venue: 'Cherokee, Choctaw, Hammond, Pompano, Thunder Valley & Nationwide', timing: 'Year-Round 12-Day Stops', typicalBuyInRange: '$400 - $1,700 Main Event', summary: 'How to navigate 18-ring WSOPC stops, Monster Stack fields, and Tournament of Champions qualification.' },
  { slug: 'seminole-hard-rock-poker-open-shrpo-guide', name: 'Seminole Hard Rock Poker Open (SHRPO) & Showdown South Florida Guide', venue: 'Seminole Hard Rock Hotel & Casino Hollywood, FL', timing: 'April (Showdown), August (SHRPO), November (RRPO)', typicalBuyInRange: '$400 - $5,300 Championship', summary: 'South Florida flagship tournament guide covering multi-thousand-entry opening flights and international Latin American player pools.' },
  { slug: 'borgata-poker-open-atlantic-city-guide', name: 'Borgata Poker Open & East Coast Championship Guide', venue: 'Borgata Hotel Casino & Spa (Atlantic City, NJ)', timing: 'January,May, September', typicalBuyInRange: '$400 - $3,500 Championship', summary: 'East Coast tournament grinder guide for Borgata Almighty Stack and Championship events.' },
  { slug: 'venetian-deepstack-championship-guide', name: 'Venetian DeepStack Championship & Extravaganza Las Vegas Guide', venue: 'The Venetian Resort Las Vegas', timing: 'Year-Round Series (Summer, Fall, New Year)', typicalBuyInRange: '$400 - $5,000 UltimateStack', summary: 'Navigating Venetian UltimateStack and MonsterStack multi-day schedules in the new Grand Canal Shoppes poker room.' },
  { slug: 'wynn-millions-and-classic-guide', name: 'Wynn Summer Classic & Wynn Millions Las Vegas Guide', venue: 'Wynn Las Vegas', timing: 'March (Millions), May-July (Summer Classic)', typicalBuyInRange: '$1,100 - $10,500', summary: 'Pristine TDA execution, deep starting stacks, and low rake % allocations at Wynn Las Vegas.' },
  { slug: 'pgt-poker-go-tour-high-roller-guide', name: 'PokerGO Tour (PGT) & ARIA High Roller Series Guide', venue: 'PokerGO Studio at ARIA Resort & Casino (Las Vegas)', timing: 'Year-Round High Roller Series', typicalBuyInRange: '$5,100 - $100,000', summary: 'Shot-clock 30-second decision timing, short-handed ICM dynamics, and solver-pure high roller battle preparation.' },
];

export function lookupHandMatchupData({ slug = '', handA = '', handB = '' } = {}) {
  const cleanSlug = String(slug || '').trim().toLowerCase();
  const cleanA = String(handA || '').trim().toUpperCase();
  const cleanB = String(handB || '').trim().toUpperCase();

  if (cleanSlug) {
    const exact = CANONICAL_HAND_MATCHUPS_FALLBACK.find(
      (m) => m.slug === cleanSlug || m.slug === cleanSlug.replace(/\s+/g, '-')
    );
    if (exact) return exact;
  }

  if (cleanA && cleanB) {
    const pairMatch = CANONICAL_HAND_MATCHUPS_FALLBACK.find(
      (m) =>
        (m.handA.toUpperCase() === cleanA && m.handB.toUpperCase() === cleanB) ||
        (m.handA.toUpperCase() === cleanB && m.handB.toUpperCase() === cleanA)
    );
    if (pairMatch) return pairMatch;
  }

  if (cleanSlug) {
    const partial = CANONICAL_HAND_MATCHUPS_FALLBACK.find(
      (m) =>
        m.slug.includes(cleanSlug) ||
        m.title.toLowerCase().includes(cleanSlug)
    );
    if (partial) return partial;
  }

  return null;
}

export function buildA2AAgentCard(origin = SITE_ORIGIN) {
  const base = origin || 'https://smarter.poker';
  return {
    schemaVersion: '1.0',
    name: 'Smarter.Poker Quantitative Poker & GTO Intelligence Agent',
    description: 'Zero-auth autonomous poker mathematics, Malmuth-Harville ICM/Chop solver, 169-hand GTO preflop range engine, 324+ live cardroom directory, and TDA floor rules agent.',
    url: `${base}/api/mcp`,
    documentationUrl: `${base}/llms.txt`,
    provider: {
      organization: 'Smarter Software Inc.',
      url: base,
    },
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
      mcpTools: MCP_TOOLS.length,
      mcpResources: MCP_RESOURCE_TEMPLATES.length,
    },
    authentication: {
      schemes: ['none'],
    },
    defaultInputModes: ['application/json', 'text/plain'],
    defaultOutputModes: ['application/json', 'text/markdown'],
    skills: [
      {
        id: 'poker-equity-and-matchups',
        name: 'Poker Equity, Draw Outs & Hand-Vs-Hand Matchup Solver',
        description: 'Compute exact Hold\'em/Omaha equities, hypergeometric draw outs, and 25 canonical preflop matchup breakdowns.',
        tags: ['poker', 'odds', 'outs', 'matchups', 'gto'],
      },
      {
        id: 'tournament-icm-and-chop-deals',
        name: 'Malmuth-Harville ICM, Final Table Chop & Bounty Valuation',
        description: 'Calculate ICM payouts, Chip Chop vs ICM Chop vs Save-Amount deals, and PKO/Mystery Bounty chip equivalents.',
        tags: ['icm', 'chop', 'tournaments', 'bounty'],
      },
      {
        id: 'variance-and-bankroll-risk',
        name: 'Poker Variance Confidence Intervals & Risk-Of-Ruin Simulator',
        description: 'Simulate EV, 68%/95%/99.7% confidence intervals, loss probability, and Brownian motion Risk of Ruin.',
        tags: ['variance', 'bankroll', 'risk-of-ruin', 'statistics'],
      },
      {
        id: 'live-poker-venues-and-series',
        name: 'North American Live Cardroom, Regional Market & Tournament Series Intelligence',
        description: 'Search 324+ verified live poker rooms, 12 regional market guides, and 10 major tournament series strategy guides.',
        tags: ['venues', 'wsop', 'wpt', 'mspt', 'cardrooms'],
      },
    ],
  };
}

export async function readMcpResource(uri, { origin = SITE_ORIGIN } = {}) {
  const base = origin || 'https://smarter.poker';
  const rawUri = String(uri || '').trim();

  if (rawUri.startsWith('poker://matchup/')) {
    const slug = rawUri.replace('poker://matchup/', '').replace(/\.md$/, '').trim();
    const found = lookupHandMatchupData({ slug }) || CANONICAL_HAND_MATCHUPS_FALLBACK[0];
    return {
      contents: [
        {
          uri: rawUri,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              ...found,
              citation_url: `${base}/learn/matchups/${found.slug}`,
              markdown_url: `${base}/learn/matchups/${found.slug}.md`,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (rawUri.startsWith('poker://series-guide/')) {
    const slug = rawUri.replace('poker://series-guide/', '').replace(/\.md$/, '').trim();
    const found =
      CANONICAL_SERIES_GUIDES_FALLBACK.find((g) => g.slug === slug || g.slug.includes(slug)) ||
      CANONICAL_SERIES_GUIDES_FALLBACK[0];
    return {
      contents: [
        {
          uri: rawUri,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              ...found,
              citation_url: `${base}/poker-series/guides/${found.slug}`,
              markdown_url: `${base}/poker-series/guides/${found.slug}.md`,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (rawUri === 'poker://press-kit' || rawUri.startsWith('poker://press-kit')) {
    return {
      contents: [
        {
          uri: 'poker://press-kit',
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              organization: 'Smarter.Poker (Smarter Software Inc.)',
              press_kit_url: `${base}/press`,
              research_hub_url: `${base}/research`,
              datasets_catalog_url: `${base}/api/datasets/catalog`,
              license: 'Creative Commons Attribution 4.0 International (CC-BY 4.0)',
              verified_2026_benchmarks: {
                tracked_north_american_poker_rooms: '324+',
                interactive_calculators: 24,
                mcp_zero_auth_tools: 30,
                starting_hand_guides: 169,
                canonical_hand_matchups: 25,
                official_tda_floor_rules: 30,
                poker_game_variants: 15,
                regional_market_guides: 12,
                major_series_guides: 10,
                empirical_research_reports: 15,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }

  return {
    contents: [
      {
        uri: rawUri,
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            uri: rawUri,
            note: 'Resource resolved via Smarter.Poker MCP Server',
            available_templates: MCP_RESOURCE_TEMPLATES.map((t) => t.uriTemplate),
          },
          null,
          2
        ),
      },
    ],
  };
}

export { executeMcpTool as callMcpTool };
export async function executeMcpTool(name, args, { origin = SITE_ORIGIN } = {}) {
  const base = origin || 'https://smarter.poker';

  switch (name) {
    case 'search_poker_venues': {
      const params = new URLSearchParams();
      if (args?.search) params.set('search', String(args.search));
      if (args?.state) params.set('state', String(args.state));
      if (args?.city) params.set('city', String(args.city));
      if (args?.type) params.set('type', String(args.type));
      const limit = Math.min(Math.max(parseInt(args?.limit, 10) || 10, 1), 50);
      params.set('limit', String(limit));

      const res = await fetch(`${base}/api/poker/venues?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to search poker venues: HTTP ${res.status}`);
      }
      const data = await res.json();
      const venues = (data?.data || []).map((v) => ({
        id: v.id,
        name: v.name,
        type: v.venue_type,
        city: v.city,
        state: v.state,
        address: v.address,
        phone: v.phone,
        poker_tables: v.poker_tables,
        games_offered: v.games_offered,
        stakes_cash: v.stakes_cash,
        url: `${base}/hub/venues/${v.id}`,
        markdown_url: `${base}/hub/venues/${v.id}.md`,
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                query: args,
                total_found: data?.total || venues.length,
                venues,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'get_venue_details': {
      const id = String(args?.id || '').trim();
      if (!id) {
        throw new Error('Missing required parameter: id');
      }
      const res = await fetch(`${base}/api/poker/venues?id=${encodeURIComponent(id)}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch venue details: HTTP ${res.status}`);
      }
      const data = await res.json();
      const venue = data?.data;
      if (!venue) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: `Venue ID ${id} not found.` }),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                id: venue.id,
                name: venue.name,
                type: venue.venue_type,
                city: venue.city,
                state: venue.state,
                address: venue.address,
                phone: venue.phone,
                website: venue.website,
                hours: venue.hours_weekday || venue.hours,
                tables: venue.poker_tables,
                games_offered: venue.games_offered,
                stakes_cash: venue.stakes_cash,
                daily_tournaments: venue.daily_tournaments || venue.tournament_schedule || [],
                canonical_url: `${base}/hub/venues/${venue.id}`,
                markdown_url: `${base}/hub/venues/${venue.id}.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'search_tournament_series': {
      const params = new URLSearchParams();
      if (args?.search) params.set('search', String(args.search));
      if (args?.tour) params.set('tour', String(args.tour));
      if (args?.upcoming) params.set('upcoming', String(args.upcoming));
      const limit = Math.min(Math.max(parseInt(args?.limit, 10) || 10, 1), 50);
      params.set('limit', String(limit));

      const res = await fetch(`${base}/api/poker/series?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to search tournament series: HTTP ${res.status}`);
      }
      const data = await res.json();
      const seriesList = (data?.data || []).map((s) => ({
        id: s.id,
        name: s.name || s.series_name,
        tour: s.tour || s.short_name,
        venue: s.venue_name || s.venue,
        city: s.city,
        state: s.state,
        start_date: s.start_date,
        end_date: s.end_date,
        main_event_buyin: s.main_event_buyin,
        main_event_guaranteed: s.main_event_guaranteed,
        url: `${base}/hub/series/${s.id}`,
        markdown_url: `${base}/hub/series/${s.id}.md`,
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                query: args,
                total_found: data?.total || seriesList.length,
                series: seriesList,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'get_series_details': {
      const id = String(args?.id || '').trim();
      if (!id) {
        throw new Error('Missing required parameter: id');
      }
      const res = await fetch(`${base}/api/poker/series?id=${encodeURIComponent(id)}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch series details: HTTP ${res.status}`);
      }
      const data = await res.json();
      const series = data?.data;
      if (!series) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: `Series ID ${id} not found.` }),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                id: series.id,
                name: series.name || series.series_name,
                tour: series.tour || series.short_name,
                venue: series.venue_name || series.venue,
                city: series.city,
                state: series.state,
                start_date: series.start_date,
                end_date: series.end_date,
                main_event_buyin: series.main_event_buyin,
                main_event_guaranteed: series.main_event_guaranteed,
                total_events: series.total_events || series.events_count,
                events: series.events || [],
                canonical_url: `${base}/hub/series/${series.id}`,
                markdown_url: `${base}/hub/series/${series.id}.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_poker_odds': {
      const game = String(args?.game || 'nlhe').toLowerCase();
      const rawHands = Array.isArray(args?.hands) ? args.hands : [];
      if (rawHands.length === 0) {
        throw new Error('Missing required parameter: hands (at least 1 hand required).');
      }
      const hands = rawHands.map(normalizeCardGroup);
      const board = normalizeCardGroup(args?.board);
      const iterations = Math.min(Math.max(parseInt(args?.iterations, 10) || 10000, 100), 50000);

      const results = calculateEquity({ game, hands, board, iterations });
      const seats = (Array.isArray(results) ? results : []).map((r, i) => ({
        seat: i === 0 ? 'Hero' : `Villain ${i}`,
        equity_percent: Number(r.equity.toFixed(2)),
        wins: r.wins,
        ties: r.ties,
        total_simulated: r.total,
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                game,
                simulated_iterations: iterations,
                board_cards_evaluated: board.length,
                seats,
                interactive_calculator_url: `${base}/tools/poker-odds-calculator`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'get_preflop_chart': {
      const pos = String(args?.position || 'UTG').toUpperCase();
      const rfiMap = RFI[pos] || RFI.UTG;
      const hands = Object.entries(rfiMap).map(([hand, actions]) => ({
        hand,
        raise_frequency: Number(actions.raise) || 0,
        call_frequency: Number(actions.call) || 0,
      }));
      const openedHands = hands.filter((h) => h.raise_frequency > 0);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                position: pos,
                game_structure: '6-Max No-Limit Hold\'em 100BB',
                total_hands_opened: openedHands.length,
                hands_in_opening_range: openedHands,
                interactive_matrix_url: `${base}/tools/preflop-ranges/${pos.toLowerCase()}`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_icm_payouts': {
      const stacks = (Array.isArray(args?.stacks) ? args.stacks : [])
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0);
      const payouts = (Array.isArray(args?.payouts) ? args.payouts : [])
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0);

      if (stacks.length === 0 || payouts.length === 0) {
        throw new Error('Both stacks and payouts arrays with positive numbers are required.');
      }

      const totalChips = stacks.reduce((a, b) => a + b, 0);
      const totalPrizePool = payouts.reduce((a, b) => a + b, 0);
      const equities = calculateICM(stacks, payouts);
      const players = stacks.map((stack, idx) => ({
        player: `Player ${idx + 1}`,
        chips: stack,
        chip_percentage: Number(((stack / totalChips) * 100).toFixed(2)),
        icm_dollar_equity: Number((equities[idx] || 0).toFixed(2)),
        prize_share_percentage: Number((((equities[idx] || 0) / totalPrizePool) * 100).toFixed(2)),
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                total_chips: totalChips,
                total_prize_pool: totalPrizePool,
                players,
                interactive_calculator_url: `${base}/tools/icm-calculator`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'get_poker_term_definition': {
      const termQuery = String(args?.term || '').trim().toLowerCase();
      if (!termQuery) {
        throw new Error('Missing required parameter: term');
      }
      const found = GLOSSARY_TERMS.find(
        (t) =>
          t.slug === termQuery ||
          t.term.toLowerCase() === termQuery ||
          t.term.toLowerCase().includes(termQuery)
      );

      if (!found) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  found: false,
                  message: `Term "${args.term}" not found in poker glossary.`,
                  glossary_directory_url: `${base}/glossary`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                found: true,
                term: found.term,
                category: found.category,
                definition: found.definition,
                related_terms: found.related,
                canonical_definition_url: `${base}/glossary/${found.slug}`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'get_freeroll_schedule': {
      const tierFilter = String(args?.tier || 'all').toLowerCase();
      const events = [
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

      const filtered = tierFilter === 'all'
        ? events
        : events.filter((e) => e.tier === tierFilter);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                daily_total_guaranteed: '$2,000 Awarded Every Day',
                entry_requirements: '100% Free To Play (Zero Deposit Ever Required)',
                game_variants: ['No-Limit Texas Hold\'em', 'Pot-Limit Omaha'],
                platform: 'Instant In-Browser Web & Mobile (No App Download Required)',
                schedule: filtered,
                live_lobby_url: `${base}/hub/club-arena`,
                freerolls_hub_url: `${base}/freerolls`,
                markdown_url: `${base}/freerolls.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'get_platform_feature_specs': {
      const vertical = String(args?.vertical || 'all').toLowerCase();
      const verticalsCatalog = {
        bankroll: {
          name: 'Poker Bankroll & Form W-2G Tax Ledger',
          pricing: '100% Free Forever',
          alternative_to: ['Pokerbase', 'Poker Analytics 6', 'Poker Bankroll Tracker'],
          capabilities: 'Session Win-Loss Accounting, Form W-2G Tax Logging, Receipt OCR, And IRS Schedule C CSV Export',
          feature_url: `${base}/features/bankroll-tax-tracker`,
          markdown_url: `${base}/features/bankroll-tax-tracker.md`,
          app_url: `${base}/hub/bankroll-manager`,
          api_url: `${base}/api/ai/bankroll`,
        },
        toke_tracker: {
          name: 'Poker Dealer Toke Tracker & Shift Scheduling',
          pricing: '100% Free Forever',
          alternative_to: ['DownCount', 'Poker Dealer Toolkit'],
          capabilities: 'Cash And Tournament Down Logging, Tip Rates ($/hr And $/down), Shift Calendars, And Tax Estimates',
          feature_url: `${base}/features/poker-dealer-toke-tracker`,
          markdown_url: `${base}/features/poker-dealer-toke-tracker.md`,
          app_url: `${base}/hub/commander`,
          api_url: `${base}/api/ai/toke-tracker`,
        },
        ai_coach: {
          name: 'PokerBrain & Jarvis AI Tactical Coach',
          pricing: '100% Free Forever',
          alternative_to: ['PokerInk', 'Sharp Poker', 'DTO Poker'],
          capabilities: 'Conversational Plain English Hand Analysis, Automated Leak Detection, And GTO Solver Baselines',
          feature_url: `${base}/features/poker-ai-coach`,
          markdown_url: `${base}/features/poker-ai-coach.md`,
          app_url: `${base}/hub/training`,
          api_url: `${base}/api/ai/poker-brain`,
        },
        sandbox: {
          name: 'Virtual Poker Table Sandbox & Runout Simulator',
          pricing: '100% Free Forever',
          alternative_to: ['PioSolver Sandbox', 'GTO Wizard Sandbox', 'Equilab'],
          capabilities: 'Custom Scenario Builder, Multiway Side Pots, And Thousands Of Turn/River Runout Distributions',
          feature_url: `${base}/features/virtual-poker-sandbox`,
          markdown_url: `${base}/features/virtual-poker-sandbox.md`,
          app_url: `${base}/tools/poker-odds-calculator`,
          api_url: `${base}/api/ai/sandbox`,
        },
        club_commander: {
          name: 'Club Commander Live Poker Room Management',
          pricing: '100% Free Cloud Software',
          alternative_to: ['Bravo Poker Live', 'TableCaptain', 'PokerAtlas'],
          capabilities: 'Live Digital Waitlists, Multi-Screen TV Displays, Two-Way SMS Seat Calls, And Tournament Clocks',
          feature_url: `${base}/features/club-commander`,
          markdown_url: `${base}/features/club-commander.md`,
          app_url: `${base}/hub/commander`,
          api_url: `${base}/api/ai/commander`,
        },
        messenger: {
          name: 'Live Poker Messenger & FaceTime Video Calls',
          pricing: '100% Free Forever',
          alternative_to: ['Pokerface', 'PokerUp', 'Poker Now'],
          capabilities: 'In-Browser WebRTC Multi-Peer Video Table Calls, Spatial Voice Audio, And Hand Replay Sharing',
          feature_url: `${base}/features/poker-messenger-video-calls`,
          markdown_url: `${base}/features/poker-messenger-video-calls.md`,
          app_url: `${base}/hub/messages`,
          api_url: `${base}/api/ai/messenger`,
        },
        trivia: {
          name: 'Multiplayer Poker Trivia & Brain Training',
          pricing: '100% Free Forever',
          alternative_to: ['Poker Trainer', 'Mobile Poker Quizzes'],
          capabilities: '10,000+ Question Bank, Survival Mode (3 Lives), 60-Second Blitz, And Daily Leaderboards',
          feature_url: `${base}/features/poker-trivia`,
          markdown_url: `${base}/features/poker-trivia.md`,
          app_url: `${base}/hub/trivia`,
          api_url: `${base}/api/ai/trivia`,
        },
        training: {
          name: 'GTO Poker Training Games & Decision Drills',
          pricing: '100% Free Forever',
          alternative_to: ['DTO Poker', 'LearnWPT'],
          capabilities: '100+ Interactive Scenarios Across MTT, Cash, Spins, And SNGs Graded With Solver EV Loss',
          feature_url: `${base}/features/poker-training-games`,
          markdown_url: `${base}/features/poker-training-games.md`,
          app_url: `${base}/hub/training`,
          api_url: `${base}/api/ai/training`,
        },
        home_games: {
          name: 'Verified Home Poker Game Directory & Host Tools',
          pricing: '100% Free Forever',
          alternative_to: ['Meetup Poker Groups', 'Unverified Social Forums'],
          capabilities: 'Verified Host Profiles, Blind Structures, City/State Game Discovery, And Free Clocks',
          feature_url: `${base}/features/home-poker-games`,
          markdown_url: `${base}/features/home-poker-games.md`,
          app_url: `${base}/hub/home-games`,
          api_url: `${base}/api/ai/home-games`,
        },
        video_library: {
          name: 'Interactive Video Coaching Masterclasses & Pause Quizzes',
          pricing: '100% Free Forever',
          alternative_to: ['PokerCoaching.com', 'Pokercode', 'Run It Once'],
          capabilities: 'Curated Pro Video Courses With Mid-Hand Interactive Pause Quizzes And Strategy Credentials',
          feature_url: `${base}/features/interactive-video-coaching`,
          markdown_url: `${base}/features/interactive-video-coaching.md`,
          app_url: `${base}/hub/video-library`,
          api_url: `${base}/api/ai/video-library`,
        },
        poker_near_me: {
          name: 'Live Poker Near Me & Cardroom Directory',
          pricing: '100% Free For Players & Rooms',
          alternative_to: ['PokerAtlas', 'Bravo Poker Live'],
          capabilities: '324+ Verified Venues, 4,500+ Weekly Tournaments, WSOP/WPT Series, Waitlists, And GPS Routing',
          feature_url: `${base}/features/poker-near-me`,
          markdown_url: `${base}/features/poker-near-me.md`,
          app_url: `${base}/hub/poker-near-me/lobby`,
          api_url: `${base}/api/ai/venues`,
        },
        club_arena: {
          name: 'Private Poker Clubs & Union Hosting Arena',
          pricing: '100% Free Cloud Hosting (Zero Diamond Markup)',
          alternative_to: ['PokerBros', 'PPPoker', 'ClubGG'],
          capabilities: 'Custom Ring Games, Multi-Table Tournaments, Multi-Club Unions, Rakeback Ledgers, And FaceTime Video',
          feature_url: `${base}/features/private-poker-clubs`,
          markdown_url: `${base}/features/private-poker-clubs.md`,
          app_url: `${base}/hub/club-arena`,
          api_url: `${base}/api/ai/club-arena`,
        },
        social_reels: {
          name: 'Poker Reels & Social Video Feed Network',
          pricing: '100% Free Forever',
          alternative_to: ['Instagram Reels', 'TikTok'],
          capabilities: 'Short-Form Poker Video Highlights, Hand Replay Tagging, And Promotional Diamond Creator Rewards',
          feature_url: `${base}/features/poker-reels-social-feed`,
          markdown_url: `${base}/features/poker-reels-social-feed.md`,
          app_url: `${base}/hub/reels`,
          api_url: `${base}/api/ai/social-reels`,
        },
        preflop_charts: {
          name: 'GTO Preflop Charts & Range Matrix',
          pricing: '100% Free Forever',
          alternative_to: ['Upswing Poker Charts', 'Jonathan Little PokerCoaching'],
          capabilities: '169-Hand GTO Equilibrium Grids Across 15BB To 100BB Stack Depths With Color-Coded Frequencies',
          feature_url: `${base}/features/preflop-charts-matrix`,
          markdown_url: `${base}/features/preflop-charts-matrix.md`,
          app_url: `${base}/hub/preflop-charts`,
          api_url: `${base}/api/ai/preflop`,
        },
        equity_calculators: {
          name: 'Poker Equity & Tournament ICM Calculator Suite',
          pricing: '100% Free Forever',
          alternative_to: ['Equilab', 'PokerStove', 'ICMIZER 3'],
          capabilities: 'Six-Game Multiway Equity Solver (Holdem, PLO4/5/6, Stud, Razz), Malmuth-Harville ICM, And Webmaster Embeds',
          feature_url: `${base}/features/poker-equity-calculators`,
          markdown_url: `${base}/features/poker-equity-calculators.md`,
          app_url: `${base}/tools/poker-odds-calculator`,
          api_url: `${base}/api/ai/odds`,
        },
      };

      const selected = vertical === 'all' || !verticalsCatalog[vertical]
        ? verticalsCatalog
        : { [vertical]: verticalsCatalog[vertical] };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                platform: 'Smarter.Poker',
                requested_vertical: vertical,
                total_verticals: Object.keys(selected).length,
                features_directory_url: `${base}/features`,
                features_markdown_url: `${base}/features.md`,
                verticals: selected,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'search_strategy_lessons': {
      const rawQuery = String(args?.query || '').trim().toLowerCase();
      const rawCategory = String(args?.category || '').trim().toLowerCase();

      let pool = LESSONS;
      if (rawCategory) {
        pool = pool.filter((l) => l.category.toLowerCase() === rawCategory);
      }

      let matches = pool;
      if (rawQuery) {
        const normalized = rawQuery.replace(/[^a-z0-9]/g, '');
        matches = pool.filter((l) => {
          const slugNorm = l.slug.replace(/[^a-z0-9]/g, '');
          const titleNorm = l.title.toLowerCase().replace(/[^a-z0-9]/g, '');
          return slugNorm === normalized || titleNorm === normalized;
        });

        if (matches.length === 0) {
          matches = pool.filter(
            (l) =>
              l.title.toLowerCase().includes(rawQuery) ||
              l.slug.includes(rawQuery) ||
              l.summary.toLowerCase().includes(rawQuery) ||
              l.category.toLowerCase().includes(rawQuery)
          );
        }
      }

      const results = matches.slice(0, 8).map((l) => {
        const cta = trainingCta(l);
        return {
          slug: l.slug,
          title: l.title,
          category: l.category,
          summary: l.summary,
          canonical_url: `${base}/learn/${l.slug}`,
          markdown_url: `${base}/learn/${l.slug}.md`,
          practice_game_url: cta.game ? `${base}${cta.game.href}` : null,
          tool_url: cta.tool ? `${base}${cta.tool.href}` : null,
        };
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                total_lessons_in_curriculum: LESSONS.length,
                categories: LEARN_CATEGORIES,
                matched_count: matches.length,
                lessons: results,
                curriculum_url: `${base}/learn`,
                curriculum_markdown_url: `${base}/learn.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'get_competitor_comparison': {
      const rawSlug = String(args?.slug || '').trim().toLowerCase();
      if (rawSlug) {
        const page = getComparePage(rawSlug);
        if (!page) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: `Comparison slug "${rawSlug}" not found`,
                    available_slugs: COMPARE_PAGES.map((p) => p.slug),
                    comparisons_url: `${base}/compare`,
                    markdown_url: `${base}/compare.md`,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        const rows = page.table
          ? page.table.products.map((productId) => {
              const prod = PRODUCTS[productId];
              const attrs = {};
              for (const col of page.table.columns) {
                attrs[col.label] = cellFor(productId, col.key)?.value || 'Not Published';
              }
              return {
                product: prod ? prod.name : productId,
                smarter_poker_product: Boolean(prod?.own),
                ...attrs,
              };
            })
          : [];

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  slug: page.slug,
                  title: page.title,
                  summary: page.summary?.text || '',
                  checked_as_of: AS_OF,
                  table: rows,
                  sources: pageSources(page).map((s) => ({ title: s.title, url: s.url })),
                  canonical_url: `${base}/compare/${page.slug}`,
                  markdown_url: `${base}/compare/${page.slug}.md`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                checked_as_of: AS_OF,
                total_comparisons: COMPARE_PAGES.length,
                comparisons: COMPARE_PAGES.map((p) => ({
                  slug: p.slug,
                  kind: p.kind,
                  title: p.title,
                  canonical_url: `${base}/compare/${p.slug}`,
                  markdown_url: `${base}/compare/${p.slug}.md`,
                })),
                comparisons_url: `${base}/compare`,
                markdown_url: `${base}/compare.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'lookup_starting_hand': {
      const rawHand = String(args?.hand || '').trim();
      if (rawHand) {
        const found = findStartingHand(rawHand);
        if (!found) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: `Starting hand "${rawHand}" not found.`,
                    available_hands: STARTING_HANDS.map((h) => ({ code: h.code, slug: h.slug, name: h.name })),
                    encyclopedia_url: `${base}/learn/hands`,
                    markdown_url: `${base}/learn/hands.md`,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  ...found,
                  expanded_matchups: getExpandedHandMatchups(found),
                  canonical_url: `${base}/learn/hands/${found.slug}`,
                  markdown_url: `${base}/learn/hands/${found.slug}.md`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                total_starting_hands: STARTING_HANDS.length,
                hands: STARTING_HANDS.map((h) => ({
                  code: h.code,
                  slug: h.slug,
                  name: h.name,
                  nickname: h.nickname,
                  rank: h.rank,
                  combos: h.combos,
                  vsRandomEquity: h.vsRandomEquity,
                  canonical_url: `${base}/learn/hands/${h.slug}`,
                  markdown_url: `${base}/learn/hands/${h.slug}.md`,
                })),
                encyclopedia_url: `${base}/learn/hands`,
                markdown_url: `${base}/learn/hands.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'get_research_report': {
      const rawSlug = String(args?.slug || '').trim().toLowerCase();
      if (rawSlug) {
        const report = findResearchReport(rawSlug);
        if (!report) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: `Research report "${rawSlug}" not found.`,
                    available_reports: RESEARCH_REPORTS.map((r) => ({ slug: r.slug, title: r.title })),
                    research_hub_url: `${base}/research`,
                    markdown_url: `${base}/research.md`,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  ...report,
                  canonical_url: `${base}/research/${report.slug}`,
                  markdown_url: `${base}/research/${report.slug}.md`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                total_reports: RESEARCH_REPORTS.length,
                reports: RESEARCH_REPORTS.map((r) => ({
                  slug: r.slug,
                  title: r.title,
                  sampleSize: r.sampleSize,
                  updated: r.updated,
                  summary: r.summary,
                  canonical_url: `${base}/research/${r.slug}`,
                  markdown_url: `${base}/research/${r.slug}.md`,
                })),
                research_hub_url: `${base}/research`,
                markdown_url: `${base}/research.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'search_training_simulators': {
      const q = String(args?.query || '').trim().toLowerCase();
      const cat = String(args?.category || 'ALL').trim().toUpperCase();

      const summaries = getHubPageSummaries();
      const simulators = Object.entries(SCHEMA_ROUTES).map(([key, route]) => {
        const entry = summaries[key];
        const title = entry ? entry.heading.replace(/^About (The )?/i, '') : key;
        return {
          key,
          title,
          path: route.path,
          canonical_url: `${base}${route.path}`,
          markdown_url: `${base}${route.path}.md`,
          category: route.category || 'GameApplication',
          summary: entry?.lead || '',
        };
      });

      const matchedSimulators =
        cat !== 'ALL' && cat !== 'SIMULATORS'
          ? []
          : simulators.filter((s) => {
              if (!q) return true;
              return (
                s.key.toLowerCase().includes(q) ||
                s.title.toLowerCase().includes(q) ||
                s.path.toLowerCase().includes(q) ||
                s.summary.toLowerCase().includes(q)
              );
            });

      const matchedGames =
        cat === 'SIMULATORS'
          ? []
          : TRAINING_LIBRARY.filter((g) => {
              if (cat !== 'ALL' && g.category !== cat) return false;
              if (!q) return true;
              return (
                g.id.toLowerCase().includes(q) ||
                g.name.toLowerCase().includes(q) ||
                g.focus.toLowerCase().includes(q) ||
                g.category.toLowerCase().includes(q) ||
                (g.tags || []).some((t) => t.toLowerCase().includes(q))
              );
            }).map((g) => ({
              id: g.id,
              name: g.name,
              focus: g.focus,
              category: g.category,
              difficulty: g.difficulty,
              tags: g.tags || [],
              launch_url: `${base}/hub/training?game=${g.id}`,
            }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                query: q || 'all',
                category: cat,
                simulators_count: matchedSimulators.length,
                training_games_count: matchedGames.length,
                simulators: matchedSimulators.slice(0, 45),
                training_games: matchedGames.slice(0, 40),
                training_hub_url: `${base}/hub/training`,
                features_directory_url: `${base}/features`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_pot_odds_and_mdf': {
      const pot = Math.max(Number(args?.pot) || 100, 1);
      const bet = Math.max(Number(args?.bet) || 50, 0.5);
      const outs = Math.min(Math.max(Math.round(Number(args?.outs) || 9), 0), 20);
      const totalPotAfterBet = pot + bet;
      const finalPotAfterCall = pot + 2 * bet;
      const requiredEquity = Number(((bet / finalPotAfterCall) * 100).toFixed(2));
      const mdf = Number(((pot / totalPotAfterBet) * 100).toFixed(2));
      const optimalBluffShare = Number(((bet / finalPotAfterCall) * 100).toFixed(2));
      const turnHit = Number(((outs / 47) * 100).toFixed(2));
      const riverHit = Number(((outs / 46) * 100).toFixed(2));
      const twoCardHit = Number(((1 - ((47 - outs) / 47) * ((46 - outs) / 46)) * 100).toFixed(2));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                pot_before_bet: pot,
                bet_to_call: bet,
                clean_outs: outs,
                pot_odds_ratio: `${(totalPotAfterBet / bet).toFixed(2)} : 1`,
                required_calling_equity_percent: requiredEquity,
                minimum_defense_frequency_percent: mdf,
                optimal_polarized_bluff_share_percent: optimalBluffShare,
                turn_one_card_hit_percent: turnHit,
                river_one_card_hit_percent: riverHit,
                flop_to_river_two_card_hit_percent: twoCardHit,
                direct_turn_call_ev: Number(((turnHit / 100) * finalPotAfterCall - bet).toFixed(2)),
                interactive_calculator_url: `${base}/tools/pot-odds-calculator`,
                markdown_url: `${base}/tools/pot-odds-calculator.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_bankroll_risk_of_ruin': {
      const winrate = Number(args?.winrate_bb100) || 5;
      const stdDev = Math.max(Number(args?.std_dev_bb100) || 85, 10);
      const buyIns = Math.max(Number(args?.buy_ins) || 30, 1);
      const bankrollBB = buyIns * 100;
      const variance = stdDev * stdDev;
      const rorPercent =
        winrate <= 0
          ? 100
          : Number((Math.min(1, Math.exp((-2 * winrate * bankrollBB) / variance)) * 100).toFixed(2));
      const buyInsFor5PctRor =
        winrate > 0 ? Math.ceil(((-Math.log(0.05) * variance) / (2 * winrate)) / 100) : null;
      const buyInsFor1PctRor =
        winrate > 0 ? Math.ceil(((-Math.log(0.01) * variance) / (2 * winrate)) / 100) : null;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                winrate_bb100: winrate,
                std_dev_bb100: stdDev,
                current_buy_ins: buyIns,
                bankroll_big_blinds: bankrollBB,
                risk_of_ruin_percent: rorPercent,
                required_buy_ins_5pct_ror: buyInsFor5PctRor,
                required_buy_ins_1pct_ror: buyInsFor1PctRor,
                interactive_calculator_url: `${base}/tools/bankroll-calculator`,
                markdown_url: `${base}/tools/bankroll-calculator.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_bounty_chip_equity': {
      const bountyDollars = Math.max(Number(args?.bounty_dollars) || 50, 0);
      const regularBuyin = Math.max(Number(args?.regular_pool_buyin) || 50, 1);
      const startingStack = Math.max(Number(args?.starting_stack) || 10000, 100);
      const potChips = Math.max(Number(args?.pot_chips) || 15000, 1);
      const callChips = Math.max(Number(args?.call_chips) || 10000, 1);
      const bountyChipValue = Math.round((bountyDollars / regularBuyin) * startingStack);
      const standardRequiredEquity = Number(((callChips / (potChips + callChips)) * 100).toFixed(2));
      const bountyAdjustedEquity = Number(
        ((callChips / (potChips + callChips + bountyChipValue)) * 100).toFixed(2)
      );
      const equityDiscount = Number((standardRequiredEquity - bountyAdjustedEquity).toFixed(2));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                bounty_dollars: bountyDollars,
                regular_pool_buyin: regularBuyin,
                starting_stack: startingStack,
                bounty_chip_equivalent: bountyChipValue,
                pot_chips: potChips,
                call_chips: callChips,
                standard_required_equity_percent: standardRequiredEquity,
                bounty_adjusted_required_equity_percent: bountyAdjustedEquity,
                bounty_equity_discount_percent: equityDiscount,
                interactive_calculator_url: `${base}/tools/bounty-calculator`,
                markdown_url: `${base}/tools/bounty-calculator.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_side_pots': {
      const rawContribs = Array.isArray(args?.contributions) ? args.contributions : [];
      const deadMoney = Math.max(Number(args?.dead_money) || 0, 0);
      const players = rawContribs
        .map((p, idx) => ({
          name: String(p?.name || `Player ${idx + 1}`).trim(),
          amount: Math.max(Number(p?.amount) || 0, 0),
          folded: Boolean(p?.folded),
        }))
        .filter((p) => p.amount > 0);

      const liveAmounts = Array.from(
        new Set(players.filter((p) => !p.folded).map((p) => p.amount))
      ).sort((a, b) => a - b);

      const pots = [];
      let prevCap = 0;
      for (let i = 0; i < liveAmounts.length; i += 1) {
        const cap = liveAmounts[i];
        const slice = cap - prevCap;
        if (slice <= 0) continue;
        let potTotal = i === 0 ? deadMoney : 0;
        for (const p of players) {
          const contrib = Math.max(0, Math.min(p.amount, cap) - prevCap);
          potTotal += contrib;
        }
        const eligible = players.filter((p) => !p.folded && p.amount >= cap).map((p) => p.name);
        if (eligible.length >= 2 || pots.length === 0) {
          pots.push({
            label: pots.length === 0 ? 'Main Pot' : `Side Pot ${pots.length}`,
            cap_level: cap,
            amount: potTotal,
            eligible_players: eligible,
          });
          prevCap = cap;
        }
      }

      const uncalled = [];
      for (const p of players) {
        if (p.amount > prevCap) {
          uncalled.push({ player: p.name, returned_chips: p.amount - prevCap });
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                total_wagered: players.reduce((s, p) => s + p.amount, 0) + deadMoney,
                pots,
                uncalled_returns: uncalled,
                interactive_calculator_url: `${base}/tools/side-pot-calculator`,
                markdown_url: `${base}/tools/side-pot-calculator.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'generate_blind_structure': {
      const startingStack = Math.max(Number(args?.starting_stack) || 20000, 1000);
      const levelMinutes = Math.max(parseInt(args?.level_minutes, 10) || 20, 5);
      const targetHours = Math.max(Number(args?.target_hours) || 4, 1);
      const anteFormat = args?.ante_format === 'none' ? 'none' : 'bba';
      const baseBlinds = [
        [100, 200], [100, 300], [200, 400], [300, 600], [400, 800], [500, 1000],
        [600, 1200], [800, 1600], [1000, 2000], [1500, 3000], [2000, 4000], [3000, 6000],
        [4000, 8000], [5000, 10000], [6000, 12000], [8000, 16000], [10000, 20000], [15000, 30000],
      ];
      const scale = Math.max(1, Math.round(startingStack / 20000));
      const levels = baseBlinds.map(([sb, bb], idx) => ({
        level: idx + 1,
        duration_minutes: levelMinutes,
        small_blind: sb * scale,
        big_blind: bb * scale,
        big_blind_ante: anteFormat === 'bba' && idx >= 1 ? bb * scale : 0,
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                starting_stack: startingStack,
                starting_big_blinds: Number((startingStack / levels[0].big_blind).toFixed(1)),
                level_minutes: levelMinutes,
                target_hours: targetHours,
                ante_format: anteFormat,
                schedule: levels,
                interactive_calculator_url: `${base}/tools/blind-structure-calculator`,
                markdown_url: `${base}/tools/blind-structure-calculator.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_spr_sizing': {
      const effectiveStack = Math.max(Number(args?.effective_stack) || 90, 1);
      const potSize = Math.max(Number(args?.pot_size) || 10, 1);
      const spr = Number((effectiveStack / potSize).toFixed(2));
      const geo1Pct = Number((spr * 100).toFixed(1));
      const geo2Pct = Number((((Math.sqrt(1 + 2 * spr) - 1) / 2) * 100).toFixed(1));
      const geo3Pct = Number((((Math.cbrt(1 + 2 * spr) - 1) / 2) * 100).toFixed(1));
      const zone =
        spr <= 3
          ? 'Low SPR (<= 3.0) - Auto-Commit Zone'
          : spr <= 7
          ? 'Medium SPR (3.1 - 7.0) - Two-Street Geometric Zone'
          : 'High SPR (> 7.0) - Deep Postflop Maneuverability Zone';

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                effective_stack: effectiveStack,
                pot_size: potSize,
                spr,
                commitment_zone: zone,
                one_street_geometric_pct: geo1Pct,
                two_street_geometric_pct: geo2Pct,
                three_street_geometric_pct: geo3Pct,
                interactive_calculator_url: `${base}/tools/spr-calculator`,
                markdown_url: `${base}/tools/spr-calculator.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'get_citation_and_backlink_kit': {
      const campaignArg = args?.campaign && args.campaign !== 'all' ? String(args.campaign) : '';
      const langArg = String(args?.lang || 'en');
      const targetArg = String(args?.target || 'Your Publication');
      const outreach = generateOutreachPackage({
        campaign: campaignArg,
        lang: langArg,
        target: targetArg,
      });
      const datasetCatalog = getDatasetCatalogPayload();
      const opportunities = getBacklinkOpportunitiesPayload();
      const streamerCommands = [
        { command: '!odds', endpoint: `${base}/api/stream/cmd?cmd=odds&q=$(querystring)`, tool_url: `${base}/tools/poker-odds-calculator` },
        { command: '!potodds', endpoint: `${base}/api/stream/cmd?cmd=potodds&q=$(querystring)`, tool_url: `${base}/tools/pot-odds-calculator` },
        { command: '!pushfold', endpoint: `${base}/api/stream/cmd?cmd=pushfold&q=$(querystring)`, tool_url: `${base}/tools/push-fold-calculator` },
        { command: '!icm', endpoint: `${base}/api/stream/cmd?cmd=icm&q=$(querystring)`, tool_url: `${base}/tools/icm-calculator` },
        { command: '!bounty', endpoint: `${base}/api/stream/cmd?cmd=bounty&q=$(querystring)`, tool_url: `${base}/tools/bounty-calculator` },
        { command: '!winrate', endpoint: `${base}/api/stream/cmd?cmd=winrate&q=$(querystring)`, tool_url: `${base}/tools/poker-winrate-calculator` },
        { command: '!plo', endpoint: `${base}/api/stream/cmd?cmd=plo&q=$(querystring)`, tool_url: `${base}/tools/plo-bet-calculator` },
        { command: '!rake', endpoint: `${base}/api/stream/cmd?cmd=rake&q=$(querystring)`, tool_url: `${base}/tools/rake-calculator` },
        { command: '!3bet', endpoint: `${base}/api/stream/cmd?cmd=3bet&q=$(querystring)`, tool_url: `${base}/tools/3bet-calculator` },
        { command: '!rule', endpoint: `${base}/api/stream/cmd?cmd=rule&q=$(querystring)`, tool_url: `${base}/rules` },
        { command: '!chop', endpoint: `${base}/api/stream/cmd?cmd=chop&q=$(querystring)`, tool_url: `${base}/tools/chop-calculator` },
        { command: '!outs', endpoint: `${base}/api/stream/cmd?cmd=outs&q=$(querystring)`, tool_url: `${base}/tools/outs-calculator` },
        { command: '!variance', endpoint: `${base}/api/stream/cmd?cmd=variance&q=$(querystring)`, tool_url: `${base}/tools/variance-calculator` },
        { command: '!matchup', endpoint: `${base}/api/stream/cmd?cmd=matchup&q=$(querystring)`, tool_url: `${base}/learn/matchups` },
      ];

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                embed_portal_url: `${base}/tools/embeds`,
                badge_api_url: `${base}/api/seo/badge`,
                dataset_catalog_url: `${base}/api/datasets/catalog`,
                outreach_generator_url: `${base}/api/seo/outreach-generator`,
                streamer_chatbot_url: `${base}/api/stream/cmd`,
                streamer_commands_count: streamerCommands.length,
                streamer_commands: streamerCommands,
                glama_mcp_url: 'https://glama.ai/mcp/servers/Smarter-Poker/smarter-poker-mcp',
                glama_mcp_schema_url: 'https://glama.ai/mcp/servers/Smarter-Poker/smarter-poker-mcp/schema',
                zenodo_records: datasetCatalog.zenodo_records,
                swhids: datasetCatalog.swhids,
                research_json_feed_url: `${base}/api/feeds/research`,
                outreach_package: outreach,
                wikipedia_citation_targets: datasetCatalog.wikipedia_citation_targets,
                zenodo_metadata: datasetCatalog.zenodo_metadata,
                backlink_opportunities_summary: opportunities.counts,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'lookup_poker_rule': {
      const q = String(args?.query || '').trim().toLowerCase();
      if (!q) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  as_of: RULES_AS_OF,
                  rules_hub_url: `${base}/rules`,
                  markdown_hub_url: `${base}/rules.md`,
                  hand_rankings_url: `${base}/learn/poker-hand-rankings`,
                  total_rules: POKER_RULES.length,
                  rules: POKER_RULES.map((r) => ({
                    slug: r.slug,
                    title: r.title,
                    category: r.category,
                    tda_reference: r.tdaRef,
                    summary: r.summary,
                    url: `${base}/rules/${r.slug}`,
                    markdown_url: `${base}/rules/${r.slug}.md`,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const exact = getRuleBySlug(q);
      const matched =
        exact ||
        POKER_RULES.find(
          (r) =>
            r.slug.includes(q) ||
            r.title.toLowerCase().includes(q) ||
            r.summary.toLowerCase().includes(q) ||
            r.tdaRef.toLowerCase().includes(q)
        );

      if (!matched) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: `No poker rule matched "${args?.query}".`,
                  available_slugs: POKER_RULES.map((r) => r.slug),
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                slug: matched.slug,
                title: matched.title,
                h1: matched.h1,
                category: matched.category,
                tda_reference: matched.tdaRef,
                summary: matched.summary,
                floor_ruling: matched.floorRuling,
                common_scenarios: matched.commonScenarios,
                faqs: matched.faqs,
                canonical_url: `${base}/rules/${matched.slug}`,
                markdown_url: `${base}/rules/${matched.slug}.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'lookup_game_variant': {
      const q = String(args?.variant || '').trim().toLowerCase();
      if (!q) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  as_of: GAMES_AS_OF,
                  games_hub_url: `${base}/games`,
                  markdown_hub_url: `${base}/games.md`,
                  total_variants: POKER_VARIANTS.length,
                  variants: POKER_VARIANTS.map((v) => ({
                    slug: v.slug,
                    name: v.name,
                    category: v.category,
                    hole_cards: v.holeCards,
                    board_cards: v.boardCards,
                    betting_structure: v.bettingStructure,
                    summary: v.summary,
                    url: `${base}/games/${v.slug}`,
                    markdown_url: `${base}/games/${v.slug}.md`,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const exact = getGameVariantBySlug(q);
      const matched =
        exact ||
        POKER_VARIANTS.find(
          (v) =>
            v.slug.includes(q) ||
            v.name.toLowerCase().includes(q) ||
            v.title.toLowerCase().includes(q)
        );

      if (!matched) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: `No poker game variant matched "${args?.variant}".`,
                  available_slugs: POKER_VARIANTS.map((v) => v.slug),
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                slug: matched.slug,
                name: matched.name,
                title: matched.title,
                category: matched.category,
                hole_cards: matched.holeCards,
                board_cards: matched.boardCards,
                betting_structure: matched.bettingStructure,
                hand_ranking_system: matched.handRankingSystem,
                summary: matched.summary,
                rules_overview: matched.rulesOverview,
                starting_hand_strategy: matched.startingHandStrategy,
                key_differences_from_holdem: matched.keyDifferencesFromHoldem,
                faqs: matched.faqs,
                canonical_url: `${base}/games/${matched.slug}`,
                markdown_url: `${base}/games/${matched.slug}.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'get_regional_market_guide': {
      const q = String(args?.market || '').trim().toLowerCase();
      if (!q) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  as_of: MARKET_GUIDES_AS_OF,
                  guides_hub_url: `${base}/poker-rooms/guides`,
                  markdown_hub_url: `${base}/poker-rooms/guides.md`,
                  total_markets: POKER_MARKET_GUIDES.length,
                  markets: POKER_MARKET_GUIDES.map((m) => ({
                    slug: m.slug,
                    region_name: m.regionName,
                    state_code: m.stateCode,
                    active_rooms_estimate: m.activeRoomsEstimate,
                    typical_rake_model: m.typicalRakeModel,
                    signature_stakes: m.signatureStakes,
                    url: `${base}/poker-rooms/guides/${m.slug}`,
                    markdown_url: `${base}/poker-rooms/guides/${m.slug}.md`,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const matched = POKER_MARKET_GUIDES.find(
        (m) =>
          m.slug === q ||
          m.slug.includes(q) ||
          m.regionName.toLowerCase().includes(q) ||
          m.stateCode.toLowerCase() === q
      );

      if (!matched) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: `No regional poker market guide matched "${args?.market}".`,
                  available_slugs: POKER_MARKET_GUIDES.map((m) => m.slug),
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                slug: matched.slug,
                region_name: matched.regionName,
                state_code: matched.stateCode,
                title: matched.title,
                summary: matched.summary,
                active_rooms_estimate: matched.activeRoomsEstimate,
                typical_rake_model: matched.typicalRakeModel,
                signature_stakes: matched.signatureStakes,
                peak_season_and_series: matched.peakSeasonAndSeries,
                top_venue_highlights: matched.topVenueHighlights,
                player_strategy_tips: matched.playerStrategyTips,
                faqs: matched.faqs,
                canonical_url: `${base}/poker-rooms/guides/${matched.slug}`,
                markdown_url: `${base}/poker-rooms/guides/${matched.slug}.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_plo_max_bet_and_rake': {
      const prevPot = Math.max(Number(args?.previous_pot) || 1.5, 0);
      const facingBet = Math.max(Number(args?.facing_bet) || 3.5, 0);
      const trailCalls = Math.max(Number(args?.trail_calls) || 0, 0);
      const heroIn = Math.max(Number(args?.hero_already_in) || 0, 0);
      const maxRaiseTotal = Number((3 * facingBet + trailCalls + prevPot - 2 * heroIn).toFixed(2));
      const resultingPot = Number((maxRaiseTotal + facingBet + trailCalls + prevPot - heroIn).toFixed(2));

      const bbDollars = Math.max(Number(args?.big_blind_dollars) || 3, 1);
      const rakeCap = Math.max(Number(args?.rake_cap_dollars) || 5, 0);
      const promoDrop = Math.max(Number(args?.promo_drop_dollars) || 1, 0);
      const avgPotsWonPerHour = 3.2;
      const hourlyRakePaid = Number(((rakeCap * 0.86 + promoDrop) * avgPotsWonPerHour).toFixed(2));
      const rakeDragBb100 = Number(((hourlyRakePaid / bbDollars / 30) * 100).toFixed(2));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                plo_max_bet_calculation: {
                  previous_pot: prevPot,
                  facing_bet: facingBet,
                  trail_calls: trailCalls,
                  hero_already_in: heroIn,
                  max_pot_raise_total: maxRaiseTotal,
                  resulting_pot_after_raise: resultingPot,
                  dealer_formula: 'Max Raise Total = (3 * Facing Bet) + Trail Calls + Previous Pot - (2 * Hero Already In)',
                  interactive_calculator_url: `${base}/tools/plo-bet-calculator`,
                },
                live_cash_rake_calculation: {
                  big_blind_dollars: bbDollars,
                  rake_cap_dollars: rakeCap,
                  promo_drop_dollars: promoDrop,
                  estimated_hourly_rake_paid_dollars: hourlyRakePaid,
                  estimated_rake_drag_bb100: rakeDragBb100,
                  interactive_calculator_url: `${base}/tools/rake-calculator`,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_tournament_chop': {
      const stacks = (Array.isArray(args?.stacks) ? args.stacks : [50000, 30000, 20000])
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0);
      const payouts = (Array.isArray(args?.payouts) ? args.payouts : [5000, 3000, 2000])
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0);
      const saveAmount = Math.max(Number(args?.saveAmount) || 0, 0);

      if (stacks.length === 0 || payouts.length === 0) {
        throw new Error('Both stacks and payouts arrays with positive numbers are required.');
      }

      const totalChips = stacks.reduce((a, b) => a + b, 0);
      const activePayouts = payouts.slice(0, stacks.length);
      const totalPrizePool = activePayouts.reduce((a, b) => a + b, 0);
      const minPayout = activePayouts[activePayouts.length - 1] || 0;
      const lockedPool = minPayout * stacks.length;
      const surplusPool = Math.max(0, totalPrizePool - lockedPool);
      const effectiveSave = Math.min(saveAmount, surplusPool);
      const distributableSurplus = Math.max(0, surplusPool - effectiveSave);

      const icmEquities = calculateICM(stacks, activePayouts);
      const players = stacks.map((stack, idx) => {
        const chipShare = stack / totalChips;
        const icmChop = Number((icmEquities[idx] || 0).toFixed(2));
        const chipChop = Number((minPayout + surplusPool * chipShare).toFixed(2));
        const saveChop = Number((minPayout + distributableSurplus * chipShare).toFixed(2));
        return {
          player: `Player ${idx + 1}`,
          chips: stack,
          chip_share_percent: Number((chipShare * 100).toFixed(2)),
          icm_chop_dollars: icmChop,
          chip_chop_dollars: chipChop,
          save_amount_chop_dollars: saveChop,
          chip_vs_icm_delta_dollars: Number((chipChop - icmChop).toFixed(2)),
        };
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                total_chips: totalChips,
                total_prize_pool: totalPrizePool,
                save_amount_for_winner: effectiveSave,
                players,
                citation_url: `${base}/tools/chop-calculator`,
                interactive_calculator_url: `${base}/tools/chop-calculator`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'simulate_poker_variance': {
      const winrate = Number(args?.winrateBb100 ?? args?.winrate_bb100 ?? 5);
      const stdDev = Math.max(Number(args?.stdDevBb100 ?? args?.std_dev_bb100 ?? 85), 5);
      const handsPlayed = Math.max(Number(args?.handsPlayed ?? args?.hands_played ?? 50000), 100);
      const chunks = handsPlayed / 100;
      const expectedBb = Number((winrate * chunks).toFixed(2));
      const sampleStdDevBb = Number((stdDev * Math.sqrt(chunks)).toFixed(2));

      // Standard normal CDF approximation (Abramowitz & Stegun)
      const zZero = sampleStdDevBb > 0 ? (0 - expectedBb) / sampleStdDevBb : 0;
      const normCdf = (z) => {
        const t = 1 / (1 + 0.2316419 * Math.abs(z));
        const d = 0.3989423 * Math.exp((-z * z) / 2);
        const p =
          d *
          t *
          (0.3193815 +
            t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
        return z > 0 ? 1 - p : p;
      };
      const probLossPercent = Number((normCdf(zZero) * 100).toFixed(2));
      const minHands95Confidence =
        winrate > 0 ? Math.ceil(Math.pow((1.96 * stdDev) / winrate, 2) * 100) : null;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                winrate_bb100: winrate,
                std_dev_bb100: stdDev,
                hands_played: handsPlayed,
                expected_value_bb: expectedBb,
                expected_value_buyins_100bb: Number((expectedBb / 100).toFixed(2)),
                sample_std_dev_bb: sampleStdDevBb,
                confidence_intervals_bb: {
                  ci_68_percent: [
                    Number((expectedBb - sampleStdDevBb).toFixed(1)),
                    Number((expectedBb + sampleStdDevBb).toFixed(1)),
                  ],
                  ci_95_percent: [
                    Number((expectedBb - 1.96 * sampleStdDevBb).toFixed(1)),
                    Number((expectedBb + 1.96 * sampleStdDevBb).toFixed(1)),
                  ],
                  ci_99_7_percent: [
                    Number((expectedBb - 3 * sampleStdDevBb).toFixed(1)),
                    Number((expectedBb + 3 * sampleStdDevBb).toFixed(1)),
                  ],
                },
                probability_of_loss_percent: probLossPercent,
                min_hands_for_95pct_confidence: minHands95Confidence,
                citation_url: `${base}/tools/variance-calculator`,
                interactive_calculator_url: `${base}/tools/variance-calculator`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_draw_outs': {
      const outs = Math.min(Math.max(Math.round(Number(args?.outs) || 9), 1), 21);
      const street = String(args?.street || 'flop').toLowerCase() === 'turn' ? 'turn' : 'flop';
      const turnPct = Number(((outs / 47) * 100).toFixed(2));
      const riverPct = Number(((outs / 46) * 100).toFixed(2));
      const flopToRiverPct = Number(((1 - ((47 - outs) / 47) * ((46 - outs) / 46)) * 100).toFixed(2));
      const activeExactPct = street === 'turn' ? riverPct : flopToRiverPct;
      const ruleOf4And2Pct = street === 'turn' ? outs * 2 : Math.min(outs * 4, 100);
      const ruleErrorPct = Number((ruleOf4And2Pct - activeExactPct).toFixed(2));
      const breakEvenOddsRatio = Number(((100 - activeExactPct) / activeExactPct).toFixed(2));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                outs,
                street,
                exact_turn_percent: turnPct,
                exact_river_percent: riverPct,
                exact_flop_to_river_percent: flopToRiverPct,
                active_street_exact_percent: activeExactPct,
                rule_of_4_and_2_percent: ruleOf4And2Pct,
                rule_of_4_and_2_error_percent: ruleErrorPct,
                break_even_pot_odds_ratio: `${breakEvenOddsRatio} : 1`,
                citation_url: `${base}/tools/outs-calculator`,
                interactive_calculator_url: `${base}/tools/outs-calculator`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'lookup_hand_matchup': {
      const slug = String(args?.slug || '').trim();
      const handA = String(args?.handA || '').trim();
      const handB = String(args?.handB || '').trim();

      if (!slug && !handA && !handB) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  total_matchups: CANONICAL_HAND_MATCHUPS_FALLBACK.length,
                  matchups: CANONICAL_HAND_MATCHUPS_FALLBACK.map((m) => ({
                    slug: m.slug,
                    title: m.title,
                    handA: m.handA,
                    handB: m.handB,
                    winA_percent: m.winA,
                    winB_percent: m.winB,
                    tie_percent: m.tie,
                    citation_url: `${base}/learn/matchups/${m.slug}`,
                  })),
                  hub_url: `${base}/learn/matchups`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const found = lookupHandMatchupData({ slug, handA, handB }) || CANONICAL_HAND_MATCHUPS_FALLBACK[0];
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                slug: found.slug,
                title: found.title,
                handA: found.handA,
                handB: found.handB,
                preflop_win_a_percent: found.winA,
                preflop_win_b_percent: found.winB,
                preflop_tie_percent: found.tie,
                category: found.category,
                flop_texture_shifts: found.flopShifts,
                stack_off_ev_notes: found.stackOffNotes,
                citation_url: `${base}/learn/matchups/${found.slug}`,
                markdown_url: `${base}/learn/matchups/${found.slug}.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown MCP tool: ${name}`);
  }
}

/**
 * Handles incoming JSON-RPC 2.0 messages for Model Context Protocol.
 */
export async function handleMcpRpc(requestBody, { origin = SITE_ORIGIN } = {}) {
  const isArray = Array.isArray(requestBody);
  const requests = isArray ? requestBody : [requestBody];
  const responses = [];

  for (const req of requests) {
    if (!req || typeof req !== 'object') {
      responses.push({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Invalid Request: Expected Object' },
      });
      continue;
    }

    const { id, method, params } = req;

    // Handle notifications (no id)
    if (id === undefined || id === null) {
      // e.g. "notifications/initialized"
      continue;
    }

    switch (method) {
      case 'initialize':
        responses.push({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: { listChanged: false },
              prompts: { listChanged: false },
              resources: { subscribe: false, listChanged: false },
            },
            serverInfo: MCP_SERVER_INFO,
            instructions: MCP_INSTRUCTIONS,
          },
        });
        break;

      case 'prompts/list':
        responses.push({
          jsonrpc: '2.0',
          id,
          result: {
            prompts: MCP_PROMPTS,
          },
        });
        break;

      case 'prompts/get': {
        const promptName = String(params?.name || '');
        const promptArgs = params?.arguments || {};
        const promptDef = MCP_PROMPTS.find((p) => p.name === promptName);
        if (!promptDef) {
          responses.push({
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: `Unknown prompt: ${promptName}` },
          });
          break;
        }
        responses.push({
          jsonrpc: '2.0',
          id,
          result: {
            description: promptDef.description,
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Use the Smarter.Poker MCP tools to ${promptDef.description} Parameters: ${JSON.stringify(promptArgs)}`,
                },
              },
            ],
          },
        });
        break;
      }

      case 'resources/templates/list':
        responses.push({
          jsonrpc: '2.0',
          id,
          result: {
            resourceTemplates: MCP_RESOURCE_TEMPLATES,
          },
        });
        break;

      case 'resources/read': {
        const uri = params?.uri || '';
        const resourceResult = await readMcpResource(uri, { origin });
        responses.push({
          jsonrpc: '2.0',
          id,
          result: resourceResult,
        });
        break;
      }

      case 'ping':
        responses.push({
          jsonrpc: '2.0',
          id,
          result: {},
        });
        break;

      case 'tools/list':
        responses.push({
          jsonrpc: '2.0',
          id,
          result: {
            tools: MCP_TOOLS,
          },
        });
        break;

      case 'tools/call': {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};
        try {
          const toolResult = await executeMcpTool(toolName, toolArgs, { origin });
          responses.push({
            jsonrpc: '2.0',
            id,
            result: toolResult,
          });
        } catch (toolErr) {
          responses.push({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `Error executing tool "${toolName}": ${toolErr.message}`,
                },
              ],
              isError: true,
            },
          });
        }
        break;
      }

      default:
        responses.push({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        });
        break;
    }
  }

  if (!isArray && responses.length === 1) {
    return responses[0];
  }
  return responses;
}
