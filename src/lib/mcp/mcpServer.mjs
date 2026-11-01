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
import { STARTING_HANDS, findStartingHand } from '../../content/learn/hands.js';
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
  version: '1.0.0',
};

export const MCP_TOOLS = [
  {
    name: 'search_poker_venues',
    description: 'Search verified poker rooms and casinos by name, city, state, or game type across North America.',
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
    description: 'Retrieve verified, source-cited side-by-side comparison matrices and best-of benchmarks between Smarter.Poker and competitors (PokerBros, PPPoker, ClubGG, Bravo Poker Live, TableCaptain, GTO Wizard, DTO, Sharp Poker, Pokerbase, DownCount, Bellagio, Aria, Commerce, The Lodge, Run It Once, Upswing Poker, PokerTracker 4, Holdem Manager 3, PioSolver, MonkerSolver).',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'Comparison slug (e.g. "best-poker-club-apps", "best-gto-poker-trainers", "smarter-poker-vs-piosolver", "smarter-poker-vs-run-it-once") or omit to list all 25 verified comparisons.',
        },
      },
    },
  },
  {
    name: 'lookup_starting_hand',
    description: 'Look up combinatorics, 100BB 6-Max GTO positional opening ranges, 3-bet strategies, and preflop equities for any canonical Texas Holdem starting hand (e.g. "AA", "KK", "88", "AKs", "AQo", "KJs", "87s", "72o", "pocket-aces", "ace-king-suited").',
    inputSchema: {
      type: 'object',
      properties: {
        hand: {
          type: 'string',
          description: 'Hand code or slug (e.g. "AA", "KK", "88", "AKs", "AQo", "KJs", "87s", "72o", "pocket-aces"). Omit to list all 30 canonical starting hand guides.',
        },
      },
    },
  },
  {
    name: 'get_research_report',
    description: 'Retrieve first-party empirical poker industry research reports and dataset benchmarks (US Live Poker Room Rake & Jackpot Benchmark, Daily Tournament Buy-In Index, GTO vs Population Leak Study, Private Club Software Economics, Poker Dealer Toke & Hourly Rate Benchmark, Tournament ICM Bubble Factor & Risk Premium Study).',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'Research report slug (e.g. "us-live-poker-room-rake-and-jackpot-benchmark", "poker-dealer-toke-and-hourly-rate-benchmark", "tournament-icm-bubble-factor-and-risk-premium-study") or omit to list all 6 empirical studies.',
        },
      },
    },
  },
  {
    name: 'search_training_simulators',
    description: 'Search and retrieve interactive Smarter.Poker World Hub tools, GTO solvers, ICM calculators, leak scanners, range builders, and all 107 scenario training games by skill topic, format, or slug.',
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
];

/**
 * Executes an MCP tool call and returns the standardized tool response content.
 */
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
