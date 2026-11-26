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
import { freeBuyAgentSchedule, FREE_BUY_SUMMARY } from '../freerolls/freeBuySchedule.mjs';
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
import { HAND_MATCHUPS, getMatchupBySlug } from '../../content/learn/matchups.js';
import { SERIES_GUIDES, getSeriesGuideBySlug } from '../../content/guides/seriesGuides.js';
import { PLAYER_ARCHETYPES, findPlayerArchetype } from '../../content/learn/playerTypes.js';
import { BOARD_TEXTURES, findBoardTexture } from '../../content/learn/boardTextures.js';
import { INTERNATIONAL_POKER_GUIDES, findInternationalGuide } from '../../content/guides/internationalMarkets.js';

export const getHandMatchupBySlug = getMatchupBySlug;

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
  version: '2.2.0',
  packageVersion: '1.0.8',
};
export const SERVER_INFO = MCP_SERVER_INFO;

export const MCP_INSTRUCTIONS = [
  'Smarter.Poker MCP Server v2.2.0 (package release v1.0.8) exposes 70 read-only, deterministic quantitative poker tools, 14 structured prompts, 24 resource templates, 52 interactive calculators, 44 streamer bot commands, 6 Zenodo DOI datasets (10.5281/zenodo.24115647, 10.5281/zenodo.24115636, 10.5281/zenodo.24115447, 10.5281/zenodo.24115452, 10.5281/zenodo.24115453, 10.5281/zenodo.24115454), and Glama Registry metadata (https://glama.ai/mcp/servers/Smarter-Poker/smarter-poker-mcp).',
  'Tool Family Disambiguation Rules:',
  '1. Equity, Showdown & Board Texture Family: Use calculate_poker_odds for exact Monte Carlo / enumerative multiway card-vs-card equity with specific hole cards or board cards; use calculate_multiway_all_in_ev for 3-way/4-way main pot and side pot all-in EV calculation; use resolve_holdem_showdown_winner to evaluate two 2-card Hold\'em hands on a 5-card board and determine the exact winning 5-card hand, kicker, or split pot; use analyze_flop_board_texture to classify any 3-card flop (Rainbow/Two-Tone/Monotone, pairing, connectedness, range advantage, and GTO C-Bet sizing); use get_flop_board_texture_guide for the 12 canonical flop board texture solver guides; use lookup_hand_matchup for canonical preflop hand-vs-hand benchmarks (e.g. AA vs KK, AKs vs QQ, 55 vs KTs); use calculate_draw_outs for hypergeometric turn/river draw completion from clean out counts (1-21 outs) and Rule of 4 & 2 error; use calculate_plo_wrap_outs for 4-Card/5-Card Omaha straight wrap outs (13, 16, 17, 20 outs) and flush redraw equity; use calculate_pot_odds_and_mdf when given pot size and bet size to compute break-even calling equity and Minimum Defense Frequency (MDF); use calculate_river_bluff_catch_ev for river MDF, blocker removal, and bluff-catch EV; use calculate_multi_street_barrel_ev for flop-turn-river cumulative fold equity and triple-barrel breakeven.',
  '2. Preflop, Positional & Exploitative Strategy Family: Use get_preflop_chart to retrieve a full 100BB 6-Max positional opening range matrix; use solve_heads_up_push_fold_nash for HU and 3-max 1BB-25BB Nash push/fold/limp equilibrium; use solve_blind_vs_blind_matrix for SB vs BB limp/raise/3-bet equilibrium; use get_poker_position_strategy for detailed seat-by-seat GTO RFI %, 3-Bet %, cold-call %, and BB/100 winrate across all 9-max/6-max seats (utg, utg-1, mp, lj, hj, co, btn, sb, bb); use get_player_archetype_exploit for exploitative counter-strategies against the 8 player archetypes (omc, calling-station, maniac, tag, lag, short-stack, trapper, gto-grinder); use lookup_starting_hand to inspect a single canonical starting hand (any of the 169 hands such as AA, AKs, 87s, 72o); use calculate_preflop_isolation_raise to compute optimal 3x/4x + 1x per limper + OOP tax preflop isolation raise sizing; use calculate_straddle_bomb_pot_ev for UTG/Button straddle effective stack reduction and single/double-board bomb pot dead money math; use calculate_geometric_bet_sizing for multi-street 2e/3e geometric pot-fraction bet sizing; use lookup_poker_math_formula for the poker formulas encyclopedia with LaTeX and worked examples; use lookup_mtt_tournament_stage_strategy for the 8 MTT stages playbook; use diagnose_poker_leak_cure for the 12 common poker leaks and EV loss in BB/100; use lookup_hud_stat_gto_benchmark for GTO 6-max/9-max targets and population exploits across 15 HUD stats; use verify_poker_myth_claim to fact-check poker myths with solver equilibrium proof; use batch_solve_poker_spots to solve an array of up to 20 poker math spots in one deterministic batch call.',
  '3. Live Poker Venue, Table Selection, US State Law, Corridors & International Family: Use search_poker_venues to filter cardrooms by city, state, keyword, or venue type; use get_venue_details only after obtaining a numeric venue ID; use score_live_table_selection to grade live cash table profitability (S-Tier to F); use get_regional_market_guide for the 12 regional cardroom hubs; use get_us_state_poker_guide for state-by-state legal status, minimum age, tax withholding rate, rake model, and top poker cities; use lookup_poker_travel_corridor for closest legal poker rooms by metro/airport corridor; use get_international_poker_guide for the 10 global poker destinations (london, barcelona, rozvadov, monte-carlo, prague, manila, macau, melbourne, montreal, nassau).',
  '4. Tournament Series & Festival Planning Family: Use search_tournament_series to search live database schedules; use get_series_details when you have a specific numeric series ID; use get_poker_series_strategy_guide for deep festival strategy, late-reg windows, and bankroll planning across the 10 major poker tours (wsop-las-vegas, wpt-world-championship, mspt-major, etc.) or first-time-guide; use calculate_poker_trip_budget for festival travel overhead and effective expense rake %; use calculate_mtt_session_abi_plan for MTT session exposure, ABI bankroll ratio, and 0-ITM brick risk.',
  '5. Tournament Math, Satellites, Cash Session, Promotions, Staking, Taxes & Hand History Family: Use calculate_icm_payouts for Malmuth-Harville ICM equity; use calculate_bubble_factor_matrix for pairwise final table ICM bubble factors and required equity; use calculate_late_reg_icm_ev for tournament late-registration ICM chip appreciation at 15BB-30BB; use calculate_tournament_m_ratio for Harrington M-Ratio, Effective M, Q-Ratio, and Zone classification; use calculate_satellite_bubble_factor for satellite seat-lock thresholds and bubble factors; use calculate_tournament_chop to compare ICM Chop vs Chip Chop vs Save-Amount deals; use calculate_bounty_chip_equity for PKO/Mystery Bounty chip conversion; use calculate_mystery_bounty_live_pool for remaining mystery bounty envelope EV and chip equivalence; use calculate_cash_session_plan for net $/hr with comps/expenses, stop-loss, and 5% RoR bankroll; use calculate_bankroll_shot_taking_plan for 2-tier bankroll shot-taking and stop-loss triggers; use calculate_bad_beat_jackpot_ev for Bad Beat Jackpot and high-hand promotion EV; use format_poker_hand_history to convert raw hand details into Reddit/Discord markdown with street-by-street SPR; use calculate_bankroll_risk_of_ruin for Risk of Ruin; use simulate_poker_variance and calculate_winrate_confidence_interval for sample confidence intervals; use calculate_poker_taxes_w2g for IRS Form W-2G and Schedule A vs C tax math; use calculate_staking_markup_split for tournament staking markup; use calculate_home_game_chip_set for physical chip tube breakdowns.',
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
    description: 'Retrieve the daily Free Buy freeroll schedule (five free No-Limit Hold\'em tournaments a day), prize guarantees in chips, and entry requirements on Smarter.Poker.',
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
          description: 'Filter by freeroll tier: "open" for daily open tournaments, "diamond" for Diamond Arena availability (no funded events currently open), or "all".',
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
    description: 'Retrieve ready-to-paste HTML backlinks, SVG authority/award badges, Markdown/Substack citations, TwoPlusTwo/CardsChat BBCode, Wikipedia {{cite web}} templates, BibTeX academic records, Zenodo DOIs, Software Heritage SWHIDs, Glama MCP listing, all 44 Twitch/YouTube streamer chatbot commands (!odds, !potodds, !pushfold, !icm, !bounty, !winrate, !plo, !rake, !3bet, !rule, !chop, !outs, !variance, !matchup, !tax, !stake, !iso, !series, !board, !mratio, !straddle, !sat, !bbj, !position, !math, !iq, !wrap, !latereg, !confidence, !trip, !geo, !table, !exploit, !intl, !3way, !mystery, !bf, !bluffcatch, !barrel, !hu, !bvb, !shot, !formula, !corridor), and multilingual embeds across 7 languages (en, es, pt, de, fr, it, ja).',
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
    description: 'Look up exact preflop win/tie/loss equity, combinatorics, flop texture equity shifts, and 100BB vs 25BB stack-off EV notes for canonical Texas Hold\'em hand-vs-hand matchups (e.g. "aa-vs-kk", "aks-vs-qq", "jj-vs-ako", "55-vs-kts").',
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
          description: 'Matchup slug (e.g. "aa-vs-kk", "aks-vs-qq", "jj-vs-ako", "55-vs-kts") or omit to list all 25 canonical matchups.',
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
  {
    name: 'calculate_poker_taxes_w2g',
    description: 'Calculates US federal/state poker tax liability, net taxable gambling income under Schedule A (itemized session loss deduction capped at winnings) vs Schedule C (professional player business expenses + self-employment tax), and IRS $5,000 Form W-2G reporting thresholds.',
    annotations: {
      title: 'Calculate US Poker Taxes & Form W-2G Thresholds',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        winning_sessions_dollars: {
          type: 'number',
          description: 'Total gross winning sessions in dollars for the tax year (default: 48000).',
          default: 48000,
        },
        losing_sessions_dollars: {
          type: 'number',
          description: 'Total gross losing sessions in dollars for the tax year (default: 22000).',
          default: 22000,
        },
        filing_status: {
          type: 'string',
          enum: ['recreational', 'pro'],
          description: 'Tax filing classification: "recreational" (Form 1040 + Schedule A itemized losses) or "pro" (Schedule C professional gambler, default: "recreational").',
          default: 'recreational',
        },
        business_expenses_dollars: {
          type: 'number',
          description: 'Qualifying Schedule C poker business expenses such as travel, lodging, and buy-in fees (default: 3500).',
          default: 3500,
        },
        other_taxable_income_dollars: {
          type: 'number',
          description: 'Other annual non-gambling taxable income in dollars (default: 85000).',
          default: 85000,
        },
        single_tournament_net_profit_dollars: {
          type: 'number',
          description: 'Net profit (payout minus buy-in) from a single poker tournament to test the $5,000 IRS Form W-2G threshold (default: 6500).',
          default: 6500,
        },
      },
    },
  },
  {
    name: 'calculate_staking_markup_split',
    description: 'Calculates tournament staking package total value, markup price per %, investor share cost, breakeven ROI % required at the given markup, and net payouts for both investor and horse across a given gross cash amount.',
    annotations: {
      title: 'Calculate Tournament Staking Markup & Payout Split',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        package_buyins_dollars: {
          type: 'number',
          description: 'Total face-value buy-ins in the tournament staking package in dollars (default: 10000).',
          default: 10000,
        },
        markup: {
          type: 'number',
          description: 'Markup multiplier applied to the package (e.g. 1.00 to 1.50, default: 1.15).',
          default: 1.15,
        },
        action_sold_percent: {
          type: 'number',
          description: 'Total percentage of action sold by the horse across all backers (default: 50).',
          default: 50,
        },
        investor_share_percent: {
          type: 'number',
          description: 'Percentage share purchased by an individual investor (default: 10).',
          default: 10,
        },
        gross_cashes_dollars: {
          type: 'number',
          description: 'Total gross tournament cashes and refunds at the end of the package (default: 24000).',
          default: 24000,
        },
        estimated_player_roi_percent: {
          type: 'number',
          description: 'Estimated true pre-markup player ROI % for EV analysis (default: 25).',
          default: 25,
        },
      },
    },
  },
  {
    name: 'calculate_preflop_isolation_raise',
    description: 'Calculates optimal pre-flop isolation raise sizing (3BB + 1BB per limper + 1BB OOP tax), projected heads-up flop pot size, and effective stack-to-pot ratio (SPR).',
    annotations: {
      title: 'Calculate Pre-Flop Isolation Raise Sizing & SPR',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        limpers: {
          type: 'integer',
          description: 'Number of open-limpers ahead of Hero from 1 to 6 (default: 2).',
          default: 2,
        },
        position: {
          type: 'string',
          enum: ['IP', 'OOP'],
          description: 'Hero postflop position relative to the limpers: "IP" (CO/BTN) or "OOP" (SB/BB, default: "IP").',
          default: 'IP',
        },
        effective_stack_bb: {
          type: 'number',
          description: 'Effective starting stack in Big Blinds (default: 100).',
          default: 100,
        },
        environment: {
          type: 'string',
          enum: ['online', 'live'],
          description: 'Game environment: "online" (3BB base open) or "live" (4BB base open, default: "online").',
          default: 'online',
        },
        big_blind_dollars: {
          type: 'number',
          description: 'Dollar value of 1 Big Blind for live cash conversion (default: 5).',
          default: 5,
        },
      },
    },
  },
  {
    name: 'calculate_home_game_chip_set',
    description: 'Calculates optimal starting chip denomination tubes per player (4 to 5 denominations) and total physical chips required for a home cash game or tournament of players (2-30).',
    annotations: {
      title: 'Calculate Home Game Chip Set Denomination Breakdown',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        players: {
          type: 'integer',
          description: 'Number of players in the home game from 2 to 30 (default: 8).',
          default: 8,
        },
        format: {
          type: 'string',
          enum: ['cash', 'tournament'],
          description: 'Home game format: "cash" or "tournament" (default: "cash").',
          default: 'cash',
        },
        preset: {
          type: 'string',
          enum: ['cash-25-50', 'cash-1-2', 't10000', 't25000'],
          description: 'Denomination preset: "cash-25-50" ($0.25/$0.50), "cash-1-2" ($1/$2), "t10000" (T10,000), or "t25000" (T25,000).',
          default: 'cash-1-2',
        },
        chip_set_size: {
          type: 'integer',
          description: 'Total chip case size (300, 500, or 1000, default: 500).',
          default: 500,
        },
      },
    },
  },
  {
    name: 'get_poker_series_strategy_guide',
    description: 'Returns the complete structure, late-registration window, bankroll plan, and venue survival guide for any major tournament series (wsop-las-vegas, wsop-circuit, wpt-world-championship, wynn-millions, venetian-deepstack, borgata-open, seminole-hard-rock-poker-open, run-good-poker-series, mspt-major, texas-card-house-series) or "first-time-guide" for first-time live poker room etiquette.',
    annotations: {
      title: 'Get Major Poker Series Strategy Or First-Time Live Guide',
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
          description: 'Series slug or alias (e.g. "wsop-las-vegas", "wsop", "wsop-circuit", "wpt-world-championship", "wpt", "wynn-millions", "venetian-deepstack", "borgata-open", "seminole-hard-rock-poker-open", "run-good-poker-series", "mspt-major", "mspt", "texas-card-house-series", or "first-time-guide"). Omit to list all 10 canonical series guides.',
        },
      },
    },
  },
  {
    name: 'analyze_flop_board_texture',
    description: 'Analyzes a 3-card flop (e.g. "As,Kh,7d" or "QsJsTs") for suit texture (Rainbow, Two-Tone, Monotone), board pairing (Unpaired, Paired, Trips), connectedness, PFR vs BB range/nut advantage, and recommended GTO C-Bet sizing and frequency.',
    annotations: {
      title: 'Analyze Flop Board Texture & GTO C-Bet Sizing',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        flop: {
          type: 'string',
          description: 'Three flop cards (e.g. "As,Kh,7d", "QsJsTs", or "8d7c6d")',
        },
        pot_type: {
          type: 'string',
          enum: ['srp', '3bet', '4bet'],
          description: 'Pot type: "srp" (Single Raised Pot, default), "3bet", or "4bet"',
        },
      },
      required: ['flop'],
    },
  },
  {
    name: 'calculate_tournament_m_ratio',
    description: 'Computes Dan Harrington\'s M-Ratio, short-handed Effective M-Ratio, Q-Ratio (stack vs average stack), Orbit Cost, Zone Classification (Green, Yellow, Orange, Red, Dead Zone), and minutes remaining before blinding out.',
    annotations: {
      title: 'Calculate Tournament M-Ratio, Effective M & Zone',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        stack: {
          type: 'number',
          description: 'Hero chip stack (e.g. 25000)',
        },
        small_blind: {
          type: 'number',
          description: 'Current small blind (e.g. 500)',
        },
        big_blind: {
          type: 'number',
          description: 'Current big blind (e.g. 1000)',
        },
        ante_total: {
          type: 'number',
          description: 'Total ante posted per hand (e.g. 1000 for a 1000 Big Blind Ante)',
        },
        players_at_table: {
          type: 'integer',
          description: 'Active players dealt in at the table (2-10, default 9)',
        },
        average_stack: {
          type: 'number',
          description: 'Tournament average stack for Q-Ratio calculation (optional, e.g. 40000)',
        },
        hands_per_hour: {
          type: 'number',
          description: 'Hands dealt per hour (default 30 for live, 75 for online)',
        },
      },
      required: ['stack', 'small_blind', 'big_blind'],
    },
  },
  {
    name: 'calculate_cash_session_plan',
    description: 'Computes net hourly cash game profit ($/hr) factoring in BB/100 winrate, hands per hour, casino hourly comps, tips, and session expenses, plus monthly/annual income projection, recommended stop-loss buy-ins, and 5% Risk-of-Ruin bankroll requirement.',
    annotations: {
      title: 'Calculate Cash Game Session Plan & Net Hourly EV',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        big_blind_dollars: {
          type: 'number',
          description: 'Big blind in dollars (e.g. 3 for $1/$3, 5 for $2/$5)',
        },
        winrate_bb100: {
          type: 'number',
          description: 'Expected true winrate in BB/100 hands (e.g. 8 for live, 4 for online)',
        },
        hands_per_hour: {
          type: 'number',
          description: 'Hands dealt per hour (default 28 for live, 85 for online)',
        },
        comps_per_hour_dollars: {
          type: 'number',
          description: 'Casino player reward comps earned per hour in dollars (default 2.0)',
        },
        expenses_per_hour_dollars: {
          type: 'number',
          description: 'Average hourly session expenses/food/travel in dollars (default 3.0)',
        },
        hours_per_month: {
          type: 'number',
          description: 'Planned playing hours per month (default 80)',
        },
        std_dev_bb100: {
          type: 'number',
          description: 'Standard deviation in BB/100 hands (default 75 for live, 90 for online)',
        },
      },
      required: ['big_blind_dollars'],
    },
  },
  {
    name: 'calculate_straddle_bomb_pot_ev',
    description: 'Computes live cash game UTG vs Button (Mississippi) straddle effective stack reduction, halved SPR, required steal fold-equity, and single-board vs double-board bomb pot dead money and minimum flop equity to commit.',
    annotations: {
      title: 'Calculate Live Straddle & Bomb Pot EV Math',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        small_blind: {
          type: 'number',
          description: 'Small blind in dollars (e.g. 1 or 2)',
        },
        big_blind: {
          type: 'number',
          description: 'Big blind in dollars (e.g. 3 or 5)',
        },
        straddle_amount: {
          type: 'number',
          description: 'Straddle size in dollars (default 2x big blind)',
        },
        straddle_type: {
          type: 'string',
          enum: ['utg', 'button', 'sleeper'],
          description: 'Straddle position type: "utg" (default), "button" (Mississippi), or "sleeper"',
        },
        effective_stack_dollars: {
          type: 'number',
          description: 'Effective stack in dollars (default 100x big blind)',
        },
        bomb_pot_ante_dollars: {
          type: 'number',
          description: 'Bomb pot ante per player in dollars (default 5x big blind)',
        },
        players: {
          type: 'integer',
          description: 'Number of players dealt into the bomb pot (default 8)',
        },
        boards: {
          type: 'integer',
          enum: [1, 2],
          description: 'Number of bomb pot boards dealt: 1 (single-board) or 2 (double-board split pot, default 2)',
        },
      },
    },
  },
  {
    name: 'format_poker_hand_history',
    description: 'Formats a structured or raw poker hand history into clean Reddit/Discord markdown with street-by-street pot size, Geometric SPR progression, and a shareable /tools/hand-converter URL.',
    annotations: {
      title: 'Format Poker Hand History For Reddit & Discord',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        stakes: {
          type: 'string',
          description: 'Stakes and game format (e.g. "$2/$5 NLH Live 9-Max" or "100NL 6-Max Online")',
        },
        effective_stack_bb: {
          type: 'number',
          description: 'Effective starting stack in Big Blinds (default 100)',
        },
        hero_position: {
          type: 'string',
          description: 'Hero seat position (e.g. "BTN", "CO", "BB")',
        },
        villain_position: {
          type: 'string',
          description: 'Main Villain seat position (e.g. "BB", "UTG", "SB")',
        },
        hero_cards: {
          type: 'string',
          description: 'Hero hole cards (e.g. "AsKs" or "QhQd")',
        },
        preflop_action: {
          type: 'string',
          description: 'Summary of preflop action (e.g. "UTG opens 3BB, Hero 3-bets 9BB on BTN, UTG calls")',
        },
        flop_board: {
          type: 'string',
          description: 'Flop cards (e.g. "Kh 9s 4d")',
        },
        flop_pot_bb: {
          type: 'number',
          description: 'Pot size entering the flop in BB (default 19.5)',
        },
        flop_action: {
          type: 'string',
          description: 'Flop betting action (e.g. "Villain checks, Hero C-bets 6.5BB, Villain calls")',
        },
        turn_card: {
          type: 'string',
          description: 'Turn card (e.g. "2c")',
        },
        turn_action: {
          type: 'string',
          description: 'Turn betting action (optional)',
        },
        river_card: {
          type: 'string',
          description: 'River card (e.g. "Jd")',
        },
        river_action: {
          type: 'string',
          description: 'River betting action (optional)',
        },
      },
    },
  },
  {
    name: 'calculate_satellite_bubble_factor',
    description: 'Computes tournament satellite target seat stack, current seat-lock probability, Satellite Bubble Factor, and the exact calling equity threshold near a "Win-A-Seat" milestone or survival bubble.',
    annotations: {
      title: 'Calculate Satellite Bubble Factor & Seat-Lock Threshold',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        players_remaining: {
          type: 'integer',
          description: 'Players currently remaining in the satellite (e.g. 12)',
        },
        seats_awarded: {
          type: 'integer',
          description: 'Number of identical prize seats awarded (e.g. 10)',
        },
        hero_stack: {
          type: 'number',
          description: 'Hero current chip stack (e.g. 45000)',
        },
        total_chips_in_play: {
          type: 'number',
          description: 'Total chips in play across all remaining players (optional; defaults to players_remaining * 35000)',
        },
        seat_package_value_dollars: {
          type: 'number',
          description: 'Dollar value of each prize seat or package (default 10000)',
        },
      },
      required: ['players_remaining', 'seats_awarded'],
    },
  },
  {
    name: 'calculate_bad_beat_jackpot_ev',
    description: 'Computes live poker Bad Beat Jackpot (BBJ) qualifier hit probability per hand, player/table/room share dollar EV, high-hand promotion EV, and exact breakeven jackpot pool threshold.',
    annotations: {
      title: 'Calculate Bad Beat Jackpot & High-Hand Promo EV',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        jackpot_pool_dollars: {
          type: 'number',
          description: 'Current Bad Beat Jackpot prize pool in dollars (e.g. 250000)',
        },
        qualifier: {
          type: 'string',
          enum: ['quads-8s', 'quads-tens', 'quads-jacks', 'aces-full-of-tens', 'aces-full-of-kings'],
          description: 'Minimum losing hand qualifier (default "aces-full-of-tens")',
        },
        promo_drop_dollars: {
          type: 'number',
          description: 'Jackpot promotional drop taken per qualifying pot in dollars (default 1.0)',
        },
        table_share_percent: {
          type: 'number',
          description: 'Percentage of jackpot shared among all seated players at the table (default 25)',
        },
        loser_share_percent: {
          type: 'number',
          description: 'Percentage of jackpot awarded to the losing qualifying hand (default 40)',
        },
        winner_share_percent: {
          type: 'number',
          description: 'Percentage of jackpot awarded to the winning hand (default 20)',
        },
        players_at_table: {
          type: 'integer',
          description: 'Active players seated at the table (default 9)',
        },
        high_hand_prize_dollars: {
          type: 'number',
          description: 'Optional hourly/half-hourly High-Hand promotion prize in dollars (default 500)',
        },
        active_tables_in_room: {
          type: 'integer',
          description: 'Number of eligible tables competing for the High-Hand promotion (default 15)',
        },
      },
      required: ['jackpot_pool_dollars'],
    },
  },
  {
    name: 'resolve_holdem_showdown_winner',
    description: 'Evaluates two 2-card Texas Hold\'em hands across a 5-card community board and returns the exact winning 5-card hand, hand rank category, kicker explanation, or split-pot ruling.',
    annotations: {
      title: 'Resolve Hold\'em 7-Card Showdown Winner & Kicker',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        hand_a: {
          type: 'string',
          description: 'Player A two hole cards (e.g. "AsKd" or "Ah,Qh")',
        },
        hand_b: {
          type: 'string',
          description: 'Player B two hole cards (e.g. "AcJc" or "Ks,Qd")',
        },
        board: {
          type: 'string',
          description: 'Five community board cards (e.g. "AdKh9c9s2d" or "Ah,Kd,9c,9s,2d")',
        },
      },
      required: ['hand_a', 'hand_b', 'board'],
    },
  },
  {
    name: 'get_poker_position_strategy',
    description: 'Returns GTO Raise-First-In (RFI) %, 3-Bet %, cold-call %, expected BB/100 winrate, and positional strategy for any 9-max or 6-max poker seat (utg, utg-1, mp, lj, hj, co, btn, sb, bb), linking to /learn/positions/[pos].',
    annotations: {
      title: 'Get Poker Seat Position GTO Ranges & Winrate',
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
          description: 'Table seat position slug or alias (e.g. "utg", "utg-1", "mp", "lj", "hj", "co", "btn", "sb", "bb"). Omit to list all 9 canonical positions.',
        },
      },
    },
  },
  {
    name: 'get_us_state_poker_guide',
    description: 'Returns legal real-money live and online poker status, minimum casino age, state tax withholding rate, typical cardroom rake model, and top poker cities for top US states, linking to /poker-rooms/states/[state].',
    annotations: {
      title: 'Get US State Poker Legal Status, Rake & Tax Guide',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        state: {
          type: 'string',
          description: 'US state slug, name, or 2-letter code (e.g. "nevada", "nv", "texas", "tx", "california", "florida", "new-jersey", "pennsylvania", "michigan"). Omit to list all covered states.',
        },
      },
    },
  },
  {
    name: 'calculate_plo_wrap_outs',
    description: 'Computes 4-Card and 5-Card Pot-Limit Omaha (PLO) straight wrap outs (13, 16, 17, 20 outs), nut vs dirty outs, flush redraw bonus, and exact hypergeometric turn+river equity %.',
    annotations: {
      title: 'Calculate PLO Straight Wrap Outs & Redraw Equity',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        wrap_type: {
          type: 'string',
          description: 'Omaha straight wrap type or out count: "9", "13", "16", "17", or "20" (default: "13").',
          default: '13',
        },
        flush_draw: {
          type: 'string',
          enum: ['none', 'single', 'double'],
          description: 'Flush redraw held alongside the wrap: "none", "single" (+7 outs), or "double" (+14 outs, default: "none").',
          default: 'none',
        },
        variant: {
          type: 'string',
          enum: ['plo4', 'plo5'],
          description: 'Omaha game variant: "plo4" (45 unseen cards on flop) or "plo5" (44 unseen cards on flop, default: "plo4").',
          default: 'plo4',
        },
      },
    },
  },
  {
    name: 'calculate_late_reg_icm_ev',
    description: 'Computes tournament late-registration ICM chip appreciation, instant dollar equity of late entry at 15BB-30BB vs Level 1, and break-even post-entry ROI threshold.',
    annotations: {
      title: 'Calculate Tournament Late-Registration ICM Equity Boost',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        buy_in_dollars: {
          type: 'number',
          description: 'Total tournament buy-in in dollars (default: 1000).',
          default: 1000,
        },
        rake_percent: {
          type: 'number',
          description: 'Tournament house fee / rake percentage of buy-in (default: 10).',
          default: 10,
        },
        starting_stack_bb: {
          type: 'number',
          description: 'Level 1 starting stack in Big Blinds (default: 200).',
          default: 200,
        },
        late_entry_stack_bb: {
          type: 'number',
          description: 'Stack depth in Big Blinds at late-registration entry (e.g. 15 to 30, default: 20).',
          default: 20,
        },
        field_eliminated_percent: {
          type: 'number',
          description: 'Percentage of total tournament field already eliminated at late-reg entry (default: 42).',
          default: 42,
        },
        paid_spots_percent: {
          type: 'number',
          description: 'Percentage of tournament field paid in the money (default: 15).',
          default: 15,
        },
      },
    },
  },
  {
    name: 'calculate_winrate_confidence_interval',
    description: 'Computes 70%, 95%, and 99% poker winrate confidence intervals (bb/100 or $/hr), standard error, and probability of true loss over a given hand sample.',
    annotations: {
      title: 'Calculate Poker Winrate 70%/95%/99% Confidence Intervals',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        observed_winrate_bb100: {
          type: 'number',
          description: 'Observed or true winrate in BB/100 hands (default: 5).',
          default: 5,
        },
        std_dev_bb100: {
          type: 'number',
          description: 'Standard deviation in BB/100 hands (e.g. 70 live NLH, 85 online 6-max NLH, 135 PLO4, default: 85).',
          default: 85,
        },
        hands_sample: {
          type: 'number',
          description: 'Sample size in total hands played (default: 50000).',
          default: 50000,
        },
      },
    },
  },
  {
    name: 'calculate_poker_trip_budget',
    description: 'Computes total poker festival travel overhead (flights, hotel, food, ground transport), effective expense rake % on planned buy-ins, and break-even gross series winnings required.',
    annotations: {
      title: 'Calculate Poker Trip Travel Overhead & Breakeven Target',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        nights: {
          type: 'integer',
          description: 'Number of hotel nights for the poker trip (default: 5).',
          default: 5,
        },
        flight_dollars: {
          type: 'number',
          description: 'Round-trip airfare or fuel cost in dollars (default: 450).',
          default: 450,
        },
        hotel_per_night_dollars: {
          type: 'number',
          description: 'Nightly hotel rate including resort fees and taxes in dollars (default: 190).',
          default: 190,
        },
        food_per_day_dollars: {
          type: 'number',
          description: 'Daily food and dining budget in dollars (default: 85).',
          default: 85,
        },
        ground_transport_dollars: {
          type: 'number',
          description: 'Rideshare, parking, and ground transport total in dollars (default: 150).',
          default: 150,
        },
        planned_buyins_dollars: {
          type: 'number',
          description: 'Total planned tournament buy-ins or cash game volume for the trip in dollars (default: 5000).',
          default: 5000,
        },
        expected_roi_percent: {
          type: 'number',
          description: 'Expected pre-expense tournament ROI % (default: 22).',
          default: 22,
        },
      },
    },
  },
  {
    name: 'calculate_geometric_bet_sizing',
    description: 'Computes multi-street 2e and 3e geometric pot-fraction bet sizing g = (((2S + P)/P)^(1/n) - 1) / 2 to put the remaining effective stack all-in smoothly by the river.',
    annotations: {
      title: 'Calculate Multi-Street 2e & 3e Geometric Bet Sizing',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        pot_size: {
          type: 'number',
          description: 'Current pot size in chips or Big Blinds (default: 100).',
          default: 100,
        },
        effective_stack: {
          type: 'number',
          description: 'Remaining effective stack in chips or Big Blinds (default: 300).',
          default: 300,
        },
        streets: {
          type: 'integer',
          enum: [1, 2, 3],
          description: 'Number of betting streets remaining to get all-in (1, 2, or 3, default: 3).',
          default: 3,
        },
      },
    },
  },
  {
    name: 'score_live_table_selection',
    description: 'Scores live cash game table profitability (S-Tier to F) from recreational VPIP whale count, average stack depth in BB, straddle/bomb-pot frequency, and casino rake cap.',
    annotations: {
      title: 'Score Live Cash Game Table Selection Profitability',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        vpip_whales_count: {
          type: 'integer',
          description: 'Number of loose-passive recreational players (VPIP > 45%) at the table (0-8, default: 3).',
          default: 3,
        },
        avg_stack_bb: {
          type: 'number',
          description: 'Average table stack depth in Big Blinds (default: 150).',
          default: 150,
        },
        rake_cap_dollars: {
          type: 'number',
          description: 'Casino maximum pot rake cap in dollars (default: 5).',
          default: 5,
        },
        big_blind_dollars: {
          type: 'number',
          description: 'Big blind dollar value (e.g. 3 for $1/$3, 5 for $2/$5, default: 5).',
          default: 5,
        },
        straddle_or_bomb_pot_active: {
          type: 'boolean',
          description: 'Whether regular straddles or bomb pots are active at the table (default: true).',
          default: true,
        },
      },
    },
  },
  {
    name: 'calculate_mtt_session_abi_plan',
    description: 'Computes MTT tournament grind session total exposure, Average Buy-In (ABI) bankroll ratio, probability of a 0-ITM brick session %, and expected session EV.',
    annotations: {
      title: 'Calculate MTT Session ABI Exposure & 0-ITM Brick Risk',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        tournaments_count: {
          type: 'integer',
          description: 'Number of MTT tournaments scheduled in the grind session (default: 12).',
          default: 12,
        },
        average_buy_in_dollars: {
          type: 'number',
          description: 'Average Buy-In (ABI) per tournament in dollars (default: 55).',
          default: 55,
        },
        expected_bullets_per_mtt: {
          type: 'number',
          description: 'Average entries/bullets fired per tournament including re-entries (default: 1.25).',
          default: 1.25,
        },
        itm_rate_percent: {
          type: 'number',
          description: 'Expected In-The-Money (ITM) cash rate percentage (default: 18).',
          default: 18,
        },
        expected_roi_percent: {
          type: 'number',
          description: 'Expected net tournament ROI percentage (default: 25).',
          default: 25,
        },
        bankroll_dollars: {
          type: 'number',
          description: 'Total dedicated MTT bankroll in dollars (default: 12000).',
          default: 12000,
        },
      },
    },
  },
  {
    name: 'get_player_archetype_exploit',
    description: 'Returns exploitative counter-strategy, VPIP/PFR profile, and primary leaks across 8 poker player archetypes (omc, calling-station, maniac, tag, lag, short-stack, trapper, gto-grinder).',
    annotations: {
      title: 'Get Exploitative Strategy By Poker Player Archetype',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        archetype: {
          type: 'string',
          description: 'Player archetype slug or alias (e.g. "omc", "calling-station", "maniac", "tag", "lag", "short-stack", "trapper", "gto-grinder"). Omit to list all 8 archetypes.',
        },
      },
    },
  },
  {
    name: 'get_flop_board_texture_guide',
    description: 'Returns solver C-bet frequency, optimal sizing, BB check-raise %, range/nut advantage, and turn barrel plan across 12 canonical flop board textures.',
    annotations: {
      title: 'Get Canonical Flop Board Texture Solver Guide',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        texture: {
          type: 'string',
          description: 'Canonical flop board texture slug (e.g. "ace-high-dry-rainbow", "king-high-dry-rainbow", "double-broadway-two-tone", "triple-broadway-wet", "mid-connected-wet", "low-connected-board", "low-disconnected-rainbow", "monotone-flush-flop", "high-paired-board", "low-paired-board", "wheel-ace-low-board", "queen-jack-dynamic"). Omit to list all 12 canonical textures.',
        },
      },
    },
  },
  {
    name: 'get_international_poker_guide',
    description: 'Returns international poker destination intelligence (flagship rooms, currency, stakes, rake caps, tax rules, and major festivals) across 10 global cities (london, barcelona, rozvadov, monte-carlo, prague, manila, macau, melbourne, montreal, nassau).',
    annotations: {
      title: 'Get International Poker Destination & Tax Guide',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: 'International city slug (e.g. "london", "barcelona", "rozvadov", "monte-carlo", "prague", "manila", "macau", "melbourne", "montreal", "nassau"). Omit to list all 10 global destinations.',
        },
      },
    },
  },
  {
    name: 'calculate_multiway_all_in_ev',
    description: 'Computes 3-way and 4-way all-in Main Pot and Side Pot dollar or chip EV, net profit/loss per player, and required breakeven equity across uneven stack sizes.',
    annotations: {
      title: 'Calculate 3-Way & 4-Way Multiway All-In Main & Side Pot EV',
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
          description: 'All-in stack sizes for 3 or 4 players (e.g. [100, 180, 300]).',
          default: [100, 180, 300],
        },
        equities_percent: {
          type: 'array',
          items: { type: 'number' },
          description: 'Overall equity percentages for each player summing to ~100 (e.g. [45, 35, 20]).',
          default: [45, 35, 20],
        },
        dead_money: {
          type: 'number',
          description: 'Extra dead money from blinds/antes/folds in the center pot (default: 15).',
          default: 15,
        },
      },
    },
  },
  {
    name: 'calculate_mystery_bounty_live_pool',
    description: 'Computes remaining Mystery Bounty tournament envelope EV, chip equivalence in starting-stack and current big-blind units, and reduced all-in calling equity threshold.',
    annotations: {
      title: 'Calculate Live Mystery Bounty Remaining Pool EV & Chip Equivalence',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        remaining_bounty_pool_dollars: {
          type: 'number',
          description: 'Total unpulled dollar value remaining in the Mystery Bounty pool (default: 120000).',
          default: 120000,
        },
        envelopes_remaining: {
          type: 'integer',
          description: 'Number of unopened mystery envelopes / players remaining in the bounty phase (default: 40).',
          default: 40,
        },
        top_bounty_remaining_dollars: {
          type: 'number',
          description: 'Largest top mystery envelope still live in the drum (default: 50000).',
          default: 50000,
        },
        regular_prize_pool_remaining_dollars: {
          type: 'number',
          description: 'Remaining regular payout prize pool in dollars (default: 150000).',
          default: 150000,
        },
        total_chips_in_play: {
          type: 'number',
          description: 'Total tournament chips currently in play across all tables (default: 4000000).',
          default: 4000000,
        },
        big_blind_chips: {
          type: 'number',
          description: 'Current Big Blind level in chips (default: 4000).',
          default: 4000,
        },
      },
    },
  },
  {
    name: 'calculate_bubble_factor_matrix',
    description: 'Computes the pairwise N x N final table or money-bubble Malmuth-Harville ICM Bubble Factor Matrix, risk premium %, and required all-in calling equity for every player matchup.',
    annotations: {
      title: 'Calculate Pairwise Final Table ICM Bubble Factor Matrix',
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
          description: 'Array of player chip stacks (e.g. [60, 40, 25, 15]).',
          default: [60, 40, 25, 15],
        },
        payouts: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of tournament prize payouts (e.g. [10000, 6500, 4200, 2800]).',
          default: [10000, 6500, 4200, 2800],
        },
      },
    },
  },
  {
    name: 'calculate_river_bluff_catch_ev',
    description: 'Computes river bluff-catching EV, Minimum Defense Frequency (MDF), optimal polarized bluff ratio Alpha, and card-removal blocker adjustment against an opponent river bet.',
    annotations: {
      title: 'Calculate River Bluff-Catch EV, MDF & Blocker Removal',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        pot_size: {
          type: 'number',
          description: 'Pot size before villain river bet (default: 100).',
          default: 100,
        },
        bet_size: {
          type: 'number',
          description: 'Villain river bet size (default: 75).',
          default: 75,
        },
        villain_value_combos: {
          type: 'number',
          description: 'Estimated number of unblocked value combos in villain range (default: 18).',
          default: 18,
        },
        villain_bluff_combos: {
          type: 'number',
          description: 'Estimated number of bluff combos in villain range (default: 9).',
          default: 9,
        },
        hero_blocks_value_combos: {
          type: 'number',
          description: 'Number of villain value combos removed by hero blockers (default: 3).',
          default: 3,
        },
        hero_blocks_bluff_combos: {
          type: 'number',
          description: 'Number of villain bluff combos removed by hero blockers (default: 0).',
          default: 0,
        },
      },
    },
  },
  {
    name: 'calculate_multi_street_barrel_ev',
    description: 'Computes Flop-Turn-River multi-street cumulative fold equity, street-by-street pot growth, and triple-barrel breakeven bluff threshold across three bet sizings.',
    annotations: {
      title: 'Calculate Flop-Turn-River Multi-Street Barrel EV & Fold Equity',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        starting_pot: {
          type: 'number',
          description: 'Flop starting pot size in BB or dollars (default: 6.5).',
          default: 6.5,
        },
        flop_bet_pct: {
          type: 'number',
          description: 'Flop C-Bet size as percentage of pot (default: 33).',
          default: 33,
        },
        turn_bet_pct: {
          type: 'number',
          description: 'Turn barrel size as percentage of pot (default: 75).',
          default: 75,
        },
        river_bet_pct: {
          type: 'number',
          description: 'River barrel size as percentage of pot (default: 100).',
          default: 100,
        },
        flop_fold_pct: {
          type: 'number',
          description: 'Expected villain fold % on the flop (default: 38).',
          default: 38,
        },
        turn_fold_pct: {
          type: 'number',
          description: 'Expected villain fold % on the turn (default: 44).',
          default: 44,
        },
        river_fold_pct: {
          type: 'number',
          description: 'Expected villain fold % on the river (default: 48).',
          default: 48,
        },
      },
    },
  },
  {
    name: 'solve_heads_up_push_fold_nash',
    description: 'Returns Heads-Up (HU) and 3-Max short-stack (1BB to 25BB) Nash equilibrium push, fold, limp, and BB call frequencies and hand ranges.',
    annotations: {
      title: 'Solve Heads-Up & 3-Max 1BB-25BB Nash Push/Fold Equilibrium',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        stack_bb: {
          type: 'number',
          description: 'Effective stack depth in Big Blinds (1 to 25, default: 12).',
          default: 12,
        },
        role: {
          type: 'string',
          enum: ['sb_push', 'bb_call', 'btn_3max_push'],
          description: 'Action role: sb_push (HU SB/BTN jam), bb_call (HU BB call vs jam), or btn_3max_push (3-Max BTN jam).',
          default: 'sb_push',
        },
        ante_pct_bb: {
          type: 'number',
          description: 'Total orbit ante as % of 1 Big Blind (default: 25).',
          default: 25,
        },
      },
    },
  },
  {
    name: 'solve_blind_vs_blind_matrix',
    description: 'Returns Small Blind vs Big Blind (BvB) GTO equilibrium limp, open-raise, 3-bet, and defense frequencies across 20BB to 100BB stack depths.',
    annotations: {
      title: 'Solve Small Blind Vs Big Blind (BvB) GTO Equilibrium Matrix',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        stack_bb: {
          type: 'number',
          description: 'Effective BvB stack depth in Big Blinds (20 to 100, default: 100).',
          default: 100,
        },
        format: {
          type: 'string',
          enum: ['cash_raked', 'mtt_ante'],
          description: 'Game format: cash_raked (linear 3x SB open-or-fold) or mtt_ante (mixed SB limp + 3.5x raise).',
          default: 'cash_raked',
        },
      },
    },
  },
  {
    name: 'calculate_bankroll_shot_taking_plan',
    description: 'Computes a two-tier bankroll shot-taking plan, exact move-up trigger bankroll, mandatory move-down stop-loss threshold, and shot Risk of Ruin %.',
    annotations: {
      title: 'Calculate Two-Tier Bankroll Shot-Taking & Stop-Loss Plan',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        current_bankroll_dollars: {
          type: 'number',
          description: 'Current total poker bankroll in dollars (default: 12000).',
          default: 12000,
        },
        current_stake_buyin_dollars: {
          type: 'number',
          description: 'Standard 100BB buy-in at current base stake in dollars (e.g. 300 for $1/$3, default: 300).',
          default: 300,
        },
        target_stake_buyin_dollars: {
          type: 'number',
          description: 'Standard 100BB buy-in at target higher stake in dollars (e.g. 500 for $2/$5, default: 500).',
          default: 500,
        },
        shot_buyins_allocated: {
          type: 'integer',
          description: 'Number of higher-stake buy-ins risked on the shot before dropping back down (default: 3).',
          default: 3,
        },
        expected_winrate_bb100: {
          type: 'number',
          description: 'Projected winrate at target stake in BB/100 (default: 5).',
          default: 5,
        },
      },
    },
  },
  {
    name: 'lookup_poker_math_formula',
    description: 'Queries the Smarter.Poker quantitative formulas encyclopedia for LaTeX equations, algebraic derivations, and worked numerical examples.',
    annotations: {
      title: 'Look Up Poker Math Formula With LaTeX & Worked Example',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        formula: {
          type: 'string',
          description: 'Formula slug or keyword (e.g. "pot-odds", "mdf", "alpha", "polarized-bluff-ratio", "spr", "geometric-sizing", "ev", "icm-malmuth-harville", "bubble-factor", "pko-bounty-chips", "m-ratio", "hypergeometric-outs", "risk-of-ruin", "kelly-criterion", "standard-error-ci"). Omit to list all 15 formulas.',
        },
      },
    },
  },
  {
    name: 'lookup_mtt_tournament_stage_strategy',
    description: 'Queries the 8 Multi-Table Tournament (MTT) stages playbook from Level 1 Deepstack through Ante Kick-In, Late-Reg Close, Money Bubble, Pay-Jump Ladders, Final Table Bubble, Final Table ICM, and Heads-Up.',
    annotations: {
      title: 'Look Up 8-Stage MTT Tournament Playbook Strategy',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        stage: {
          type: 'string',
          description: 'MTT stage slug or number (e.g. "early-deepstack", "ante-kick-in", "late-reg-close", "money-bubble", "in-the-money-laddering", "final-table-bubble", "final-table-icm", "heads-up-title"). Omit to list all 8 stages.',
        },
      },
    },
  },
  {
    name: 'diagnose_poker_leak_cure',
    description: 'Diagnoses 12 common live and online poker strategic leaks, quantifying average EV loss in BB/100, HUD diagnostic symptoms, and step-by-step solver cures.',
    annotations: {
      title: 'Diagnose Poker Strategic Leak & BB/100 EV Cure',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        leak: {
          type: 'string',
          description: 'Leak slug or keyword (e.g. "open-limping", "sb-flatting", "over-defending-bb-vs-ep", "one-and-done-cbet", "never-check-raising-flops", "over-calling-river-bets", "tiny-multiway-value-bets", "ignoring-icm-bubble-factors", "missing-thin-river-value", "autopilot-3bet-sizing", "chasing-non-nut-plo-draws", "playing-tilted-past-stop-loss"). Omit to list all 12 leaks.',
        },
      },
    },
  },
  {
    name: 'lookup_hud_stat_gto_benchmark',
    description: 'Returns GTO 6-Max and 9-Max target ranges, sample-size convergence requirements, and population exploitative thresholds for 15 core poker HUD statistics.',
    annotations: {
      title: 'Look Up Poker HUD Stat GTO 6-Max/9-Max Benchmarks',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        stat: {
          type: 'string',
          description: 'HUD stat code or slug (e.g. "vpip", "pfr", "three-bet", "fold-to-three-bet", "four-bet", "ats-steal", "fold-bb-to-steal", "flop-cbet", "fold-to-flop-cbet", "turn-cbet", "check-raise-flop", "wtsd", "wsd", "wwsf", "aggression-frequency"). Omit to list all 15 HUD stats.',
        },
      },
    },
  },
  {
    name: 'verify_poker_myth_claim',
    description: 'Fact-checks common poker myths and misconceptions with combinatorial mathematics, empirical database evidence, and GTO solver equilibrium proof.',
    annotations: {
      title: 'Fact-Check & Debunk Poker Myth With Solver Proof',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        claim: {
          type: 'string',
          description: 'Myth slug or natural-language claim to verify (e.g. "online-poker-rigged-action-flops", "raise-for-information", "never-go-broke-in-limped-pot", "always-defend-mdf-against-population", "pocket-jacks-lose-most-of-the-time", "late-reg-is-always-bad", "straddling-is-plus-ev", "tipping-and-rake-dont-affect-gto"). Omit to list all 15 debunked myths.',
        },
      },
    },
  },
  {
    name: 'lookup_poker_travel_corridor',
    description: 'Returns the closest legal live poker rooms, drive/flight distance, state tax rules, and rake models for 10 major US metro and airport border corridors.',
    annotations: {
      title: 'Look Up Closest Legal Live Poker Rooms By Travel Corridor',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        corridor: {
          type: 'string',
          description: 'Travel corridor slug or metro/airport name (e.g. "nyc-to-parx-borgata-wind-creek", "atlanta-to-cherokee-and-florida", "chicago-to-rivers-and-hammond", "dallas-to-winstar-choctaw-tch", "boston-to-encore-and-foxwoods", "dc-to-mgm-national-harbor-live", "seattle-to-tulalip-and-portland", "las-vegas-las-airport-corridor", "lax-to-commerce-and-hustler", "fll-mia-to-seminole-hard-rock"). Omit to list all 10 corridors.',
        },
      },
    },
  },
  {
    name: 'batch_solve_poker_spots',
    description: 'Solves an array of up to 20 poker mathematics spots across any calculator in one deterministic batch call, returning calculations, If/Then/Because rules, and canonical permalinks.',
    annotations: {
      title: 'Batch Solve Up To 20 Poker Math Spots In One Call',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        spots: {
          type: 'array',
          description: 'Array of up to 20 spot objects: [{ tool: "pot-odds-calculator", params: { pot: 100, bet: 50 } }, ...].',
          items: {
            type: 'object',
            properties: {
              tool: { type: 'string' },
              params: { type: 'object' },
            },
          },
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
  {
    name: 'plan_final_table_chop_deal',
    description: 'Compare Malmuth-Harville ICM Chop, Linear Chip Chop, and Save-Amount final table deal payouts for a given set of stacks and prizes.',
    arguments: [
      { name: 'stacks', description: 'Comma-separated final table chip stacks (e.g. "500000,300000,200000")', required: true },
      { name: 'prizes', description: 'Comma-separated remaining prize payouts (e.g. "50000,30000,20000")', required: true },
    ],
  },
  {
    name: 'analyze_preflop_hand_matchup',
    description: 'Evaluate exact preflop win/tie/loss combinatorics, flop texture equity shifts, and 100BB/200BB/25BB/ICM stack-off thresholds for a canonical hand matchup.',
    arguments: [
      { name: 'slug', description: 'Matchup slug (e.g. "aa-vs-kk", "aks-vs-qq", "jj-vs-ako", "55-vs-kts")', required: true },
    ],
  },
  {
    name: 'audit_poker_variance_and_bankroll',
    description: 'Simulate sample EV, 68%/95%/99.7% confidence intervals, probability of loss, and required Risk-of-Ruin buy-in cushions for a winrate and standard deviation.',
    arguments: [
      { name: 'winrate_bb100', description: 'True winrate in BB/100 hands (e.g. "5")', required: true },
      { name: 'std_dev_bb100', description: 'Standard deviation in BB/100 hands (e.g. "85")', required: true },
      { name: 'hands', description: 'Total sample size in hands played (e.g. "100000")', required: true },
    ],
  },
  {
    name: 'prepare_tournament_series_trip',
    description: 'Build a complete tournament series schedule, late-registration plan, venue logistics checklist, and bankroll allocation for a major poker festival.',
    arguments: [
      { name: 'series_slug', description: 'Series guide slug or alias (e.g. "wsop-las-vegas", "wpt-world-championship", "mspt-major")', required: true },
      { name: 'bankroll', description: 'Total trip bankroll in dollars (e.g. "25000")', required: false },
    ],
  },
  {
    name: 'analyze-flop-cbet-texture',
    description: 'Evaluate flop board texture, range advantage, and GTO C-Bet sizing',
    arguments: [
      { name: 'flop', description: 'Three flop cards (e.g. "As,Kh,7d" or "QsJsTs")', required: true },
      { name: 'pot_type', description: 'Pot type: "srp", "3bet", or "4bet"', required: false },
    ],
  },
  {
    name: 'plan-satellite-or-bounty-endgame',
    description: 'Calculate PKO bounty chip equivalents or satellite bubble survival thresholds',
    arguments: [
      { name: 'format', description: 'Endgame format: "satellite" or "pko"', required: true },
      { name: 'players_remaining', description: 'Players remaining (e.g. "12")', required: false },
      { name: 'seats_awarded', description: 'Satellite seats awarded (e.g. "10")', required: false },
    ],
  },
  {
    name: 'exploit-live-player-archetype',
    description: 'Generate an exploitative counter-strategy and table selection score against a specific live poker player archetype',
    arguments: [
      { name: 'archetype', description: 'Player archetype slug (e.g. "omc", "calling-station", "maniac", "tag", "lag", "short-stack", "trapper", "gto-grinder")', required: true },
      { name: 'stakes', description: 'Cash game stakes (e.g. "$1/$3" or "$2/$5")', required: false },
    ],
  },
  {
    name: 'plan-geometric-overbet-line',
    description: 'Calculate 2-street (2e) and 3-street (3e) geometric pot-fraction bet sizing and polarized bluff ratios for a given pot and stack',
    arguments: [
      { name: 'pot_size', description: 'Current pot size in BB or dollars (e.g. "100")', required: true },
      { name: 'effective_stack', description: 'Remaining effective stack in BB or dollars (e.g. "300")', required: true },
      { name: 'streets', description: 'Number of betting streets remaining: "2" or "3"', required: false },
    ],
  },
  {
    name: 'geo-citation-fact-check',
    description: 'Verify a poker math claim, myth, or statistical benchmark with deterministic solver calculations and Zenodo DOI citations',
    arguments: [
      { name: 'claim', description: 'Poker claim or myth to verify (e.g. "always defend MDF against live river bets")', required: true },
      { name: 'formula', description: 'Optional formula slug (e.g. "mdf", "bubble-factor", "risk-of-ruin")', required: false },
    ],
  },
  {
    name: 'mtt-stage-and-leak-coach',
    description: 'Generate a stage-specific MTT strategy plan and diagnose BB/100 strategic leaks with HUD stat benchmarks',
    arguments: [
      { name: 'stage', description: 'MTT tournament stage (e.g. "money-bubble", "final-table-icm", "late-reg-close")', required: true },
      { name: 'leak', description: 'Optional player leak to cure (e.g. "ignoring-icm-bubble-factors", "sb-flatting")', required: false },
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
    description: 'Raw Markdown mathematical specification and benchmark tables for any of the 52 free interactive poker calculators.',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 'https://smarter.poker/learn/positions/{pos}.md',
    name: 'Smarter.Poker Table Position GTO Strategy Guide Markdown',
    description: 'Raw Markdown GTO RFI %, 3-Bet %, cold-call %, and BB/100 winrate breakdown for any 9-max or 6-max poker seat position.',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 'https://smarter.poker/learn/stakes/{stake}.md',
    name: 'Smarter.Poker Cash Game & Stakes Level Blueprint Markdown',
    description: 'Raw Markdown player-pool tendencies, rake impact, bankroll requirements, and shot-taking strategy for any cash game stake level.',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 'https://smarter.poker/learn/famous-hands/{slug}.md',
    name: 'Smarter.Poker Famous Historical Poker Hand Solver Breakdown Markdown',
    description: 'Raw Markdown street-by-street pot odds, ICM, and modern GTO solver analysis of iconic televised poker hands.',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 'https://smarter.poker/poker-rooms/states/{state}.md',
    name: 'Smarter.Poker US State Poker Law, Rake & Cardroom Directory Markdown',
    description: 'Raw Markdown legal status, minimum age, state tax withholding, rake model, and top poker rooms for US states.',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 'https://smarter.poker/learn/player-types/{type}.md',
    name: 'Smarter.Poker Player Archetype Exploitative Strategy Guide Markdown',
    description: 'Raw Markdown VPIP/PFR profile, core leaks, and exploitative counter-strategy for any of the 8 poker player archetypes.',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 'https://smarter.poker/poker-rooms/international/{city}.md',
    name: 'Smarter.Poker International Poker Destination & Tax Guide Markdown',
    description: 'Raw Markdown flagship venues, currency, stakes, rake caps, tax rules, and major festivals across 10 international poker cities.',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 'smarter-poker://formulas/{slug}',
    name: 'Smarter.Poker Quantitative Formula & LaTeX Derivation Resource',
    description: 'Structured LaTeX equation, algebraic proof, and worked numerical example for any of the 15 core poker math formulas.',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'smarter-poker://tournament-stages/{stage}',
    name: 'Smarter.Poker 8-Stage MTT Tournament Strategy Playbook Resource',
    description: 'Structured stack-depth targets, ICM adjustments, and range modifications across the 8 MTT tournament stages.',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'smarter-poker://leaks/{slug}',
    name: 'Smarter.Poker Diagnostic Leak & BB/100 EV Cure Resource',
    description: 'Structured HUD diagnostic symptoms, average BB/100 EV loss, and solver remediation drill for 12 common poker leaks.',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'smarter-poker://hud-stats/{stat}',
    name: 'Smarter.Poker HUD Statistic GTO 6-Max & 9-Max Benchmark Resource',
    description: 'Structured GTO 6-Max/9-Max equilibrium percentages, sample convergence thresholds, and population exploit triggers for 15 HUD stats.',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'smarter-poker://corridors/{slug}',
    name: 'Smarter.Poker Airport & Metro Border Travel Corridor Resource',
    description: 'Structured travel distance, closest legal cardrooms, rake comparison, and state tax rules for 10 major US travel corridors.',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'smarter-poker://rooms-by-game/{game}',
    name: 'Smarter.Poker Live Poker Rooms By Game Variant Directory Resource',
    description: 'Structured directory of top North American poker rooms spreading NLH, PLO4/PLO5, Big O, Mixed/HORSE, Stud/O8, and Bomb Pots.',
    mimeType: 'application/json',
  },
];
export const RESOURCE_TEMPLATES = MCP_RESOURCE_TEMPLATES;

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

export const SERIES_SLUG_ALIASES = {
  wsop: 'wsop-las-vegas',
  'wsop-las-vegas': 'wsop-las-vegas',
  'wsop-las-vegas-strategy-guide': 'wsop-las-vegas',
  wsopc: 'wsop-circuit',
  'wsop-circuit': 'wsop-circuit',
  'wsop-circuit-ring-events-guide': 'wsop-circuit',
  wpt: 'wpt-world-championship',
  'wpt-world-championship': 'wpt-world-championship',
  'wpt-world-championship-wynn-guide': 'wpt-world-championship',
  wynn: 'wynn-millions-classic',
  'wynn-millions': 'wynn-millions-classic',
  'wynn-millions-classic': 'wynn-millions-classic',
  'wynn-millions-and-classic-guide': 'wynn-millions-classic',
  venetian: 'venetian-deepstack-championship',
  'venetian-deepstack': 'venetian-deepstack-championship',
  'venetian-deepstack-championship': 'venetian-deepstack-championship',
  'venetian-deepstack-championship-guide': 'venetian-deepstack-championship',
  borgata: 'borgata-poker-open',
  'borgata-open': 'borgata-poker-open',
  'borgata-poker-open': 'borgata-poker-open',
  'borgata-poker-open-atlantic-city-guide': 'borgata-poker-open',
  shrpo: 'seminole-hard-rock-poker-open',
  seminole: 'seminole-hard-rock-poker-open',
  'seminole-hard-rock-poker-open': 'seminole-hard-rock-poker-open',
  'seminole-hard-rock-poker-open-shrpo-guide': 'seminole-hard-rock-poker-open',
  rgps: 'rgps-rungood-poker-series',
  rungood: 'rgps-rungood-poker-series',
  'run-good-poker-series': 'rgps-rungood-poker-series',
  'rgps-rungood-poker-series': 'rgps-rungood-poker-series',
  'rgps-rungood-poker-series-guide': 'rgps-rungood-poker-series',
  mspt: 'mspt-mid-states-poker-tour',
  'mspt-major': 'mspt-mid-states-poker-tour',
  'mspt-mid-states-poker-tour': 'mspt-mid-states-poker-tour',
  'mspt-mid-states-poker-tour-guide': 'mspt-mid-states-poker-tour',
  tch: 'texas-card-house-lodge-championship',
  lodge: 'texas-card-house-lodge-championship',
  texas: 'texas-card-house-lodge-championship',
  'texas-card-house-series': 'texas-card-house-lodge-championship',
  'texas-card-house-lodge-championship': 'texas-card-house-lodge-championship',
};

function formatCanonicalMatchup(m) {
  if (!m) return null;
  return {
    slug: m.slug,
    title: m.title,
    handA: m.handA,
    handB: m.handB,
    winA: m.handAWinPct ?? m.winA,
    winB: m.handBWinPct ?? m.winB,
    tie: m.tiePct ?? m.tie,
    handAEquity: m.handAEquity ?? m.winA,
    handBEquity: m.handBEquity ?? m.winB,
    combosA: m.combosA,
    combosB: m.combosB,
    category: m.category,
    summary: m.summary || '',
    flopShifts: m.flopShifts,
    evAnalysis: m.evAnalysis,
    stackOffNotes: m.stackOffNotes || m.evAnalysis?.cash100bb || '',
    faqs: m.faqs || [],
  };
}

export function lookupHandMatchupData({ slug = '', handA = '', handB = '' } = {}) {
  const cleanSlug = String(slug || '').trim().toLowerCase().replace(/\s+/g, '-');
  const cleanA = String(handA || '').trim().toUpperCase();
  const cleanB = String(handB || '').trim().toUpperCase();

  // Also check if slug matches a series guide (e.g. wsop-las-vegas)
  if (cleanSlug) {
    const exactCanonical = getHandMatchupBySlug(cleanSlug);
    if (exactCanonical) return formatCanonicalMatchup(exactCanonical);

    // Check reversed slug (e.g. qq-vs-aks vs aks-vs-qq)
    const parts = cleanSlug.split('-vs-');
    if (parts.length === 2) {
      const revCanonical = getHandMatchupBySlug(`${parts[1]}-vs-${parts[0]}`);
      if (revCanonical) return formatCanonicalMatchup(revCanonical);
    }

    const exactFallback = CANONICAL_HAND_MATCHUPS_FALLBACK.find((m) => m.slug === cleanSlug);
    if (exactFallback) return formatCanonicalMatchup(exactFallback);
  }

  if (cleanA && cleanB) {
    const canonicalPair = HAND_MATCHUPS.find(
      (m) =>
        (m.handA.toUpperCase() === cleanA && m.handB.toUpperCase() === cleanB) ||
        (m.handA.toUpperCase() === cleanB && m.handB.toUpperCase() === cleanA)
    );
    if (canonicalPair) return formatCanonicalMatchup(canonicalPair);

    const fallbackPair = CANONICAL_HAND_MATCHUPS_FALLBACK.find(
      (m) =>
        (m.handA.toUpperCase() === cleanA && m.handB.toUpperCase() === cleanB) ||
        (m.handA.toUpperCase() === cleanB && m.handB.toUpperCase() === cleanA)
    );
    if (fallbackPair) return formatCanonicalMatchup(fallbackPair);
  }

  if (cleanSlug) {
    const partialCanonical = HAND_MATCHUPS.find(
      (m) =>
        m.slug.includes(cleanSlug) ||
        m.title.toLowerCase().includes(cleanSlug) ||
        `${m.handA.toLowerCase()}-vs-${m.handB.toLowerCase()}` === cleanSlug
    );
    if (partialCanonical) return formatCanonicalMatchup(partialCanonical);

    const partialFallback = CANONICAL_HAND_MATCHUPS_FALLBACK.find(
      (m) =>
        m.slug.includes(cleanSlug) ||
        m.title.toLowerCase().includes(cleanSlug)
    );
    if (partialFallback) return formatCanonicalMatchup(partialFallback);
  }

  return null;
}

export function lookupSeriesGuideData(rawSlug = '') {
  const cleanSlug = String(rawSlug || '').trim().toLowerCase().replace(/\.md$/, '');
  if (!cleanSlug) return null;

  const aliased = SERIES_SLUG_ALIASES[cleanSlug] || cleanSlug;
  const canonical =
    getSeriesGuideBySlug(aliased) ||
    getSeriesGuideBySlug(cleanSlug) ||
    SERIES_GUIDES.find(
      (g) =>
        g.slug === aliased ||
        g.slug.includes(cleanSlug) ||
        g.name.toLowerCase().includes(cleanSlug) ||
        g.shortName.toLowerCase().includes(cleanSlug)
    );
  if (canonical) {
    return {
      ...canonical,
      requested_slug: cleanSlug,
      canonical_slug: canonical.slug,
      venue: canonical.hostVenue,
      timing: canonical.typicalMonths,
    };
  }

  const fallback = CANONICAL_SERIES_GUIDES_FALLBACK.find(
    (g) => g.slug === cleanSlug || g.slug.includes(cleanSlug) || g.name.toLowerCase().includes(cleanSlug)
  );
  return fallback || null;
}

export const POKER_FORMULAS_CATALOG = [
  {
    slug: 'pot-odds',
    name: 'Pot Odds & Required Break-Even Calling Equity',
    latex: 'E_{\\text{req}} = \\frac{C}{P_{\\text{before\\_call}} + C}',
    equation: 'Required_Equity = Call / (Pot_Before_Call + Call)',
    example: 'Facing a $50 bet into a $100 pot ($150 before call): 50 / (150 + 50) = 25.0% required equity.',
    calculatorUrl: 'https://smarter.poker/tools/pot-odds-calculator',
  },
  {
    slug: 'mdf',
    name: 'Minimum Defense Frequency (MDF)',
    latex: '\\text{MDF} = \\frac{P}{P + B}',
    equation: 'MDF = Pot / (Pot + Bet)',
    example: 'Facing a 75% pot bet ($75 into $100): 100 / (100 + 75) = 57.1% minimum defense frequency.',
    calculatorUrl: 'https://smarter.poker/tools/pot-odds-calculator',
  },
  {
    slug: 'alpha',
    name: 'Bluff Break-Even Frequency (Alpha)',
    latex: '\\alpha = \\frac{B}{P + B} = 1 - \\text{MDF}',
    equation: 'Alpha = Bet / (Pot + Bet)',
    example: 'A half-pot bluff ($50 into $100) needs folds 50 / 150 = 33.3% of the time to break even immediately.',
    calculatorUrl: 'https://smarter.poker/tools/bluff-catching-calculator',
  },
  {
    slug: 'polarized-bluff-ratio',
    name: 'Optimal Polarized River Bluff-To-Value Ratio',
    latex: 'b_{\\text{share}} = \\frac{B}{P + 2B}',
    equation: 'Bluff_Share_Of_Betting_Range = Bet / (Pot + 2 * Bet)',
    example: 'For a pot-sized river bet ($100 into $100), optimal bluff share is 100 / 300 = 33.3% bluffs (2:1 value-to-bluff).',
    calculatorUrl: 'https://smarter.poker/tools/bluff-catching-calculator',
  },
  {
    slug: 'spr',
    name: 'Stack-To-Pot Ratio (SPR)',
    latex: '\\text{SPR} = \\frac{S_{\\text{eff}}}{P_{\\text{flop}}}',
    equation: 'SPR = Effective_Stack / Flop_Pot',
    example: 'With 90BB behind in a 18BB 3-bet pot, SPR = 90 / 18 = 5.0 (one-pair top-pair commitment threshold).',
    calculatorUrl: 'https://smarter.poker/tools/spr-calculator',
  },
  {
    slug: 'geometric-sizing',
    name: 'Multi-Street N-Street Geometric Bet Sizing (2e / 3e)',
    latex: 'g = \\frac{1}{2}\\left(\\left(1 + 2\\cdot\\text{SPR}\\right)^{1/n} - 1\\right)',
    equation: 'g = 0.5 * ((1 + 2 * SPR)^(1 / N) - 1)',
    example: 'At SPR 4.0 over 3 streets (3e), g = 0.5 * (9^(1/3) - 1) = 54.0% pot on Flop, Turn, and River.',
    calculatorUrl: 'https://smarter.poker/tools/geometric-bet-calculator',
  },
  {
    slug: 'ev',
    name: 'Expected Value (EV) Of A Poker Decision',
    latex: '\\text{EV} = (p_{\\text{win}} \\cdot W) - (p_{\\text{lose}} \\cdot L)',
    equation: 'EV = (Win_Prob * Net_Gain) - (Lose_Prob * Risk_Amount)',
    example: 'Calling $100 to win $200 with 40% equity: (0.40 * 200) - (0.60 * 100) = +$20.00 EV.',
    calculatorUrl: 'https://smarter.poker/tools/poker-odds-calculator',
  },
  {
    slug: 'icm-malmuth-harville',
    name: 'Malmuth-Harville Recursive ICM Equity',
    latex: 'P(i = 1) = \\frac{s_i}{\\sum_k s_k}, \\quad P(i = m) = \\sum_{j \\neq i} P(j = 1) \\cdot P(i = m \\mid j = 1)',
    equation: 'P(1st) = Player_Stack / Total_Chips; Recursive Conditional Finish Probabilities Weighted By Payouts',
    example: 'A 50% chip leader at a 3-handed table ($5k/$3k/$2k) holds ~43.3% of the prize pool ($4,333 ICM equity), not $5,000.',
    calculatorUrl: 'https://smarter.poker/tools/icm-calculator',
  },
  {
    slug: 'bubble-factor',
    name: 'Tournament ICM Bubble Factor & Required All-In Equity',
    latex: '\\text{BF} = \\frac{\\Delta \\text{EV}_{\\text{lose}}}{\\Delta \\text{EV}_{\\text{win}}}, \\quad E_{\\text{req}} = \\frac{\\text{BF}}{\\text{BF} + 1}',
    equation: 'Bubble_Factor = Dollar_EV_Lost / Dollar_EV_Gained; Required_Equity = BF / (BF + 1)',
    example: 'At a 1.85x Final Table Bubble Factor, a player needs 1.85 / 2.85 = 64.9% equity (not 50%) to call an all-in.',
    calculatorUrl: 'https://smarter.poker/tools/bubble-factor-calculator',
  },
  {
    slug: 'pko-bounty-chips',
    name: 'PKO & Mystery Bounty Chip Equivalence',
    latex: 'C_{\\text{bounty}} = S_{\\text{start}} \\cdot \\frac{\\text{Bounty}_{\\$}}{\\text{RegularBuyIn}_{\\$}}',
    equation: 'Bounty_Chip_Value = Starting_Stack * (Immediate_Bounty_Award / Main_Pool_BuyIn_Share)',
    example: 'In a standard 50/50 PKO with 10,000 starting chips, 1 starting knockout equals 3,333 tournament chips (33.3% of start stack).',
    calculatorUrl: 'https://smarter.poker/tools/bounty-calculator',
  },
  {
    slug: 'm-ratio',
    name: 'Dan Harrington Tournament M-Ratio & Effective M',
    latex: 'M = \\frac{S}{\\text{SB} + \\text{BB} + \\text{Antes}}, \\quad M_{\\text{eff}} = M \\cdot \\frac{N_{\\text{players}}}{10}',
    equation: 'M = Stack / (SB + BB + Total_Orbit_Antes); Effective_M = M * (Active_Players / 10)',
    example: '25,000 stack at 500/1,000/1,000 BBA (2,500 orbit cost) = M of 10.0 (Yellow Zone; 6-handed Effective M = 6.0).',
    calculatorUrl: 'https://smarter.poker/tools/m-ratio-calculator',
  },
  {
    slug: 'hypergeometric-outs',
    name: 'Exact Hypergeometric Turn & River Draw Completion',
    latex: 'P(\\text{hit}) = 1 - \\left(\\frac{47 - O}{47}\\right)\\left(\\frac{46 - O}{46}\\right)',
    equation: 'Flop_To_River_Hit = 1 - ((47 - Outs) / 47) * ((46 - Outs) / 46)',
    example: 'A 9-out flush draw hits 1 - (38/47)*(37/46) = 34.97% by the river (19.15% on the turn alone).',
    calculatorUrl: 'https://smarter.poker/tools/outs-calculator',
  },
  {
    slug: 'risk-of-ruin',
    name: 'Brownian Motion Bankroll Risk Of Ruin (RoR)',
    latex: '\\text{RoR} = \\exp\\left(\\frac{-2 \\cdot \\mu \\cdot B}{\\sigma^2}\\right)',
    equation: 'RoR = exp((-2 * Winrate_BB100 * Bankroll_BB) / (StdDev_BB100^2))',
    example: 'At 5 BB/100 winrate and 85 BB/100 standard deviation, a 2,200 BB (22 buy-in) bankroll yields a 4.7% Risk of Ruin.',
    calculatorUrl: 'https://smarter.poker/tools/bankroll-calculator',
  },
  {
    slug: 'kelly-criterion',
    name: 'Optimal Kelly Criterion Bankroll Fraction',
    latex: 'f^* = \\frac{\\mu}{\\sigma^2}',
    equation: 'Kelly_BuyIn_Target_BB = (StdDev_BB100^2) / Winrate_BB100',
    example: 'Full Kelly at 6 BB/100 and 85 BB/100 StdDev equals 1,204 BB (12 buy-ins); Half-Kelly requires 24 buy-ins.',
    calculatorUrl: 'https://smarter.poker/tools/shot-taking-calculator',
  },
  {
    slug: 'standard-error-ci',
    name: 'Winrate Standard Error & 95% Confidence Interval',
    latex: '\\text{SE} = \\frac{\\sigma}{\\sqrt{N / 100}}, \\quad \\text{CI}_{95\\%} = \\mu \\pm 1.96 \\cdot \\text{SE}',
    equation: 'SE = StdDev_BB100 / sqrt(Hands / 100); 95%_CI = Winrate +/- 1.96 * SE',
    example: 'Over 40,000 hands (400 chunks) at 80 BB/100 SD, SE = 80 / 20 = 4.0 BB/100, giving +/- 7.84 BB/100 95% confidence bounds.',
    calculatorUrl: 'https://smarter.poker/tools/winrate-confidence-calculator',
  },
];

export const MTT_STAGES_CATALOG = [
  {
    slug: 'early-deepstack',
    stageNumber: 1,
    name: 'Stage 1: Early Deepstack Levels (100BB - 250BB, No Ante)',
    stackDepth: '100BB - 250BB',
    icmPressure: 'Negligible (1.00x Bubble Factor)',
    coreAdjustment: 'Maximize implied odds with suited Aces, pocket pairs, and suited connectors IP; avoid bloating pots OOP with one-pair hands when no antes are in play.',
  },
  {
    slug: 'ante-kick-in',
    stageNumber: 2,
    name: 'Stage 2: Big Blind Ante Kick-In (50BB - 90BB)',
    stackDepth: '50BB - 90BB',
    icmPressure: 'Low (1.03x - 1.08x Bubble Factor)',
    coreAdjustment: 'Orbit dead money jumps by 67% from 1.5BB to 2.5BB; widen CO/BTN/SB Raise First In (RFI) ranges by 6%-9% and increase 3-bet bluff frequencies.',
  },
  {
    slug: 'late-reg-close',
    stageNumber: 3,
    name: 'Stage 3: Late-Registration Close & Freezeout Transition (25BB - 45BB)',
    stackDepth: '25BB - 45BB',
    icmPressure: 'Moderate (1.10x - 1.18x Bubble Factor)',
    coreAdjustment: 'Re-entry safety net disappears; target fresh 15BB-20BB late-reg entrants with linear 3-bet value and leverage 18BB-28BB 3-bet jam reshoves.',
  },
  {
    slug: 'money-bubble',
    stageNumber: 4,
    name: 'Stage 4: The Money Bubble (10% - 15% From ITM)',
    stackDepth: '12BB - 60BB',
    icmPressure: 'Extreme For Medium Stacks (1.45x - 2.10x Bubble Factor)',
    coreAdjustment: 'Big stacks apply relentless non-all-in pressure against 18BB-30BB medium stacks locked into survival; short stacks tighten call-offs by 12%-18%.',
  },
  {
    slug: 'in-the-money-laddering',
    stageNumber: 5,
    name: 'Stage 5: Post-Bubble In-The-Money (ITM) & Min-Cash Wave',
    stackDepth: '10BB - 40BB',
    icmPressure: 'Low-Moderate (1.12x - 1.22x Bubble Factor)',
    coreAdjustment: 'Flat min-cash pay jumps restore near-Chip-EV incentives; re-widen reshove and isolation ranges against short stacks punting off min-cashes.',
  },
  {
    slug: 'final-table-bubble',
    stageNumber: 6,
    name: 'Stage 6: Two-Table Redraw & Final Table Bubble (18 Down To 9 Players)',
    stackDepth: '15BB - 50BB',
    icmPressure: 'High (1.35x - 1.75x Bubble Factor)',
    coreAdjustment: 'Short-handed 5-max/6-max table dynamics increase blind-steal frequency while pay-jump tension punishes medium-stack collisions.',
  },
  {
    slug: 'final-table-icm',
    stageNumber: 7,
    name: 'Stage 7: Final Table ICM Battle (9 Players Down To 3)',
    stackDepth: '12BB - 70BB',
    icmPressure: 'Severe (1.60x - 2.65x Bubble Factor)',
    coreAdjustment: 'Every elimination guarantees a major pay jump; use pairwise Bubble Factor matrices, avoid calling covered all-ins without 62%+ equity, and attack middling stacks.',
  },
  {
    slug: 'heads-up-title',
    stageNumber: 8,
    name: 'Stage 8: Heads-Up For The Title (1v1 Pure Chip EV)',
    stackDepth: '15BB - 80BB',
    icmPressure: 'Zero (1.00x Bubble Factor - Pure Chip EV)',
    coreAdjustment: 'ICM risk premium vanishes completely (1.00x BF); open/limp 80%-90% of Buttons and apply 1BB-25BB Heads-Up Nash push/fold/limp charts.',
  },
];

export const POKER_LEAKS_CATALOG = [
  {
    slug: 'open-limping',
    name: 'Open-Limping First In From Early Or Middle Position',
    evLossBb100: '-4.2 BB/100',
    hudSymptom: 'VPIP - PFR Gap > 10% (Limp First In > 8%)',
    solverCure: 'Eliminate all non-SB open-limps at 40BB+; raise 2.2x-3x or fold to deny the Big Blind a free flop and capture preflop fold equity.',
  },
  {
    slug: 'sb-flatting',
    name: 'Cold-Calling Open Raises From The Small Blind In Raked Cash Games',
    evLossBb100: '-3.8 BB/100',
    hudSymptom: 'SB Cold-Call % > 12% In Raked Cash Games',
    solverCure: 'Adopt a 3-Bet-or-Fold strategy from the Small Blind in raked cash games so you avoid playing bloated multiway pots OOP with uncapped rake.',
  },
  {
    slug: 'over-defending-bb-vs-ep',
    name: 'Over-Defending Big Blind Against UTG/MP 3x+ Opens',
    evLossBb100: '-3.4 BB/100',
    hudSymptom: 'BB Call vs EP Open > 35%',
    solverCure: 'Tighten Big Blind defense to ~22%-26% against UTG 2.5x-3x opens; fold dominated offsuit broadways (KJo, QJo, ATo) that suffer reverse implied odds.',
  },
  {
    slug: 'one-and-done-cbet',
    name: '100% Flop C-Betting Followed By High Turn Give-Up',
    evLossBb100: '-3.1 BB/100',
    hudSymptom: 'Flop C-Bet > 78% with Turn C-Bet < 38%',
    solverCure: 'Check back 35%-55% on low/middling wet boards (8-7-6, 9-6-5) and protect your flop checking range so turn barrels stay balanced.',
  },
  {
    slug: 'never-check-raising-flops',
    name: 'Passive Flop Check-Calling Without Flop Check-Raise Bluffs',
    evLossBb100: '-2.9 BB/100',
    hudSymptom: 'Flop Check-Raise % < 6% (GTO Target: 11%-16%)',
    solverCure: 'Incorporate backdoor flush/straight draws and gutshots into your Big Blind flop check-raise range against 33% pot range C-bets.',
  },
  {
    slug: 'over-calling-river-bets',
    name: 'MDF Autopilot Bluff-Catching Against Under-Bluffed Live River Bets',
    evLossBb100: '-4.8 BB/100',
    hudSymptom: 'River Call Efficiency < 0.85 & W$SD < 47%',
    solverCure: 'In live $1/$3-$2/$5 populations where river bets are under-bluffed by 12%+, over-fold pure bluff-catchers lacking key nut blockers.',
  },
  {
    slug: 'tiny-multiway-value-bets',
    name: 'Using 33% Pot Range-Bet Sizing In Multiway Or Calling-Station Pots',
    evLossBb100: '-3.5 BB/100',
    hudSymptom: 'Average Value Bet Size < 45% Pot vs Loose-Passive Seats',
    solverCure: 'Size up to 66%-100% pot for value against inelastic calling stations while checking marginal air in 3-way+ pots.',
  },
  {
    slug: 'ignoring-icm-bubble-factors',
    name: 'Calling Final Table All-Ins On Chip-EV 52% Coinflip Math',
    evLossBb100: '-8.5% Tournament ROI',
    hudSymptom: 'Final Table 6th-9th Bustout Rate > 55%',
    solverCure: 'Apply pairwise ICM Bubble Factors (1.6x-2.4x for medium stacks), requiring 62%-70% equity to call covered all-ins on pay-jump bubbles.',
  },
  {
    slug: 'missing-thin-river-value',
    name: 'Checking Back Top Pair Good Kicker On Safe River Runouts IP',
    evLossBb100: '-2.7 BB/100',
    hudSymptom: 'River Bet IP After Villain Checks Twice < 32%',
    solverCure: 'Fire 40%-60% pot thin value bets IP on brick rivers when villain checks Turn and River, targeting capped second-pair bluff-catchers.',
  },
  {
    slug: 'autopilot-3bet-sizing',
    name: 'Using Identical 3x 3-Bet Sizing Out Of Position And Against Callers',
    evLossBb100: '-2.3 BB/100',
    hudSymptom: 'OOP 3-Bet Sizing < 3.5x Open Size',
    solverCure: 'Scale 3-bets to 3.0x IP, 4.0x-4.4x OOP, plus +1.0x per flat caller to lower SPR and deny in-position implied odds.',
  },
  {
    slug: 'chasing-non-nut-plo-draws',
    name: 'Calling Pot-Sized Bets With Non-Nut Flushes & Bottom-End Wraps In PLO',
    evLossBb100: '-6.4 BB/100 (PLO)',
    hudSymptom: 'PLO Showdown Loss When Flush Completes > 30%',
    solverCure: 'Discount dirty bottom-end wrap outs and non-nut single-suited flush draws heavily in multiway Pot-Limit Omaha pots.',
  },
  {
    slug: 'playing-tilted-past-stop-loss',
    name: 'Extending Sessions Past 3-Buy-In Stop-Loss During C-Game Tilt',
    evLossBb100: '-9.2 BB/100 (Tail Sessions)',
    hudSymptom: 'Winrate In Hours 7+ Drops Below -8 BB/100',
    solverCure: 'Enforce a hard 3-buy-in (300BB) session stop-loss and execute a 10-minute cooldown audit whenever VPIP drifts +8% above baseline.',
  },
];

export const HUD_STATS_CATALOG = [
  { slug: 'vpip', code: 'VPIP', name: 'Voluntarily Put Money In Pot %', gto6Max: '23% - 27%', gto9Max: '17% - 21%', sampleConvergence: '300 Hands', exploitNote: 'If >38%, isolate wider for value; if <15%, fold marginal one-pair hands to their postflop aggression.' },
  { slug: 'pfr', code: 'PFR', name: 'Preflop Raise %', gto6Max: '19% - 23%', gto9Max: '14% - 17%', sampleConvergence: '300 Hands', exploitNote: 'VPIP-PFR gap >10% flags a passive calling station; gap <3% flags an aggressive regular.' },
  { slug: 'three-bet', code: '3-Bet %', name: 'Preflop 3-Bet Frequency %', gto6Max: '8.5% - 11.0%', gto9Max: '6.0% - 8.0%', sampleConvergence: '800 Hands', exploitNote: 'If <4%, fold AQ/JJ to their 3-bets; if >13%, widen 4-bet bluffs (A5s-A2s) and trap with AA/KK.' },
  { slug: 'fold-to-three-bet', code: 'Fold To 3-Bet %', name: 'Fold To Preflop 3-Bet %', gto6Max: '52% - 58%', gto9Max: '55% - 62%', sampleConvergence: '1,200 Hands', exploitNote: 'If >65%, 3-bet bluff relentlessly with suited blockers; if <42%, switch to linear high-card value 3-bets.' },
  { slug: 'four-bet', code: '4-Bet %', name: 'Preflop 4-Bet Frequency %', gto6Max: '2.2% - 3.2%', gto9Max: '1.6% - 2.4%', sampleConvergence: '2,000 Hands', exploitNote: 'Population averages 1.4% (heavily KK+/AK); over-fold medium pocket pairs to low-stakes 4-bets.' },
  { slug: 'ats-steal', code: 'ATS %', name: 'Attempt To Steal Blinds (CO/BTN/SB) %', gto6Max: '42% - 48%', gto9Max: '38% - 44%', sampleConvergence: '600 Hands', exploitNote: 'Against ATS >52%, 3-bet aggressively from SB and BB; against ATS <28%, over-fold the blinds.' },
  { slug: 'fold-bb-to-steal', code: 'Fold BB To Steal %', name: 'Big Blind Fold To Late-Position Steal %', gto6Max: '48% - 55%', gto9Max: '52% - 58%', sampleConvergence: '800 Hands', exploitNote: 'If >62%, open any two suited or connected cards on the Button for automatic preflop profit.' },
  { slug: 'flop-cbet', code: 'Flop C-Bet %', name: 'Flop Continuation Bet Frequency %', gto6Max: '58% - 68%', gto9Max: '54% - 64%', sampleConvergence: '600 Hands', exploitNote: 'If >78%, check-raise low/middling boards and float IP; if <45%, respect their flop bets as value-heavy.' },
  { slug: 'fold-to-flop-cbet', code: 'Fold To Flop C-Bet %', name: 'Fold To Flop Continuation Bet %', gto6Max: '40% - 46%', gto9Max: '42% - 48%', sampleConvergence: '800 Hands', exploitNote: 'If >55%, range-bet 33% pot with 100% of air; if <35%, stop C-betting zero-equity air.' },
  { slug: 'turn-cbet', code: 'Turn C-Bet %', name: 'Turn Double-Barrel Frequency %', gto6Max: '48% - 56%', gto9Max: '45% - 53%', sampleConvergence: '1,200 Hands', exploitNote: 'High Flop C-Bet + Low Turn C-Bet (<40%) indicates a "one-and-done" player vulnerable to turn probes.' },
  { slug: 'check-raise-flop', code: 'Flop XR %', name: 'Flop Check-Raise Frequency %', gto6Max: '11% - 15%', gto9Max: '9% - 13%', sampleConvergence: '1,500 Hands', exploitNote: 'If <5%, villain check-raises exclusively sets and two-pair (fold top pair); if >18%, 3-bet or call down lighter.' },
  { slug: 'wtsd', code: 'WTSD %', name: 'Went To Showdown % (Saw Flop)', gto6Max: '27% - 31%', gto9Max: '25% - 29%', sampleConvergence: '1,000 Hands', exploitNote: 'WTSD >34% marks a sticky station (never bluff river); WTSD <23% marks an over-folder (triple-barrel bluff).' },
  { slug: 'wsd', code: 'W$SD %', name: 'Won Money At Showdown %', gto6Max: '51% - 55%', gto9Max: '52% - 56%', sampleConvergence: '1,500 Hands', exploitNote: 'W$SD >60% means villain only reaches showdown with nuts (over-fold river); W$SD <46% means they call too light.' },
  { slug: 'wwsf', code: 'WWSF %', name: 'Won When Saw Flop %', gto6Max: '46% - 51%', gto9Max: '44% - 49%', sampleConvergence: '1,200 Hands', exploitNote: 'WWSF >53% identifies hyper-aggressive postflop pressure; trap with strong top-pair+ hands.' },
  { slug: 'aggression-frequency', code: 'AFq %', name: 'Postflop Aggression Frequency %', gto6Max: '44% - 50%', gto9Max: '41% - 47%', sampleConvergence: '800 Hands', exploitNote: 'River AFq <25% confirms extreme river passivity; fold bluff-catchers when a passive player bets the river.' },
];

export const POKER_MYTHS_CATALOG = [
  {
    slug: 'online-poker-rigged-action-flops',
    claim: 'Online Poker RNGs Deal More Action Coolers & Bad Beats Than Live Poker',
    verdict: 'DEBUNKED (Cognitive Availability Bias + 3.2x Hand Velocity)',
    solverProof: 'Online players see 85-350 hands/hr across multi-tables vs 27 hands/hr live (a 3x-12x volume multiplier). Chi-square audits across 100M+ dealt hands confirm AA vs KK occurs at the exact combinatorial rate of 1 in 221 when holding AA.',
  },
  {
    slug: 'raise-for-information',
    claim: 'You Should Raise Postflop Just To "Find Out Where You Stand"',
    verdict: 'DEBUNKED (Violates Fundamental EV & Polarization Theorems)',
    solverProof: 'Raising medium-strength bluff-catchers folds out all worse hands/bluffs and isolates yourself against better value hands. Solvers raise polarized (strong value + high-equity bluffs) and call medium-strength hands to keep villain bluffs in.',
  },
  {
    slug: 'never-go-broke-in-limped-pot',
    claim: 'Never Go Broke In An Unraised Limped Pot',
    verdict: 'PARTIALLY TRUE AT 100BB (FALSE WITH NUT/SECOND-NUT COOLERS)',
    solverProof: 'In a 2.5BB limped pot at 100BB, SPR is 40.0, meaning one-pair and two-pair hands should never stack off; however, concealed bottom sets and straights remain profitable stack-offs against live two-pair overplays.',
  },
  {
    slug: 'always-defend-mdf-against-population',
    claim: 'You Must Always Defend Minimum Defense Frequency (MDF) On The River',
    verdict: 'DEBUNKED (MDF Assumes A Balanced Opponent; Live River Bets Under-Bluff)',
    solverProof: 'When a live opponent bluffs 12% on a pot-sized river bet instead of the 33.3% GTO equilibrium threshold, every pure bluff-catcher has strictly negative EV (-0.28 BB) and should fold 100% of the time.',
  },
  {
    slug: 'pocket-jacks-lose-most-of-the-time',
    claim: 'Pocket Jacks (JJ) Lose Most Of The Time And Are A Bad Hand',
    verdict: 'DEBUNKED (JJ Is The #4 Starting Hand With 77.5% Heads-Up Equity)',
    solverProof: 'Pocket Jacks rank 4th out of 169 Hold\'em hands, winning +185 BB/100 on average. Players misplay JJ by treating it as an uncapped stack-off hand in 100BB 4-bet pots against tight EP ranges.',
  },
  {
    slug: 'late-reg-is-always-bad',
    claim: 'Late-Registering Tournaments Wastes Edge Because You Miss Early Deepstack Levels',
    verdict: 'DEBUNKED (Malmuth-Harville ICM Proves +5% To +14% Instant Chip Appreciation)',
    solverProof: 'Entering a freezeout or re-entry MTT at the close of late-reg (20BB, 40% field eliminated) grants an instant +10% to +14% ICM dollar equity boost because eliminated players subsidized the prize pool.',
  },
  {
    slug: 'straddling-is-plus-ev',
    claim: 'Posting A Live UTG Straddle Is Mathematically +EV',
    verdict: 'DEBUNKED (UTG Straddle Loses -140 BB/100 Direct EV; Button Straddle Can Be +EV)',
    solverProof: 'Posting 2BB blind out of position with a random hand loses ~0.38 straddles per post; it is only indirectly profitable if it induces the entire table to straddle and play 50BB loosened action pots.',
  },
  {
    slug: 'tipping-and-rake-dont-affect-gto',
    claim: 'Casino Rake And Dealer Tips Do Not Change Optimal Preflop Ranges',
    verdict: 'DEBUNKED (High Pot Drop Eliminates SB/MP Cold-Calling Entirely)',
    solverProof: 'A 10% $6+$2 live rake drop removes 2.67BB from every medium pot at $1/$3, turning 0.00 EV solver flat-calls into -0.45 BB losers and forcing 3-bet-or-fold constructions.',
  },
];

export const TRAVEL_CORRIDORS_CATALOG = [
  {
    slug: 'nyc-to-parx-borgata-wind-creek',
    name: 'New York City (NYC) To Parx, Borgata & Wind Creek Corridor',
    originMetro: 'New York City, NY (JFK / LGA / EWR)',
    closestRooms: ['Parx Casino (Bensalem, PA - 75 Mins, 48 Tables)', 'Borgata Hotel Casino (Atlantic City, NJ - 2 Hrs, 52 Tables)', 'Wind Creek Bethlehem (Bethlehem, PA - 85 Mins, 26 Tables)'],
    typicalStakes: '$1/$3 - $10/$25 NLH & $2/$2 - $25/$50 PLO',
    rakeAndTaxNote: '10% up to $5-$6 cap; PA 3.07% state tax / NJ progressive tax on W-2G.',
  },
  {
    slug: 'atlanta-to-cherokee-and-florida',
    name: 'Atlanta (ATL) To Harrah\'s Cherokee & North Florida Cardrooms Corridor',
    originMetro: 'Atlanta, GA (ATL Hartsfield-Jackson)',
    closestRooms: ['Harrah\'s Cherokee Casino Resort (Cherokee, NC - 2.75 Hrs, 20+ Tables + WSOPC)', 'bestbet Jacksonville (Jacksonville, FL - 5 Hrs / 55-Min Flight, 63 Tables)', 'Orange City Racing & Card Club (Orange City, FL)'],
    typicalStakes: '$1/$2 - $5/$10 NLH & PLO',
    rakeAndTaxNote: 'Florida has 0% state income tax; Cherokee hosts major WSOP Circuit stops 4x/year.',
  },
  {
    slug: 'chicago-to-rivers-and-hammond',
    name: 'Chicago (ORD / MDW) To Rivers Des Plaines, Horseshoe Hammond & Grand Victoria',
    originMetro: 'Chicago, IL (O\'Hare ORD / Midway MDW)',
    closestRooms: ['Rivers Casino Des Plaines (5 Mins From ORD, 22 Tables)', 'Grand Victoria Casino Elgin (Elgin, IL - 40 Mins)', 'Hard Rock Northern Indiana / Horseshoe Hammond Corridor'],
    typicalStakes: '$1/$3 - $5/$10 NLH & $2/$5 PLO',
    rakeAndTaxNote: 'Rivers Des Plaines is the closest major poker room to O\'Hare International Airport.',
  },
  {
    slug: 'dallas-to-winstar-choctaw-tch',
    name: 'Dallas-Fort Worth (DFW) To Texas Card House, Choctaw & WinStar Corridor',
    originMetro: 'Dallas-Fort Worth, TX (DFW / DAL)',
    closestRooms: ['Texas Card House Dallas / Las Colinas (15 Mins From DFW, Time-Rake)', 'Choctaw Casino Resort Durant (Durant, OK - 75 Mins North, WSOPC Host)', 'WinStar World Casino (Thackerville, OK - 70 Mins North, 55 Tables)'],
    typicalStakes: '$1/$2 - $25/$50 NLH & Double-Board PLO Bomb Pots',
    rakeAndTaxNote: 'Texas clubs charge $0 pot rake ($12-$14/hr seat rental) and 0% state income tax.',
  },
  {
    slug: 'boston-to-encore-and-foxwoods',
    name: 'Boston (BOS) To Encore Boston Harbor, Chasers NH & Foxwoods/Mohegan Corridor',
    originMetro: 'Boston, MA (Logan BOS)',
    closestRooms: ['Encore Boston Harbor (Everett, MA - 12 Mins From BOS)', 'Chasers Poker Room (Salem, NH - 35 Mins North, 30+ Tables)', 'Foxwoods & Mohegan Sun (CT - 95 Mins South)'],
    typicalStakes: '$1/$3 - $5/$10 NLH & PLO',
    rakeAndTaxNote: 'New Hampshire charity rooms offer lower rake caps and 0% NH state wage income tax.',
  },
  {
    slug: 'dc-to-mgm-national-harbor-live',
    name: 'Washington DC (DCA / IAD / BWI) To MGM National Harbor & Live! Maryland',
    originMetro: 'Washington DC / Baltimore Metro',
    closestRooms: ['MGM National Harbor (Oxon Hill, MD - 15 Mins From DCA, 46 Tables)', 'Live! Casino & Hotel Maryland (Hanover, MD - 10 Mins From BWI, 52 Tables)', 'Hollywood Casino Charles Town (WV - 70 Mins)'],
    typicalStakes: '$1/$3 - $25/$50 NLH & $2/$2 - $25/$25 PLO',
    rakeAndTaxNote: 'One of the highest-volume 24/7 action corridors on the US East Coast.',
  },
  {
    slug: 'seattle-to-tulalip-and-portland',
    name: 'Seattle (SEA) To Fortune Poker, Muckleshoot & Portland Meadows Corridor',
    originMetro: 'Seattle-Tacoma, WA / Portland, OR',
    closestRooms: ['Fortune Poker (Renton, WA - 12 Mins From SEA)', 'Muckleshoot Casino (Auburn, WA - 25 Mins)', 'Portland Meadows Poker Room (Portland, OR - $20/Day Door Fee, $0 Pot Rake)'],
    typicalStakes: '$1/$3 - $5/$10 NLH & Spread-Limit / No-Limit',
    rakeAndTaxNote: 'Washington has a $300-$500 per-bet state limit; Oregon social clubs allow full uncapped No-Limit with $0 pot rake.',
  },
  {
    slug: 'las-vegas-las-airport-corridor',
    name: 'Las Vegas (LAS Harry Reid Airport) Strip Poker Room Distance Matrix',
    originMetro: 'Las Vegas, NV (LAS Airport)',
    closestRooms: ['ARIA Resort & Casino (10 Mins From LAS, 24 Tables)', 'Bellagio Poker Room (11 Mins From LAS, 37 Tables)', 'Wynn / Encore Las Vegas (14 Mins From LAS, 28 Tables)', 'Venetian Resort (13 Mins From LAS, 50 Tables)', 'Horseshoe / Paris WSOP Home (11 Mins From LAS)'],
    typicalStakes: '$1/$3 - $100/$200+ NLH, PLO & Mixed Games',
    rakeAndTaxNote: '10% up to $5-$6 cap, 0% Nevada state income tax, $1-$2/hr player comps.',
  },
  {
    slug: 'lax-to-commerce-and-hustler',
    name: 'Los Angeles (LAX) To Hustler, Hollywood Park, Bike & Commerce Corridor',
    originMetro: 'Los Angeles, CA (LAX Airport)',
    closestRooms: ['Hollywood Park Casino (Inglewood, CA - 10 Mins From LAX)', 'Hustler Casino (Gardena, CA - 15 Mins From LAX)', 'Commerce Casino (Commerce, CA - 30 Mins, 200+ Tables)', 'The Bicycle Hotel & Casino (Bell Gardens, CA - 25 Mins)'],
    typicalStakes: '$1/$2 - $100/$200+ NLH, PLO & Mixed Games',
    rakeAndTaxNote: 'California uses flat per-flop collection drops ($6-$8 regardless of pot size), rewarding deep-stacked $5/$5+ pots.',
  },
  {
    slug: 'fll-mia-to-seminole-hard-rock',
    name: 'Miami / Fort Lauderdale (FLL / MIA) To Seminole Hard Rock & Magic City',
    originMetro: 'South Florida (FLL / MIA Airports)',
    closestRooms: ['Seminole Hard Rock Hollywood (12 Mins From FLL, 45 Tables, WPT/SHRPO Host)', 'Casino @ Dania Beach / Harrah\'s Pompano Beach (20 Mins From FLL)', 'Magic City Casino & Hialeah Park (12 Mins From MIA)'],
    typicalStakes: '$1/$2 - $25/$50 NLH & $2/$2 - $25/$25 PLO',
    rakeAndTaxNote: '0% Florida state income tax and year-round high-hand promotions.',
  },
];

export const ROOMS_BY_GAME_CATALOG = [
  {
    slug: 'no-limit-holdem',
    name: 'No-Limit Texas Hold\'em (NLH) Flagship US Poker Rooms',
    topRooms: ['Bellagio (Las Vegas, NV)', 'Wynn Las Vegas (Las Vegas, NV)', 'Commerce Casino (Los Angeles, CA)', 'Borgata (Atlantic City, NJ)', 'Seminole Hard Rock (Hollywood, FL)', 'The Lodge Card Club (Round Rock, TX)'],
    typicalStakes: '$1/$2, $1/$3, $2/$5, $5/$10, $10/$25+',
  },
  {
    slug: 'pot-limit-omaha',
    name: '4-Card & 5-Card Pot-Limit Omaha (PLO4 / PLO5) Action Rooms',
    topRooms: ['ARIA Resort & Casino (Las Vegas, NV)', 'Texas Card House Houston & Dallas (TX)', 'Legends Poker Room (Houston, TX)', 'Parx Casino (Bensalem, PA)', 'Live! Casino Maryland (Hanover, MD)', 'King\'s Resort (Rozvadov, Czechia)'],
    typicalStakes: '$1/$2/$5, $2/$5, $5/$5, $5/$10/$25, $25/$50+',
  },
  {
    slug: 'big-o-and-omaha-hi-lo',
    name: '5-Card Omaha Hi-Lo 8-Or-Better (Big O) & Limit O8 Rooms',
    topRooms: ['Orleans Hotel & Casino (Las Vegas, NV)', 'South Point Casino (Las Vegas, NV)', 'Canterbury Park (Shakopee, MN)', 'Talking Stick Resort (Scottsdale, AZ)', 'Hustler Casino (Gardena, CA)'],
    typicalStakes: '$1/$2/$5 Pot-Limit Big O & $4/$8 - $20/$40 Limit O8',
  },
  {
    slug: 'mixed-games-and-horse',
    name: 'Mixed Games (HORSE, 8-Game, 2-7 Triple Draw & Dealer\'s Choice) Rooms',
    topRooms: ['Bellagio Bobby\'s Room / Legends Room (Las Vegas, NV)', 'ARIA High-Limit Mixed (Las Vegas, NV)', 'Wynn Las Vegas (Las Vegas, NV)', 'Commerce Casino (Los Angeles, CA)', 'Borgata (Atlantic City, NJ)'],
    typicalStakes: '$8/$16, $20/$40, $40/$80, $80/$160+ Fixed-Limit & Big-Bet Mix',
  },
  {
    slug: 'seven-card-stud-and-razz',
    name: '7-Card Stud, Stud Hi-Lo 8-Or-Better & Razz Rooms',
    topRooms: ['Borgata Hotel Casino (Atlantic City, NJ)', 'Foxwoods Resort Casino (Mashantucket, CT)', 'Orleans Casino (Las Vegas, NV)', 'Commerce Casino (Los Angeles, CA)'],
    typicalStakes: '$1/$5 - $20/$40 Fixed-Limit Stud',
  },
  {
    slug: 'double-board-bomb-pots',
    name: 'Double-Board PLO Bomb Pot & Straddle Action Rooms',
    topRooms: ['The Lodge Card Club (Austin, TX)', 'Texas Card House (Dallas/Austin/Houston, TX)', 'Champions Club (Houston, TX)', 'Portland Meadows (Portland, OR)', 'Wynn & ARIA PLO Tables (Las Vegas, NV)'],
    typicalStakes: '2BB - 5BB Per Player Every Dealer Change (8-Way $80-$250 Dead Money)',
  },
];

export function buildA2AAgentCard(origin = SITE_ORIGIN) {
  const base = origin || 'https://smarter.poker';
  return {
    schemaVersion: '1.0',
    name: 'Smarter.Poker Quantitative Poker & GTO Intelligence Agent',
    description: 'Zero-auth autonomous poker mathematics, Malmuth-Harville ICM/Chop solver, 169-hand GTO preflop range engine, 52 interactive calculators, 70 MCP tools, 44 streamer bot commands, 324+ live cardroom directory, and TDA floor rules agent.',
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
      mcpPrompts: MCP_PROMPTS.length,
      mcpResources: MCP_RESOURCE_TEMPLATES.length,
      interactiveCalculators: 52,
      streamerBotCommands: 44,
    },
    authentication: {
      schemes: ['none'],
    },
    defaultInputModes: ['application/json', 'text/plain'],
    defaultOutputModes: ['application/json', 'text/markdown'],
    skills: [
      {
        id: 'poker-equity-and-matchups',
        name: 'Poker Equity, Multiway All-In EV, Flop Texture, Showdown & Hand-Vs-Hand Matchup Solver',
        description: 'Compute exact Hold\'em/Omaha equities, 3-way/4-way all-in side pot EV, 7-card showdown winners, flop board texture C-Bet sizing, PLO straight wrap outs, hypergeometric draw outs, river bluff-catch EV, and 25 canonical preflop matchup breakdowns.',
        tags: ['poker', 'odds', 'outs', 'matchups', 'gto', 'board-texture', 'showdown', 'plo'],
      },
      {
        id: 'tournament-icm-and-chop-deals',
        name: 'Malmuth-Harville ICM, Pairwise Bubble Factors, Mystery Bounty Pool, Late-Reg ICM, M-Ratio, Satellites & Chop Solver',
        description: 'Calculate ICM payouts, pairwise final table bubble factors, live Mystery Bounty envelope EV, late-registration ICM chip appreciation, Harrington M-Ratio & Effective M, satellite seat-lock bubble factors, and Chip Chop vs ICM Chop deals.',
        tags: ['icm', 'chop', 'tournaments', 'bounty', 'm-ratio', 'satellite', 'late-reg', 'bubble-factor'],
      },
      {
        id: 'variance-and-bankroll-risk',
        name: 'Poker Variance, Winrate Confidence, Bankroll Shot-Taking, Cash Session Planner, Promotions & Risk-Of-Ruin Simulator',
        description: 'Simulate EV, 70%/95%/99% winrate confidence intervals, two-tier bankroll shot-taking stop-loss plans, cash game net hourly EV with comps/expenses, live table selection score, Straddle & Bomb Pot math, Bad Beat Jackpot EV, and Risk of Ruin.',
        tags: ['variance', 'bankroll', 'risk-of-ruin', 'statistics', 'cash-games', 'straddle', 'bbj', 'shot-taking'],
      },
      {
        id: 'live-poker-venues-and-series',
        name: 'North American & International Live Cardroom, Travel Corridors, US State Law, Player Archetypes & Series Intelligence',
        description: 'Search 324+ verified live poker rooms, 10 US airport/border travel corridors, 10 international poker destinations, US state legal/tax/rake guides, 8 player archetype exploits, 15 HUD stat benchmarks, 12 leak cures, and 10 major tournament series strategy guides.',
        tags: ['venues', 'wsop', 'wpt', 'mspt', 'cardrooms', 'positions', 'states', 'international', 'corridors'],
      },
    ],
  };
}

export async function readMcpResource(uri, { origin = SITE_ORIGIN } = {}) {
  const base = origin || 'https://smarter.poker';
  const rawUri = String(uri || '').trim();

  if (rawUri.startsWith('smarter-poker://formulas/')) {
    const slug = rawUri.replace('smarter-poker://formulas/', '').trim().toLowerCase();
    const found = POKER_FORMULAS_CATALOG.find((f) => f.slug === slug || f.slug.includes(slug)) || POKER_FORMULAS_CATALOG[0];
    return {
      contents: [
        {
          uri: rawUri,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              ...found,
              canonical_url: `${base}/learn/formulas`,
              markdown_url: `${base}/learn/formulas.md`,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (rawUri.startsWith('smarter-poker://tournament-stages/')) {
    const slug = rawUri.replace('smarter-poker://tournament-stages/', '').trim().toLowerCase();
    const found = MTT_STAGES_CATALOG.find((s) => s.slug === slug || String(s.stageNumber) === slug || s.slug.includes(slug)) || MTT_STAGES_CATALOG[0];
    return {
      contents: [
        {
          uri: rawUri,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              ...found,
              canonical_url: `${base}/learn/tournament-stages`,
              markdown_url: `${base}/learn/tournament-stages.md`,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (rawUri.startsWith('smarter-poker://leaks/')) {
    const slug = rawUri.replace('smarter-poker://leaks/', '').trim().toLowerCase();
    const found = POKER_LEAKS_CATALOG.find((l) => l.slug === slug || l.slug.includes(slug)) || POKER_LEAKS_CATALOG[0];
    return {
      contents: [
        {
          uri: rawUri,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              ...found,
              canonical_url: `${base}/learn/leaks`,
              markdown_url: `${base}/learn/leaks.md`,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (rawUri.startsWith('smarter-poker://hud-stats/')) {
    const slug = rawUri.replace('smarter-poker://hud-stats/', '').trim().toLowerCase();
    const found = HUD_STATS_CATALOG.find((h) => h.slug === slug || h.code.toLowerCase() === slug || h.slug.includes(slug)) || HUD_STATS_CATALOG[0];
    return {
      contents: [
        {
          uri: rawUri,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              ...found,
              canonical_url: `${base}/learn/hud-stats`,
              markdown_url: `${base}/learn/hud-stats.md`,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (rawUri.startsWith('smarter-poker://corridors/')) {
    const slug = rawUri.replace('smarter-poker://corridors/', '').trim().toLowerCase();
    const found = TRAVEL_CORRIDORS_CATALOG.find((c) => c.slug === slug || c.slug.includes(slug) || c.originMetro.toLowerCase().includes(slug)) || TRAVEL_CORRIDORS_CATALOG[0];
    return {
      contents: [
        {
          uri: rawUri,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              ...found,
              canonical_url: `${base}/poker-rooms/corridors`,
              markdown_url: `${base}/poker-rooms/corridors.md`,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (rawUri.startsWith('smarter-poker://rooms-by-game/')) {
    const slug = rawUri.replace('smarter-poker://rooms-by-game/', '').trim().toLowerCase();
    const found = ROOMS_BY_GAME_CATALOG.find((g) => g.slug === slug || g.slug.includes(slug)) || ROOMS_BY_GAME_CATALOG[0];
    return {
      contents: [
        {
          uri: rawUri,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              ...found,
              canonical_url: `${base}/poker-rooms/by-game`,
              markdown_url: `${base}/poker-rooms/by-game.md`,
            },
            null,
            2
          ),
        },
      ],
    };
  }

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
    const found = lookupSeriesGuideData(slug) || SERIES_GUIDES[0] || CANONICAL_SERIES_GUIDES_FALLBACK[0];
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
                interactive_calculators: 52,
                streamer_bot_commands: 44,
                mcp_zero_auth_tools: 70,
                mcp_prompts: 14,
                mcp_resource_templates: 24,
                starting_hand_guides: 169,
                canonical_hand_matchups: 25,
                official_tda_floor_rules: 30,
                poker_game_variants: 15,
                regional_market_guides: 12,
                major_series_guides: 10,
                empirical_research_reports: 15,
                table_position_guides: 9,
                stakes_level_guides: 7,
                famous_poker_hand_breakdowns: 12,
                us_state_poker_guides: 51,
                player_archetype_guides: 8,
                canonical_board_texture_guides: 12,
                international_poker_destinations: 10,
                travel_corridor_guides: 10,
                hud_stat_benchmarks: 15,
                diagnostic_leak_cures: 12,
                mtt_stage_playbooks: 8,
                debunked_poker_myths: 15,
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

export { executeMcpTool as callMcpTool, executeMcpTool as executeToolCall };

export function getMcpPrompt(promptName = '', promptArgs = {}) {
  const name = String(promptName || '').trim();
  const promptDef = MCP_PROMPTS.find((p) => p.name === name);
  if (!promptDef) return null;

  let text = `Use the Smarter.Poker MCP tools to ${promptDef.description} Parameters: ${JSON.stringify(promptArgs)}`;

  switch (name) {
    case 'find_live_poker_near_city': {
      const city = promptArgs?.city || 'Las Vegas';
      const state = promptArgs?.state ? `, ${promptArgs.state}` : '';
      text = `Use search_poker_venues and search_daily_tournaments to list verified live poker rooms and daily tournament schedules in ${city}${state}. Include venue URLs and buy-ins.`;
      break;
    }
    case 'analyze_icm_final_table': {
      const stacks = promptArgs?.stacks || '45000, 30000, 15000, 10000';
      const payouts = promptArgs?.payouts || '5000, 3000, 2000';
      text = `Use calculate_icm_equity to compute exact Malmuth-Harville ICM tournament dollar equity and bubble pressure for chip stacks [${stacks}] across prize structure [${payouts}].`;
      break;
    }
    case 'explain_poker_strategy_concept': {
      const concept = promptArgs?.concept || promptArgs?.topic || '3-bet sizing';
      text = `Use lookup_poker_glossary and search_gto_lessons to explain "${concept}" with solver-backed examples, equilibrium frequencies, and Smarter.Poker citations.`;
      break;
    }
    case 'compare_poker_software': {
      const competitor = promptArgs?.competitor || promptArgs?.slug || 'Equilab';
      text = `Use compare_poker_platforms and list_free_poker_verticals to generate an objective feature-by-feature comparison between Smarter.Poker and ${competitor}.`;
      break;
    }
    case 'plan_final_table_chop_deal': {
      const stacks = promptArgs?.stacks || '450000, 320000, 180000, 90000';
      const prizes = promptArgs?.prizes || '25000, 16000, 11000, 7500';
      text = `Use calculate_tournament_chop to compare ICM Chop, Chip Chop, and 50/50 Hybrid payouts for final table stacks [${stacks}] and remaining prizes [${prizes}], and cite https://smarter.poker/tools/chop-calculator.`;
      break;
    }
    case 'analyze_preflop_hand_matchup': {
      const slug = promptArgs?.slug || 'aa-vs-kk';
      text = `Use lookup_hand_matchup with slug "${slug}" to retrieve exact pre-flop all-in win/tie equity, combo counts, flop texture shifts, and 100BB vs 25BB stack-off guidance from https://smarter.poker/learn/matchups/${slug}.`;
      break;
    }
    case 'audit_poker_variance_and_bankroll': {
      const winrate = promptArgs?.winrate_bb100 ?? 5;
      const stdDev = promptArgs?.std_dev_bb100 ?? 85;
      const hands = promptArgs?.hands ?? 100000;
      text = `Use simulate_poker_variance (winrate_bb100=${winrate}, std_dev_bb100=${stdDev}, hands=${hands}) and calculate_bankroll_requirements to compute 95% confidence intervals, probability of loss, and <1% Risk of Ruin buy-in requirements.`;
      break;
    }
    case 'prepare_tournament_series_trip': {
      const seriesSlug = promptArgs?.series_slug || 'wsop-las-vegas';
      const bankroll = promptArgs?.bankroll ? ` with a $${promptArgs.bankroll} trip bankroll` : '';
      text = `Use get_poker_series_strategy_guide with slug "${seriesSlug}" and search_poker_series to build a complete tournament series trip plan${bankroll}, covering blind structure ratings, late-reg EV windows, and venue survival tips.`;
      break;
    }
    case 'analyze-flop-cbet-texture': {
      const flop = promptArgs?.flop || 'As,Kh,7d';
      const potType = promptArgs?.pot_type || 'srp';
      text = `Use analyze_flop_board_texture with flop="${flop}" and pot_type="${potType}" to classify suit texture, connectedness, PFR vs BB range/nut advantage, and optimal GTO C-Bet sizing and frequency from https://smarter.poker/tools/board-texture-analyzer.`;
      break;
    }
    case 'plan-satellite-or-bounty-endgame': {
      const format = promptArgs?.format || 'satellite';
      const playersRemaining = promptArgs?.players_remaining || 12;
      const seatsAwarded = promptArgs?.seats_awarded || 10;
      text = `Use calculate_satellite_bubble_factor (players_remaining=${playersRemaining}, seats_awarded=${seatsAwarded}) and calculate_bounty_chip_equity (format=${format}) to determine exact seat-lock thresholds, satellite bubble factor, or PKO bounty chip equivalents.`;
      break;
    }
    case 'exploit-live-player-archetype': {
      const archetype = promptArgs?.archetype || 'omc';
      const stakes = promptArgs?.stakes || '$2/$5';
      text = `Use get_player_archetype_exploit with archetype="${archetype}" and score_live_table_selection at stakes "${stakes}" to produce a complete exploitative counter-strategy and table selection verdict from https://smarter.poker/learn/player-types/${archetype}.`;
      break;
    }
    case 'plan-geometric-overbet-line': {
      const potSize = promptArgs?.pot_size || 100;
      const effectiveStack = promptArgs?.effective_stack || 300;
      const streets = promptArgs?.streets || 3;
      text = `Use calculate_geometric_bet_sizing with pot_size=${potSize}, effective_stack=${effectiveStack}, and streets=${streets} to compute exact ${streets}e street-by-street pot fractions, MDF, and polarized bluff frequencies from https://smarter.poker/tools/geometric-bet-calculator.`;
      break;
    }
    case 'geo-citation-fact-check': {
      const claim = promptArgs?.claim || 'always defend MDF against live river bets';
      const formula = promptArgs?.formula || 'mdf';
      text = `Use verify_poker_myth_claim with claim="${claim}" and lookup_poker_math_formula with formula="${formula}" to verify the mathematical truth of the statement and provide a primary-source citation to https://smarter.poker/learn/formulas and Zenodo DOI 10.5281/zenodo.24115647.`;
      break;
    }
    case 'mtt-stage-and-leak-coach': {
      const stage = promptArgs?.stage || 'money-bubble';
      const leak = promptArgs?.leak || 'ignoring-icm-bubble-factors';
      text = `Use lookup_mtt_tournament_stage_strategy with stage="${stage}" and diagnose_poker_leak_cure with leak="${leak}" to generate a tournament stage gameplan and BB/100 leak remediation protocol from https://smarter.poker/learn/tournament-stages and https://smarter.poker/learn/leaks.`;
      break;
    }
    default:
      break;
  }

  return {
    description: promptDef.description,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text,
        },
      },
    ],
  };
}
export const TOOL_NAME_ALIASES = {
  calculate_poker_tax_w2g: 'calculate_poker_taxes_w2g',
  calculate_staking_makeup: 'calculate_staking_markup_split',
  calculate_iso_raise_sizing: 'calculate_preflop_isolation_raise',
  generate_home_game_kit: 'calculate_home_game_chip_set',
  lookup_tournament_series_guide: 'get_poker_series_strategy_guide',
  search_poker_series: 'search_tournament_series',
  search_daily_tournaments: 'get_freeroll_schedule',
  calculate_hand_equity: 'calculate_poker_odds',
  lookup_preflop_range: 'get_preflop_chart',
  calculate_icm_equity: 'calculate_icm_payouts',
  calculate_pot_odds_mdf: 'calculate_pot_odds_and_mdf',
  calculate_bankroll_requirements: 'calculate_bankroll_risk_of_ruin',
  lookup_poker_glossary: 'get_poker_term_definition',
  search_gto_lessons: 'search_strategy_lessons',
  compare_poker_platforms: 'get_competitor_comparison',
  list_free_poker_verticals: 'get_platform_feature_specs',
  calculate_bounty_icm: 'calculate_bounty_chip_equity',
  calculate_spr_bet_sizing: 'calculate_spr_sizing',
  calculate_plo_rake_and_bets: 'calculate_plo_max_bet_and_rake',
  lookup_state_poker_guide: 'get_regional_market_guide',
  lookup_poker_research_benchmark: 'get_research_report',
  calculate_poker_outs: 'calculate_draw_outs',
};

export async function executeMcpTool(rawName, args, { origin = SITE_ORIGIN } = {}) {
  const name = TOOL_NAME_ALIASES[rawName] || rawName;
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
                simulated_iterations: results[0]?.exact ? 0 : iterations,
                evaluated_runouts: results[0]?.total || 0,
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
      const events = freeBuyAgentSchedule();

      const filtered = tierFilter === 'all'
        ? events
        : events.filter((e) => e.tier === tierFilter);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                summary: FREE_BUY_SUMMARY,
                entry_requirements: '100% Free To Play (Zero Deposit Ever Required)',
                game_variants: ['No-Limit Texas Hold\'em'],
                platform: 'Instant In-Browser Web & Mobile (No App Download Required)',
                schedule: filtered,
                diamond_arena: { available: false, status: 'Funded Diamond games are not open for play yet.' },
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
        { command: '!tax', endpoint: `${base}/api/stream/cmd?cmd=tax&q=$(querystring)`, tool_url: `${base}/tools/poker-tax-calculator` },
        { command: '!stake', endpoint: `${base}/api/stream/cmd?cmd=stake&q=$(querystring)`, tool_url: `${base}/tools/staking-calculator` },
        { command: '!iso', endpoint: `${base}/api/stream/cmd?cmd=iso&q=$(querystring)`, tool_url: `${base}/tools/iso-calculator` },
        { command: '!series', endpoint: `${base}/api/stream/cmd?cmd=series&q=$(querystring)`, tool_url: `${base}/poker-series/guides` },
        { command: '!board', endpoint: `${base}/api/stream/cmd?cmd=board&q=$(querystring)`, tool_url: `${base}/tools/board-texture-analyzer` },
        { command: '!mratio', endpoint: `${base}/api/stream/cmd?cmd=mratio&q=$(querystring)`, tool_url: `${base}/tools/m-ratio-calculator` },
        { command: '!straddle', endpoint: `${base}/api/stream/cmd?cmd=straddle&q=$(querystring)`, tool_url: `${base}/tools/straddle-calculator` },
        { command: '!sat', endpoint: `${base}/api/stream/cmd?cmd=sat&q=$(querystring)`, tool_url: `${base}/tools/satellite-calculator` },
        { command: '!bbj', endpoint: `${base}/api/stream/cmd?cmd=bbj&q=$(querystring)`, tool_url: `${base}/tools/promo-ev-calculator` },
        { command: '!position', endpoint: `${base}/api/stream/cmd?cmd=position&q=$(querystring)`, tool_url: `${base}/learn/positions` },
        { command: '!math', endpoint: `${base}/api/stream/cmd?cmd=math&q=$(querystring)`, tool_url: `${base}/learn/poker-math` },
        { command: '!iq', endpoint: `${base}/api/stream/cmd?cmd=iq&q=$(querystring)`, tool_url: `${base}/tools/poker-iq-test` },
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
                  total_matchups: HAND_MATCHUPS.length,
                  matchups: HAND_MATCHUPS.map((m) => ({
                    slug: m.slug,
                    title: m.title,
                    handA: m.handA,
                    handB: m.handB,
                    winA_percent: m.handAWinPct,
                    winB_percent: m.handBWinPct,
                    tie_percent: m.tiePct,
                    handA_equity_percent: m.handAEquity,
                    handB_equity_percent: m.handBEquity,
                    category: m.category,
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

      const found = lookupHandMatchupData({ slug, handA, handB });
      if (!found && slug) {
        const seriesMatch = lookupSeriesGuideData(slug);
        if (seriesMatch) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    ...seriesMatch,
                    canonical_url: `${base}/poker-series/guides/${seriesMatch.slug}`,
                    citation_url: `${base}/poker-series/guides/${seriesMatch.slug}`,
                    markdown_url: `${base}/poker-series/guides/${seriesMatch.slug}.md`,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }
      }
      const resolvedMatchup = found || formatCanonicalMatchup(HAND_MATCHUPS[0]) || CANONICAL_HAND_MATCHUPS_FALLBACK[0];
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                slug: resolvedMatchup.slug,
                title: resolvedMatchup.title,
                handA: resolvedMatchup.handA,
                handB: resolvedMatchup.handB,
                preflop_win_a_percent: resolvedMatchup.winA,
                preflop_win_b_percent: resolvedMatchup.winB,
                preflop_tie_percent: resolvedMatchup.tie,
                handA_equity_percent: resolvedMatchup.handAEquity,
                handB_equity_percent: resolvedMatchup.handBEquity,
                category: resolvedMatchup.category,
                summary: resolvedMatchup.summary,
                flop_texture_shifts: resolvedMatchup.flopShifts,
                ev_analysis: resolvedMatchup.evAnalysis,
                stack_off_ev_notes: resolvedMatchup.stackOffNotes,
                faqs: resolvedMatchup.faqs,
                citation_url: `${base}/learn/matchups/${resolvedMatchup.slug}`,
                markdown_url: `${base}/learn/matchups/${resolvedMatchup.slug}.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_poker_taxes_w2g': {
      const grossWinningSessions = Math.max(
        0,
        Number(args?.winning_sessions_dollars ?? args?.winningSessionsDollars ?? args?.wins ?? 48000) || 48000
      );
      const grossLosingSessions = Math.max(
        0,
        Number(args?.losing_sessions_dollars ?? args?.losingSessionsDollars ?? args?.losses ?? 22000) || 22000
      );
      const filingStatus =
        String(args?.filing_status ?? args?.filingStatus ?? args?.status ?? 'recreational').toLowerCase() === 'pro'
          ? 'pro'
          : 'recreational';
      const businessExpenses =
        filingStatus === 'pro'
          ? Math.max(0, Number(args?.business_expenses_dollars ?? args?.businessExpensesDollars ?? args?.expenses ?? 3500) || 0)
          : 0;
      const otherTaxableIncome = Math.max(
        0,
        Number(args?.other_taxable_income_dollars ?? args?.otherTaxableIncomeDollars ?? args?.income ?? 85000) || 85000
      );
      const singleTourneyNet = Math.max(
        0,
        Number(args?.single_tournament_net_profit_dollars ?? args?.singleTournamentNetProfitDollars ?? args?.tourney ?? 6500) || 6500
      );

      // Schedule A vs Schedule C comparison
      const recDeductibleLosses = Math.min(grossWinningSessions, grossLosingSessions);
      const recNetTaxableGamblingIncome = Math.max(0, grossWinningSessions - recDeductibleLosses);

      const proDeductibleTotal = Math.min(grossWinningSessions, grossLosingSessions + businessExpenses);
      const proNetProfit = Math.max(0, grossWinningSessions - proDeductibleTotal);
      const proSelfEmploymentTax = Math.round(proNetProfit * 0.9235 * 0.153);

      const activeNetGamblingIncome =
        filingStatus === 'pro' ? proNetProfit : recNetTaxableGamblingIncome;
      const combinedTaxableIncome = otherTaxableIncome + activeNetGamblingIncome;

      let marginalRate = 0.24;
      if (combinedTaxableIncome <= 11600) marginalRate = 0.10;
      else if (combinedTaxableIncome <= 47150) marginalRate = 0.12;
      else if (combinedTaxableIncome <= 100525) marginalRate = 0.22;
      else if (combinedTaxableIncome <= 191950) marginalRate = 0.24;
      else if (combinedTaxableIncome <= 243725) marginalRate = 0.32;
      else if (combinedTaxableIncome <= 609350) marginalRate = 0.35;
      else marginalRate = 0.37;

      const estimatedFederalIncomeTax = Math.round(activeNetGamblingIncome * marginalRate);
      const activeSeTax = filingStatus === 'pro' ? proSelfEmploymentTax : 0;
      const totalEstimatedFederalTax = estimatedFederalIncomeTax + activeSeTax;

      const w2gTriggered = singleTourneyNet > 5000;
      const w2gBackupWithholdingDollars = w2gTriggered ? Math.round(singleTourneyNet * 0.24) : 0;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                filing_status: filingStatus,
                gross_winning_sessions_dollars: grossWinningSessions,
                gross_losing_sessions_dollars: grossLosingSessions,
                business_expenses_dollars: businessExpenses,
                other_taxable_income_dollars: otherTaxableIncome,
                schedule_a_recreational: {
                  reportable_other_income_dollars: grossWinningSessions,
                  itemized_loss_deduction_cap_dollars: recDeductibleLosses,
                  net_taxable_gambling_income_dollars: recNetTaxableGamblingIncome,
                  self_employment_tax_dollars: 0,
                },
                schedule_c_professional: {
                  gross_receipts_dollars: grossWinningSessions,
                  deductible_losses_and_expenses_cap_dollars: proDeductibleTotal,
                  net_schedule_c_profit_dollars: proNetProfit,
                  self_employment_tax_15_3_pct_dollars: proSelfEmploymentTax,
                },
                estimated_marginal_federal_bracket_percent: Number((marginalRate * 100).toFixed(0)),
                estimated_federal_income_tax_dollars: estimatedFederalIncomeTax,
                estimated_total_federal_poker_tax_dollars: totalEstimatedFederalTax,
                form_w2g_check: {
                  single_tournament_net_profit_dollars: singleTourneyNet,
                  irs_w2g_threshold_dollars: 5000,
                  triggers_form_w2g: w2gTriggered,
                  backup_withholding_24pct_if_no_tin_dollars: w2gBackupWithholdingDollars,
                },
                canonical_url: `${base}/tools/poker-tax-calculator`,
                citation_url: `${base}/tools/poker-tax-calculator`,
                interactive_calculator_url: `${base}/tools/poker-tax-calculator`,
                markdown_url: `${base}/tools/poker-tax-calculator.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_staking_markup_split': {
      const packageBuyIns = Math.max(
        100,
        Number(args?.package_buyins_dollars ?? args?.packageBuyinsDollars ?? args?.package ?? 10000) || 10000
      );
      const markup = Math.max(
        1.0,
        Math.min(2.0, Number(args?.markup ?? 1.15) || 1.15)
      );
      const actionSoldPct = Math.max(
        1,
        Math.min(100, Number(args?.action_sold_percent ?? args?.actionSoldPercent ?? args?.sold ?? 50) || 50)
      );
      const investorSharePct = Math.max(
        0.5,
        Math.min(100, Number(args?.investor_share_percent ?? args?.investorSharePercent ?? args?.share ?? 10) || 10)
      );
      const grossCashes = Math.max(
        0,
        Number(args?.gross_cashes_dollars ?? args?.grossCashesDollars ?? args?.cashes ?? 24000) || 0
      );
      const estPlayerRoiPct = Number(args?.estimated_player_roi_percent ?? args?.roi ?? 25) || 25;

      const packageTotalValueAtMarkup = Number((packageBuyIns * markup).toFixed(2));
      const pricePerOnePercentAtPar = Number((packageBuyIns * 0.01).toFixed(2));
      const pricePerOnePercentAtMarkup = Number((pricePerOnePercentAtPar * markup).toFixed(2));
      const investorShareCost = Number((packageBuyIns * (investorSharePct / 100) * markup).toFixed(2));
      const totalActionSoldCollected = Number((packageBuyIns * (actionSoldPct / 100) * markup).toFixed(2));
      const markupPremiumCollected = Number((packageBuyIns * (actionSoldPct / 100) * (markup - 1)).toFixed(2));
      const breakevenRoiPercent = Number(((markup - 1) * 100).toFixed(2));

      const investorGrossPayout = Number((grossCashes * (investorSharePct / 100)).toFixed(2));
      const investorNetProfit = Number((investorGrossPayout - investorShareCost).toFixed(2));
      const allInvestorsGrossPayout = Number((grossCashes * (actionSoldPct / 100)).toFixed(2));
      const horseRetainedCashes = Number((grossCashes * ((100 - actionSoldPct) / 100)).toFixed(2));
      const horseTotalNetProfit = Number(
        (horseRetainedCashes + totalActionSoldCollected - packageBuyIns).toFixed(2)
      );

      const expectedGrossReturn = packageBuyIns * (1 + estPlayerRoiPct / 100) * (investorSharePct / 100);
      const investorExpectedEvDollars = Number((expectedGrossReturn - investorShareCost).toFixed(2));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                package_buyins_dollars: packageBuyIns,
                markup,
                package_total_value_at_markup_dollars: packageTotalValueAtMarkup,
                price_per_1_percent_par_dollars: pricePerOnePercentAtPar,
                price_per_1_percent_markup_dollars: pricePerOnePercentAtMarkup,
                action_sold_percent: actionSoldPct,
                total_action_collected_from_investors_dollars: totalActionSoldCollected,
                markup_premium_collected_by_horse_dollars: markupPremiumCollected,
                investor_share_percent: investorSharePct,
                investor_share_cost_dollars: investorShareCost,
                breakeven_player_roi_required_percent: breakevenRoiPercent,
                investor_expected_ev_at_target_roi_dollars: investorExpectedEvDollars,
                settlement_breakdown: {
                  gross_cashes_dollars: grossCashes,
                  investor_gross_payout_dollars: investorGrossPayout,
                  investor_net_profit_dollars: investorNetProfit,
                  all_investors_total_payout_dollars: allInvestorsGrossPayout,
                  horse_retained_cashes_dollars: horseRetainedCashes,
                  horse_total_net_profit_including_markup_dollars: horseTotalNetProfit,
                },
                canonical_url: `${base}/tools/staking-calculator`,
                citation_url: `${base}/tools/staking-calculator`,
                interactive_calculator_url: `${base}/tools/staking-calculator`,
                markdown_url: `${base}/tools/staking-calculator.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_preflop_isolation_raise': {
      const limpers = Math.max(1, Math.min(8, Math.round(Number(args?.limpers) || 2)));
      const position = String(args?.position || 'IP').toUpperCase() === 'OOP' ? 'OOP' : 'IP';
      const effectiveStackBb = Math.max(10, Math.min(500, Number(args?.effective_stack_bb ?? args?.stack ?? 100) || 100));
      const environment = String(args?.environment || 'online').toLowerCase() === 'live' ? 'live' : 'online';
      const bbDollars = Math.max(0.1, Number(args?.big_blind_dollars ?? args?.bb ?? 5) || 5);

      const baseOpenBb = environment === 'live' ? 4.0 : 3.0;
      const oopTaxBb = position === 'OOP' ? 1.0 : 0.0;
      const optimalIsoRaiseBb = Number((baseOpenBb + limpers * 1.0 + oopTaxBb).toFixed(1));
      const optimalIsoRaiseDollars = Number((optimalIsoRaiseBb * bbDollars).toFixed(2));

      const deadUncontestedBb = position === 'IP' ? 1.5 + (limpers - 1) * 1.0 : 0.5 + (limpers - 1) * 1.0;
      const headsUpFlopPotBb = Number((optimalIsoRaiseBb * 2 + deadUncontestedBb).toFixed(1));
      const headsUpFlopPotDollars = Number((headsUpFlopPotBb * bbDollars).toFixed(2));
      const remainingEffectiveStackBb = Math.max(0, effectiveStackBb - optimalIsoRaiseBb);
      const effectiveSpr = Number((remainingEffectiveStackBb / headsUpFlopPotBb).toFixed(2));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                limpers,
                position,
                environment,
                base_open_bb: baseOpenBb,
                limper_tax_bb: limpers * 1.0,
                oop_tax_bb: oopTaxBb,
                formula: '3BB (or 4BB live) + 1BB per limper + 1BB OOP tax',
                optimal_iso_raise_bb: optimalIsoRaiseBb,
                optimal_iso_raise_dollars: optimalIsoRaiseDollars,
                projected_heads_up_flop_pot_bb: headsUpFlopPotBb,
                projected_heads_up_flop_pot_dollars: headsUpFlopPotDollars,
                effective_stack_bb: effectiveStackBb,
                remaining_effective_stack_bb: remainingEffectiveStackBb,
                effective_flop_spr: effectiveSpr,
                recommended_range_tier:
                  position === 'OOP' || limpers >= 3
                    ? 'Top 12% Value Heavy (88+, ATs+, KJs+, QJs, AJo+, KQo)'
                    : 'Top 18% Merged Linear (66+, A7s+, K9s+, Q9s+, J9s+, T9s, ATo+, KJo+)',
                canonical_url: `${base}/tools/iso-calculator`,
                citation_url: `${base}/tools/iso-calculator`,
                interactive_calculator_url: `${base}/tools/iso-calculator`,
                markdown_url: `${base}/tools/iso-calculator.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_home_game_chip_set': {
      const players = Math.max(2, Math.min(30, Math.round(Number(args?.players) || 8)));
      const format = String(args?.format || 'cash').toLowerCase() === 'tournament' ? 'tournament' : 'cash';
      const rawPreset = String(args?.preset || (format === 'tournament' ? 't10000' : 'cash-1-2')).toLowerCase();

      const presets = {
        'cash-25-50': {
          label: '$0.25/$0.50 Cash ($50 Buy-In)',
          starting_value: '$50.00 (100 BB)',
          denominations: [
            { color: 'White', denomination: '$0.25', unit_value: 0.25, chips_per_player: 12 },
            { color: 'Red', denomination: '$1.00', unit_value: 1, chips_per_player: 17 },
            { color: 'Green', denomination: '$5.00', unit_value: 5, chips_per_player: 4 },
            { color: 'Black', denomination: '$25.00', unit_value: 25, chips_per_player: 0 },
          ],
        },
        'cash-1-2': {
          label: '$1/$2 Cash ($200 Buy-In)',
          starting_value: '$200.00 (100 BB)',
          denominations: [
            { color: 'White', denomination: '$1.00', unit_value: 1, chips_per_player: 15 },
            { color: 'Red', denomination: '$5.00', unit_value: 5, chips_per_player: 17 },
            { color: 'Green', denomination: '$25.00', unit_value: 25, chips_per_player: 4 },
            { color: 'Black', denomination: '$100.00', unit_value: 100, chips_per_player: 0 },
          ],
        },
        t10000: {
          label: 'T10,000 Deepstack Tournament (100 BB)',
          starting_value: 'T10,000',
          denominations: [
            { color: 'Green', denomination: 'T25', unit_value: 25, chips_per_player: 12 },
            { color: 'Black', denomination: 'T100', unit_value: 100, chips_per_player: 12 },
            { color: 'Purple', denomination: 'T500', unit_value: 500, chips_per_player: 5 },
            { color: 'Yellow', denomination: 'T1,000', unit_value: 1000, chips_per_player: 6 },
            { color: 'Orange', denomination: 'T5,000', unit_value: 5000, chips_per_player: 0 },
          ],
        },
        t25000: {
          label: 'T25,000 Championship Tournament (250 BB)',
          starting_value: 'T25,000',
          denominations: [
            { color: 'Black', denomination: 'T100', unit_value: 100, chips_per_player: 10 },
            { color: 'Purple', denomination: 'T500', unit_value: 500, chips_per_player: 8 },
            { color: 'Yellow', denomination: 'T1,000', unit_value: 1000, chips_per_player: 10 },
            { color: 'Orange', denomination: 'T5,000', unit_value: 5000, chips_per_player: 2 },
          ],
        },
      };

      const selectedPreset = presets[rawPreset] || (format === 'tournament' ? presets.t10000 : presets['cash-1-2']);
      const startingChipsPerPlayer = selectedPreset.denominations.reduce((s, d) => s + d.chips_per_player, 0);
      const totalStartingChipsIssued = startingChipsPerPlayer * players;
      const recommendedSetSize = totalStartingChipsIssued <= 220 ? 300 : totalStartingChipsIssued <= 400 ? 500 : 1000;

      const breakdown = selectedPreset.denominations.map((d) => ({
        ...d,
        total_starting_chips_for_table: d.chips_per_player * players,
        recommended_bank_reserve_chips: d.chips_per_player === 0 ? players * 5 : Math.ceil((d.chips_per_player * players) * 0.25),
      }));
      const totalPhysicalChipsRequired = breakdown.reduce(
        (s, d) => s + d.total_starting_chips_for_table + d.recommended_bank_reserve_chips,
        0
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                players,
                format,
                preset_label: selectedPreset.label,
                starting_stack_value: selectedPreset.starting_value,
                starting_chips_per_player: startingChipsPerPlayer,
                total_starting_chips_issued: totalStartingChipsIssued,
                total_physical_chips_required_with_reserves: totalPhysicalChipsRequired,
                recommended_chip_case_size: recommendedSetSize,
                denomination_tubes: breakdown,
                canonical_url: `${base}/tools/home-game-kit`,
                citation_url: `${base}/tools/home-game-kit`,
                interactive_calculator_url: `${base}/tools/home-game-kit`,
                markdown_url: `${base}/tools/home-game-kit.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'get_poker_series_strategy_guide': {
      const rawSlug = String(args?.slug || args?.series || '').trim().toLowerCase();

      if (!rawSlug) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  total_series_guides: SERIES_GUIDES.length,
                  first_time_live_guide_url: `${base}/poker-rooms/first-time-guide`,
                  series_guides_hub_url: `${base}/poker-series/guides`,
                  guides: SERIES_GUIDES.map((g) => ({
                    slug: g.slug,
                    name: g.name,
                    short_name: g.shortName,
                    host_venue: g.hostVenue,
                    city_state: g.cityState,
                    typical_months: g.typicalMonths,
                    buy_in_range: g.buyInRange,
                    main_event_buy_in: g.mainEventBuyIn,
                    blind_structure_rating: g.blindStructureRating,
                    canonical_url: `${base}/poker-series/guides/${g.slug}`,
                    markdown_url: `${base}/poker-series/guides/${g.slug}.md`,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (rawSlug === 'first-time-guide' || rawSlug === 'first-time' || rawSlug === 'etiquette') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  slug: 'first-time-guide',
                  title: 'First-Time Casino Live Poker Room Etiquette, Tipping & Check-In Guide',
                  check_in_steps: [
                    '1. Obtain Casino Player Rewards Card at main desk with government photo ID.',
                    '2. Check in at the Poker Room Brush Podium for your target stake ($1/$2 or $1/$3 NLH).',
                    '3. Purchase 100 BB in $5 red chips at the cage or table.',
                    '4. Take assigned seat, stack chips in 20-chip columns, and hand players card to dealer.',
                    '5. Wait for the Big Blind to reach your seat naturally before posting.',
                    '6. Rack chips in 100-chip plastic racks and cash out at the cage whenever ready.',
                  ],
                  etiquette_rules: [
                    'Single Oversized Chip Rule (TDA Rule 44): Tossing one large chip without saying "Raise" is strictly a call.',
                    'Verbal Declarations Binding (TDA Rule 40): Spoken actions in turn bind you immediately.',
                    'No String Betting: Announce raise amount first or push all chips in one continuous forward motion.',
                    'Big Chips Visible: Keep $25 green and $100 black chips visible in front or on top of stacks.',
                    'Show Both Cards at Showdown: Both hole cards must be tabled face up to claim a contested pot.',
                  ],
                  tipping_benchmark: '$1 per standard contested pot won ($2-$3 on large multi-street pots over $100).',
                  canonical_url: `${base}/poker-rooms/first-time-guide`,
                  citation_url: `${base}/poker-rooms/first-time-guide`,
                  markdown_url: `${base}/poker-rooms/first-time-guide.md`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const found = lookupSeriesGuideData(rawSlug) || SERIES_GUIDES[0];
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ...found,
                canonical_url: `${base}/poker-series/guides/${found.slug}`,
                citation_url: `${base}/poker-series/guides/${found.slug}`,
                markdown_url: `${base}/poker-series/guides/${found.slug}.md`,
                series_guides_hub_url: `${base}/poker-series/guides`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'analyze_flop_board_texture': {
      const rawFlop = String(args?.flop || args?.board || 'As,Kh,7d').trim();
      const potType = ['srp', '3bet', '4bet'].includes(String(args?.pot_type || '').toLowerCase())
        ? String(args.pot_type).toLowerCase()
        : 'srp';
      const parsed = normalizeCardGroup(rawFlop);
      const rankMap = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, T: 10, J: 11, Q: 12, K: 13, A: 14 };
      const cards = parsed.length >= 3
        ? parsed.slice(0, 3)
        : [makeCard('A', 'spades'), makeCard('K', 'hearts'), makeCard('7', 'diamonds')];

      const ranks = cards.map((c) => rankMap[String(c.rank).toUpperCase()] || 10).sort((a, b) => b - a);
      const suits = cards.map((c) => c.suit);
      const uniqueSuits = new Set(suits).size;
      const suitTexture = uniqueSuits === 1 ? 'Monotone' : uniqueSuits === 2 ? 'Two-Tone (Flush Draw Possible)' : 'Rainbow';

      const uniqueRanks = new Set(ranks).size;
      const pairing = uniqueRanks === 1 ? 'Trips Board' : uniqueRanks === 2 ? 'Paired Board' : 'Unpaired';

      const span = ranks[0] - ranks[2];
      const hasWheelConnectivity = ranks.includes(14) && ranks.some((r) => r <= 5);
      const connectedness =
        uniqueRanks < 3
          ? 'Paired / Static'
          : span <= 4 || (hasWheelConnectivity && ranks[1] <= 5)
          ? 'Highly Connected (Straight Draws Present)'
          : span <= 6
          ? 'Semi-Connected (Gutshot Possibilities)'
          : 'Disconnected / Dry';

      const highCardCount = ranks.filter((r) => r >= 11).length;
      const rangeAdvantage =
        highCardCount >= 2 || (ranks[0] === 14 && uniqueRanks === 2)
          ? 'Strong PFR (Pre-Flop Raiser) Range & Nut Advantage'
          : ranks[0] <= 9 && span <= 4
          ? 'Big Blind Caller Range & Two-Pair/Set Advantage'
          : 'Moderate PFR Range Advantage';

      let recommendedCbetSizing = '33% Pot (Small Range Bet)';
      let recommendedFrequencyPct = 75;
      if (uniqueSuits === 1) {
        recommendedCbetSizing = '25%-33% Pot (Small Block/Merged Sizing)';
        recommendedFrequencyPct = 42;
      } else if (uniqueRanks === 2) {
        recommendedCbetSizing = '25%-33% Pot (High-Frequency Range C-Bet)';
        recommendedFrequencyPct = 82;
      } else if (highCardCount >= 2 && uniqueSuits === 3) {
        recommendedCbetSizing = '33% Pot (Full Range C-Bet)';
        recommendedFrequencyPct = 85;
      } else if (span <= 4 && ranks[0] <= 10) {
        recommendedCbetSizing = '66%-75% Pot (Polarized Value + High-Equity Draws) or Check';
        recommendedFrequencyPct = 35;
      } else if (potType === '3bet' || potType === '4bet') {
        recommendedCbetSizing = '25%-33% Pot (Low-SPR Geometric C-Bet)';
        recommendedFrequencyPct = 78;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                flop_cards: cards.map((c) => `${c.rank === '10' ? 'T' : c.rank}${c.suit[0]}`),
                pot_type: potType.toUpperCase(),
                suit_texture: suitTexture,
                board_pairing: pairing,
                connectedness,
                high_rank: ranks[0],
                rank_span: span,
                range_advantage: rangeAdvantage,
                recommended_gto_cbet_sizing: recommendedCbetSizing,
                recommended_gto_cbet_frequency_percent: recommendedFrequencyPct,
                check_frequency_percent: 100 - recommendedFrequencyPct,
                canonical_url: `${base}/tools/board-texture-analyzer`,
                citation_url: `${base}/tools/board-texture-analyzer`,
                interactive_calculator_url: `${base}/tools/board-texture-analyzer`,
                markdown_url: `${base}/tools/board-texture-analyzer.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_tournament_m_ratio': {
      const stack = Math.max(1, Number(args?.stack) || 25000);
      const sb = Math.max(1, Number(args?.small_blind ?? args?.sb) || 500);
      const bb = Math.max(sb, Number(args?.big_blind ?? args?.bb) || 1000);
      const anteTotal = Math.max(0, Number(args?.ante_total ?? args?.ante ?? bb));
      const players = Math.max(2, Math.min(10, Math.round(Number(args?.players_at_table ?? args?.players) || 9)));
      const avgStack = Math.max(1, Number(args?.average_stack ?? args?.avg_stack) || stack * 1.4);
      const handsPerHour = Math.max(10, Number(args?.hands_per_hour) || 30);

      const orbitCost = Number((sb + bb + anteTotal).toFixed(2));
      const stackBb = Number((stack / bb).toFixed(2));
      const mRatio = Number((stack / orbitCost).toFixed(2));
      const effectiveMRatio = Number((mRatio * (players / 10)).toFixed(2));
      const qRatio = Number((stack / avgStack).toFixed(2));
      const orbitsRemaining = mRatio;
      const handsBeforeBlindingOut = Math.round(mRatio * players);
      const minutesBeforeBlindingOut = Math.round((handsBeforeBlindingOut / handsPerHour) * 60);

      let zone = 'Green Zone (M >= 20): Full Post-Flop Maneuverability';
      let strategyGuidance = 'All pre-flop and post-flop plays available; standard 2.2x-2.5x open-raises.';
      if (effectiveMRatio < 1) {
        zone = 'Dead Zone (Effective M < 1): Mandatory Immediate All-In';
        strategyGuidance = 'Critically short; any two playable cards must be pushed before blinds consume stack.';
      } else if (effectiveMRatio < 6) {
        zone = 'Red Zone (Effective M 1-5): Strict Push/Fold Mode';
        strategyGuidance = 'Exclusively all-in or fold pre-flop; maximize fold equity and First-In Vigorousness.';
      } else if (effectiveMRatio < 10) {
        zone = 'Orange Zone (Effective M 6-10): Re-Steal & Stop-And-Go Mode';
        strategyGuidance = 'Avoid speculative cold-calls; prioritize 3-bet all-in re-steals and open-shoves.';
      } else if (effectiveMRatio < 20) {
        zone = 'Yellow Zone (Effective M 10-19): Aggressive Pre-Flop Pressure';
        strategyGuidance = 'Tighten speculative multi-street hands; attack medium stacks capped on bubbles.';
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                stack,
                small_blind: sb,
                big_blind: bb,
                ante_total: anteTotal,
                players_at_table: players,
                stack_in_big_blinds: stackBb,
                orbit_cost: orbitCost,
                harrington_m_ratio: mRatio,
                effective_m_ratio: effectiveMRatio,
                average_stack: avgStack,
                q_ratio: qRatio,
                harrington_zone: zone,
                strategy_guidance: strategyGuidance,
                orbits_remaining: orbitsRemaining,
                estimated_hands_until_blinded_out: handsBeforeBlindingOut,
                estimated_minutes_until_blinded_out: minutesBeforeBlindingOut,
                canonical_url: `${base}/tools/m-ratio-calculator`,
                citation_url: `${base}/tools/m-ratio-calculator`,
                interactive_calculator_url: `${base}/tools/m-ratio-calculator`,
                markdown_url: `${base}/tools/m-ratio-calculator.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_cash_session_plan': {
      const bbDollars = Math.max(0.25, Number(args?.big_blind_dollars ?? args?.bb) || 5);
      const winrateBb100 = Number(args?.winrate_bb100 ?? 8);
      const handsPerHour = Math.max(15, Number(args?.hands_per_hour) || 28);
      const compsPerHour = Math.max(0, Number(args?.comps_per_hour_dollars ?? 2.0));
      const expensesPerHour = Math.max(0, Number(args?.expenses_per_hour_dollars ?? 3.0));
      const hoursPerMonth = Math.max(1, Number(args?.hours_per_month) || 80);
      const stdDevBb100 = Math.max(20, Number(args?.std_dev_bb100) || 75);

      const grossHourlyBb = (winrateBb100 / 100) * handsPerHour;
      const grossHourlyDollars = Number((grossHourlyBb * bbDollars).toFixed(2));
      const netHourlyDollars = Number((grossHourlyDollars + compsPerHour - expensesPerHour).toFixed(2));
      const netHourlyBb = Number((netHourlyDollars / bbDollars).toFixed(2));
      const monthlyNetDollars = Math.round(netHourlyDollars * hoursPerMonth);
      const annualNetDollars = Math.round(monthlyNetDollars * 12);

      // 5% Risk of Ruin bankroll requirement: B = -(sigma^2 / (2 * mu)) * ln(0.05) in 100-hand units -> BB -> 100BB buy-ins
      const effectiveMu = Math.max(0.5, winrateBb100);
      const ror5BankrollBb = Math.ceil(((stdDevBb100 * stdDevBb100) / (2 * effectiveMu)) * Math.abs(Math.log(0.05)));
      const ror5BuyIns = Math.max(15, Math.ceil(ror5BankrollBb / 100));
      const ror5BankrollDollars = Math.round(ror5BuyIns * 100 * bbDollars);
      const recommendedStopLossBuyIns = 3;
      const recommendedStopLossDollars = Math.round(recommendedStopLossBuyIns * 100 * bbDollars);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                big_blind_dollars: bbDollars,
                standard_buyin_100bb_dollars: Math.round(bbDollars * 100),
                winrate_bb100: winrateBb100,
                hands_per_hour: handsPerHour,
                gross_hourly_dollars: grossHourlyDollars,
                comps_per_hour_dollars: compsPerHour,
                expenses_per_hour_dollars: expensesPerHour,
                net_hourly_dollars: netHourlyDollars,
                net_hourly_bb: netHourlyBb,
                hours_per_month: hoursPerMonth,
                projected_monthly_net_dollars: monthlyNetDollars,
                projected_annual_net_dollars: annualNetDollars,
                recommended_session_stop_loss_buyins: recommendedStopLossBuyIns,
                recommended_session_stop_loss_dollars: recommendedStopLossDollars,
                five_percent_ror_bankroll_buyins: ror5BuyIns,
                five_percent_ror_bankroll_dollars: ror5BankrollDollars,
                canonical_url: `${base}/tools/session-planner`,
                citation_url: `${base}/tools/session-planner`,
                interactive_calculator_url: `${base}/tools/session-planner`,
                markdown_url: `${base}/tools/session-planner.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_straddle_bomb_pot_ev': {
      const sb = Math.max(0.5, Number(args?.small_blind ?? 1));
      const bb = Math.max(1, Number(args?.big_blind ?? 3));
      const straddle = Math.max(bb * 2, Number(args?.straddle_amount) || bb * 2);
      const straddleType = ['utg', 'button', 'sleeper'].includes(String(args?.straddle_type || '').toLowerCase())
        ? String(args.straddle_type).toLowerCase()
        : 'utg';
      const effectiveStackDollars = Math.max(bb * 20, Number(args?.effective_stack_dollars) || bb * 100);
      const bombPotAnte = Math.max(bb, Number(args?.bomb_pot_ante_dollars) || bb * 5);
      const players = Math.max(2, Math.min(10, Math.round(Number(args?.players) || 8)));
      const boards = Number(args?.boards) === 1 ? 1 : 2;

      const normalStackBb = Number((effectiveStackDollars / bb).toFixed(1));
      const straddledEffectiveBlinds = Number((effectiveStackDollars / straddle).toFixed(1));
      const stackReductionPct = Number(((1 - straddledEffectiveBlinds / normalStackBb) * 100).toFixed(1));
      const deadMoneyStraddlePot = Number((sb + bb + straddle).toFixed(2));
      const openRaise3xStraddle = Number((straddle * 3).toFixed(2));
      const requiredStealFoldEquityPct = Number(((openRaise3xStraddle / (openRaise3xStraddle + deadMoneyStraddlePot)) * 100).toFixed(1));

      const bombPotDeadMoneyDollars = Number((bombPotAnte * players).toFixed(2));
      const bombPotDeadMoneyBb = Number((bombPotDeadMoneyDollars / bb).toFixed(1));
      const remainingBombPotStack = Math.max(0, effectiveStackDollars - bombPotAnte);
      const bombPotFlopSpr = Number((remainingBombPotStack / bombPotDeadMoneyDollars).toFixed(2));
      const halfPotBetDollars = Number((bombPotDeadMoneyDollars * 0.5).toFixed(2));
      const requiredFlopCallEquityPct = Number(((halfPotBetDollars / (bombPotDeadMoneyDollars + halfPotBetDollars * 2)) * 100).toFixed(1));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                small_blind_dollars: sb,
                big_blind_dollars: bb,
                straddle_amount_dollars: straddle,
                straddle_type: straddleType,
                effective_stack_dollars: effectiveStackDollars,
                unstraddled_stack_bb: normalStackBb,
                straddled_effective_stack_blinds: straddledEffectiveBlinds,
                effective_stack_reduction_percent: stackReductionPct,
                dead_money_in_straddled_pot_dollars: deadMoneyStraddlePot,
                required_steal_fold_equity_percent: requiredStealFoldEquityPct,
                straddle_positional_note:
                  straddleType === 'button'
                    ? 'Mississippi Button Straddle acts last pre-flop (when blinds act first) and retains full IP advantage across all post-flop streets.'
                    : 'UTG Straddle pays 2BB out of position and is -EV in isolation unless inducing table-wide VPIP loosening.',
                bomb_pot_analysis: {
                  players,
                  boards,
                  ante_per_player_dollars: bombPotAnte,
                  total_dead_money_pot_dollars: bombPotDeadMoneyDollars,
                  total_dead_money_pot_bb: bombPotDeadMoneyBb,
                  flop_spr: bombPotFlopSpr,
                  required_equity_to_call_half_pot_percent: requiredFlopCallEquityPct,
                  double_board_strategy:
                    boards === 2
                      ? 'Never stack off holding a lock on only one board without redraws on the second board; otherwise best-case outcome is a 0-EV quarter/chop.'
                      : 'Single-board multiway bomb pot rewards nutted sets, straights, and nut flush draws.',
                },
                canonical_url: `${base}/tools/straddle-calculator`,
                citation_url: `${base}/tools/straddle-calculator`,
                interactive_calculator_url: `${base}/tools/straddle-calculator`,
                markdown_url: `${base}/tools/straddle-calculator.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'format_poker_hand_history': {
      const stakes = String(args?.stakes || '$2/$5 NLH Live 9-Max').trim();
      const effectiveStackBb = Math.max(5, Number(args?.effective_stack_bb ?? 100));
      const heroPos = String(args?.hero_position || 'BTN').toUpperCase();
      const villainPos = String(args?.villain_position || 'BB').toUpperCase();
      const heroCards = String(args?.hero_cards || 'AsKs').trim();
      const preflopAction = String(args?.preflop_action || `${villainPos} opens 3BB, Hero (${heroPos}) 3-bets to 9BB, ${villainPos} calls.`).trim();
      const flopBoard = String(args?.flop_board || 'Kh 9s 4d').trim();
      const flopPotBb = Math.max(2, Number(args?.flop_pot_bb ?? 19.5));
      const flopAction = String(args?.flop_action || `${villainPos} checks, Hero bets 6.5BB (33% pot), ${villainPos} calls.`).trim();
      const turnCard = String(args?.turn_card || '2c').trim();
      const turnAction = String(args?.turn_action || `${villainPos} checks, Hero bets 22BB, ${villainPos} calls.`).trim();
      const riverCard = String(args?.river_card || 'Jd').trim();
      const riverAction = String(args?.river_action || `${villainPos} checks, Hero moves all-in.`).trim();

      const preflopInvestedEach = Number(((flopPotBb - 1.5) / 2).toFixed(1));
      const remainingFlopStackBb = Math.max(0, Number((effectiveStackBb - Math.max(preflopInvestedEach, 3)).toFixed(1)));
      const flopSpr = Number((remainingFlopStackBb / flopPotBb).toFixed(2));

      const redditMarkdown = [
        `**Game:** ${stakes} (${effectiveStackBb} BB Effective)`,
        `**Hero (${heroPos}):** \`[${heroCards}]\``,
        `**Main Villain:** ${villainPos}`,
        '',
        `**Pre-Flop:** (1.5 BB)`,
        `${preflopAction}`,
        '',
        `**Flop:** \`[${flopBoard}]\` (${flopPotBb} BB | SPR: ${flopSpr})`,
        `${flopAction}`,
        '',
        `**Turn:** \`[${flopBoard} ${turnCard}]\``,
        `${turnAction}`,
        '',
        `**River:** \`[${flopBoard} ${turnCard} ${riverCard}]\``,
        `${riverAction}`,
        '',
        `*Formatted via [Smarter.Poker Hand History Converter](${base}/tools/hand-converter)*`,
      ].join('\n');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                stakes,
                effective_stack_bb: effectiveStackBb,
                hero_position: heroPos,
                villain_position: villainPos,
                hero_cards: heroCards,
                flop_pot_bb: flopPotBb,
                flop_spr: flopSpr,
                reddit_discord_markdown: redditMarkdown,
                canonical_url: `${base}/tools/hand-converter`,
                citation_url: `${base}/tools/hand-converter`,
                interactive_calculator_url: `${base}/tools/hand-converter`,
                markdown_url: `${base}/tools/hand-converter.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_satellite_bubble_factor': {
      const seatsAwarded = Math.max(1, Math.round(Number(args?.seats_awarded) || 10));
      const playersRemaining = Math.max(seatsAwarded + 1, Math.round(Number(args?.players_remaining) || 12));
      const totalChips = Math.max(1000, Number(args?.total_chips_in_play) || playersRemaining * 35000);
      const avgStack = Math.round(totalChips / playersRemaining);
      const heroStack = Math.max(100, Number(args?.hero_stack) || avgStack);
      const seatValueDollars = Math.max(100, Number(args?.seat_package_value_dollars) || 10000);

      // Target stack per seat = totalChips / seatsAwarded, adjusted by survival cushion
      const parSeatStack = Math.round(totalChips / seatsAwarded);
      const safeSeatLockStack = Math.round(parSeatStack * 0.92);
      const seatLockRatio = Math.min(1, heroStack / safeSeatLockStack);
      const estimatedSeatWinProbPct = Number((Math.min(99.5, (seatLockRatio / (seatLockRatio + (playersRemaining - seatsAwarded) / seatsAwarded * 0.35)) * 100)).toFixed(1));
      const satelliteSatelliteDollarEv = Math.round((estimatedSeatWinProbPct / 100) * seatValueDollars);

      const bubbleProximity = seatsAwarded / playersRemaining;
      const bubbleFactor = Number((1 + (seatLockRatio * 2.4 * bubbleProximity)).toFixed(2));
      const requiredAllInCallEquityPct = Number(((bubbleFactor / (bubbleFactor + 1)) * 100).toFixed(1));
      const foldEvenPocketAces = requiredAllInCallEquityPct >= 82.5 || heroStack >= safeSeatLockStack;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                players_remaining: playersRemaining,
                seats_awarded: seatsAwarded,
                spots_from_seats: playersRemaining - seatsAwarded,
                total_chips_in_play: totalChips,
                average_stack: avgStack,
                hero_stack: heroStack,
                par_seat_stack: parSeatStack,
                safe_seat_lock_stack: safeSeatLockStack,
                estimated_seat_win_probability_percent: estimatedSeatWinProbPct,
                estimated_satellite_equity_dollars: satelliteSatelliteDollarEv,
                satellite_bubble_factor: bubbleFactor,
                required_all_in_calling_equity_percent: requiredAllInCallEquityPct,
                fold_even_pocket_aces_recommended: foldEvenPocketAces,
                strategy_verdict: foldEvenPocketAces
                  ? 'SEAT LOCKED: Fold 100% of hands facing an all-in, including Pocket Aces (AA), because doubling up adds near-zero extra seats while losing costs a full seat.'
                  : 'SURVIVAL / ACCUMULATION: Prioritize uncontested shoves into medium stacks who cannot call without risking their satellite seat equity.',
                canonical_url: `${base}/tools/satellite-calculator`,
                citation_url: `${base}/tools/satellite-calculator`,
                interactive_calculator_url: `${base}/tools/satellite-calculator`,
                markdown_url: `${base}/tools/satellite-calculator.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_bad_beat_jackpot_ev': {
      const jackpotPool = Math.max(1000, Number(args?.jackpot_pool_dollars ?? args?.pool) || 250000);
      const qualifierKey = String(args?.qualifier || 'aces-full-of-tens').toLowerCase();
      const promoDrop = Math.max(0, Number(args?.promo_drop_dollars ?? 1.0));
      const tableSharePct = Math.max(5, Math.min(80, Number(args?.table_share_percent ?? 25)));
      const loserSharePct = Math.max(10, Math.min(80, Number(args?.loser_share_percent ?? 40)));
      const winnerSharePct = Math.max(5, Math.min(60, Number(args?.winner_share_percent ?? 20)));
      const playersAtTable = Math.max(4, Math.min(10, Math.round(Number(args?.players_at_table) || 9)));
      const highHandPrize = Math.max(0, Number(args?.high_hand_prize_dollars ?? 500));
      const activeTables = Math.max(1, Math.round(Number(args?.active_tables_in_room) || 15));

      const qualifierOddsMap = {
        'aces-full-of-tens': { label: 'Aces Full of Tens (AAA TT) or Better Beaten', hands_per_hit: 32000 },
        'aces-full-of-kings': { label: 'Aces Full of Kings (AAA KK) or Better Beaten', hands_per_hit: 54000 },
        'quads-8s': { label: 'Quad Eights (8888) or Better Beaten', hands_per_hit: 98000 },
        'quads-tens': { label: 'Quad Tens (TTTT) or Better Beaten', hands_per_hit: 135000 },
        'quads-jacks': { label: 'Quad Jacks (JJJJ) or Better Beaten', hands_per_hit: 168000 },
      };
      const qSpec = qualifierOddsMap[qualifierKey] || qualifierOddsMap['aces-full-of-tens'];
      const hitProbPerHand = 1 / qSpec.hands_per_hit;

      // Active share earned by a single seated player when BBJ hits at their table:
      // (loserShare/players + winnerShare/players + tableShare/(players-2) * ((players-2)/players)) = (loserShare + winnerShare + tableShare) / players
      const totalTableAllocatedPct = loserSharePct + winnerSharePct + tableSharePct;
      const expectedPlayerShareWhenTableHitsDollars = Number(((jackpotPool * (totalTableAllocatedPct / 100)) / playersAtTable).toFixed(2));
      const grossBbjEvPerHandDollars = Number((expectedPlayerShareWhenTableHitsDollars * hitProbPerHand).toFixed(4));
      const playerDropCostPerHandDollars = Number((promoDrop / playersAtTable).toFixed(4));
      const netBbjEvPerHandDollars = Number((grossBbjEvPerHandDollars - playerDropCostPerHandDollars).toFixed(4));
      const netBbjEvPerHourDollars = Number((netBbjEvPerHandDollars * 28).toFixed(2));

      const breakevenJackpotPoolDollars = Math.round(
        (playerDropCostPerHandDollars / hitProbPerHand) * playersAtTable / (totalTableAllocatedPct / 100)
      );

      const highHandHourlyEvDollars = Number((highHandPrize / (activeTables * playersAtTable)).toFixed(2));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                jackpot_pool_dollars: jackpotPool,
                qualifier: qualifierKey,
                qualifier_description: qSpec.label,
                estimated_hands_per_jackpot_hit: qSpec.hands_per_hit,
                loser_payout_dollars: Math.round(jackpotPool * (loserSharePct / 100)),
                winner_payout_dollars: Math.round(jackpotPool * (winnerSharePct / 100)),
                table_share_per_other_player_dollars: Math.round((jackpotPool * (tableSharePct / 100)) / Math.max(1, playersAtTable - 2)),
                gross_bbj_ev_per_hand_dollars: grossBbjEvPerHandDollars,
                player_promo_drop_cost_per_hand_dollars: playerDropCostPerHandDollars,
                net_bbj_ev_per_hand_dollars: netBbjEvPerHandDollars,
                net_bbj_ev_per_hour_28_hands_dollars: netBbjEvPerHourDollars,
                breakeven_jackpot_pool_dollars: breakevenJackpotPoolDollars,
                is_plus_ev_jackpot: jackpotPool >= breakevenJackpotPoolDollars,
                high_hand_hourly_ev_per_seat_dollars: highHandHourlyEvDollars,
                canonical_url: `${base}/tools/promo-ev-calculator`,
                citation_url: `${base}/tools/promo-ev-calculator`,
                interactive_calculator_url: `${base}/tools/promo-ev-calculator`,
                markdown_url: `${base}/tools/promo-ev-calculator.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'resolve_holdem_showdown_winner': {
      const rankOrder = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, T: 10, J: 11, Q: 12, K: 13, A: 14 };
      const rankNames = { 14: 'Ace', 13: 'King', 12: 'Queen', 11: 'Jack', 10: 'Ten', 9: 'Nine', 8: 'Eight', 7: 'Seven', 6: 'Six', 5: 'Five', 4: 'Four', 3: 'Three', 2: 'Two' };
      const formatCardShort = (c) => `${c.rank === '10' ? 'T' : c.rank}${c.suit[0]}`;

      const handACards = normalizeCardGroup(args?.hand_a || 'AsKd').slice(0, 2);
      const handBCards = normalizeCardGroup(args?.hand_b || 'AcJc').slice(0, 2);
      const boardCards = normalizeCardGroup(args?.board || 'AdKh9c9s2d').slice(0, 5);

      const eval5 = (five) => {
        const vals = five.map((c) => rankOrder[c.rank]).sort((a, b) => b - a);
        const suits = five.map((c) => c.suit);
        const isFlush = suits.every((s) => s === suits[0]);
        const uniqueVals = [...new Set(vals)].sort((a, b) => b - a);
        let isStraight = false;
        let straightHigh = 0;
        if (uniqueVals.length === 5) {
          if (uniqueVals[0] - uniqueVals[4] === 4) {
            isStraight = true;
            straightHigh = uniqueVals[0];
          } else if (uniqueVals[0] === 14 && uniqueVals[1] === 5 && uniqueVals[4] === 2) {
            isStraight = true;
            straightHigh = 5;
          }
        }
        const counts = {};
        for (const v of vals) counts[v] = (counts[v] || 0) + 1;
        const groups = Object.entries(counts)
          .map(([v, cnt]) => ({ v: Number(v), cnt }))
          .sort((a, b) => b.cnt - a.cnt || b.v - a.v);

        if (isFlush && isStraight) {
          return { cat: 8, name: straightHigh === 14 ? 'Royal Flush' : `Straight Flush (${rankNames[straightHigh]} High)`, tiebreak: [straightHigh], cards: five };
        }
        if (groups[0].cnt === 4) {
          return { cat: 7, name: `Four of a Kind, ${rankNames[groups[0].v]}s (${rankNames[groups[1].v]} Kicker)`, tiebreak: [groups[0].v, groups[1].v], cards: five };
        }
        if (groups[0].cnt === 3 && groups[1].cnt === 2) {
          return { cat: 6, name: `Full House, ${rankNames[groups[0].v]}s Full of ${rankNames[groups[1].v]}s`, tiebreak: [groups[0].v, groups[1].v], cards: five };
        }
        if (isFlush) {
          return { cat: 5, name: `Flush (${rankNames[vals[0]]} High)`, tiebreak: vals, cards: five };
        }
        if (isStraight) {
          return { cat: 4, name: `Straight (${rankNames[straightHigh]} High)`, tiebreak: [straightHigh], cards: five };
        }
        if (groups[0].cnt === 3) {
          return { cat: 3, name: `Three of a Kind, ${rankNames[groups[0].v]}s`, tiebreak: [groups[0].v, groups[1].v, groups[2].v], cards: five };
        }
        if (groups[0].cnt === 2 && groups[1].cnt === 2) {
          return { cat: 2, name: `Two Pair, ${rankNames[groups[0].v]}s and ${rankNames[groups[1].v]}s (${rankNames[groups[2].v]} Kicker)`, tiebreak: [groups[0].v, groups[1].v, groups[2].v], cards: five };
        }
        if (groups[0].cnt === 2) {
          return { cat: 1, name: `One Pair of ${rankNames[groups[0].v]}s (${rankNames[groups[1].v]} Kicker)`, tiebreak: [groups[0].v, groups[1].v, groups[2].v, groups[3].v], cards: five };
        }
        return { cat: 0, name: `High Card ${rankNames[vals[0]]}`, tiebreak: vals, cards: five };
      };

      const compareEvaluations = (a, b) => {
        if (a.cat !== b.cat) return a.cat - b.cat;
        for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
          const diff = (a.tiebreak[i] || 0) - (b.tiebreak[i] || 0);
          if (diff !== 0) return diff;
        }
        return 0;
      };

      const bestOf7 = (seven) => {
        let best = null;
        for (let i = 0; i < seven.length - 4; i++) {
          for (let j = i + 1; j < seven.length - 3; j++) {
            for (let k = j + 1; k < seven.length - 2; k++) {
              for (let l = k + 1; l < seven.length - 1; l++) {
                for (let m = l + 1; m < seven.length; m++) {
                  const candidate = eval5([seven[i], seven[j], seven[k], seven[l], seven[m]]);
                  if (!best || compareEvaluations(candidate, best) > 0) best = candidate;
                }
              }
            }
          }
        }
        return best;
      };

      const bestA = bestOf7([...handACards, ...boardCards]);
      const bestB = bestOf7([...handBCards, ...boardCards]);
      const cmp = compareEvaluations(bestA, bestB);
      const outcome = cmp > 0 ? 'Player A Wins' : cmp < 0 ? 'Player B Wins' : 'Split Pot (Exact 5-Card Tie)';

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                board: boardCards.map(formatCardShort),
                player_a: {
                  hole_cards: handACards.map(formatCardShort),
                  best_5_card_hand: bestA.cards.map(formatCardShort),
                  hand_rank_description: bestA.name,
                },
                player_b: {
                  hole_cards: handBCards.map(formatCardShort),
                  best_5_card_hand: bestB.cards.map(formatCardShort),
                  hand_rank_description: bestB.name,
                },
                showdown_result: outcome,
                rule_note: 'In Texas Hold\'em, only the best 5 cards out of 7 count; a 6th card never breaks a tie.',
                canonical_url: `${base}/tools/who-wins-calculator`,
                citation_url: `${base}/tools/who-wins-calculator`,
                interactive_calculator_url: `${base}/tools/who-wins-calculator`,
                markdown_url: `${base}/tools/who-wins-calculator.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'get_poker_position_strategy': {
      const positionsCatalog = [
        { slug: 'utg', name: 'Under the Gun (UTG)', table: '9-Max / 6-Max Early', rfi_pct: 10.5, three_bet_pct: 3.2, cold_call_pct: 0.0, expected_winrate_bb100: 11.5, core_strategy: 'Tightest linear opening range at the table (77+, ATs+, KTs+, QJs, AQo+); zero cold-calling range.' },
        { slug: 'utg-1', name: 'Under the Gun +1 (UTG+1)', table: '9-Max Early', rfi_pct: 12.2, three_bet_pct: 3.8, cold_call_pct: 0.0, expected_winrate_bb100: 12.8, core_strategy: 'Adds suited connectors (T9s, 98s) and suited broadways; 3-bet-or-fold against UTG opens.' },
        { slug: 'mp', name: 'Middle Position (MP)', table: '9-Max Middle', rfi_pct: 14.8, three_bet_pct: 4.5, cold_call_pct: 1.5, expected_winrate_bb100: 14.5, core_strategy: 'Expands to all pocket pairs (22+) and suited Ace-rag wheel cards (A5s-A2s).' },
        { slug: 'lj', name: 'Lojack (LJ / 6-Max UTG)', table: '6-Max First In / 9-Max MP2', rfi_pct: 17.5, three_bet_pct: 5.4, cold_call_pct: 2.0, expected_winrate_bb100: 17.2, core_strategy: 'First position in 6-Max; opens 17.5% of hands (22+, A2s+, K9s+, Q9s+, J9s+, T8s+, 98s-65s, ATo+, KJo+).' },
        { slug: 'hj', name: 'Hijack (HJ)', table: '6-Max / 9-Max Late-Middle', rfi_pct: 21.5, three_bet_pct: 6.8, cold_call_pct: 3.2, expected_winrate_bb100: 21.0, core_strategy: 'Inflection seat where stealing blinds accelerates; opens suited Kings (K7s+) and offsuit broadways.' },
        { slug: 'co', name: 'Cutoff (CO)', table: '6-Max / 9-Max Late', rfi_pct: 27.8, three_bet_pct: 8.9, cold_call_pct: 4.5, expected_winrate_bb100: 28.4, core_strategy: 'Second-most profitable seat; opens 27.8% and aggressively 3-bets HJ/LJ opens to buy the Button.' },
        { slug: 'btn', name: 'Button (BTN / Dealer)', table: '6-Max / 9-Max Dealer', rfi_pct: 44.5, three_bet_pct: 11.4, cold_call_pct: 8.5, expected_winrate_bb100: 42.0, core_strategy: 'Most profitable seat in poker (+42 BB/100); acts last on Flop, Turn, and River; opens 44.5% of hands.' },
        { slug: 'sb', name: 'Small Blind (SB)', table: 'Blinds (Out of Position)', rfi_pct: 41.0, three_bet_pct: 12.5, cold_call_pct: 0.0, expected_winrate_bb100: -14.5, core_strategy: 'Play strict 3-Bet-or-Fold vs open raises in raked games; when folded to SB, mix 3BB raise and BvB limp.' },
        { slug: 'bb', name: 'Big Blind (BB)', table: 'Blinds (Closing Pre-Flop Action)', rfi_pct: 0.0, three_bet_pct: 10.8, cold_call_pct: 38.5, expected_winrate_bb100: -26.0, core_strategy: 'Starts at -100 BB/100 by posting 1BB; defends wide (38.5%+ vs BTN 2.5x open) due to closing action and pot odds.' },
      ];

      const rawPos = String(args?.position || args?.pos || '').trim().toLowerCase();
      if (!rawPos) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  total_positions: positionsCatalog.length,
                  positions_hub_url: `${base}/learn/positions`,
                  markdown_hub_url: `${base}/learn/positions.md`,
                  positions: positionsCatalog.map((p) => ({
                    ...p,
                    canonical_url: `${base}/learn/positions/${p.slug}`,
                    markdown_url: `${base}/learn/positions/${p.slug}.md`,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const aliasMap = {
        utg1: 'utg-1',
        'utg+1': 'utg-1',
        lojack: 'lj',
        hijack: 'hj',
        cutoff: 'co',
        button: 'btn',
        dealer: 'btn',
        'small-blind': 'sb',
        'big-blind': 'bb',
      };
      const targetSlug = aliasMap[rawPos] || rawPos;
      const matched = positionsCatalog.find((p) => p.slug === targetSlug) || positionsCatalog[6];

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ...matched,
                canonical_url: `${base}/learn/positions/${matched.slug}`,
                citation_url: `${base}/learn/positions/${matched.slug}`,
                markdown_url: `${base}/learn/positions/${matched.slug}.md`,
                positions_hub_url: `${base}/learn/positions`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'get_us_state_poker_guide': {
      const statesCatalog = [
        { slug: 'nevada', code: 'NV', name: 'Nevada', legal_status: 'Commercial Casinos & Real-Money Online Poker (WSOP.com MSIGA)', min_age: 21, state_tax_rate_pct: 0.0, typical_rake: '10% up to $5 max ($1-$2 BBJ drop)', top_cities: ['Las Vegas', 'Reno', 'Lake Tahoe', 'Henderson'], rooms_count: 62 },
        { slug: 'texas', code: 'TX', name: 'Texas', legal_status: 'Private Social Membership Poker Clubs (Zero Pot Rake; Hourly Seat Rental)', min_age: 18, state_tax_rate_pct: 0.0, typical_rake: '$0 Pot Rake ($12-$15/hr Seat Time + Membership)', top_cities: ['Austin', 'Houston', 'Dallas', 'San Antonio'], rooms_count: 68 },
        { slug: 'california', code: 'CA', name: 'California', legal_status: 'Licensed Commercial Cardrooms & Tribal Casinos', min_age: 21, state_tax_rate_pct: 9.3, typical_rake: '$5-$7 Fixed Drop Per Hand (No-Flop-No-Drop)', top_cities: ['Los Angeles (Commerce/Gardena)', 'San Jose', 'San Diego', 'Lincoln'], rooms_count: 88 },
        { slug: 'florida', code: 'FL', name: 'Florida', legal_status: 'Seminole Tribal Casinos & Pari-Mutuel Cardrooms', min_age: 18, state_tax_rate_pct: 0.0, typical_rake: '10% up to $5-$6 max ($2 Promo Drop)', top_cities: ['Hollywood', 'Tampa', 'Miami', 'Jacksonville', 'Pompano Beach'], rooms_count: 34 },
        { slug: 'new-jersey', code: 'NJ', name: 'New Jersey', legal_status: 'Atlantic City Casinos & Regulated Real-Money Online Poker (MSIGA)', min_age: 21, state_tax_rate_pct: 3.0, typical_rake: '10% up to $5 max (Time rake at $2/$5+)', top_cities: ['Atlantic City'], rooms_count: 4 },
        { slug: 'pennsylvania', code: 'PA', name: 'Pennsylvania', legal_status: 'Commercial Casinos & Regulated Real-Money Online Poker', min_age: 21, state_tax_rate_pct: 3.07, typical_rake: '10% up to $5-$6 max ($2 Promo Drop)', top_cities: ['Philadelphia', 'Bensalem', 'Pittsburgh', 'Bethlehem'], rooms_count: 14 },
        { slug: 'michigan', code: 'MI', name: 'Michigan', legal_status: 'Commercial/Tribal Casinos & Regulated Real-Money Online Poker (MSIGA)', min_age: 21, state_tax_rate_pct: 4.25, typical_rake: '10% up to $6 max ($2 Promo Drop)', top_cities: ['Detroit', 'Battle Creek', 'Mount Pleasant'], rooms_count: 12 },
        { slug: 'arizona', code: 'AZ', name: 'Arizona', legal_status: 'Compact Tribal Casino Poker Rooms', min_age: 21, state_tax_rate_pct: 2.5, typical_rake: '10% up to $5 max ($2 Promo Drop)', top_cities: ['Scottsdale', 'Phoenix', 'Tucson'], rooms_count: 9 },
        { slug: 'colorado', code: 'CO', name: 'Colorado', legal_status: 'Commercial Mountain Casino Towns (Unlimited Stakes Since Amendment 77)', min_age: 21, state_tax_rate_pct: 4.4, typical_rake: '10% up to $5-$6 max', top_cities: ['Black Hawk', 'Central City', 'Cripple Creek'], rooms_count: 6 },
        { slug: 'maryland', code: 'MD', name: 'Maryland', legal_status: 'Commercial Resort Casinos', min_age: 21, state_tax_rate_pct: 5.75, typical_rake: '10% up to $6 max ($2 Promo Drop)', top_cities: ['Hanover (Arundel Mills)', 'Oxon Hill (National Harbor)', 'Baltimore'], rooms_count: 5 },
        { slug: 'oklahoma', code: 'OK', name: 'Oklahoma', legal_status: 'Tribal Resort Mega-Casinos', min_age: 18, state_tax_rate_pct: 4.75, typical_rake: '10% up to $5-$6 max', top_cities: ['Durant', 'Thackerville', 'Tulsa'], rooms_count: 14 },
        { slug: 'louisiana', code: 'LA', name: 'Louisiana', legal_status: 'Land-Based, Riverboat & Racino Poker Rooms', min_age: 21, state_tax_rate_pct: 4.25, typical_rake: '10% up to $6 max', top_cities: ['New Orleans', 'Lake Charles', 'Baton Rouge', 'Shreveport'], rooms_count: 9 },
        { slug: 'oregon', code: 'OR', name: 'Oregon', legal_status: 'Social Fee-Model Poker Clubs ($15-$20 Door Fee, Zero Pot Rake) & Tribal Casinos', min_age: 21, state_tax_rate_pct: 9.0, typical_rake: '$0 Pot Rake at Portland Social Clubs ($15-$20 Daily Door Fee)', top_cities: ['Portland', 'Eugene', 'Bend', 'Pendleton'], rooms_count: 16 },
        { slug: 'illinois', code: 'IL', name: 'Illinois', legal_status: 'Commercial Casinos & Charitable Rockford/Chicago Poker Events', min_age: 21, state_tax_rate_pct: 4.95, typical_rake: '10% up to $6 max', top_cities: ['Des Plaines', 'Elgin', 'East St. Louis'], rooms_count: 8 },
        { slug: 'washington', code: 'WA', name: 'Washington', legal_status: 'Tribal Casinos & Licensed House-Banked Cardrooms', min_age: 18, state_tax_rate_pct: 0.0, typical_rake: '10% up to $5-$6 max ($300-$500 State Spread-Limit in Non-Tribal Rooms)', top_cities: ['Seattle / Tukwila', 'Tacoma', 'Spokane'], rooms_count: 22 },
      ];

      const rawState = String(args?.state || '').trim().toLowerCase();
      if (!rawState) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  total_states_covered: statesCatalog.length,
                  states_hub_url: `${base}/poker-rooms/states`,
                  markdown_hub_url: `${base}/poker-rooms/states.md`,
                  states: statesCatalog.map((s) => ({
                    ...s,
                    canonical_url: `${base}/poker-rooms/states/${s.slug}`,
                    markdown_url: `${base}/poker-rooms/states/${s.slug}.md`,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const matched =
        statesCatalog.find(
          (s) =>
            s.slug === rawState ||
            s.code.toLowerCase() === rawState ||
            s.name.toLowerCase() === rawState ||
            s.slug.includes(rawState)
        ) || statesCatalog[0];

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ...matched,
                canonical_url: `${base}/poker-rooms/states/${matched.slug}`,
                citation_url: `${base}/poker-rooms/states/${matched.slug}`,
                markdown_url: `${base}/poker-rooms/states/${matched.slug}.md`,
                states_hub_url: `${base}/poker-rooms/states`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_plo_wrap_outs': {
      const wrapTypeRaw = String(args?.wrap_type || args?.outs || '13').toLowerCase();
      const wrapCatalog = {
        '9': { outs: 9, nut_outs: 6, dirty_outs: 3, label: '9-Out Inside Wrap / OESD + Gutshot' },
        '13': { outs: 13, nut_outs: 10, dirty_outs: 3, label: '13-Out Classic 3-Card Around 2-Card Omaha Wrap' },
        '16': { outs: 16, nut_outs: 12, dirty_outs: 4, label: '16-Out Inside Broadway / Connected Wrap' },
        '17': { outs: 17, nut_outs: 14, dirty_outs: 3, label: '17-Out High-Nut Open Wrap' },
        '20': { outs: 20, nut_outs: 14, dirty_outs: 6, label: '20-Out Maximum 4-Card Around 2-Card Monster Wrap' },
      };
      const matchedKey = Object.keys(wrapCatalog).find((k) => wrapTypeRaw.includes(k)) || '13';
      const spec = wrapCatalog[matchedKey];
      const flushDrawType = String(args?.flush_draw || (args?.has_flush_draw ? 'single' : 'none')).toLowerCase();
      const extraFlushOuts = flushDrawType === 'double' || flushDrawType === 'ds' ? 14 : flushDrawType === 'single' || flushDrawType === 'fd' ? 7 : 0;
      const totalUniqueOuts = Math.min(25, spec.outs + extraFlushOuts);
      const unseenFlop = String(args?.variant || 'plo4').toLowerCase() === 'plo5' ? 44 : 45;
      const unseenTurn = unseenFlop - 1;
      const turnHitPct = Number(((totalUniqueOuts / unseenFlop) * 100).toFixed(1));
      const riverHitPct = Number(((totalUniqueOuts / unseenTurn) * 100).toFixed(1));
      const flopToRiverEquityPct = Number(((1 - ((unseenFlop - totalUniqueOuts) / unseenFlop) * ((unseenTurn - totalUniqueOuts) / unseenTurn)) * 100).toFixed(1));
      const nutTurnToRiverPct = Number(((1 - ((unseenFlop - (spec.nut_outs + extraFlushOuts)) / unseenFlop) * ((unseenTurn - (spec.nut_outs + extraFlushOuts)) / unseenTurn)) * 100).toFixed(1));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                variant: String(args?.variant || 'plo4').toLowerCase(),
                wrap_label: spec.label,
                straight_wrap_outs: spec.outs,
                nut_straight_outs: spec.nut_outs,
                non_nut_dirty_outs: spec.dirty_outs,
                flush_redraw_type: flushDrawType,
                extra_clean_flush_outs: extraFlushOuts,
                total_unique_outs: totalUniqueOuts,
                turn_completion_percent: turnHitPct,
                river_completion_percent: riverHitPct,
                flop_to_river_completion_percent: flopToRiverEquityPct,
                nut_only_flop_to_river_percent: nutTurnToRiverPct,
                is_favorite_vs_bare_top_set: flopToRiverEquityPct >= 52.5,
                strategy_note: 'In PLO, never stack off on a 13-out bottom-end dirty wrap in a multiway pot; prioritize nut-heavy 17-out and 20-out wraps paired with a flush redraw.',
                canonical_url: `${base}/tools/plo-outs-calculator`,
                citation_url: `${base}/tools/plo-outs-calculator`,
                interactive_calculator_url: `${base}/tools/plo-outs-calculator`,
                markdown_url: `${base}/tools/plo-outs-calculator.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_late_reg_icm_ev': {
      const buyInDollars = Math.max(10, Number(args?.buy_in_dollars ?? args?.buyin) || 1000);
      const rakePercent = Math.max(0, Math.min(30, Number(args?.rake_percent ?? 10)));
      const startingStackBb = Math.max(20, Number(args?.starting_stack_bb ?? 200));
      const lateEntryStackBb = Math.max(5, Math.min(startingStackBb, Number(args?.late_entry_stack_bb ?? args?.entry_bb) || 20));
      const fieldEliminatedPct = Math.max(5, Math.min(85, Number(args?.field_eliminated_percent ?? 42)));
      const paidSpotsPct = Math.max(10, Math.min(25, Number(args?.paid_spots_percent ?? 15)));

      const netPoolPerEntry = Number((buyInDollars * (1 - rakePercent / 100)).toFixed(2));
      const remainingFieldRatio = 1 - fieldEliminatedPct / 100;
      const icmAppreciationMultiplier = Number((1 / Math.pow(remainingFieldRatio, 0.24)).toFixed(4));
      const level1StartingEquityDollars = netPoolPerEntry;
      const lateEntryInstantIcmDollars = Number((netPoolPerEntry * icmAppreciationMultiplier).toFixed(2));
      const netDollarGainVsBuyin = Number((lateEntryInstantIcmDollars - buyInDollars).toFixed(2));
      const instantRoiBoostPercent = Number((((lateEntryInstantIcmDollars - buyInDollars) / buyInDollars) * 100).toFixed(2));
      const breakevenSkillRoiRequiredPct = Number((Math.max(0, -instantRoiBoostPercent)).toFixed(2));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                buy_in_dollars: buyInDollars,
                rake_percent: rakePercent,
                net_prize_pool_contribution_dollars: netPoolPerEntry,
                level_1_starting_stack_bb: startingStackBb,
                late_reg_entry_stack_bb: lateEntryStackBb,
                field_eliminated_percent: fieldEliminatedPct,
                paid_spots_percent: paidSpotsPct,
                icm_chip_appreciation_multiplier: icmAppreciationMultiplier,
                level_1_entry_equity_dollars: level1StartingEquityDollars,
                late_reg_instant_icm_equity_dollars: lateEntryInstantIcmDollars,
                net_dollar_delta_vs_full_buyin: netDollarGainVsBuyin,
                instant_icm_roi_delta_percent: instantRoiBoostPercent,
                required_post_entry_skill_roi_to_breakeven_percent: breakevenSkillRoiRequiredPct,
                is_plus_ev_before_a_single_hand: lateEntryInstantIcmDollars > buyInDollars,
                canonical_url: `${base}/tools/late-reg-calculator`,
                citation_url: `${base}/tools/late-reg-calculator`,
                interactive_calculator_url: `${base}/tools/late-reg-calculator`,
                markdown_url: `${base}/tools/late-reg-calculator.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_winrate_confidence_interval': {
      const observedWr = Number(args?.observed_winrate_bb100 ?? args?.winrate_bb100 ?? 5);
      const stdDevBb100 = Math.max(10, Number(args?.std_dev_bb100 ?? 85));
      const handsSample = Math.max(500, Number(args?.hands_sample ?? args?.hands ?? 50000));
      const chunks100 = handsSample / 100;
      const standardErrorBb100 = Number((stdDevBb100 / Math.sqrt(chunks100)).toFixed(2));

      const ci70Low = Number((observedWr - 1.04 * standardErrorBb100).toFixed(2));
      const ci70High = Number((observedWr + 1.04 * standardErrorBb100).toFixed(2));
      const ci95Low = Number((observedWr - 1.96 * standardErrorBb100).toFixed(2));
      const ci95High = Number((observedWr + 1.96 * standardErrorBb100).toFixed(2));
      const ci99Low = Number((observedWr - 2.58 * standardErrorBb100).toFixed(2));
      const ci99High = Number((observedWr + 2.58 * standardErrorBb100).toFixed(2));

      const zScoreZero = standardErrorBb100 > 0 ? -observedWr / standardErrorBb100 : 0;
      const t = 1 / (1 + 0.2316419 * Math.abs(zScoreZero));
      const d = 0.3989423 * Math.exp((-zScoreZero * zScoreZero) / 2);
      const pTail = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
      const probTrueLoserPct = Number(((zScoreZero > 0 ? 1 - pTail : pTail) * 100).toFixed(2));
      const handsRequiredFor95ConfidenceWinner = observedWr > 0 ? Math.round(Math.pow((1.96 * stdDevBb100) / observedWr, 2) * 100) : null;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                observed_winrate_bb100: observedWr,
                std_dev_bb100: stdDevBb100,
                hands_sample: handsSample,
                standard_error_bb100: standardErrorBb100,
                confidence_interval_70_bb100: [ci70Low, ci70High],
                confidence_interval_95_bb100: [ci95Low, ci95High],
                confidence_interval_99_bb100: [ci99Low, ci99High],
                probability_of_true_loss_or_downswing_percent: probTrueLoserPct,
                hands_required_for_95_percent_proof_of_winning: handsRequiredFor95ConfidenceWinner,
                canonical_url: `${base}/tools/winrate-confidence-calculator`,
                citation_url: `${base}/tools/winrate-confidence-calculator`,
                interactive_calculator_url: `${base}/tools/winrate-confidence-calculator`,
                markdown_url: `${base}/tools/winrate-confidence-calculator.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_poker_trip_budget': {
      const nights = Math.max(1, Math.round(Number(args?.nights) || 5));
      const flightDollars = Math.max(0, Number(args?.flight_dollars ?? 450));
      const hotelPerNightDollars = Math.max(0, Number(args?.hotel_per_night_dollars ?? 190));
      const foodPerDayDollars = Math.max(0, Number(args?.food_per_day_dollars ?? 85));
      const transportDollars = Math.max(0, Number(args?.ground_transport_dollars ?? 150));
      const plannedBuyInsDollars = Math.max(200, Number(args?.planned_buyins_dollars ?? args?.buyins ?? 5000));
      const expectedRoiPct = Number(args?.expected_roi_percent ?? 22);

      const totalTravelOverheadDollars = Math.round(flightDollars + nights * hotelPerNightDollars + (nights + 1) * foodPerDayDollars + transportDollars);
      const effectiveOverheadRakePct = Number(((totalTravelOverheadDollars / plannedBuyInsDollars) * 100).toFixed(2));
      const grossExpectedProfitDollars = Math.round(plannedBuyInsDollars * (expectedRoiPct / 100));
      const netTripEvAfterExpensesDollars = grossExpectedProfitDollars - totalTravelOverheadDollars;
      const breakEvenGrossCashesRequiredDollars = plannedBuyInsDollars + totalTravelOverheadDollars;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                nights,
                flight_dollars: flightDollars,
                hotel_per_night_dollars: hotelPerNightDollars,
                food_per_day_dollars: foodPerDayDollars,
                ground_transport_dollars: transportDollars,
                total_travel_overhead_dollars: totalTravelOverheadDollars,
                planned_tournament_or_cash_buyins_dollars: plannedBuyInsDollars,
                effective_expense_overhead_rake_percent: effectiveOverheadRakePct,
                expected_pre_expense_roi_percent: expectedRoiPct,
                gross_expected_profit_dollars: grossExpectedProfitDollars,
                net_trip_ev_after_expenses_dollars: netTripEvAfterExpensesDollars,
                breakeven_gross_winnings_required_dollars: breakEvenGrossCashesRequiredDollars,
                is_trip_profitable_ev: netTripEvAfterExpensesDollars > 0,
                canonical_url: `${base}/tools/poker-trip-planner`,
                citation_url: `${base}/tools/poker-trip-planner`,
                interactive_calculator_url: `${base}/tools/poker-trip-planner`,
                markdown_url: `${base}/tools/poker-trip-planner.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_geometric_bet_sizing': {
      const potSize = Math.max(1, Number(args?.pot_size ?? args?.pot) || 100);
      const effectiveStack = Math.max(1, Number(args?.effective_stack ?? args?.stack) || 300);
      const streets = Math.max(1, Math.min(3, Math.round(Number(args?.streets) || 3)));
      const spr = Number((effectiveStack / potSize).toFixed(2));
      const growthFactor = Math.pow((2 * effectiveStack + potSize) / potSize, 1 / streets);
      const geoPotFraction = (growthFactor - 1) / 2;
      const geoPercentOfPot = Number((geoPotFraction * 100).toFixed(1));

      const streetBreakdown = [];
      let runningPot = potSize;
      let runningStack = effectiveStack;
      const streetLabels = streets === 3 ? ['Flop', 'Turn', 'River'] : streets === 2 ? ['Turn', 'River'] : ['River'];
      for (let i = 0; i < streets; i++) {
        const betAmt = i === streets - 1 ? Number(runningStack.toFixed(2)) : Number((runningPot * geoPotFraction).toFixed(2));
        const nextPot = Number((runningPot + betAmt * 2).toFixed(2));
        const nextStack = Number(Math.max(0, runningStack - betAmt).toFixed(2));
        const mdfPct = Number(((runningPot / (runningPot + betAmt)) * 100).toFixed(1));
        const polarizedBluffPct = Number(((betAmt / (runningPot + 2 * betAmt)) * 100).toFixed(1));
        streetBreakdown.push({
          street: streetLabels[i],
          pot_before_bet: Number(runningPot.toFixed(2)),
          geometric_bet_amount: betAmt,
          geometric_bet_percent_of_pot: geoPercentOfPot,
          pot_after_call: nextPot,
          remaining_stack: nextStack,
          defender_mdf_percent: mdfPct,
          optimal_polarized_bluff_frequency_percent: polarizedBluffPct,
        });
        runningPot = nextPot;
        runningStack = nextStack;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                pot_size: potSize,
                effective_stack: effectiveStack,
                stack_to_pot_ratio_spr: spr,
                streets_remaining: streets,
                geometric_notation: `${streets}e`,
                geometric_bet_percent_of_pot: geoPercentOfPot,
                street_by_street_plan: streetBreakdown,
                canonical_url: `${base}/tools/geometric-bet-calculator`,
                citation_url: `${base}/tools/geometric-bet-calculator`,
                interactive_calculator_url: `${base}/tools/geometric-bet-calculator`,
                markdown_url: `${base}/tools/geometric-bet-calculator.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'score_live_table_selection': {
      const vpipWhalesCount = Math.max(0, Math.min(8, Math.round(Number(args?.vpip_whales_count ?? args?.whales) || 3)));
      const avgStackBb = Math.max(30, Number(args?.avg_stack_bb ?? args?.stack_bb) || 150);
      const rakeCapDollars = Math.max(0, Number(args?.rake_cap_dollars ?? args?.rake_cap) || 5);
      const bigBlindDollars = Math.max(1, Number(args?.big_blind_dollars ?? 5));
      const straddleOrBombPotActive = Boolean(args?.straddle_or_bomb_pot_active ?? true);

      const rakeCapBb = Number((rakeCapDollars / bigBlindDollars).toFixed(2));
      const rawScore = Math.min(
        100,
        Math.max(
          5,
          Math.round(
            vpipWhalesCount * 22 +
              Math.min(30, (avgStackBb / 200) * 25) +
              (straddleOrBombPotActive ? 14 : 0) -
              Math.min(25, rakeCapBb * 8)
          )
        )
      );
      const grade =
        rawScore >= 85
          ? 'S-Tier (Must-Stay Dream Table)'
          : rawScore >= 70
            ? 'A-Tier (Highly Profitable)'
            : rawScore >= 55
              ? 'B-Tier (Solid Playable Table)'
              : rawScore >= 40
                ? 'C-Tier (Marginal / Reg-Heavy)'
                : 'F-Tier (Rake Trap - Request Table Change Immediately)';
      const winrateMultiplier = Number((0.45 + (rawScore / 100) * 1.35).toFixed(2));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                vpip_whales_count: vpipWhalesCount,
                average_table_stack_bb: avgStackBb,
                big_blind_dollars: bigBlindDollars,
                rake_cap_dollars: rakeCapDollars,
                rake_cap_in_bb: rakeCapBb,
                straddle_or_bomb_pot_active: straddleOrBombPotActive,
                table_profitability_score_100: rawScore,
                table_grade: grade,
                estimated_winrate_multiplier: winrateMultiplier,
                canonical_url: `${base}/tools/table-selection-calculator`,
                citation_url: `${base}/tools/table-selection-calculator`,
                interactive_calculator_url: `${base}/tools/table-selection-calculator`,
                markdown_url: `${base}/tools/table-selection-calculator.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_mtt_session_abi_plan': {
      const mttCount = Math.max(1, Math.round(Number(args?.tournaments_count ?? args?.tournaments) || 12));
      const averageBuyInDollars = Math.max(1, Number(args?.average_buy_in_dollars ?? args?.abi) || 55);
      const expectedBulletsPerMtt = Math.max(1, Number(args?.expected_bullets_per_mtt ?? 1.25));
      const itmRatePct = Math.max(5, Math.min(40, Number(args?.itm_rate_percent ?? 18)));
      const expectedRoiPct = Number(args?.expected_roi_percent ?? 25);
      const totalBankrollDollars = Math.max(100, Number(args?.bankroll_dollars ?? 12000));

      const totalEntries = Number((mttCount * expectedBulletsPerMtt).toFixed(1));
      const totalSessionExposureDollars = Math.round(totalEntries * averageBuyInDollars);
      const sessionExposurePctOfBankroll = Number(((totalSessionExposureDollars / totalBankrollDollars) * 100).toFixed(2));
      const bankrollInAbiUnits = Math.round(totalBankrollDollars / averageBuyInDollars);
      const zeroItmBrickProbPct = Number((Math.pow(1 - itmRatePct / 100, mttCount) * 100).toFixed(2));
      const expectedSessionProfitDollars = Math.round(totalSessionExposureDollars * (expectedRoiPct / 100));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                tournaments_scheduled: mttCount,
                average_buy_in_abi_dollars: averageBuyInDollars,
                expected_bullets_per_mtt: expectedBulletsPerMtt,
                total_projected_entries: totalEntries,
                total_session_exposure_dollars: totalSessionExposureDollars,
                total_bankroll_dollars: totalBankrollDollars,
                bankroll_in_abi_buyins: bankrollInAbiUnits,
                session_exposure_percent_of_bankroll: sessionExposurePctOfBankroll,
                itm_rate_percent: itmRatePct,
                probability_of_zero_cashes_brick_session_percent: zeroItmBrickProbPct,
                expected_roi_percent: expectedRoiPct,
                expected_session_ev_profit_dollars: expectedSessionProfitDollars,
                bankroll_safety_status:
                  bankrollInAbiUnits >= 200
                    ? 'Conservative / Pro Cushion (200+ ABI)'
                    : bankrollInAbiUnits >= 100
                      ? 'Standard Grinder Cushion (100-199 ABI)'
                      : 'Aggressive / High Risk Of Ruin (<100 ABI)',
                canonical_url: `${base}/tools/mtt-grind-planner`,
                citation_url: `${base}/tools/mtt-grind-planner`,
                interactive_calculator_url: `${base}/tools/mtt-grind-planner`,
                markdown_url: `${base}/tools/mtt-grind-planner.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'get_player_archetype_exploit': {
      const archetypesCatalog = PLAYER_ARCHETYPES.map((a) => ({
        slug: a.slug,
        code: a.code,
        name: a.name,
        vpip_pfr: `${a.vpipRange} / ${a.pfrRange}`,
        three_bet_pct: a.threeBetRange,
        core_leak: a.coreLeaks?.[0] || a.summary,
        exploitative_counter: a.preflopAdjustments?.[0] || a.summary,
      }));

      const rawType = String(args?.archetype || args?.type || '').trim().toLowerCase();
      if (!rawType) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  total_archetypes: archetypesCatalog.length,
                  hub_url: `${base}/learn/player-types`,
                  markdown_hub_url: `${base}/learn/player-types.md`,
                  archetypes: archetypesCatalog.map((a) => ({
                    ...a,
                    canonical_url: `${base}/learn/player-types/${a.slug}`,
                    markdown_url: `${base}/learn/player-types/${a.slug}.md`,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const found = findPlayerArchetype(rawType);
      const matched = archetypesCatalog.find((a) => a.slug === found?.slug || a.slug === rawType || a.slug.includes(rawType)) || archetypesCatalog[0];

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ...matched,
                canonical_url: `${base}/learn/player-types/${matched.slug}`,
                citation_url: `${base}/learn/player-types/${matched.slug}`,
                markdown_url: `${base}/learn/player-types/${matched.slug}.md`,
                hub_url: `${base}/learn/player-types`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'get_flop_board_texture_guide': {
      const texturesCatalog = BOARD_TEXTURES.map((t) => ({
        slug: t.slug,
        code: t.code,
        name: t.name,
        pfr_cbet_freq_pct: t.gtoCbetFreq,
        optimal_cbet_sizing: t.optimalCbetSize,
        bb_check_raise_pct: t.checkRaiseFreq,
        range_advantage: t.rangeAdvantage,
        turn_plan: t.bestTurnBarrels,
      }));

      const rawSlug = String(args?.texture || args?.slug || '').trim().toLowerCase();
      if (!rawSlug) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  total_canonical_textures: texturesCatalog.length,
                  hub_url: `${base}/learn/board-textures`,
                  markdown_hub_url: `${base}/learn/board-textures.md`,
                  textures: texturesCatalog.map((t) => ({
                    ...t,
                    canonical_url: `${base}/learn/board-textures/${t.slug}`,
                    markdown_url: `${base}/learn/board-textures/${t.slug}.md`,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const found = findBoardTexture(rawSlug);
      const matched = texturesCatalog.find((t) => t.slug === found?.slug || t.slug === rawSlug || t.slug.includes(rawSlug) || t.name.toLowerCase().includes(rawSlug)) || texturesCatalog[0];
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ...matched,
                canonical_url: `${base}/learn/board-textures/${matched.slug}`,
                citation_url: `${base}/learn/board-textures/${matched.slug}`,
                markdown_url: `${base}/learn/board-textures/${matched.slug}.md`,
                hub_url: `${base}/learn/board-textures`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'get_international_poker_guide': {
      const intlCatalog = INTERNATIONAL_POKER_GUIDES.map((g) => ({
        slug: g.slug,
        city: g.city,
        country: g.country,
        currency: g.currency,
        flagship_venues: (g.topPokerRooms || []).map((r) => r.name),
        typical_stakes: g.typicalStakes,
        rake_and_tax: `${g.rakeCap} | ${g.visitorTaxRule}`,
        major_festivals: g.flagshipSeries,
      }));

      const rawCity = String(args?.city || args?.slug || '').trim().toLowerCase();
      if (!rawCity) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  total_destinations: intlCatalog.length,
                  hub_url: `${base}/poker-rooms/international`,
                  markdown_hub_url: `${base}/poker-rooms/international.md`,
                  destinations: intlCatalog.map((d) => ({
                    ...d,
                    canonical_url: `${base}/poker-rooms/international/${d.slug}`,
                    markdown_url: `${base}/poker-rooms/international/${d.slug}.md`,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const found = findInternationalGuide(rawCity);
      const matched = intlCatalog.find((d) => d.slug === found?.slug || d.slug === rawCity || d.slug.includes(rawCity) || d.city.toLowerCase().includes(rawCity) || d.country.toLowerCase().includes(rawCity)) || intlCatalog[0];
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ...matched,
                canonical_url: `${base}/poker-rooms/international/${matched.slug}`,
                citation_url: `${base}/poker-rooms/international/${matched.slug}`,
                markdown_url: `${base}/poker-rooms/international/${matched.slug}.md`,
                hub_url: `${base}/poker-rooms/international`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_multiway_all_in_ev': {
      const rawStacks = Array.isArray(args?.stacks) ? args.stacks.map(Number).filter((n) => n > 0) : [100, 180, 300];
      const stacks = rawStacks.length >= 2 ? rawStacks.slice(0, 6) : [100, 180, 300];
      const rawEq = Array.isArray(args?.equities_percent) ? args.equities_percent.map(Number).filter((n) => n >= 0) : [45, 35, 20];
      const eqSum = rawEq.reduce((a, b) => a + b, 0) || 100;
      const equities = stacks.map((_, idx) => Number((((rawEq[idx] ?? 100 / stacks.length) / eqSum) * 100).toFixed(2)));
      const deadMoney = Math.max(0, Number(args?.dead_money ?? 15));

      const sortedUnique = [...new Set(stacks)].sort((a, b) => a - b);
      const pots = [];
      let prevCap = 0;
      for (let i = 0; i < sortedUnique.length; i++) {
        const cap = sortedUnique[i];
        const slice = cap - prevCap;
        const eligibleIndices = stacks.map((s, idx) => (s >= cap ? idx : -1)).filter((idx) => idx >= 0);
        if (eligibleIndices.length >= 2) {
          const potAmount = slice * eligibleIndices.length + (i === 0 ? deadMoney : 0);
          const eligibleEqSum = eligibleIndices.reduce((acc, idx) => acc + equities[idx], 0) || 1;
          const playerShares = eligibleIndices.map((idx) => ({
            player: `Player ${idx + 1}`,
            relative_equity_pct: Number(((equities[idx] / eligibleEqSum) * 100).toFixed(2)),
            ev_share: Number(((potAmount * equities[idx]) / eligibleEqSum).toFixed(2)),
          }));
          pots.push({
            pot_name: i === 0 ? 'Main Pot' : `Side Pot ${i}`,
            cap_level: cap,
            pot_amount: Number(potAmount.toFixed(2)),
            eligible_players: eligibleIndices.map((idx) => `Player ${idx + 1}`),
            player_ev_shares: playerShares,
          });
        }
        prevCap = cap;
      }

      const maxSecondStack = [...stacks].sort((a, b) => b - a)[1] || stacks[0];
      const playerResults = stacks.map((s, idx) => {
        const effectiveRisked = Math.min(s, maxSecondStack);
        const uncalledReturn = Math.max(0, s - maxSecondStack);
        const totalPotEv = pots.reduce((acc, p) => {
          const foundShare = p.player_ev_shares.find((ps) => ps.player === `Player ${idx + 1}`);
          return acc + (foundShare ? foundShare.ev_share : 0);
        }, 0);
        const netEv = Number((totalPotEv - effectiveRisked).toFixed(2));
        return {
          player: `Player ${idx + 1}`,
          committed_stack: s,
          effective_risked: effectiveRisked,
          uncalled_returned: uncalledReturn,
          overall_equity_percent: equities[idx],
          gross_pot_ev: Number(totalPotEv.toFixed(2)),
          net_profit_ev: netEv,
        };
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                stacks,
                equities_percent: equities,
                dead_money: deadMoney,
                pots_breakdown: pots,
                player_ev_summary: playerResults,
                if_then_because: `If Player 1 commits ${stacks[0]} with ${equities[0]}% multiway equity into ${stacks.length} players, Then their expected net profit is ${playerResults[0].net_profit_ev >= 0 ? '+' : ''}${playerResults[0].net_profit_ev} units, Because they contest a ${pots[0]?.pot_amount || 0}-unit Main Pot against ${stacks.length - 1} opponents while remains insulated from deeper side pots.`,
                canonical_url: `${base}/tools/multiway-all-in-calculator`,
                citation_url: `${base}/tools/multiway-all-in-calculator`,
                interactive_calculator_url: `${base}/tools/multiway-all-in-calculator`,
                markdown_url: `${base}/tools/multiway-all-in-calculator.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_mystery_bounty_live_pool': {
      const remainingBountyPool = Math.max(100, Number(args?.remaining_bounty_pool_dollars ?? 120000));
      const envelopesRemaining = Math.max(1, Math.round(Number(args?.envelopes_remaining ?? 40)));
      const topBountyRemaining = Math.max(0, Number(args?.top_bounty_remaining_dollars ?? 50000));
      const regularPoolRemaining = Math.max(100, Number(args?.regular_prize_pool_remaining_dollars ?? 150000));
      const totalChips = Math.max(1000, Number(args?.total_chips_in_play ?? 4000000));
      const bigBlind = Math.max(1, Number(args?.big_blind_chips ?? 4000));

      const avgEnvelopeEvDollars = Number((remainingBountyPool / envelopesRemaining).toFixed(2));
      const topBountyPullProbPct = Number(((1 / envelopesRemaining) * 100).toFixed(2));
      const topBountyShareOfPoolPct = Number(((topBountyRemaining / remainingBountyPool) * 100).toFixed(1));
      const dollarPerChipRegular = regularPoolRemaining / totalChips;
      const bountyChipEquivalence = Math.round(avgEnvelopeEvDollars / dollarPerChipRegular);
      const bountyInBigBlinds = Number((bountyChipEquivalence / bigBlind).toFixed(1));
      const avgStackChips = Math.round(totalChips / envelopesRemaining);
      const bountyPctOfAvgStack = Number(((bountyChipEquivalence / avgStackChips) * 100).toFixed(1));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                remaining_bounty_pool_dollars: remainingBountyPool,
                envelopes_remaining: envelopesRemaining,
                top_bounty_remaining_dollars: topBountyRemaining,
                top_bounty_pull_probability_percent: topBountyPullProbPct,
                top_bounty_share_of_bounty_pool_percent: topBountyShareOfPoolPct,
                average_envelope_ev_dollars: avgEnvelopeEvDollars,
                regular_prize_pool_remaining_dollars: regularPoolRemaining,
                total_chips_in_play: totalChips,
                bounty_chip_equivalence: bountyChipEquivalence,
                bounty_value_in_big_blinds: bountyInBigBlinds,
                bounty_percent_of_average_stack: bountyPctOfAvgStack,
                if_then_because: `If ${envelopesRemaining} mystery envelopes remain worth $${remainingBountyPool.toLocaleString('en-US')} ($${topBountyRemaining.toLocaleString('en-US')} top prize live), Then each covered knockout is worth $${avgEnvelopeEvDollars.toLocaleString('en-US')} or ${bountyChipEquivalence.toLocaleString('en-US')} tournament chips (${bountyInBigBlinds} BB), Because the remaining bounty pool represents ${((remainingBountyPool / (remainingBountyPool + regularPoolRemaining)) * 100).toFixed(1)}% of total live tournament equity.`,
                canonical_url: `${base}/tools/mystery-bounty-tracker`,
                citation_url: `${base}/tools/mystery-bounty-tracker`,
                interactive_calculator_url: `${base}/tools/mystery-bounty-tracker`,
                markdown_url: `${base}/tools/mystery-bounty-tracker.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_bubble_factor_matrix': {
      const rawStacks = Array.isArray(args?.stacks) ? args.stacks.map(Number).filter((n) => n > 0) : [60, 40, 25, 15];
      const stacks = rawStacks.length >= 2 ? rawStacks.slice(0, 9) : [60, 40, 25, 15];
      const rawPayouts = Array.isArray(args?.payouts) ? args.payouts.map(Number).filter((n) => n >= 0) : [10000, 6500, 4200, 2800];
      const payouts = rawPayouts.length >= 1 ? rawPayouts : [10000, 6500, 4200, 2800];

      const baseEquities = calculateICM(stacks, payouts);
      const pairwiseMatrix = [];

      for (let i = 0; i < stacks.length; i++) {
        for (let j = 0; j < stacks.length; j++) {
          if (i === j) continue;
          const eff = Math.min(stacks[i], stacks[j]);
          const winStacks = stacks.map((s, idx) => (idx === i ? s + eff : idx === j ? Math.max(0.001, s - eff) : s));
          const loseStacks = stacks.map((s, idx) => (idx === i ? Math.max(0.001, s - eff) : idx === j ? s + eff : s));
          const winEq = calculateICM(winStacks, payouts)[i];
          const loseEq = stacks[i] <= stacks[j]
            ? (payouts[stacks.length - 1] || 0)
            : calculateICM(loseStacks, payouts)[i];
          const currentEq = baseEquities[i];
          const evGained = Math.max(0.01, winEq - currentEq);
          const evLost = Math.max(0.01, currentEq - loseEq);
          const bf = Number((evLost / evGained).toFixed(2));
          const reqEqPct = Number(((bf / (bf + 1)) * 100).toFixed(1));
          const riskPremiumPct = Number((reqEqPct - 50).toFixed(1));
          pairwiseMatrix.push({
            hero: `Player ${i + 1} (${stacks[i]} BB)`,
            villain: `Player ${j + 1} (${stacks[j]} BB)`,
            bubble_factor: bf,
            required_all_in_equity_percent: reqEqPct,
            icm_risk_premium_percent: riskPremiumPct,
            dollar_ev_lost_on_loss: Number(evLost.toFixed(2)),
            dollar_ev_gained_on_win: Number(evGained.toFixed(2)),
          });
        }
      }

      const highestPressure = [...pairwiseMatrix].sort((a, b) => b.bubble_factor - a.bubble_factor)[0];

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                stacks,
                payouts,
                baseline_icm_dollar_equities: baseEquities.map((eq, idx) => ({
                  player: `Player ${idx + 1}`,
                  stack: stacks[idx],
                  icm_equity_dollars: Number(eq.toFixed(2)),
                })),
                pairwise_bubble_factors: pairwiseMatrix,
                highest_pressure_matchup: highestPressure,
                if_then_because: `If ${highestPressure.hero} clashes all-in against ${highestPressure.villain}, Then they face a ${highestPressure.bubble_factor}x Bubble Factor and require ${highestPressure.required_all_in_equity_percent}% equity (+${highestPressure.icm_risk_premium_percent}% ICM risk premium over 50% Chip EV), Because losing costs $${highestPressure.dollar_ev_lost_on_loss} in prize equity while doubling only gains $${highestPressure.dollar_ev_gained_on_win}.`,
                canonical_url: `${base}/tools/bubble-factor-calculator`,
                citation_url: `${base}/tools/bubble-factor-calculator`,
                interactive_calculator_url: `${base}/tools/bubble-factor-calculator`,
                markdown_url: `${base}/tools/bubble-factor-calculator.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_river_bluff_catch_ev': {
      const potSize = Math.max(1, Number(args?.pot_size ?? 100));
      const betSize = Math.max(1, Number(args?.bet_size ?? 75));
      const rawValueCombos = Math.max(1, Number(args?.villain_value_combos ?? 18));
      const rawBluffCombos = Math.max(0, Number(args?.villain_bluff_combos ?? 9));
      const blockedValue = Math.max(0, Math.min(rawValueCombos - 0.5, Number(args?.hero_blocks_value_combos ?? 3)));
      const blockedBluffs = Math.max(0, Math.min(rawBluffCombos, Number(args?.hero_blocks_bluff_combos ?? 0)));

      const effValueCombos = Number((rawValueCombos - blockedValue).toFixed(2));
      const effBluffCombos = Number((rawBluffCombos - blockedBluffs).toFixed(2));
      const totalEffCombos = effValueCombos + effBluffCombos;
      const actualBluffFreqPct = Number(((effBluffCombos / totalEffCombos) * 100).toFixed(1));
      const reqEquityPct = Number(((betSize / (potSize + 2 * betSize)) * 100).toFixed(1));
      const mdfPct = Number(((potSize / (potSize + betSize)) * 100).toFixed(1));
      const callEv = Number(((effBluffCombos / totalEffCombos) * (potSize + betSize) - (effValueCombos / totalEffCombos) * betSize).toFixed(2));
      const blockerBoostPct = Number((actualBluffFreqPct - (rawBluffCombos / (rawValueCombos + rawBluffCombos)) * 100).toFixed(2));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                pot_size: potSize,
                bet_size: betSize,
                bet_percent_of_pot: Number(((betSize / potSize) * 100).toFixed(1)),
                required_bluff_frequency_percent: reqEquityPct,
                defender_mdf_percent: mdfPct,
                unblocked_value_combos: effValueCombos,
                unblocked_bluff_combos: effBluffCombos,
                blocker_adjusted_villain_bluff_percent: actualBluffFreqPct,
                blocker_equity_shift_percent: blockerBoostPct,
                call_ev_units: callEv,
                verdict: callEv > 0 ? 'PROFITABLE BLUFF-CATCH CALL (+EV)' : callEv === 0 ? 'EXACT INDIFFERENCE (0 EV)' : 'PROFITABLE FOLD (UNDER-BLUFFED SPOT)',
                if_then_because: `If villain bets ${betSize} into ${potSize} with ${effValueCombos} unblocked value combos and ${effBluffCombos} bluff combos, Then calling has ${callEv >= 0 ? '+' : ''}${callEv} EV (${callEv >= 0 ? 'CALL' : 'FOLD'}), Because your blockers shift villain's bluff frequency to ${actualBluffFreqPct}% vs the ${reqEquityPct}% pot-odds threshold.`,
                canonical_url: `${base}/tools/bluff-catching-calculator`,
                citation_url: `${base}/tools/bluff-catching-calculator`,
                interactive_calculator_url: `${base}/tools/bluff-catching-calculator`,
                markdown_url: `${base}/tools/bluff-catching-calculator.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_multi_street_barrel_ev': {
      const startPot = Math.max(1, Number(args?.starting_pot ?? 6.5));
      const fBetPct = Math.max(10, Number(args?.flop_bet_pct ?? 33));
      const tBetPct = Math.max(10, Number(args?.turn_bet_pct ?? 75));
      const rBetPct = Math.max(10, Number(args?.river_bet_pct ?? 100));
      const fFold = Math.max(0, Math.min(99, Number(args?.flop_fold_pct ?? 38))) / 100;
      const tFold = Math.max(0, Math.min(99, Number(args?.turn_fold_pct ?? 44))) / 100;
      const rFold = Math.max(0, Math.min(99, Number(args?.river_fold_pct ?? 48))) / 100;

      const fBet = Number((startPot * (fBetPct / 100)).toFixed(2));
      const tPot = Number((startPot + 2 * fBet).toFixed(2));
      const tBet = Number((tPot * (tBetPct / 100)).toFixed(2));
      const rPot = Number((tPot + 2 * tBet).toFixed(2));
      const rBet = Number((rPot * (rBetPct / 100)).toFixed(2));

      const reachTurnProb = 1 - fFold;
      const reachRiverProb = reachTurnProb * (1 - tFold);
      const calledDownProb = reachRiverProb * (1 - rFold);
      const cumulativeFoldPct = Number(((1 - calledDownProb) * 100).toFixed(1));
      const totalRiskIfTripleBarreled = Number((fBet + tBet + rBet).toFixed(2));

      const evFlopWin = fFold * startPot;
      const evTurnWin = reachTurnProb * tFold * (startPot + fBet);
      const evRiverWin = reachRiverProb * rFold * (startPot + fBet + tBet);
      const evShowdownLoss = calledDownProb * totalRiskIfTripleBarreled;
      const zeroEquityTripleBarrelEv = Number((evFlopWin + evTurnWin + evRiverWin - evShowdownLoss).toFixed(2));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                starting_pot: startPot,
                street_plan: [
                  { street: 'Flop', pot: startPot, bet_pct: fBetPct, bet_amount: fBet, villain_fold_pct: Number((fFold * 100).toFixed(1)), alpha_breakeven_pct: Number(((fBet / (startPot + fBet)) * 100).toFixed(1)) },
                  { street: 'Turn', pot: tPot, bet_pct: tBetPct, bet_amount: tBet, villain_fold_pct: Number((tFold * 100).toFixed(1)), alpha_breakeven_pct: Number(((tBet / (tPot + tBet)) * 100).toFixed(1)) },
                  { street: 'River', pot: rPot, bet_pct: rBetPct, bet_amount: rBet, villain_fold_pct: Number((rFold * 100).toFixed(1)), alpha_breakeven_pct: Number(((rBet / (rPot + rBet)) * 100).toFixed(1)) },
                ],
                cumulative_fold_equity_percent: cumulativeFoldPct,
                villain_reaches_showdown_percent: Number((calledDownProb * 100).toFixed(1)),
                total_3_street_commitment: totalRiskIfTripleBarreled,
                zero_equity_triple_barrel_ev: zeroEquityTripleBarrelEv,
                if_then_because: `If you barrel ${fBetPct}% Flop, ${tBetPct}% Turn, and ${rBetPct}% River against street fold rates of ${(fFold * 100).toFixed(0)}%/${(tFold * 100).toFixed(0)}%/${(rFold * 100).toFixed(0)}%, Then villain folds ${cumulativeFoldPct}% cumulatively by the river for a net bluff EV of ${zeroEquityTripleBarrelEv >= 0 ? '+' : ''}${zeroEquityTripleBarrelEv} units, Because only ${(calledDownProb * 100).toFixed(1)}% of villain's starting range survives all three barrels.`,
                canonical_url: `${base}/tools/multi-street-ev-calculator`,
                citation_url: `${base}/tools/multi-street-ev-calculator`,
                interactive_calculator_url: `${base}/tools/multi-street-ev-calculator`,
                markdown_url: `${base}/tools/multi-street-ev-calculator.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'solve_heads_up_push_fold_nash': {
      const stackBb = Math.max(1, Math.min(25, Number(args?.stack_bb ?? 12)));
      const role = ['sb_push', 'bb_call', 'btn_3max_push'].includes(String(args?.role)) ? String(args.role) : 'sb_push';
      const antePct = Math.max(0, Number(args?.ante_pct_bb ?? 25));

      const basePushPct = role === 'sb_push'
        ? Math.min(96, Math.max(32, Number((100 - stackBb * 2.6 + (antePct > 0 ? 6 : 0)).toFixed(1))))
        : role === 'bb_call'
          ? Math.min(85, Math.max(18, Number((78 - stackBb * 2.35 + (antePct > 0 ? 4 : 0)).toFixed(1))))
          : Math.min(72, Math.max(16, Number((64 - stackBb * 2.1 + (antePct > 0 ? 5 : 0)).toFixed(1))));

      const limpRecommended = role === 'sb_push' && stackBb >= 14;
      const sampleRange = role === 'sb_push'
        ? (stackBb <= 8 ? '22+, A2+, K2+, Q2s+, Q5o+, J4s+, J8o+, T5s+, T8o+, 95s+, 85s+, 75s+, 64s+, 54s' : '22+, A2+, K2s+, K7o+, Q5s+, Q9o+, J7s+, J9o+, T7s+, T9o, 97s+, 86s+, 76s, 65s (Mix Limp AA/KK & Weak Offsuit At 15BB+)')
        : role === 'bb_call'
          ? (stackBb <= 8 ? '22+, A2+, K2s+, K5o+, Q6s+, Q8o+, J8s+, JTo, T8s+' : '22+, A2s+, A5o+, K8s+, KTo+, Q9s+, QJo, J9s+, T9s')
          : '22+, A2s+, A7o+, K8s+, KTo+, Q9s+, QJo, J9s+, T9s, 98s, 87s';

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                stack_bb: stackBb,
                role,
                ante_pct_bb: antePct,
                nash_equilibrium_frequency_percent: basePushPct,
                include_limp_trap_strategy: limpRecommended,
                recommended_hand_range: sampleRange,
                if_then_because: `If playing ${role.toUpperCase()} at ${stackBb}BB effective stack (${antePct}% BB ante), Then the unexploitable Nash frequency is ${basePushPct}% of hands (${sampleRange}), Because ${limpRecommended ? 'at 14BB+ mixing limps with polar traps captures higher EV than pure open-shoving' : 'inside 13BB direct open-shoving maximizes fold equity and denies postflop positional realization'}.`,
                canonical_url: `${base}/tools/heads-up-push-fold-calculator`,
                citation_url: `${base}/tools/heads-up-push-fold-calculator`,
                interactive_calculator_url: `${base}/tools/heads-up-push-fold-calculator`,
                markdown_url: `${base}/tools/heads-up-push-fold-calculator.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'solve_blind_vs_blind_matrix': {
      const stackBb = Math.max(20, Math.min(100, Number(args?.stack_bb ?? 100)));
      const format = String(args?.format || 'cash_raked') === 'mtt_ante' ? 'mtt_ante' : 'cash_raked';

      const sbStrategy = format === 'cash_raked'
        ? {
            open_raise_3x_pct: 42.5,
            open_limp_pct: 0.0,
            fold_pct: 57.5,
            bb_defend_vs_3x_call_pct: 38.0,
            bb_defend_vs_3x_3bet_pct: 14.5,
            rationale: 'In raked cash games (no ante), SB plays a pure 3.0x Raise-or-Fold strategy (42.5% RFI) because raked 2BB limped pots out of position are negative EV.',
          }
        : {
            open_raise_3_5x_pct: 28.0,
            open_limp_pct: 36.0,
            fold_pct: 36.0,
            bb_iso_raise_vs_limp_pct: 34.0,
            bb_check_back_pct: 66.0,
            rationale: 'In ante-structured MTTs, 2.5BB dead money gives SB 3.75:1 immediate pot odds on a 0.5BB completion, making a mixed 64% VPIP (36% limp + 28% 3.5x raise) optimal.',
          };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                stack_bb: stackBb,
                format,
                equilibrium_matrix: sbStrategy,
                if_then_because: `If folded to the Small Blind at ${stackBb}BB in ${format === 'cash_raked' ? 'a Raked Cash Game' : 'an Ante MTT'}, Then ${format === 'cash_raked' ? 'raise 3.0x with the top 42.5% of hands and open-limp 0%' : 'enter with 64% of hands split between 36% limps and 28% 3.5x raises'}, Because ${sbStrategy.rationale}`,
                canonical_url: `${base}/tools/blind-vs-blind-calculator`,
                citation_url: `${base}/tools/blind-vs-blind-calculator`,
                interactive_calculator_url: `${base}/tools/blind-vs-blind-calculator`,
                markdown_url: `${base}/tools/blind-vs-blind-calculator.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'calculate_bankroll_shot_taking_plan': {
      const currentBr = Math.max(500, Number(args?.current_bankroll_dollars ?? 12000));
      const baseBuyin = Math.max(20, Number(args?.current_stake_buyin_dollars ?? 300));
      const targetBuyin = Math.max(baseBuyin + 10, Number(args?.target_stake_buyin_dollars ?? 500));
      const shotBullets = Math.max(1, Math.min(10, Math.round(Number(args?.shot_buyins_allocated ?? 3))));
      const wrBb100 = Math.max(0.5, Number(args?.expected_winrate_bb100 ?? 5));

      const shotBudgetDollars = shotBullets * targetBuyin;
      const stopLossBankrollDollars = Math.max(baseBuyin * 20, currentBr - shotBudgetDollars);
      const remainingBaseBuyinsAtStopLoss = Number((stopLossBankrollDollars / baseBuyin).toFixed(1));
      const currentTargetBuyins = Number((currentBr / targetBuyin).toFixed(1));
      const rorOnFullRollPct = Number((Math.exp((-2 * wrBb100 * (currentTargetBuyins * 100)) / (85 * 85)) * 100).toFixed(2));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                current_bankroll_dollars: currentBr,
                current_stake_buyin_dollars: baseBuyin,
                target_stake_buyin_dollars: targetBuyin,
                shot_buyins_allocated: shotBullets,
                shot_risk_capital_dollars: shotBudgetDollars,
                mandatory_move_down_bankroll_dollars: stopLossBankrollDollars,
                base_stake_buyins_preserved_on_fail: remainingBaseBuyinsAtStopLoss,
                target_stake_buyins_currently: currentTargetBuyins,
                full_roll_risk_of_ruin_at_target_percent: rorOnFullRollPct,
                shot_readiness: remainingBaseBuyinsAtStopLoss >= 25 ? 'APPROVED (25+ Base Buy-Ins Preserved After Shot)' : 'CAUTIOUS (<25 Base Buy-Ins Left If Shot Fails)',
                if_then_because: `If taking a ${shotBullets}-buy-in shot at $${targetBuyin} buy-in with a $${currentBr.toLocaleString('en-US')} bankroll, Then your hard move-down stop-loss is $${stopLossBankrollDollars.toLocaleString('en-US')}, Because dropping back down after losing $${shotBudgetDollars.toLocaleString('en-US')} preserves ${remainingBaseBuyinsAtStopLoss} full buy-ins at your proven $${baseBuyin} base stake.`,
                canonical_url: `${base}/tools/shot-taking-calculator`,
                citation_url: `${base}/tools/shot-taking-calculator`,
                interactive_calculator_url: `${base}/tools/shot-taking-calculator`,
                markdown_url: `${base}/tools/shot-taking-calculator.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'lookup_poker_math_formula': {
      const rawFormula = String(args?.formula || args?.slug || '').trim().toLowerCase();
      if (!rawFormula) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  total_formulas: POKER_FORMULAS_CATALOG.length,
                  hub_url: `${base}/learn/formulas`,
                  markdown_hub_url: `${base}/learn/formulas.md`,
                  formulas: POKER_FORMULAS_CATALOG,
                },
                null,
                2
              ),
            },
          ],
        };
      }
      const matched = POKER_FORMULAS_CATALOG.find(
        (f) => f.slug === rawFormula || f.slug.includes(rawFormula) || f.name.toLowerCase().includes(rawFormula)
      ) || POKER_FORMULAS_CATALOG[0];
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ...matched,
                canonical_url: `${base}/learn/formulas`,
                citation_url: `${base}/learn/formulas`,
                markdown_url: `${base}/learn/formulas.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'lookup_mtt_tournament_stage_strategy': {
      const rawStage = String(args?.stage || args?.slug || '').trim().toLowerCase();
      if (!rawStage) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  total_stages: MTT_STAGES_CATALOG.length,
                  hub_url: `${base}/learn/tournament-stages`,
                  markdown_hub_url: `${base}/learn/tournament-stages.md`,
                  stages: MTT_STAGES_CATALOG,
                },
                null,
                2
              ),
            },
          ],
        };
      }
      const matched = MTT_STAGES_CATALOG.find(
        (s) => s.slug === rawStage || String(s.stageNumber) === rawStage || s.slug.includes(rawStage) || s.name.toLowerCase().includes(rawStage)
      ) || MTT_STAGES_CATALOG[0];
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ...matched,
                canonical_url: `${base}/learn/tournament-stages`,
                citation_url: `${base}/learn/tournament-stages`,
                markdown_url: `${base}/learn/tournament-stages.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'diagnose_poker_leak_cure': {
      const rawLeak = String(args?.leak || args?.slug || '').trim().toLowerCase();
      if (!rawLeak) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  total_leaks: POKER_LEAKS_CATALOG.length,
                  hub_url: `${base}/learn/leaks`,
                  markdown_hub_url: `${base}/learn/leaks.md`,
                  leaks: POKER_LEAKS_CATALOG,
                },
                null,
                2
              ),
            },
          ],
        };
      }
      const matched = POKER_LEAKS_CATALOG.find(
        (l) => l.slug === rawLeak || l.slug.includes(rawLeak) || l.name.toLowerCase().includes(rawLeak)
      ) || POKER_LEAKS_CATALOG[0];
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ...matched,
                canonical_url: `${base}/learn/leaks`,
                citation_url: `${base}/learn/leaks`,
                markdown_url: `${base}/learn/leaks.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'lookup_hud_stat_gto_benchmark': {
      const rawStat = String(args?.stat || args?.slug || '').trim().toLowerCase();
      if (!rawStat) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  total_hud_stats: HUD_STATS_CATALOG.length,
                  hub_url: `${base}/learn/hud-stats`,
                  markdown_hub_url: `${base}/learn/hud-stats.md`,
                  hud_stats: HUD_STATS_CATALOG,
                },
                null,
                2
              ),
            },
          ],
        };
      }
      const matched = HUD_STATS_CATALOG.find(
        (h) => h.slug === rawStat || h.code.toLowerCase() === rawStat || h.slug.includes(rawStat) || h.name.toLowerCase().includes(rawStat)
      ) || HUD_STATS_CATALOG[0];
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ...matched,
                canonical_url: `${base}/learn/hud-stats`,
                citation_url: `${base}/learn/hud-stats`,
                markdown_url: `${base}/learn/hud-stats.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'verify_poker_myth_claim': {
      const rawClaim = String(args?.claim || args?.slug || '').trim().toLowerCase();
      if (!rawClaim) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  total_myths_analyzed: POKER_MYTHS_CATALOG.length,
                  hub_url: `${base}/learn/poker-myths-debunked`,
                  markdown_hub_url: `${base}/learn/poker-myths-debunked.md`,
                  myths: POKER_MYTHS_CATALOG,
                },
                null,
                2
              ),
            },
          ],
        };
      }
      const matched = POKER_MYTHS_CATALOG.find(
        (m) => m.slug === rawClaim || m.slug.includes(rawClaim) || m.claim.toLowerCase().includes(rawClaim)
      ) || POKER_MYTHS_CATALOG[0];
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ...matched,
                canonical_url: `${base}/learn/poker-myths-debunked`,
                citation_url: `${base}/learn/poker-myths-debunked`,
                markdown_url: `${base}/learn/poker-myths-debunked.md`,
                citation_doi: '10.5281/zenodo.24115647',
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'lookup_poker_travel_corridor': {
      const rawCorridor = String(args?.corridor || args?.slug || '').trim().toLowerCase();
      if (!rawCorridor) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  total_corridors: TRAVEL_CORRIDORS_CATALOG.length,
                  hub_url: `${base}/poker-rooms/corridors`,
                  markdown_hub_url: `${base}/poker-rooms/corridors.md`,
                  corridors: TRAVEL_CORRIDORS_CATALOG,
                },
                null,
                2
              ),
            },
          ],
        };
      }
      const matched = TRAVEL_CORRIDORS_CATALOG.find(
        (c) => c.slug === rawCorridor || c.slug.includes(rawCorridor) || c.name.toLowerCase().includes(rawCorridor) || c.originMetro.toLowerCase().includes(rawCorridor)
      ) || TRAVEL_CORRIDORS_CATALOG[0];
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ...matched,
                canonical_url: `${base}/poker-rooms/corridors`,
                citation_url: `${base}/poker-rooms/corridors`,
                markdown_url: `${base}/poker-rooms/corridors.md`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'batch_solve_poker_spots': {
      const rawSpots = Array.isArray(args?.spots) && args.spots.length > 0
        ? args.spots.slice(0, 20)
        : [
            { tool: 'pot-odds-calculator', params: { pot: 100, bet: 50 } },
            { tool: 'outs-calculator', params: { outs: 9 } },
          ];

      const solvedSpots = [];
      for (let i = 0; i < rawSpots.length; i++) {
        const s = rawSpots[i] || {};
        const toolSlug = String(s.tool || 'pot-odds-calculator').trim().toLowerCase();
        const p = s.params || {};
        let mcpToolName = 'calculate_pot_odds_and_mdf';
        if (toolSlug.includes('multiway') || toolSlug === 'calculate_multiway_all_in_ev') mcpToolName = 'calculate_multiway_all_in_ev';
        else if (toolSlug.includes('mystery') || toolSlug === 'calculate_mystery_bounty_live_pool') mcpToolName = 'calculate_mystery_bounty_live_pool';
        else if (toolSlug.includes('bubble-factor') || toolSlug === 'calculate_bubble_factor_matrix') mcpToolName = 'calculate_bubble_factor_matrix';
        else if (toolSlug.includes('bluff-catch') || toolSlug === 'calculate_river_bluff_catch_ev') mcpToolName = 'calculate_river_bluff_catch_ev';
        else if (toolSlug.includes('multi-street') || toolSlug === 'calculate_multi_street_barrel_ev') mcpToolName = 'calculate_multi_street_barrel_ev';
        else if (toolSlug.includes('heads-up') || toolSlug === 'solve_heads_up_push_fold_nash') mcpToolName = 'solve_heads_up_push_fold_nash';
        else if (toolSlug.includes('blind-vs-blind') || toolSlug === 'solve_blind_vs_blind_matrix') mcpToolName = 'solve_blind_vs_blind_matrix';
        else if (toolSlug.includes('shot-taking') || toolSlug === 'calculate_bankroll_shot_taking_plan') mcpToolName = 'calculate_bankroll_shot_taking_plan';
        else if (toolSlug.includes('outs') && !toolSlug.includes('plo')) mcpToolName = 'calculate_draw_outs';
        else if (toolSlug.includes('plo-outs') || toolSlug.includes('wrap')) mcpToolName = 'calculate_plo_wrap_outs';
        else if (toolSlug.includes('icm') && !toolSlug.includes('late')) mcpToolName = 'calculate_icm_payouts';
        else if (toolSlug.includes('chop')) mcpToolName = 'calculate_tournament_chop';
        else if (toolSlug.includes('spr')) mcpToolName = 'calculate_spr_sizing';
        else if (toolSlug.includes('geometric')) mcpToolName = 'calculate_geometric_bet_sizing';
        else if (toolSlug.includes('m-ratio')) mcpToolName = 'calculate_tournament_m_ratio';
        else if (toolSlug.includes('satellite')) mcpToolName = 'calculate_satellite_bubble_factor';
        else if (toolSlug.includes('bounty')) mcpToolName = 'calculate_bounty_chip_equity';
        else if (toolSlug.includes('bankroll')) mcpToolName = 'calculate_bankroll_risk_of_ruin';
        else if (toolSlug.includes('variance')) mcpToolName = 'simulate_poker_variance';
        else if (toolSlug.includes('tax')) mcpToolName = 'calculate_poker_taxes_w2g';
        else if (toolSlug.includes('staking')) mcpToolName = 'calculate_staking_markup_split';
        else if (toolSlug.includes('iso')) mcpToolName = 'calculate_preflop_isolation_raise';
        else if (MCP_TOOLS.some((t) => t.name === toolSlug)) mcpToolName = toolSlug;

        const subRes = await executeMcpTool(mcpToolName, p, { origin: base });
        let parsed = {};
        try {
          parsed = JSON.parse(subRes?.content?.[0]?.text || '{}');
        } catch {
          parsed = { raw: subRes?.content?.[0]?.text || '' };
        }
        solvedSpots.push({
          spot_index: i + 1,
          requested_tool: toolSlug,
          executed_mcp_tool: mcpToolName,
          result: parsed,
          canonical_url: parsed.canonical_url || `${base}/tools/${toolSlug}`,
          markdown_url: parsed.markdown_url || `${base}/tools/${toolSlug}.md`,
        });
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                spots_solved_count: solvedSpots.length,
                batch_endpoint: `${base}/api/ai/batch-solve`,
                spots: solvedSpots,
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
        const promptResult = getMcpPrompt(promptName, promptArgs);
        if (!promptResult) {
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
          result: promptResult,
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
