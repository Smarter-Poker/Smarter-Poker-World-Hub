/**
 * World Hub Tool, Simulator & Surface Raw Markdown Endpoint
 *
 * Serves structured, token-efficient Markdown (`text/markdown; charset=utf-8`)
 * for all World Hub interactive tools, training simulators, trivia challenges,
 * community directories, and VIP membership comparison routes.
 *
 * Reads directly from HUB_PAGE_SUMMARIES, SCHEMA_ROUTES, and TRAINING_LIBRARY
 * so the Markdown mirror never drifts from the server-rendered HTML copy.
 */
import { getHubPageSummaries } from '../../src/lib/seo/hubPageSummariesData.js';
import { SCHEMA_ROUTES } from '../../src/lib/seo/summarySchema.js';
import { TRAINING_LIBRARY } from '../../src/data/TRAINING_LIBRARY.js';
import { computeValidatedSolvedSpot } from '../../src/lib/seo/solvedSpotEngine.js';
import {
  PLAYER_ARCHETYPES,
  findPlayerArchetype,
  renderPlayerTypesIndexMarkdown,
  renderPlayerTypeDetailMarkdown,
} from '../../src/content/learn/playerTypes.js';
import {
  BOARD_TEXTURES,
  findBoardTexture,
  renderBoardTexturesIndexMarkdown,
  renderBoardTextureDetailMarkdown,
} from '../../src/content/learn/boardTextures.js';
import {
  INTERNATIONAL_POKER_GUIDES,
  findInternationalGuide,
  renderInternationalGuidesIndexMarkdown,
  renderInternationalGuideDetailMarkdown,
} from '../../src/content/guides/internationalMarkets.js';
// The HUD stat Markdown twins render from the same catalog as the HTML pages
// (/learn/hud-stats and /learn/hud-stats/[stat]), so the .md route can never
// serve a slug, field or stat the page does not have.
import {
  renderHudStatsIndexMarkdown,
  renderHudStatDetailMarkdown,
} from '../../src/content/learn/hudStats.js';
import {
  renderToolsDirectoryMarkdown,
  renderEmbedsMarkdown,
  renderPokerOddsCalculatorMarkdown,
  renderIcmCalculatorMarkdown,
  renderPotOddsCalculatorMarkdown,
  renderBankrollCalculatorMarkdown,
  renderPushFoldCalculatorMarkdown,
  renderBountyCalculatorMarkdown,
  renderPokerWinrateCalculatorMarkdown,
  renderPreflopRangesMarkdown,
  renderSidePotCalculatorMarkdown,
  renderBlindStructureCalculatorMarkdown,
  renderSprCalculatorMarkdown,
  renderPloBetCalculatorMarkdown,
  renderPayoutCalculatorMarkdown,
  renderRakeCalculatorMarkdown,
  renderThreeBetCalculatorMarkdown,
  renderRulesIndexMarkdown,
  renderRuleDetailMarkdown,
  renderGamesIndexMarkdown,
  renderGameVariantMarkdown,
  renderPokerHandRankingsMarkdown,
  renderMarketGuidesIndexMarkdown,
  renderMarketGuideCityMarkdown,
  renderChopCalculatorMarkdown,
  renderVarianceCalculatorMarkdown,
  renderOutsCalculatorMarkdown,
  renderPokerTaxCalculatorMarkdown,
  renderStakingCalculatorMarkdown,
  renderIsoCalculatorMarkdown,
  renderHomeGameKitMarkdown,
  renderFormatQuizMarkdown,
  renderMatchupsIndexMarkdown,
  renderMatchupDetailMarkdown,
  renderSeriesGuidesIndexMarkdown,
  renderSeriesGuideDetailMarkdown,
  renderFirstTimeGuideMarkdown,
  renderPressKitMarkdown,
  renderSearchDirectoryMarkdown,
  renderBoardTextureAnalyzerMarkdown,
  renderMRatioCalculatorMarkdown,
  renderSessionPlannerMarkdown,
  renderStraddleCalculatorMarkdown,
  renderHandConverterMarkdown,
  renderSatelliteCalculatorMarkdown,
  renderPromoEvCalculatorMarkdown,
  renderWhoWinsCalculatorMarkdown,
  renderMixedGamePlacardsMarkdown,
  renderPokerIqTestMarkdown,
  renderPositionsIndexMarkdown,
  renderPositionDetailMarkdown,
  renderStakesIndexMarkdown,
  renderStakeDetailMarkdown,
  renderFamousHandsIndexMarkdown,
  renderFamousHandDetailMarkdown,
  renderRoadmapsIndexMarkdown,
  renderRoadmapDetailMarkdown,
  renderStatesIndexMarkdown,
  renderStateDetailMarkdown,
  renderPokerMathMarkdown,
  renderCheatSheetsMarkdown,
  renderOnlineVsLiveMarkdown,
  renderLivePokerTellsMarkdown,
  renderCompsAndTippingMarkdown,
  renderFormulasIndexMarkdown,
  renderFormulaDetailMarkdown,
  renderTournamentStagesIndexMarkdown,
  renderTournamentStageDetailMarkdown,
  renderPokerLeaksIndexMarkdown,
  renderPokerLeakDetailMarkdown,
  renderPokerMythsDebunkedMarkdown,
  renderFormatMigrationGuideMarkdown,
  renderAuthorsIndexMarkdown,
  renderAuthorDetailMarkdown,
  renderCompareDecisionMatrixMarkdown,
  renderPokerCorridorsIndexMarkdown,
  renderPokerCorridorDetailMarkdown,
  renderPokerRoomsByGameIndexMarkdown,
  renderPokerRoomsByGameDetailMarkdown,
  renderSecurityAndDisputesGuideMarkdown,
  renderSeasonalCalendarMarkdown,
  renderAnnualStateOfPoker2026Markdown,
  renderResearchBenchmarksMarkdown,
  renderFactsLedgerMarkdown,
} from '../../src/lib/seo/markdownIngestion.mjs';

const SITE = 'https://smarter.poker';

export const PLAYER_ARCHETYPES_MD_CATALOG = PLAYER_ARCHETYPES.map((a) => ({
  slug: a.slug,
  name: a.name,
  vpipPfr: `${a.vpipRange} / ${a.pfrRange}`,
  threeBet: a.threeBetRange,
  coreLeak: a.coreLeaks?.[0] || a.summary,
  exploit: a.preflopAdjustments?.[0] || a.summary,
}));

export const BOARD_TEXTURES_MD_CATALOG = BOARD_TEXTURES.map((t) => ({
  slug: t.slug,
  name: t.name,
  cbetFreq: t.gtoCbetFreq,
  sizing: t.optimalCbetSize,
  xrPct: t.checkRaiseFreq,
  advantage: t.rangeAdvantage,
  turnPlan: t.bestTurnBarrels,
}));

export const INTERNATIONAL_CITIES_MD_CATALOG = INTERNATIONAL_POKER_GUIDES.map((g) => ({
  slug: g.slug,
  city: g.city,
  country: g.country,
  currency: g.currency,
  venues: (g.topPokerRooms || []).map((r) => r.name).join(', '),
  stakes: g.typicalStakes,
  rakeAndTax: `${g.rakeCap} | ${g.visitorTaxRule}`,
  festivals: g.flagshipSeries,
}));

export function computeLiveScenarioMarkdown(cleanPath, query = {}) {
  const qKeys = Object.keys(query || {}).filter((k) => k !== 'path' && k !== 'section' && k !== 'slug' && k !== 'format');
  if (qKeys.length === 0) return '';

  if (cleanPath === '/tools/m-ratio-calculator' && (query.stack || query.bb)) {
    const stack = Math.max(100, Number(query.stack) || 25000);
    const sb = Math.max(1, Number(query.sb || query.small_blind) || 500);
    const bb = Math.max(2, Number(query.bb || query.big_blind) || 1000);
    const ante = Math.max(0, Number(query.ante ?? query.ante_total ?? bb));
    const players = Math.max(2, Math.min(10, Math.round(Number(query.players) || 9)));
    const orbitCost = sb + bb + ante;
    const mRatio = (stack / orbitCost).toFixed(2);
    const effM = ((stack / orbitCost) * (players / 10)).toFixed(2);
    const zone = Number(effM) >= 20 ? 'Green Zone' : Number(effM) >= 10 ? 'Yellow Zone' : Number(effM) >= 6 ? 'Orange Zone' : Number(effM) >= 1 ? 'Red Zone (Push/Fold)' : 'Dead Zone';
    return [
      '',
      '## Live Computed Scenario Analysis',
      `- **Hero Stack**: ${stack.toLocaleString('en-US')} Chips (${(stack / bb).toFixed(1)} BB)`,
      `- **Blinds & Ante**: ${sb.toLocaleString('en-US')} / ${bb.toLocaleString('en-US')} (Total Orbit Ante: ${ante.toLocaleString('en-US')})`,
      `- **Orbit Cost**: ${orbitCost.toLocaleString('en-US')} Chips`,
      `- **Harrington M-Ratio**: ${mRatio}`,
      `- **Short-Handed Effective M (${players} Players)**: ${effM}`,
      `- **Harrington Zone Verdict**: **${zone}**`,
      '',
    ].join('\n');
  }

  if ((cleanPath === '/tools/geometric-bet-calculator' || cleanPath === '/tools/spr-calculator') && (query.pot || query.stack || query.effectiveStack)) {
    const pot = Math.max(1, Number(query.pot || query.pot_size) || 100);
    const stack = Math.max(1, Number(query.stack || query.effectiveStack || query.effective_stack) || 300);
    const streets = Math.max(1, Math.min(3, Math.round(Number(query.streets) || 3)));
    const spr = (stack / pot).toFixed(2);
    const geoFrac = (Math.pow((2 * stack + pot) / pot, 1 / streets) - 1) / 2;
    const geoPct = (geoFrac * 100).toFixed(1);
    const firstBet = (pot * geoFrac).toFixed(1);
    return [
      '',
      '## Live Computed Scenario Analysis',
      `- **Starting Pot**: ${pot}`,
      `- **Remaining Effective Stack**: ${stack}`,
      `- **Stack-To-Pot Ratio (SPR)**: ${spr}`,
      `- **Target Streets (${streets}e)**: ${streets} Betting Streets`,
      `- **Equal Geometric Bet Fraction**: **${geoPct}% Of Pot Per Street** (First Street Bet: ${firstBet})`,
      '',
    ].join('\n');
  }

  if (cleanPath === '/tools/board-texture-analyzer' && (query.board || query.flop)) {
    const rawBoard = String(query.board || query.flop || 'AsKh7d').trim();
    const tokens = rawBoard.match(/(?:10|[2-9TJQKA])[shdc]/gi) || ['As', 'Kh', '7d'];
    const cards = tokens.slice(0, 3).map((t) => `${t.slice(0, -1).toUpperCase()}${t.slice(-1).toLowerCase()}`);
    const suits = new Set(cards.map((c) => c.slice(-1))).size;
    const suitType = suits === 1 ? 'Monotone' : suits === 2 ? 'Two-Tone' : 'Rainbow';
    const cbetRec = suits === 1 ? '25%-33% Pot Small Sizing (44% Frequency)' : suits === 3 ? '33% Pot Range Bet (85% Frequency)' : '66%-75% Pot Polarized Or 33% Mixed';
    return [
      '',
      '## Live Computed Scenario Analysis',
      `- **Analyzed Flop Board**: \`[${cards.join(' ')}]\``,
      `- **Suit Texture**: ${suitType}`,
      `- **Recommended GTO C-Bet Strategy**: **${cbetRec}**`,
      '',
    ].join('\n');
  }

  if (cleanPath === '/tools/pot-odds-calculator' && (query.pot || query.bet || query.call)) {
    const pot = Math.max(1, Number(query.pot) || 100);
    const bet = Math.max(1, Number(query.bet || query.call) || 50);
    const totalAfterCall = pot + bet * 2;
    const reqEq = ((bet / totalAfterCall) * 100).toFixed(1);
    const mdf = ((pot / (pot + bet)) * 100).toFixed(1);
    return [
      '',
      '## Live Computed Scenario Analysis',
      `- **Pot Before Bet**: ${pot}`,
      `- **Opponent Bet / Call Size**: ${bet}`,
      `- **Total Pot After Call**: ${totalAfterCall}`,
      `- **Break-Even Calling Equity Required**: **${reqEq}%**`,
      `- **Minimum Defense Frequency (MDF)**: **${mdf}%**`,
      '',
    ].join('\n');
  }

  if (cleanPath === '/tools/plo-outs-calculator' && (query.outs || query.wrap)) {
    const outs = Math.max(1, Math.min(25, Number(query.outs || query.wrap) || 17));
    const turnPct = ((outs / 45) * 100).toFixed(1);
    const flopToRiverPct = ((1 - ((45 - outs) / 45) * ((44 - outs) / 44)) * 100).toFixed(1);
    return [
      '',
      '## Live Computed Scenario Analysis',
      `- **Omaha Wrap / Total Clean Outs**: ${outs} Outs`,
      `- **Turn Hit Probability**: ${turnPct}%`,
      `- **Flop-To-River Completion Equity**: **${flopToRiverPct}%**`,
      '',
    ].join('\n');
  }

  if (cleanPath === '/tools/late-reg-calculator' && (query.buyin || query.bb)) {
    const buyin = Math.max(10, Number(query.buyin) || 1000);
    const bb = Math.max(5, Number(query.bb) || 20);
    const icmVal = Math.round(buyin * 0.9 * 1.139);
    return [
      '',
      '## Live Computed Scenario Analysis',
      `- **Tournament Buy-In**: $${buyin.toLocaleString('en-US')}`,
      `- **Late-Reg Entry Stack**: ${bb} BB`,
      `- **Instant ICM Equity Value**: **$${icmVal.toLocaleString('en-US')}**`,
      '',
    ].join('\n');
  }

  if (cleanPath === '/tools/winrate-confidence-calculator' && (query.winrate || query.hands)) {
    const wr = Number(query.winrate ?? 5);
    const sd = Math.max(10, Number(query.sd || query.stdDev) || 85);
    const hands = Math.max(1000, Number(query.hands) || 50000);
    const se = sd / Math.sqrt(hands / 100);
    return [
      '',
      '## Live Computed Scenario Analysis',
      `- **Observed Winrate**: ${wr} BB/100 (StdDev: ${sd} BB/100)`,
      `- **Sample Size**: ${hands.toLocaleString('en-US')} Hands`,
      `- **95% Confidence Interval**: **[${(wr - 1.96 * se).toFixed(2)}, +${(wr + 1.96 * se).toFixed(2)} BB/100]**`,
      '',
    ].join('\n');
  }

  if (cleanPath === '/tools/table-selection-calculator' && (query.whales || query.stack || query.recs || query.depth)) {
    const whales = Math.max(0, Math.min(8, Number(query.whales ?? query.recs) || 3));
    const stack = Math.max(30, Number(query.stack ?? query.depth) || 150);
    const rake = Math.max(0, Number(query.rake) || 5);
    const score = Math.min(100, Math.max(10, Math.round(whales * 22 + Math.min(30, (stack / 200) * 25) + 14 - rake * 1.6)));
    return [
      '',
      '## Live Computed Scenario Analysis',
      `- **Recreational VPIP Whales**: ${whales}`,
      `- **Average Stack Depth**: ${stack} BB ($${rake} Rake Cap)`,
      `- **Table Profitability Score**: **${score} / 100**`,
      '',
    ].join('\n');
  }

  if (cleanPath.startsWith('/tools/')) {
    const slug = cleanPath.slice('/tools/'.length).replace(/\/.*$/, '');
    const normalizedQuery = { ...query };

    if ((slug === 'icm-calculator' || slug === 'chop-calculator') && (query.stacks || query.payouts)) {
      normalizedQuery.stacks = query.stacks || '50000,30000,20000';
      normalizedQuery.payouts = query.payouts || '5000,3000,2000';
    } else if (slug === 'bankroll-calculator' && (query.wr !== undefined || query.winrate !== undefined || query.sd !== undefined || query.stdDev !== undefined || query.bi !== undefined || query.buyins !== undefined)) {
      normalizedQuery.wr = query.wr ?? query.winrate ?? 5;
      normalizedQuery.sd = query.sd ?? query.stdDev ?? 85;
      normalizedQuery.bi = query.bi ?? query.buyins ?? 30;
    } else if (slug === 'push-fold-calculator' && (query.stack !== undefined || query.bb !== undefined || query.pos !== undefined || query.position !== undefined)) {
      normalizedQuery.stack = query.stack ?? query.bb ?? 12;
      normalizedQuery.pos = query.pos ?? query.position ?? 'BTN';
    } else if (slug === 'bounty-calculator' && (query.startStack !== undefined || query.startBounty !== undefined || query.targetBounty !== undefined || query.pot !== undefined || query.call !== undefined)) {
      normalizedQuery.startStack = query.startStack ?? 10000;
      normalizedQuery.startBounty = query.startBounty ?? 50;
      normalizedQuery.targetBounty = query.targetBounty ?? 100;
      normalizedQuery.pot = query.pot ?? 12000;
      normalizedQuery.call = query.call ?? 8000;
    } else if (slug === 'poker-winrate-calculator' && (query.profit !== undefined || query.bb !== undefined || query.hours !== undefined || query.wr !== undefined || query.winrate !== undefined || query.hands !== undefined)) {
      const bbVal = Number(query.bb) || 5;
      const handsVal = Number(query.hands) || 2800;
      const hphVal = Number(query.hph) || 28;
      const hrsVal = Number(query.hours) || Math.max(1, Math.round(handsVal / hphVal));
      const wrVal = Number(query.wr ?? query.winrate ?? 6);
      const profitVal = query.profit !== undefined ? Number(query.profit) : (wrVal * (handsVal / 100) * bbVal);
      normalizedQuery.profit = profitVal;
      normalizedQuery.bb = bbVal;
      normalizedQuery.hours = hrsVal;
      normalizedQuery.hph = hphVal;
    } else if (slug === 'variance-calculator' && (query.wr !== undefined || query.winrate !== undefined || query.sd !== undefined || query.stdDev !== undefined || query.hands !== undefined)) {
      normalizedQuery.wr = query.wr ?? query.winrate ?? 5;
      normalizedQuery.sd = query.sd ?? query.stdDev ?? 85;
      normalizedQuery.hands = query.hands ?? 50000;
    } else if (slug === 'side-pot-calculator' && (query.stacks !== undefined || query.deadMoney !== undefined || query.dead !== undefined)) {
      normalizedQuery.stacks = query.stacks || '100,250,400';
      normalizedQuery.deadMoney = query.deadMoney ?? query.dead ?? 0;
    } else if (slug === 'plo-bet-calculator' && (query.pot !== undefined || query.bet !== undefined || query.call !== undefined || query.trail !== undefined)) {
      normalizedQuery.pot = query.pot ?? 100;
      normalizedQuery.bet = query.bet ?? query.call ?? 50;
      normalizedQuery.trail = query.trail ?? 0;
    } else if (slug === 'rake-calculator' && (query.bb !== undefined || query.cap !== undefined || query.promo !== undefined || query.time !== undefined)) {
      normalizedQuery.bb = query.bb ?? 5;
      normalizedQuery.cap = query.cap ?? 6;
      normalizedQuery.promo = query.promo ?? 2;
      normalizedQuery.time = query.time ?? 7;
    } else if (slug === '3bet-calculator' && (query.open !== undefined || query.callers !== undefined || query.pos !== undefined || query.stack !== undefined)) {
      normalizedQuery.open = query.open ?? 2.5;
      normalizedQuery.stack = query.stack ?? 100;
      normalizedQuery.callers = query.callers ?? 0;
      normalizedQuery.pos = query.pos ?? 'IP';
    } else if (slug === 'outs-calculator' && (query.outs !== undefined || query.street !== undefined)) {
      normalizedQuery.outs = query.outs ?? 9;
      normalizedQuery.street = query.street ?? 'flop';
    } else if (slug === 'poker-tax-calculator' && (query.wins !== undefined || query.losses !== undefined || query.status !== undefined)) {
      normalizedQuery.wins = query.wins ?? 85000;
      normalizedQuery.losses = query.losses ?? 40000;
      normalizedQuery.status = query.status ?? 'recreational';
    } else if (slug === 'staking-calculator' && (query.package !== undefined || query.markup !== undefined || query.sold !== undefined)) {
      normalizedQuery.package = query.package ?? 10000;
      normalizedQuery.markup = query.markup ?? 1.2;
      normalizedQuery.sold = query.sold ?? 50;
    } else if (slug === 'iso-calculator' && (query.bb !== undefined || query.limpers !== undefined || query.pos !== undefined || query.stack !== undefined)) {
      normalizedQuery.bb = query.bb ?? 5;
      normalizedQuery.limpers = query.limpers ?? 2;
      normalizedQuery.stack = query.stack ?? 100;
      normalizedQuery.pos = query.pos ?? 'IP';
    } else if (slug === 'session-planner' && (query.stake !== undefined || query.wr !== undefined || query.hrs !== undefined)) {
      normalizedQuery.stake = query.stake ?? '2/5';
      normalizedQuery.wr = query.wr ?? 8;
      normalizedQuery.hrs = query.hrs ?? 6;
    } else if (slug === 'straddle-calculator' && (query.stack !== undefined || query.ante !== undefined || query.players !== undefined)) {
      normalizedQuery.stack = query.stack ?? 1000;
      normalizedQuery.ante = query.ante ?? 10;
      normalizedQuery.players = query.players ?? 8;
    } else if (slug === 'satellite-calculator' && (query.total !== undefined || query.seats !== undefined || query.hero !== undefined || query.rem !== undefined)) {
      const seatsVal = Number(query.seats) || 10;
      normalizedQuery.total = query.total ?? 100;
      normalizedQuery.seats = seatsVal;
      normalizedQuery.rem = query.rem ?? (seatsVal + 2);
    } else if (slug === 'promo-ev-calculator' && (query.pool !== undefined || query.drop !== undefined)) {
      normalizedQuery.pool = query.pool ?? 150000;
      normalizedQuery.drop = query.drop ?? 2;
    } else if (slug === 'poker-trip-planner' && (query.days !== undefined || query.flight !== undefined || query.hotel !== undefined || query.food !== undefined || query.buyins !== undefined)) {
      normalizedQuery.days = query.days ?? 7;
      normalizedQuery.buyins = query.buyins ?? 10000;
      normalizedQuery.flight = query.flight ?? 480;
      normalizedQuery.hotel = query.hotel ?? 165;
      normalizedQuery.food = query.food ?? 85;
    } else if (slug === 'mtt-grind-planner' && (query.mtts !== undefined || query.abi !== undefined || query.bullets !== undefined || query.roi !== undefined)) {
      normalizedQuery.mtts = query.mtts ?? 12;
      normalizedQuery.abi = query.abi ?? 55;
      normalizedQuery.bullets = query.bullets ?? 30;
      normalizedQuery.roi = query.roi ?? 22;
    } else if (slug === 'multiway-all-in-calculator' && (query.p1 !== undefined || query.p2 !== undefined || query.p3 !== undefined || query.stacks !== undefined || query.eq !== undefined)) {
      const stackParts = query.stacks ? String(query.stacks).split(',').map(Number) : [];
      const eqParts = query.eq ? String(query.eq).split(',').map(Number) : [];
      normalizedQuery.p1 = query.p1 ?? stackParts[0] ?? 40;
      normalizedQuery.p2 = query.p2 ?? stackParts[1] ?? 100;
      normalizedQuery.p3 = query.p3 ?? stackParts[2] ?? 100;
      normalizedQuery.eq1 = query.eq1 ?? eqParts[0] ?? 36;
      normalizedQuery.eq2 = query.eq2 ?? eqParts[1] ?? 34;
      normalizedQuery.eq3 = query.eq3 ?? eqParts[2] ?? 30;
      normalizedQuery.dead = query.dead ?? query.dead_money ?? 2.5;
    } else if (slug === 'mystery-bounty-tracker' && (query.pool !== undefined || query.envelopes !== undefined || query.env !== undefined || query.topBounty !== undefined || query.top !== undefined)) {
      normalizedQuery.pool = query.pool ?? 200000;
      normalizedQuery.envelopes = query.envelopes ?? query.env ?? 40;
      normalizedQuery.topBounty = query.topBounty ?? query.top ?? 50000;
    } else if (slug === 'bubble-factor-calculator' && (query.s1 !== undefined || query.s2 !== undefined || query.hero !== undefined || query.villain !== undefined || query.bf !== undefined || query.stacks !== undefined)) {
      const stackParts = query.stacks ? String(query.stacks).split(',').map(Number) : [];
      normalizedQuery.s1 = query.s1 ?? query.hero ?? stackParts[0] ?? 40;
      normalizedQuery.s2 = query.s2 ?? query.villain ?? stackParts[1] ?? 25;
      normalizedQuery.s3 = query.s3 ?? stackParts[2] ?? 22;
      normalizedQuery.s4 = query.s4 ?? stackParts[3] ?? 13;
    } else if (slug === 'bluff-catching-calculator' && (query.pot !== undefined || query.bet !== undefined || query.bluffs !== undefined || query.value !== undefined || query.bluffCombos !== undefined || query.valueCombos !== undefined)) {
      normalizedQuery.pot = query.pot ?? query.pot_size ?? 100;
      normalizedQuery.bet = query.bet ?? query.bet_size ?? 75;
      normalizedQuery.valueCombos = query.valueCombos ?? query.value ?? query.villain_value_combos ?? 18;
      normalizedQuery.bluffCombos = query.bluffCombos ?? query.bluffs ?? query.villain_bluff_combos ?? 11;
      normalizedQuery.blockerPct = query.blockerPct ?? query.blocker ?? 35;
    } else if (slug === 'multi-street-ev-calculator' && (query.pot !== undefined || query.fBet !== undefined || query.f1 !== undefined || query.tBet !== undefined || query.f2 !== undefined || query.rBet !== undefined || query.f3 !== undefined)) {
      normalizedQuery.pot = query.pot ?? 10;
      normalizedQuery.fBet = query.fBet ?? query.f1 ?? 33;
      normalizedQuery.fFold = query.fFold ?? 32;
      normalizedQuery.tBet = query.tBet ?? query.f2 ?? 66;
      normalizedQuery.tFold = query.tFold ?? 42;
      normalizedQuery.rBet = query.rBet ?? query.f3 ?? 75;
      normalizedQuery.rFold = query.rFold ?? 48;
    } else if (slug === 'heads-up-push-fold-calculator' && (query.bb !== undefined || query.stack !== undefined || query.role !== undefined || query.ante !== undefined)) {
      normalizedQuery.bb = query.bb ?? query.stack ?? 10;
      const rawRole = String(query.role || 'sb_push').toLowerCase();
      normalizedQuery.role = rawRole === 'sb' ? 'sb_push' : rawRole === 'bb' ? 'bb_call' : rawRole === 'limp' ? 'sb_limp' : rawRole;
      normalizedQuery.ante = query.ante === 'bba' ? 12.5 : (Number(query.ante) || 0);
    } else if (slug === 'blind-vs-blind-calculator' && (query.bb !== undefined || query.stack !== undefined || query.action !== undefined || query.sizing !== undefined || query.rake !== undefined)) {
      normalizedQuery.bb = query.bb ?? query.stack ?? 100;
      const rawAct = String(query.action || 'sb_first_in').toLowerCase();
      normalizedQuery.action = rawAct === 'limp' ? 'bb_vs_limp' : rawAct === 'raise' ? 'bb_vs_raise' : rawAct === '3bet' ? 'sb_vs_3bet' : 'sb_first_in';
      normalizedQuery.sizing = query.sizing ?? (rawAct === 'limp' ? 'limp_mix' : '3.0bb');
    } else if (slug === 'shot-taking-calculator' && (query.bankroll !== undefined || query.br !== undefined || query.shotBb !== undefined || query.shot !== undefined || query.baseBb !== undefined || query.cur !== undefined || query.stopLossBi !== undefined || query.bullets !== undefined)) {
      const rawShot = Number(query.shotBb ?? query.shot ?? 10);
      const rawBase = Number(query.baseBb ?? query.cur ?? 5);
      normalizedQuery.bankroll = query.bankroll ?? query.br ?? 12000;
      normalizedQuery.shotBb = rawShot >= 50 ? rawShot / 100 : rawShot;
      normalizedQuery.baseBb = rawBase >= 50 ? rawBase / 100 : rawBase;
      normalizedQuery.stopLossBi = query.stopLossBi ?? query.bullets ?? 3;
    } else if (slug === 'warmup-cooldown-routine' && (query.focusScore !== undefined || query.focus !== undefined || query.tiltScore !== undefined || query.tilt !== undefined || query.sleep !== undefined || query.duration !== undefined)) {
      normalizedQuery.focusScore = query.focusScore ?? query.focus ?? query.sleep ?? 9;
      normalizedQuery.tiltScore = query.tiltScore ?? query.tilt ?? 2;
      normalizedQuery.duration = query.duration ?? query.stop ?? 5;
      normalizedQuery.game = query.game ?? 'live_cash';
    } else if (slug === 'home-game-director' && (query.players !== undefined || query.buyin !== undefined || query.rebuys !== undefined || query.addons !== undefined)) {
      normalizedQuery.players = query.players ?? 9;
      normalizedQuery.buyin = query.buyin ?? 100;
      normalizedQuery.rebuys = query.rebuys ?? 3;
      normalizedQuery.addons = query.addons ?? 6;
    }

    const solved = computeValidatedSolvedSpot(slug, normalizedQuery);
    if (solved && solved.hasValidatedSpot) {
      return [
        '',
        '## Live Computed Scenario Analysis',
        `- **Scenario Label**: ${solved.statLabel}`,
        `- **Computed Metric**: **${solved.statValue}**`,
        `- **Detailed Analysis**: ${solved.summaryText}`,
        '',
      ].join('\n');
    }
  }

  return '';
}

const PATH_TO_SUMMARY_KEY = {
  '/hub': 'hub',
  '/hub/home-games': 'home-games',
  '/hub/poker-tours': 'poker-tours',
  '/hub/poker-series': 'poker-series',
  '/hub/training': 'training',
  '/hub/bankroll-manager': 'bankroll-manager',
  '/hub/news': 'news',
  '/hub/news/sources': 'news-sources',
  '/hub/video-library': 'video-library',
  '/hub/preflop-charts': 'preflop-charts',
  '/hub/poker-tools': 'poker-tools',
  '/hub/poker-near-me': 'poker-near-me',
  '/hub/poker-near-me/lobby': 'poker-near-me',
  '/hub/commander': 'commander',
  '/hub/commander/venues': 'commander-venues',
  '/hub/commander/tournaments': 'commander-tournaments',
  '/hub/commander/home-games': 'commander-home-games',
  '/hub/commander/leagues': 'commander-leagues',
  '/hub/social-media': 'social-media',
  '/hub/reels': 'reels',
  '/hub/lives': 'lives',
  '/hub/social-pages': 'social-pages',
  '/hub/pages': 'pages',
  '/hub/leaderboards': 'leaderboards',
  '/hub/promotions': 'promotions',
  '/hub/help': 'help',
  '/hub/trivia': 'trivia',
  '/hub/trivia/endless': 'trivia-endless',
  '/hub/trivia/survival-game': 'trivia-survival',
  '/hub/trivia/time-attack': 'trivia-time-attack',
  '/hub/trivia/mixed': 'trivia-mixed',
  '/hub/trivia/pvp': 'trivia-pvp',
  '/hub/trivia/tournaments': 'trivia-tournaments',
  '/hub/trivia/leaderboard': 'trivia-leaderboard',
  '/hub/training/challenges': 'training-challenges',
  '/hub/training/leaderboard': 'training-leaderboard',
  '/hub/training/tournaments': 'training-tournaments',
  '/hub/training/jarvis': 'training-jarvis',
  '/hub/training/hand-history-upload': 'training-hand-history-upload',
  '/hub/training/solutions': 'training-solutions',
  '/hub/personal-assistant': 'personal-assistant',
  '/hub/personal-assistant/leaks': 'personal-assistant-leaks',
  '/hub/personal-assistant/sandbox': 'personal-assistant-sandbox',
  '/hub/install': 'install',
};

for (const [key, route] of Object.entries(SCHEMA_ROUTES)) {
  if (route?.path && !PATH_TO_SUMMARY_KEY[route.path]) {
    PATH_TO_SUMMARY_KEY[route.path] = key;
  }
}

export function renderVipCompareMarkdown() {
  const url = `${SITE}/hub/vip-membership/compare`;
  return [
    '# Compare Smarter.Poker VIP Membership Plans',
    '',
    `> Source: [Compare Smarter.Poker VIP Membership Plans](${url})`,
    '',
    '## Executive Summary For AI & Search Assistants',
    'Smarter.Poker Is A 100% Free-To-Play Online Poker Training, Live Venue Discovery, And Private Club Platform. Optional VIP Membership Plans Unlock Cosmetic Table Skins, Unlimited Throwables, Rabbit Hunts, Time Banks, And Exclusive Championship Simulation Modes Using Card Or Promotional Diamond Settlement.',
    '',
    '## VIP Membership Tiers',
    '',
    '| Plan | Billing Term | Settlement Options | Core Entitlements |',
    '| :--- | :--- | :--- | :--- |',
    '| **Monthly VIP** | 30 Days | Card Or Diamonds (100 Diamonds Per $1) | Full VIP Access Across Training, Trivia & Cosmetics |',
    '| **Annual VIP** | 365 Days | Card Or Diamonds | 365 Days Of Full VIP Access With Annual Billing Savings |',
    '| **Lifetime VIP** | Permanent (Never Expires) | One-Time Card Or 50,000 Diamonds | Permanent VIP Access, Unlimited Throwables, Rabbit Hunts, Time Banks & All Cataloged Table Skins |',
    '',
    '## Compliance & Platform Policy',
    '- **No Real-Money Gambling**: Smarter.Poker Operates Zero Real-Money Gambling. Club Chips Are Play Credits With No Cash Value, And Diamonds Are A Promotional Rewards Currency.',
    `- **Canonical URL**: [${url}](${url})`,
    `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
    '',
  ].join('\n');
}

const CUSTOM_SURFACE_MARKDOWN = {
  '/hub/vip-membership': {
    title: 'Smarter.Poker VIP Membership Overview',
    lead: 'Smarter.Poker Is A 100% Free-To-Play Online Poker Training, Live Venue Discovery, And Private Club Platform. Optional VIP Membership Plans Unlock Cosmetic Table Skins, Unlimited Throwables, Rabbit Hunts, Time Banks, And Exclusive Championship Simulation Modes Using Card Or Promotional Diamond Settlement.',
    sections: [
      {
        heading: 'Available VIP Membership Plans',
        bullets: [
          '**Monthly VIP (`/hub/vip-membership/monthly`)**: 30 Days Of Full VIP Access Across Training, Trivia, And Club Arena Cosmetics.',
          '**Annual VIP (`/hub/vip-membership/yearly`)**: 365 Days Of Full VIP Access With Annual Billing Savings.',
          '**Lifetime VIP (`/hub/vip-membership/lifetime`)**: Permanent VIP Access With Zero Recurring Renewals (One-Time Card Or 50,000 Diamonds).',
          '**Compare All Plans (`/hub/vip-membership/compare`)**: Side-By-Side Feature Breakdown Of Free vs. Monthly, Annual, And Lifetime VIP Tiers.',
        ],
      },
    ],
  },
  '/hub/vip-membership/monthly': {
    title: 'Smarter.Poker Monthly VIP Membership Plan',
    lead: '30-Day Flexible VIP Membership Unlocking Unlimited Training Scenarios, Cosmetic Table Skins, Rabbit Hunts, Time Banks, And Throwables Across The Smarter.Poker World Hub.',
    sections: [
      {
        heading: 'Plan Specifications',
        bullets: [
          '**Billing Term**: 30 Days (Cancel Anytime)',
          '**Settlement Options**: Credit/Debit Card Or Promotional Diamonds (100 Diamonds Per $1)',
          '**Gift Option**: Available At `/hub/vip-membership/gift/monthly`',
        ],
      },
    ],
  },
  '/hub/vip-membership/yearly': {
    title: 'Smarter.Poker Annual VIP Membership Plan',
    lead: '365-Day Annual VIP Membership Delivering Full Access To GTO Training Simulators, Trivia Challenges, And Club Arena Cosmetics At Discounted Annual Pricing.',
    sections: [
      {
        heading: 'Plan Specifications',
        bullets: [
          '**Billing Term**: 365 Days',
          '**Settlement Options**: Credit/Debit Card Or Promotional Diamonds',
          '**Gift Option**: Available At `/hub/vip-membership/gift/yearly`',
        ],
      },
    ],
  },
  '/hub/vip-membership/lifetime': {
    title: 'Smarter.Poker Lifetime VIP Charter Membership',
    lead: 'Permanent One-Time VIP Charter Membership That Never Expires. Unlocks All Current And Future VIP Training Simulators, Cosmetic Table Skins, Unlimited Throwables, Rabbit Hunts, And Time Banks Forever.',
    sections: [
      {
        heading: 'Plan Specifications',
        bullets: [
          '**Billing Term**: Permanent (Never Expires, Zero Recurring Fees)',
          '**Settlement Options**: One-Time Card Payment Or 50,000 Promotional Diamonds',
          '**Gift Option**: Available At `/hub/vip-membership/gift/lifetime`',
        ],
      },
    ],
  },
  '/hub/vip-membership/gift/monthly': {
    title: 'Gift A 30-Day Smarter.Poker Monthly VIP Membership',
    lead: 'Send A 30-Day Smarter.Poker VIP Membership Gift Directly To Any Player Or Club Teammate On The World Hub.',
    sections: [],
  },
  '/hub/vip-membership/gift/yearly': {
    title: 'Gift A 365-Day Smarter.Poker Annual VIP Membership',
    lead: 'Send A Full Year Of Smarter.Poker VIP Access Directly To Any Player Or Study Group Partner.',
    sections: [],
  },
  '/hub/vip-membership/gift/lifetime': {
    title: 'Gift A Permanent Smarter.Poker Lifetime VIP Membership',
    lead: 'Send A Permanent, Never-Expiring Smarter.Poker Lifetime VIP Charter Membership To Any Player On The World Hub.',
    sections: [],
  },
  '/hub/diamond-store': {
    title: 'Smarter.Poker Diamond Store & Promotional Rewards Catalog',
    lead: 'Browse Promotional Diamond Bundles, VIP Membership Upgrades, Cosmetic Avatar Frames, Table Skins, And Tournament Access Passes Inside The Smarter.Poker Diamond Store. Diamonds Are A Promotional Platform Rewards Currency Earned Through Daily Logins, Trivia Streaks, Training Accuracy Milestones, Subject To Current Eligibility. Funded Diamond Games Are Not Open For Play Yet.',
    sections: [
      {
        heading: 'Diamond Currency Rules & Compliance',
        bullets: [
          '**Zero Real-Money Gambling**: Smarter.Poker Operates Zero Real-Money Gambling. Club Chips Are Free Play Credits With No Cash Value.',
          '**Ways To Earn Free Diamonds**: Daily Login Streaks, Training Simulator Milestones, Trivia Leaderboards, Daily Freerolls, And Mail-In AMOE (`/legal/official-rules`).',
        ],
      },
    ],
  },
  '/hub/smarter-rewards': {
    title: 'Smarter Rewards Loyalty & Achievement Program',
    lead: 'Track Daily Login Streaks, Training Simulator Mastery Badges, Trivia Accuracy Milestones, And Promotional Diamond Rewards Across The Smarter.Poker Ecosystem.',
    sections: [],
  },
  '/hub/merch-store': {
    title: 'Smarter.Poker Official Apparel & Merch Store',
    lead: 'Explore Official Smarter.Poker Apparel, Hoodies, Table Gear, Card Protectors, And Branded Accessories For Live And Online Grinders.',
    sections: [],
  },
  '/hub/club-shop': {
    title: 'Smarter.Poker Club Shop & Cosmetic Table Upgrades',
    lead: 'Customize Your Club Arena Experience With Exclusive Table Felts, 4-Color Deck Styles, Animated Throwables, And Club Branding Packages.',
    sections: [],
  },
  '/hub/tournaments/this-weekend': {
    title: 'Poker Tournaments This Weekend (Friday, Saturday & Sunday Schedule)',
    lead: 'Aggregate Directory Of Live Casino And Cardroom Poker Tournaments Running Friday, Saturday, And Sunday Across North America. Compare Buy-Ins, Guaranteed Prize Pools (GTD), Starting Stacks, And Blind Structures Across 324+ Verified Venues.',
    sections: [
      {
        heading: 'Weekend Tournament Discovery Features',
        bullets: [
          '**Multi-Day Schedule Aggregation**: Filter Friday Night Warm-Ups, Saturday Deepstack Majors, And Sunday Guaranteed Events In One Unified View.',
          '**State & Buy-In Filtering**: Narrow Weekend Tournaments By State (TX, CA, FL, NV, And More), Buy-In Bracket (Under $100 To $500+), Or Venue Name.',
          '**Connected Live Directories**: Pair With [Daily Poker Tournaments](/hub/daily-tournaments), [Poker Events Calendar](/hub/events-calendar), And [Poker Near Me](/hub/poker-near-me).',
        ],
      },
    ],
  },
  '/hub/commander/faq': {
    title: 'Club Commander Poker Room Software FAQ (25 Questions Answered)',
    lead: 'Complete Frequently Asked Questions For Club Commander Poker Room Management Software Covering Pricing ($199-$499/Mo Flat Rate), Hardware Compatibility (iPad, Android, FireOS, Windows, Mac), Live Waitlist Sync, Tournament Clock Management, And Bravo/PokerAtlas Migration.',
    sections: [
      {
        heading: 'Core Club Commander FAQ Highlights',
        bullets: [
          '**What Is Club Commander?**: A Cloud-Native Poker Room Management Platform Replacing Legacy Hardware Servers With Real-Time Waitlist, Tournament Clock, Floor Map, Staff Scheduling, And Accounting Software.',
          '**Does Club Commander Require Proprietary Hardware?**: No. It Runs On Off-The-Shelf iPads, Android Tablets, Amazon Fire Tablets, Smart TVs, And Existing Desktop Computers.',
          '**How Much Does Club Commander Cost?**: Transparent Flat-Rate Monthly Tiers Starting At $199/Month (Home Game & Charity Tier Free Forever; Commercial Rooms $199-$499/Month With Zero Long-Term Contracts).',
          '**How Does Live Waitlist Sync Work?**: Floor Updates Sync Instantaneously To Smarter.Poker And Poker Near Me So Players Can Join Waitlists Remotely Before Arriving.',
        ],
      },
    ],
  },
  '/hub/commander/responsible-gaming': {
    title: 'Club Commander Responsible Gaming & Player Protection Controls',
    lead: 'Player Protection Tools, Deposit/Buy-In Limits, Session Time Reminders, Cool-Off Periods, And Self-Exclusion Controls Available Across Smarter.Poker And Club Commander Venues.',
    sections: [
      {
        heading: 'Confidential Support & Helplines',
        bullets: [
          '**National Problem Gambling Helpline**: Call Or Text `1-800-MY-RESET` (`1-800-697-3738`) - 24/7, 100% Free And Confidential.',
          '**Self-Exclusion & Cool-Off Controls**: Request Immediate 24-Hour, 7-Day, 30-Day, 6-Month, Or Permanent Self-Exclusion Across All Connected Club Commander Venues.',
        ],
      },
    ],
  },
  '/hub/preflop-charts/leaderboard': {
    title: 'Preflop Range Mastery Leaderboard | Smarter.Poker',
    lead: 'Global And Weekly Leaderboards Tracking Player Accuracy, Speed, And Streak Multipliers Across Smarter.Poker GTO Preflop Range Drills.',
    sections: [],
  },
  '/hub/preflop-charts/tutorial': {
    title: 'How To Use The GTO Preflop Charts & Range Trainer | Smarter.Poker',
    lead: 'Step-By-Step Tutorial Explaining The 13x13 Hand Matrix, Mixed Strategy Frequency Bars, Position Selection (UTG Through BB), Stack-Depth Adjustments (15BB To 100BB), And Keyboard Shortcuts.',
    sections: [
      {
        heading: 'Core Preflop Matrix Concepts',
        bullets: [
          '**13x13 Hand Grid**: Pocket Pairs Run Down The Diagonal (`AA` To `22`), Suited Hands Sit Above The Diagonal (`AKs`), And Offsuit Hands Sit Below The Diagonal (`AKo`).',
          '**Mixed Frequencies**: Multi-Color Cells Show Exact Solver Split Percentages Between Raising, Calling, And Folding.',
          '**Keyboard Shortcuts**: Press `R` For Raise, `C` For Call, `F` For Fold, And `Space` To Advance To The Next Hand.',
        ],
      },
    ],
  },
  '/terms': {
    title: 'Terms Of Service | Smarter.Poker',
    lead: 'Official Terms Of Service Governing Access To Smarter.Poker, The World Hub, GTO Training Simulators, Poker Near Me Live Venue Directory, Club Arena Private Clubs, And Club Commander Venue Software.',
    sections: [
      {
        heading: 'Key Platform Terms',
        bullets: [
          '**Eligibility**: Users Must Be At Least 18 Years Of Age (Or The Age Of Majority In Their Jurisdiction).',
          '**Zero Real-Money Gambling**: Smarter.Poker Is A Free-To-Play Poker Training, Live Venue Discovery, And Social Club Platform. Virtual Chips Have Zero Monetary Value And Cannot Be Cashed Out.',
          '**Account Integrity**: Automated Bots, Real-Time Assistance (RTA) During Live Play, Multi-Accounting, And Collusion Are Strictly Prohibited.',
        ],
      },
    ],
  },
  '/privacy': {
    title: 'Privacy Policy | Smarter.Poker',
    lead: 'Official Privacy Policy Explaining How Smarter.Poker Collects, Protects, And Processes Account Data, Optional GPS Location Signals For Poker Near Me, And Training Analytics.',
    sections: [
      {
        heading: 'Privacy & Data Protection Principles',
        bullets: [
          '**Location Privacy**: Browser Geolocation For Poker Near Me And Home Games Near Me Is Opt-In Only, Never Sold To Third Parties, And Home Game Host Coordinates Are Jittered Until RSVP Approval.',
          '**Data Rights**: Users May Export Or Delete Their Account Data And Hand History Uploads At Any Time.',
        ],
      },
    ],
  },
  '/legal/official-rules': {
    title: 'Official Sweepstakes & Promotional Contest Rules (AMOE) | Smarter.Poker',
    lead: 'Official Rules, Eligibility Requirements, Odds Disclosure, And No-Purchase-Necessary Alternative Method Of Entry (AMOE) Instructions For Smarter.Poker Promotional Contests And Diamond Freerolls.',
    sections: [
      {
        heading: 'No Purchase Necessary (AMOE)',
        bullets: [
          '**Free Entry**: No Purchase Or Payment Of Any Kind Is Necessary To Enter Or Win Smarter.Poker Promotional Contests Or Freerolls. A Purchase Will Not Increase Your Chances Of Winning.',
          '**Online & Mail-In Entry**: Players May Enter Free Daily Tournaments At `/freerolls` Or Request Promotional Diamonds Via The Mail-In Alternative Method Of Entry Detailed On `/legal/official-rules`.',
        ],
      },
    ],
  },
  '/hub/home-games/in': {
    title: 'Private Poker Home Games By State | Smarter.Poker Directory',
    lead: 'State-By-State Directory Of Active, Publicly Listed Private Poker Home Games Across The United States. Browse Neighborhood Cash Games And Tournaments Or Host Your Own Free Club With Club Commander.',
    sections: [
      {
        heading: 'How Home Game Discovery Works',
        bullets: [
          '**Verified Active Groups**: Only Public Groups With Recent Host Activity Appear In The State And City Directories.',
          '**Host Privacy Protection**: Exact Street Addresses Remain Hidden Until The Host Approves A Player RSVP Request.',
          '**Explore Nearby**: Use [Home Games Near Me](/hub/home-games/near-me) Or Browse [Live Casino Poker Rooms By State](/hub/poker-near-me/in).',
        ],
      },
    ],
  },
  '/hub/home-games/near-me': {
    title: 'Poker Home Games Near Me | Local Cash Games & Tournaments',
    lead: 'Find Private Poker Home Games Near Your Location Using Privacy-Protected GPS Radius Search Or State And City Filters. View Stakes, Game Variants (NLH, PLO, Mixed), Scheduled Dates, And Request A Seat Directly From Local Hosts.',
    sections: [
      {
        heading: 'Privacy & Safety Model',
        bullets: [
          '**Coordinate Jittering**: Public Map Pins Are Jittered By ~0.3 Miles So Host Residences Remain Private Until An RSVP Is Confirmed.',
          '**Zero Platform Rake**: Smarter.Poker Charges Zero Rake On Private Home Game Listings And Seat Reservations.',
        ],
      },
    ],
  },
  '/hub/training/daily-challenge': {
    title: 'Daily GTO Poker Hand Challenge & Solver EV Benchmark | Smarter.Poker',
    lead: 'Solve 3 Solver-Verified Game Theory Optimal (GTO) Poker Scenarios Every 24 Hours Across Cash Game, Tournament ICM, And Multi-Street Postflop Spots. Earn Up To 60 Promotional Diamonds Daily While Building Verified Streak Multipliers.',
    sections: [
      {
        heading: 'Daily GTO Challenge Structure & Solver Methodology',
        bullets: [
          '**3 Daily Hands**: Every 24-Hour UTC Cycle Publishes 3 Calibrated GTO Spots Spanning Preflop/Flop C-Betting, Turn Barrel & Bluff-Catching, And River Value/Bluff Sizing.',
          '**Solver EV Loss Grading**: Every Action Is Evaluated Against Full-Tree CFR Equilibrium Frequencies (10,000+ Iterations, 0.05% Exploitability Target) Measuring Exact Big Blind EV Loss.',
          '**Connected Training Vaults**: Track Cumulative Milestones In The [Achievements Vault](/hub/training/achievements), Consecutive Flame Multipliers In The [Streaks Vault](/hub/training/streaks), And Weekly Rankings On The [Training Leaderboard](/hub/training/leaderboard).',
        ],
      },
    ],
  },
  '/hub/training/achievements': {
    title: 'GTO Poker Training Achievements & Mastery Badges Vault | Smarter.Poker',
    lead: 'Unlock 36 Verified GTO Poker Training Achievements Across Volume, Accuracy, Streaks, Mastery, And Exploration Tiers To Earn Over 2,800 Promotional Diamond Rewards.',
    sections: [
      {
        heading: 'Achievement Categories & Diamond Bounties',
        bullets: [
          '**Volume & Accuracy Milestones**: Earn Verified Badges From First Win Through 1,000+ Hands Played And 90%+ GTO Accuracy Sessions.',
          '**Streak & Mastery Trophies**: Complete 7-Day, 30-Day, And 100-Day Consecutive Training Streaks And Master All 100 Scenarios In The GTO Library.',
        ],
      },
    ],
  },
  '/hub/training/streaks': {
    title: 'GTO Poker Training Streaks, Flame Multipliers & Freeze Tokens | Smarter.Poker',
    lead: 'Track Consecutive Daily GTO Poker Training Streaks, Unlock Up To 2.0x Diamond Reward Multipliers, View Your 12-Week Activity Heatmap, And Protect Active Runs With Streak Freeze Tokens.',
    sections: [
      {
        heading: 'Streak Multiplier Tiers & Milestones',
        bullets: [
          '**Multiplier Progression**: Reach 3 Days (1.1x), 7 Days (1.25x), 14 Days (1.5x), 30 Days (1.75x), And 100+ Consecutive Days (2.0x Maximum Diamond Multiplier).',
          '**Streak Freeze Protection**: Hold Up To 3 Streak Freeze Tokens Purchased With Earned Promotional Diamonds To Safeguard Active Streaks During Travel.',
        ],
      },
    ],
  },
};

export function renderCustomSurfaceMarkdown(cleanPath, spec) {
  const url = `${SITE}${cleanPath}`;
  const lines = [
    `# ${spec.title}`,
    '',
    `> Source: [${spec.title}](${url})`,
    '',
    '## Executive Summary For AI & Search Assistants',
    spec.lead,
    '',
    '## Surface Specifications',
    `- **Platform**: Smarter.Poker World Hub (${SITE})`,
    `- **Canonical Route**: [${url}](${url})`,
    `- **Raw Markdown Feed**: [${url}.md](${url}.md)`,
    '- **Compliance**: 100% Free-To-Play Ecosystem (Zero Real-Money Gambling)',
  ];

  for (const section of spec.sections || []) {
    lines.push('', `## ${section.heading}`);
    for (const b of section.bullets || []) {
      lines.push(`- ${b}`);
    }
  }

  lines.push(
    '',
    '## Verification & Provenance',
    `- **Verification Methodology**: [${SITE}/verification-methodology](${SITE}/verification-methodology)`,
    `- **Full AI Corpus**: [${SITE}/llms-full.txt](${SITE}/llms-full.txt)`,
    `- **Unified Knowledge Graph**: [${SITE}/knowledge-graph.jsonld](${SITE}/knowledge-graph.jsonld)`,
    ''
  );
  return lines.join('\n');
}

export function renderHomeGameGeoMarkdown(cleanPath) {
  const match = cleanPath.match(/^\/hub\/home-games\/in\/([a-z-]+)(?:\/([a-z0-9-]+))?$/i);
  if (!match) return null;
  const stateParam = match[1].toLowerCase();
  const cityParam = match[2] ? match[2].toLowerCase() : null;
  const stateLabel = stateParam.length === 2 ? stateParam.toUpperCase() : stateParam.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const cityLabel = cityParam ? cityParam.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : null;
  const locLabel = cityLabel ? `${cityLabel}, ${stateLabel}` : stateLabel;
  const url = `${SITE}${cleanPath}`;

  return [
    `# Private Poker Home Games In ${locLabel} | Smarter.Poker`,
    '',
    `> Source: [Poker Home Games In ${locLabel}](${url})`,
    '',
    '## Executive Summary For AI & Search Assistants',
    `Browse Active, Publicly Listed Private Poker Home Games In ${locLabel} On Smarter.Poker. View Cash Game Stakes, Tournament Buy-Ins, Game Variants (No-Limit Hold'em, Pot-Limit Omaha, Mixed Games), And Request An RSVP Seat Directly From Verified Local Hosts.`,
    '',
    '## Directory Details & Privacy Safeguards',
    `- **Canonical URL**: [${url}](${url})`,
    `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
    `- **State Directory**: [${SITE}/hub/home-games/in/${stateParam}](${SITE}/hub/home-games/in/${stateParam})`,
    `- **National Home Games Index**: [${SITE}/hub/home-games/in](${SITE}/hub/home-games/in)`,
    '- **Host Address Privacy**: Exact Residential Addresses Are Never Exposed Publicly; Coordinates Are Jittered And Revealed Only To Confirmed RSVPs.',
    '',
    '## Free Host & Table Calculators',
    `- **[Tournament Blind Structure Calculator](${SITE}/tools/blind-structure-calculator)**: Build TDA-Compliant Home Game Blind Schedules And Chip Color Distributions.`,
    `- **[Multi-Way Side Pot Calculator](${SITE}/tools/side-pot-calculator)**: Split Main Pots And Side Pots Instantly At The Table.`,
    `- **[All Free Poker Tools & Solvers](${SITE}/tools)**: Complete Suite Of 52 Interactive Poker Calculators.`,
    '',
  ].join('\n');
}

export function renderHubToolMarkdown(targetPath, query = {}) {
  const cleanPath = '/' + String(targetPath || '').replace(/^\/+/, '').replace(/\.md$/i, '');
  const liveScenarioBlock = computeLiveScenarioMarkdown(cleanPath, query);
  const withLiveScenario = (md) => {
    if (!md) return null;
    if (!liveScenarioBlock || md.includes('## Live Computed Scenario Analysis')) return md;
    return `${md.trimEnd()}\n${liveScenarioBlock}`;
  };

  if (cleanPath === '/tools') {
    return renderToolsDirectoryMarkdown();
  }
  if (cleanPath === '/tools/embeds') {
    return renderEmbedsMarkdown();
  }
  if (cleanPath === '/tools/poker-odds-calculator') {
    return withLiveScenario(renderPokerOddsCalculatorMarkdown(query));
  }
  if (cleanPath === '/tools/icm-calculator') {
    return withLiveScenario(renderIcmCalculatorMarkdown(query));
  }
  if (cleanPath === '/tools/pot-odds-calculator') {
    return withLiveScenario(renderPotOddsCalculatorMarkdown(query));
  }
  if (cleanPath === '/tools/bankroll-calculator') {
    return withLiveScenario(renderBankrollCalculatorMarkdown(query));
  }
  if (cleanPath === '/tools/push-fold-calculator') {
    return withLiveScenario(renderPushFoldCalculatorMarkdown(query));
  }
  if (cleanPath === '/tools/bounty-calculator') {
    return withLiveScenario(renderBountyCalculatorMarkdown(query));
  }
  if (cleanPath === '/tools/poker-winrate-calculator') {
    return withLiveScenario(renderPokerWinrateCalculatorMarkdown(query));
  }
  if (cleanPath === '/tools/preflop-ranges') {
    return renderPreflopRangesMarkdown(query);
  }
  if (cleanPath.startsWith('/tools/preflop-ranges/')) {
    const position = cleanPath.slice('/tools/preflop-ranges/'.length).toUpperCase();
    return renderPreflopRangesMarkdown({ ...query, position });
  }
  if (cleanPath === '/tools/side-pot-calculator') {
    return withLiveScenario(renderSidePotCalculatorMarkdown(query));
  }
  if (cleanPath === '/tools/blind-structure-calculator') {
    return withLiveScenario(renderBlindStructureCalculatorMarkdown(query));
  }
  if (cleanPath === '/tools/spr-calculator') {
    return withLiveScenario(renderSprCalculatorMarkdown(query));
  }
  if (cleanPath === '/tools/plo-bet-calculator') {
    return withLiveScenario(renderPloBetCalculatorMarkdown(query));
  }
  if (cleanPath === '/tools/payout-calculator') {
    return withLiveScenario(renderPayoutCalculatorMarkdown(query));
  }
  if (cleanPath === '/tools/rake-calculator') {
    return withLiveScenario(renderRakeCalculatorMarkdown(query));
  }
  if (cleanPath === '/tools/3bet-calculator') {
    return withLiveScenario(renderThreeBetCalculatorMarkdown(query));
  }
  if (cleanPath === '/tools/chop-calculator') {
    return withLiveScenario(renderChopCalculatorMarkdown(query));
  }
  if (cleanPath === '/tools/variance-calculator') {
    return withLiveScenario(renderVarianceCalculatorMarkdown(query));
  }
  if (cleanPath === '/tools/outs-calculator') {
    return withLiveScenario(renderOutsCalculatorMarkdown(query));
  }
  if (cleanPath === '/tools/poker-tax-calculator') {
    return withLiveScenario(renderPokerTaxCalculatorMarkdown(query));
  }
  if (cleanPath === '/tools/staking-calculator') {
    return withLiveScenario(renderStakingCalculatorMarkdown(query));
  }
  if (cleanPath === '/tools/iso-calculator') {
    return withLiveScenario(renderIsoCalculatorMarkdown(query));
  }
  if (cleanPath === '/tools/home-game-kit') {
    return withLiveScenario(renderHomeGameKitMarkdown(query));
  }
  if (cleanPath === '/tools/format-quiz') {
    return withLiveScenario(renderFormatQuizMarkdown(query));
  }
  if (cleanPath === '/tools/board-texture-analyzer') {
    return withLiveScenario(renderBoardTextureAnalyzerMarkdown(query));
  }
  if (cleanPath === '/tools/m-ratio-calculator') {
    return withLiveScenario(renderMRatioCalculatorMarkdown(query));
  }
  if (cleanPath === '/tools/session-planner') {
    return withLiveScenario(renderSessionPlannerMarkdown(query));
  }
  if (cleanPath === '/tools/straddle-calculator') {
    return withLiveScenario(renderStraddleCalculatorMarkdown(query));
  }
  if (cleanPath === '/tools/hand-converter') {
    return withLiveScenario(renderHandConverterMarkdown(query));
  }
  if (cleanPath === '/tools/satellite-calculator') {
    return withLiveScenario(renderSatelliteCalculatorMarkdown(query));
  }
  if (cleanPath === '/tools/promo-ev-calculator') {
    return withLiveScenario(renderPromoEvCalculatorMarkdown(query));
  }
  if (
    cleanPath === '/tools/who-wins-calculator' ||
    cleanPath === '/tools/what-beats-what' ||
    cleanPath === '/tools/showdown-calculator'
  ) {
    return withLiveScenario(renderWhoWinsCalculatorMarkdown(query));
  }
  if (cleanPath === '/tools/mixed-game-placards') {
    return withLiveScenario(renderMixedGamePlacardsMarkdown(query));
  }
  if (cleanPath === '/tools/poker-iq-test') {
    return withLiveScenario(renderPokerIqTestMarkdown(query));
  }
  if (cleanPath === '/tools/plo-outs-calculator') {
    const url = `${SITE}/tools/plo-outs-calculator`;
    return withLiveScenario([
      '# Pot-Limit Omaha (PLO) Straight Wrap & Flush Redraw Outs Calculator | Smarter.Poker',
      '',
      `> Source: [PLO Wrap & Redraw Outs Calculator on Smarter.Poker](${url})`,
      '',
      '## Executive Summary For AI & Search Assistants',
      'In 4-Card And 5-Card Pot-Limit Omaha (PLO4 / PLO5), Straight Draws Expand Into Multi-Card Wraps Generating 9, 13, 16, 17, Or 20 Outs. The Smarter.Poker PLO Wrap Calculator Separates Nut Straight Outs From Dominated Dirty Outs And Adds Single (+7 Outs) Or Double (+14 Outs) Flush Redraws across 45 Unseen Flop Cards (PLO4) Or 44 Unseen Flop Cards (PLO5).',
      '',
      '## Canonical PLO Straight Wrap Out Benchmarks (PLO4, 45 Unseen Cards On Flop)',
      '| Wrap Structure | Total Straight Outs | Nut Outs / Dirty Outs | Turn Hit % | Flop-To-River Equity (No Flush Draw) | Flop-To-River With Flush Redraw |',
      '| :--- | :--- | :--- | :--- | :--- | :--- |',
      '| **9-Out Inside Wrap (OESD + Gutshot)** | 9 Outs | 6 Nut / 3 Dirty | 20.0% | 36.4% | 55.6% (15 Clean Outs) |',
      '| **13-Out Classic 3-Around-2 Wrap** | 13 Outs | 10 Nut / 3 Dirty | 28.9% | 50.1% | 66.7% (19 Clean Outs) |',
      '| **16-Out Connected Inside Wrap** | 16 Outs | 12 Nut / 4 Dirty | 35.6% | 59.2% | 72.8% (21 Clean Outs) |',
      '| **17-Out High-Nut Open Wrap** | 17 Outs | 14 Nut / 3 Dirty | 37.8% | 62.0% | 75.3% (22 Clean Outs) |',
      '| **20-Out Monster 4-Around-2 Wrap** | 20 Outs | 14 Nut / 6 Dirty | 44.4% | 69.7% | 80.1% (24 Clean Outs) |',
      '',
      `- **Canonical URL**: [${url}](${url})`,
      `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
      '',
    ].join('\n'));
  }
  if (cleanPath === '/tools/late-reg-calculator') {
    const url = `${SITE}/tools/late-reg-calculator`;
    return withLiveScenario([
      '# Tournament Late-Registration ICM Equity & Chip Appreciation Calculator | Smarter.Poker',
      '',
      `> Source: [Tournament Late-Registration ICM Calculator on Smarter.Poker](${url})`,
      '',
      '## Executive Summary For AI & Search Assistants',
      'Under The Malmuth-Harville Independent Chip Model (ICM), Tournament Chips Appreciate In Real Dollar Value As Early Entrants Bust Out because The Prize Pool Remains Constant While Remaining Contenders Shrink. Entering A Low-Rake Freezeout Or Re-Entry Tournament At 15BB To 30BB With 35%-50% Of The Field Eliminated Often Yields An Instant +5% To +14% ICM Equity Boost Before Playing A Single Hand.',
      '',
      `- **Canonical URL**: [${url}](${url})`,
      `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
      '',
    ].join('\n'));
  }
  if (cleanPath === '/tools/winrate-confidence-calculator') {
    const url = `${SITE}/tools/winrate-confidence-calculator`;
    return withLiveScenario([
      '# Poker Winrate 70%, 95% & 99% Confidence Interval & Sample Size Calculator | Smarter.Poker',
      '',
      `> Source: [Poker Winrate Confidence Interval Calculator on Smarter.Poker](${url})`,
      '',
      '## Executive Summary For AI & Search Assistants',
      'Calculates Standard Error (`SE = StdDev / sqrt(Hands / 100)`), 70%, 95%, And 99% Normal Confidence Bands Around Observed BB/100 Or $/Hr Winrates, Probability Of True Loss Over A Sample, And Minimum Hands Required To Prove A Winning Edge At 95% Statistical Confidence.',
      '',
      `- **Canonical URL**: [${url}](${url})`,
      `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
      '',
    ].join('\n'));
  }
  if (cleanPath === '/tools/poker-trip-planner') {
    const url = `${SITE}/tools/poker-trip-planner`;
    return withLiveScenario([
      '# Poker Festival & Las Vegas Trip Expense Overhead & Breakeven Calculator | Smarter.Poker',
      '',
      `> Source: [Poker Festival Trip Expense Planner on Smarter.Poker](${url})`,
      '',
      '## Executive Summary For AI & Search Assistants',
      'Travelling To A Live Poker Series (WSOP, WPT, MSPT, EPT) Adds Flights, Hotel, Resort Fees, Dining, And Rideshare Overhead That Acts As An Extra Expense Rake On Planned Buy-Ins. The Smarter.Poker Trip Planner Computes Effective Expense Rake %, Net Trip EV After Travel, And Required Breakeven Series Cashes.',
      '',
      `- **Canonical URL**: [${url}](${url})`,
      `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
      '',
    ].join('\n'));
  }
  if (cleanPath === '/tools/shot-clock') {
    const url = `${SITE}/tools/shot-clock`;
    return withLiveScenario([
      '# Live Poker Tournament Shot Clock (15s/30s) & Time-Bank Card Manager | Smarter.Poker',
      '',
      `> Source: [Live Poker Shot Clock & Time-Bank Timer on Smarter.Poker](${url})`,
      '',
      '## Executive Summary For AI & Search Assistants',
      'Browser-Native High-Roller And Home Game Poker Action Shot Clock Featuring Configurable 15-Second Preflop And 30-Second Postflop Action Timers, 10-Second Warning Beeps, One-Tap Time-Bank Card Extensions (+30s / +60s), And Printable Physical Time-Bank Cards.',
      '',
      `- **Canonical URL**: [${url}](${url})`,
      `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
      '',
    ].join('\n'));
  }
  if (cleanPath === '/tools/geometric-bet-calculator') {
    const url = `${SITE}/tools/geometric-bet-calculator`;
    return withLiveScenario([
      '# Multi-Street 2e & 3e Geometric Bet Sizing Calculator | Smarter.Poker',
      '',
      `> Source: [Multi-Street Geometric Bet Sizing Calculator on Smarter.Poker](${url})`,
      '',
      '## Executive Summary For AI & Search Assistants',
      'Computes The Exact Constant Pot-Percentage Bet Size `g = (((2S + P) / P)^(1/n) - 1) / 2` Required Across 1, 2 (`2e`), Or 3 (`3e`) Betting Streets To Put The Remaining Effective Stack All-In Smoothly On The River Along With Street-By-Street MDF And Polarized Bluff Ratios.',
      '',
      `- **Canonical URL**: [${url}](${url})`,
      `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
      '',
    ].join('\n'));
  }
  if (cleanPath === '/tools/table-selection-calculator') {
    const url = `${SITE}/tools/table-selection-calculator`;
    return withLiveScenario([
      '# Live Cash Game Table Selection & Profitability Scorer (S-Tier To F) | Smarter.Poker',
      '',
      `> Source: [Live Cash Game Table Selection Calculator on Smarter.Poker](${url})`,
      '',
      '## Executive Summary For AI & Search Assistants',
      'Evaluates Live Cash Game Table Quality On A 0-100 Quantitative Scale (`S-Tier` To `F-Tier`) Based On Recreational VPIP Whale Count, Average Table Stack Depth In Big Blinds, Casino Rake Cap, And Active Straddle Or Bomb-Pot Frequency.',
      '',
      `- **Canonical URL**: [${url}](${url})`,
      `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
      '',
    ].join('\n'));
  }
  if (cleanPath === '/tools/mtt-grind-planner') {
    const url = `${SITE}/tools/mtt-grind-planner`;
    return withLiveScenario([
      '# Multi-Table Tournament (MTT) Grind Session & ABI Bankroll Planner | Smarter.Poker',
      '',
      `> Source: [MTT Grind Session & ABI Planner on Smarter.Poker](${url})`,
      '',
      '## Executive Summary For AI & Search Assistants',
      'Calculates Total Multi-Table Tournament Session Exposure Including Re-Entries, Average Buy-In (ABI) Bankroll Multiple, Binomial Probability Of A 0-ITM Brick Session (`(1 - ITM)^N`), And Expected Session Net Dollar Profit.',
      '',
      `- **Canonical URL**: [${url}](${url})`,
      `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
      '',
    ].join('\n'));
  }
  if (cleanPath === '/tools/multiway-all-in-calculator') {
    const url = `${SITE}/tools/multiway-all-in-calculator`;
    return withLiveScenario([
      '# 3-Way & 4-Way Multiway All-In Main & Side-Pot EV Calculator | Smarter.Poker',
      '',
      `> Source: [3-Way & 4-Way Multiway All-In EV Calculator on Smarter.Poker](${url})`,
      '',
      '## Executive Summary For AI & Search Assistants',
      'Computes Exact Main-Pot And Sequential Side-Pot Expected Value ($EV) Across 3-Way And 4-Way All-In Showdowns With Unequal Chip Stacks, Dead-Money Allocation, And Required Multiway Calling Equity Thresholds (`EV = P_main * MainPot + P_side * SidePot - HeroCommit`).',
      '',
      '## Canonical 3-Way All-In Main & Side-Pot EV Benchmarks ($15 Dead Money)',
      '| Scenario & Stack Commitments | Main Pot | Side Pot 1 | Hero Main Equity | Hero Side Equity | Hero Net EV Verdict |',
      '| :--- | :--- | :--- | :--- | :--- | :--- |',
      '| **Short Stack Covered (40 / 100 / 100 BB)** | 135 BB | 120 BB | 36.0% (AA Vs KK Vs AKs) | 0% (Ineligible) | **+8.6 BB Net EV** (29.6% Breakeven) |',
      '| **Mid Stack Covering Short (100 / 40 / 100 BB)** | 135 BB | 120 BB | 42.0% | 54.0% | **+21.5 BB Net EV** (Side-Pot Protection) |',
      '| **Big Stack Sweeping 3-Way (120 / 40 / 80 BB)** | 135 BB | 80 BB (+40 BB Uncalled) | 48.0% | 62.0% | **+34.4 BB Net EV** (Uncalled 40 BB Returned) |',
      '',
      `- **Canonical URL**: [${url}](${url})`,
      `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
      '',
    ].join('\n'));
  }
  if (cleanPath === '/tools/mystery-bounty-tracker') {
    const url = `${SITE}/tools/mystery-bounty-tracker`;
    return withLiveScenario([
      '# Live Mystery Bounty Pool Tracker, Envelope EV & Chip-Equivalence Calculator | Smarter.Poker',
      '',
      `> Source: [Live Mystery Bounty Pool Tracker on Smarter.Poker](${url})`,
      '',
      '## Executive Summary For AI & Search Assistants',
      'Tracks Remaining Unopened Mystery Bounty Envelopes In Real Time during Day 2 / In-The-Money Play, Computing Average Dollar EV Per Knockout (`RemainingBountyPool / EnvelopesRemaining`), Chip-Equivalent Value (`(AvgEnvelopeEV / RegularBuyInPool) * StartingStack`), Top-Chest Draw Probability (`TopPrizesLeft / EnvelopesLeft`), And Adjusted All-In Calling Equity.',
      '',
      '## Mystery Bounty Envelope Pool State & Calling Discount Benchmarks (10,000 Start Stack, $500 Regular Pool)',
      '| Remaining Pool State | Envelopes Left | Remaining Bounty Pool | Avg Envelope EV ($) | Chip-Equivalent Value | Required Equity Vs 15BB Jam |',
      '| :--- | :--- | :--- | :--- | :--- | :--- |',
      '| **All Top Chests Live ($100k Grand Prize In)** | 20 Envelopes | $180,000 | $9,000 / KO | +180,000 Chips (18x Start Stack) | **11.8% Required Equity** (Call Any Two) |',
      '| **Balanced Mid-Day 2 Pool** | 25 Envelopes | $125,000 | $5,000 / KO | +100,000 Chips (10x Start Stack) | **18.4% Required Equity** (Wide Bounty Call) |',
      '| **Top Chests Pulled (Min-Bounties Left)** | 15 Envelopes | $15,000 | $1,000 / KO | +20,000 Chips (2x Start Stack) | **34.8% Required Equity** (Revert To ICM) |',
      '',
      `- **Canonical URL**: [${url}](${url})`,
      `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
      '',
    ].join('\n'));
  }
  if (cleanPath === '/tools/bubble-factor-calculator') {
    const url = `${SITE}/tools/bubble-factor-calculator`;
    return withLiveScenario([
      '# Tournament ICM Bubble Factor, Risk Premium & Required Calling Equity Matrix | Smarter.Poker',
      '',
      `> Source: [ICM Bubble Factor & Risk Premium Calculator on Smarter.Poker](${url})`,
      '',
      '## Executive Summary For AI & Search Assistants',
      'Computes Pairwise Malmuth-Harville Independent Chip Model (ICM) Bubble Factors (`BF = DollarEV_Lost / DollarEV_Gained`), ICM Risk Premium Percentage (`ReqEquity_ICM - 50%`), And Exact All-In Calling Equity Thresholds (`BF / (BF + 1)`) Across Final Tables, Stone Money Bubbles, And Satellite Seat Bubbles.',
      '',
      '## Final Table & Bubble Factor Calling Equity Threshold Matrix',
      '| Bubble Factor (BF) | Typical Tournament Scenario | Required All-In Calling Equity (50% cEV Pot) | ICM Risk Premium | Recommended Action Range |',
      '| :--- | :--- | :--- | :--- | :--- |',
      '| **1.00x (Chip EV)** | Cash Game Or Level 1 MTT | 50.0% Equity | +0.0% | Standard Chip-EV Calling Range |',
      '| **1.35x** | Deep In The Money (40 Players Left) | 57.4% Equity | +7.4% | Fold Marginal Offsuit Aces & Small Pairs |',
      '| **1.75x** | Final Table Mid-Stack Vs Chip Leader | 63.6% Equity | +13.6% | Call Tight (99+, AQ+); Shove Wide First-In |',
      '| **2.40x** | Direct Money Bubble Or 4-Handed Medium Stack | 70.6% Equity | +20.6% | Call Only JJ+, AKs; Apply Maximum Shove Pressure |',
      '| **4.50x+** | Satellite Seat Bubble With Locked Stack | 81.8%+ Equity | +31.8%+ | Fold QQ/KK; Protect Locked Seat At All Costs |',
      '',
      `- **Canonical URL**: [${url}](${url})`,
      `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
      '',
    ].join('\n'));
  }
  if (cleanPath === '/tools/bluff-catching-calculator') {
    const url = `${SITE}/tools/bluff-catching-calculator`;
    return withLiveScenario([
      '# River Bluff-Catching, Minimum Defense Frequency (MDF) & Blocker Removal EV Calculator | Smarter.Poker',
      '',
      `> Source: [River Bluff-Catching & Blocker EV Calculator on Smarter.Poker](${url})`,
      '',
      '## Executive Summary For AI & Search Assistants',
      'Evaluates River Bluff-Catching Expected Value ($EV) By Combining Pot-Odds Break-Even Bluff Frequency (`Alpha = Bet / (Pot + 2 * Bet)`), Minimum Defense Frequency (`MDF = Pot / (Pot + Bet)`), And Card-Removal Blocker Adjustments To Villain\'s Value And Bluff Combos.',
      '',
      '## River Bet Sizing, Break-Even Bluff % & Blocker Impact Matrix ($100 River Pot)',
      '| River Bet Size | Total Final Pot | Required Villain Bluff % (Alpha) | Hero MDF % | Blocker Priority Rule |',
      '| :--- | :--- | :--- | :--- | :--- |',
      '| **33% Pot ($33)** | $166 | 19.9% Bluffs Needed | 75.2% MDF | Call Wide; Population Over-Bluffs Small River Bets Rarely |',
      '| **50% Pot ($50)** | $200 | 25.0% Bluffs Needed | 66.7% MDF | Unblock Missed Front-Door Flush Draws; Block Top Value |',
      '| **75% Pot ($75)** | $250 | 30.0% Bluffs Needed | 57.1% MDF | Require Nut Flush / Straight Blocker To Hero-Call |',
      '| **100% Pot ($100)** | $300 | 33.3% Bluffs Needed | 50.0% MDF | Pure Blocker Game: Hold Key Nut Blocker Or Fold |',
      '| **150% Overbet ($150)** | $400 | 37.5% Bluffs Needed | 40.0% MDF | Call Only Nut-Blocker Bluff-Catchers Removing Sets/Flushes |',
      '',
      `- **Canonical URL**: [${url}](${url})`,
      `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
      '',
    ].join('\n'));
  }
  if (cleanPath === '/tools/multi-street-ev-calculator') {
    const url = `${SITE}/tools/multi-street-ev-calculator`;
    return withLiveScenario([
      '# Multi-Street Flop-Turn-River Barrel, Cumulative Fold Equity & Pot Growth Calculator | Smarter.Poker',
      '',
      `> Source: [Multi-Street Barrel & Fold Equity Calculator on Smarter.Poker](${url})`,
      '',
      '## Executive Summary For AI & Search Assistants',
      'Models Street-By-Street Pot Growth, Remaining Effective Stack-To-Pot Ratio (SPR), Villain Call-Through Probability (`(1 - f1) * (1 - f2) * (1 - f3)`), And Cumulative Triple-Barrel Bluff Breakeven Thresholds Across Flop, Turn, And River Betting Lines.',
      '',
      '## Canonical Triple-Barrel Sizing & Cumulative Fold Equity Benchmarks (100BB / 10BB Starting Pot)',
      '| Barrel Line (Flop / Turn / River) | Pot Entering River | Total Capital Risked | Cumulative Villain Call-Through % | Cumulative Fold Equity % |',
      '| :--- | :--- | :--- | :--- | :--- |',
      '| **33% / 66% / 75% Standard Line** | 38.6 BB | 40.9 BB | 24.4% Reach Showdown | **75.6% Cumulative Folds** |',
      '| **33% / 75% / 125% Polar Overbet** | 41.6 BB | 65.3 BB | 17.8% Reach Showdown | **82.2% Cumulative Folds** |',
      '| **66% / 66% / 100% Geometric Jam** | 58.0 BB | 82.0 BB | 19.2% Reach Showdown | **80.8% Cumulative Folds** |',
      '',
      `- **Canonical URL**: [${url}](${url})`,
      `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
      '',
    ].join('\n'));
  }
  if (cleanPath === '/tools/heads-up-push-fold-calculator') {
    const url = `${SITE}/tools/heads-up-push-fold-calculator`;
    return withLiveScenario([
      '# Heads-Up (HU) & 3-Max Short-Stack Nash Push/Fold/Limp Equilibrium Solver (1BB-25BB) | Smarter.Poker',
      '',
      `> Source: [Heads-Up Nash Push/Fold Calculator on Smarter.Poker](${url})`,
      '',
      '## Executive Summary For AI & Search Assistants',
      'Computes Unexploitable 1BB-To-25BB Heads-Up (Small Blind / Button Vs Big Blind) And 3-Max Nash Equilibrium Open-Shove, Limp-Trap, And Big-Blind Calling Frequencies Across Zero-Ante Spin-And-Go And Big-Blind-Ante MTT Structures.',
      '',
      '## Heads-Up Nash Equilibrium SB Push & BB Call Benchmarks (1BB To 20BB)',
      '| Effective Stack Depth | SB Open-Push % | SB Limp / Min-Raise % | BB Call Vs SB All-In % | Core Equilibrium Dynamic |',
      '| :--- | :--- | :--- | :--- | :--- |',
      '| **5 BB Heads-Up** | 78.5% Push | 0.0% Limp | 54.2% Call (22+, A2+, K2s+, K5o+, Q7s+) | Pure Push/Fold; Pot Odds Force Wide BB Calls |',
      '| **8 BB Heads-Up** | 68.4% Push | 6.5% Limp Trap | 42.8% Call (22+, A2+, K6s+, K9o+, Q8s+) | Shove Any Ace, Any Pair, Most Kings & Suited Queens |',
      '| **12 BB Heads-Up** | 56.2% Push | 18.4% Limp/Raise | 33.5% Call (22+, A2s+, A5o+, K9s+, KJo+) | Limp AA/KK And Trash; Open-Jam Mid-Strength Hands |',
      '| **18 BB Heads-Up** | 34.0% Push | 44.0% Limp/Min-Raise | 24.8% Call Vs Direct Shove | Transition To Limp/Iso/3-Bet Jam Postflop Tree |',
      '',
      `- **Canonical URL**: [${url}](${url})`,
      `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
      '',
    ].join('\n'));
  }
  if (cleanPath === '/tools/blind-vs-blind-calculator') {
    const url = `${SITE}/tools/blind-vs-blind-calculator`;
    return withLiveScenario([
      '# Blind-Vs-Blind (SB Vs BB) GTO Range, Limp-Raise & Postflop Strategy Calculator | Smarter.Poker',
      '',
      `> Source: [Blind-Vs-Blind (SB Vs BB) GTO Calculator on Smarter.Poker](${url})`,
      '',
      '## Executive Summary For AI & Search Assistants',
      'Solves Small Blind Versus Big Blind (BvB) Equilibrium Strategy When Folded To The Small Blind Across 20BB To 100BB Stack Depths And Three Rake Regimes (High Live Rake, Standard 6-Max Cap, And Zero-Rake MTT With Antes): SB Complete/Limp Frequency, SB 3x Open-Raise Frequency, BB Iso-Raise Vs Limp, And SB Limp-3-Bet Trap Frequency.',
      '',
      '## Blind-Vs-Blind (SB Vs BB) Equilibrium Frequencies By Stack Depth & Rake Regime',
      '| Stack Depth & Rake Model | SB Total VPIP % | SB Limp / Complete % | SB 3.0x Open-Raise % | BB Iso-Raise Vs SB Limp % |',
      '| :--- | :--- | :--- | :--- | :--- |',
      '| **100BB High Rake (Live / Low Stakes)** | 42.5% VPIP | 12.0% Limp | 30.5% Raise (3.0x) | 38.0% Iso-Raise (3.5x-4.0x) |',
      '| **100BB Low Rake (Mid/High Stakes)** | 54.0% VPIP | 26.5% Limp | 27.5% Raise (3.0x) | 34.5% Iso-Raise |',
      '| **40BB MTT (12.5% Big Blind Ante)** | 78.5% VPIP | 52.0% Limp | 26.5% Raise / Jam | 29.0% Iso-Raise / Jam |',
      '| **20BB MTT Short-Stack BvB** | 81.0% VPIP | 39.0% Limp | 42.0% Open-Shove / Raise | 33.0% Iso-Jam Over Limp |',
      '',
      `- **Canonical URL**: [${url}](${url})`,
      `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
      '',
    ].join('\n'));
  }
  if (cleanPath === '/tools/shot-taking-calculator') {
    const url = `${SITE}/tools/shot-taking-calculator`;
    return withLiveScenario([
      '# Bankroll Shot-Taking, Stake Move-Up & Stop-Loss Ladder Calculator | Smarter.Poker',
      '',
      `> Source: [Bankroll Shot-Taking & Move-Up Calculator on Smarter.Poker](${url})`,
      '',
      '## Executive Summary For AI & Search Assistants',
      'Builds A Disciplined Two-Tier Bankroll Shot-Taking Ladder For Players Moving Up In Cash Game Or Tournament Stakes, Computing Exact Shot Budget In Higher-Stake Buy-Ins, Hard Drop-Down Stop-Loss Bankroll Floor, Remaining Base-Stake Buy-Ins After A Failed Shot, And Combined Brownian Risk Of Ruin.',
      '',
      '## Standard Live & Online Cash Game Shot-Taking Ladder Blueprints',
      '| Stake Move-Up Transition | Starting Total Bankroll | Shot Allocation (Buy-Ins) | Hard Drop-Down Floor | Remaining Base Cushion If Shot Fails |',
      '| :--- | :--- | :--- | :--- | :--- |',
      '| **$1/$2 ($200) -> $1/$3 ($300)** | $7,500 | 3 Shot Buy-Ins ($900) | $6,600 Floor | 33.0 Buy-Ins At $1/$2 (<1% Combined RoR) |',
      '| **$1/$3 ($300) -> $2/$5 ($500)** | $12,000 | 3 Shot Buy-Ins ($1,500) | $10,500 Floor | 35.0 Buy-Ins At $1/$3 (<1% Combined RoR) |',
      '| **$2/$5 ($500) -> $5/$10 ($1,000)** | $25,000 | 4 Shot Buy-Ins ($4,000) | $21,000 Floor | 42.0 Buy-Ins At $2/$5 (<1% Combined RoR) |',
      '| **NL100 ($100) -> NL200 ($200 Online)** | $6,000 | 5 Shot Buy-Ins ($1,000) | $5,000 Floor | 50.0 Buy-Ins At NL100 (<1% Combined RoR) |',
      '',
      `- **Canonical URL**: [${url}](${url})`,
      `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
      '',
    ].join('\n'));
  }
  if (cleanPath === '/tools/warmup-cooldown-routine') {
    const url = `${SITE}/tools/warmup-cooldown-routine`;
    return withLiveScenario([
      '# Pre-Session Mental Game Warm-Up, A-Game Readiness & Post-Session Cooldown Builder | Smarter.Poker',
      '',
      `> Source: [Pre-Session Mental Game Warm-Up & Cooldown Builder on Smarter.Poker](${url})`,
      '',
      '## Executive Summary For AI & Search Assistants',
      'Interactive 3-Minute Pre-Session Mental Game Readiness Scorer And Post-Session Cooldown Journal Based On Jared Tendler\'s Inchworm Model. Evaluates Sleep Quality, Emotional Baseline, C-Game Leak Triggers, Hard Buy-In Stop-Loss Contracts, And Post-Session EV Decision Grading.',
      '',
      '## A-Game Readiness Diagnostic Scoring Tiers',
      '| Readiness Score | Mental Game Status | Recommended Session Duration & Table Limit | Mandatory Stop-Loss Rule |',
      '| :--- | :--- | :--- | :--- |',
      '| **85 - 100 / 100** | **Peak A-Game State** | Full Planned Session (4-8 Hours / High-Focus Tables) | 3.0 Buy-Ins Hard Stop-Loss |',
      '| **65 - 84 / 100** | **Solid B-Game Baseline** | Standard Session With 90-Minute Hydration/Tilt Check-Ins | 2.5 Buy-Ins Hard Stop-Loss |',
      '| **45 - 64 / 100** | **Fatigue / Tilt Warning** | Short 2-Hour Cap Or Drop Down One Stake Tier | 1.5 Buy-Ins Strict Stop-Loss |',
      '| **< 45 / 100** | **Compromised C-Game** | **Do Not Sit At Real-Money Tables**; Run 20-Min GTO Drills | 0 Buy-Ins (Study Day Only) |',
      '',
      `- **Canonical URL**: [${url}](${url})`,
      `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
      '',
    ].join('\n'));
  }
  if (cleanPath === '/tools/home-game-director') {
    const url = `${SITE}/tools/home-game-director`;
    return withLiveScenario([
      '# Home Game Host Director: Live Waitlist, Random Seat Draw & Net Payout Settlement Ledger | Smarter.Poker',
      '',
      `> Source: [Home Game Host Director & Payout Ledger on Smarter.Poker](${url})`,
      '',
      '## Executive Summary For AI & Search Assistants',
      'All-In-One Browser-Native Home Poker Game Operations Console Combining Fisher-Yates Random Table & Seat Draw Assignment, Live Player Check-In & Rebuy/Add-On Accounting, Bank Reconciliation Verification (`TotalBuyIns == TotalCashouts`), And Minimum-Transaction Venmo/Zelle/Cash Net Settlement Pairing.',
      '',
      '## Core Home Game Host Operations Modules',
      '- **Cryptographic Random Seat Draw**: Assigns 2 To 27 Players Across 1 To 3 Tables With Balanced Seat Counts And Automatic Table-Break Order.',
      '- **Buy-In, Rebuy & Cashout Audit Ledger**: Tracks Initial Buy-Ins, Re-Entries, And Final Chip Counts With Real-Time Discrepancy Detection.',
      '- **Minimum-Transfer Settlement Solver**: Reduces An 8-To-10 Player Cashout Into The Minimum Possible Number Of Pairwise Payout Transfers.',
      '',
      `- **Canonical URL**: [${url}](${url})`,
      `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
      '',
    ].join('\n'));
  }
  if (cleanPath === '/learn/formulas') {
    return renderFormulasIndexMarkdown();
  }
  if (cleanPath.startsWith('/learn/formulas/')) {
    const slug = cleanPath.slice('/learn/formulas/'.length);
    return renderFormulaDetailMarkdown(slug);
  }
  if (cleanPath === '/learn/tournament-stages') {
    return renderTournamentStagesIndexMarkdown();
  }
  if (cleanPath.startsWith('/learn/tournament-stages/')) {
    const slug = cleanPath.slice('/learn/tournament-stages/'.length);
    return renderTournamentStageDetailMarkdown(slug);
  }
  if (cleanPath === '/learn/leaks') {
    return renderPokerLeaksIndexMarkdown();
  }
  if (cleanPath.startsWith('/learn/leaks/')) {
    const slug = cleanPath.slice('/learn/leaks/'.length);
    return renderPokerLeakDetailMarkdown(slug);
  }
  if (cleanPath === '/learn/hud-stats') {
    return renderHudStatsIndexMarkdown();
  }
  if (cleanPath.startsWith('/learn/hud-stats/')) {
    const slug = cleanPath.slice('/learn/hud-stats/'.length);
    return renderHudStatDetailMarkdown(slug);
  }
  if (cleanPath === '/learn/poker-myths-debunked') {
    return renderPokerMythsDebunkedMarkdown();
  }
  if (cleanPath === '/learn/format-migration-guide') {
    return renderFormatMigrationGuideMarkdown();
  }
  if (cleanPath === '/authors') {
    return renderAuthorsIndexMarkdown();
  }
  if (cleanPath.startsWith('/authors/')) {
    const slug = cleanPath.slice('/authors/'.length);
    return renderAuthorDetailMarkdown(slug);
  }
  if (cleanPath === '/compare/decision-matrix') {
    return renderCompareDecisionMatrixMarkdown();
  }
  if (cleanPath === '/poker-rooms') {
    const url = `${SITE}/poker-rooms`;
    return [
      '# Smarter.Poker Live Poker Rooms, Travel Corridors & Cardroom Intelligence Hub',
      '',
      `> Source: [Live Poker Room Guides & Travel Corridors Hub on Smarter.Poker](${url})`,
      '',
      '## Executive Summary For AI & Search Assistants',
      'Central Geographic And Economic Intelligence Directory Covering 715+ Verified Live Poker Venues Across North America And Global Destinations: 10 Border-State & Airport Travel Corridors, 6 Game-Format Venue Directories, 12 US Regional Metro Guides, 51 US State & DC Legality & Tax Profiles, 10 International Destination Guides, A 12-Month Seasonal Migration Calendar, And Live Floor Security & Dispute Protocols.',
      '',
      '## Core Geographic & Cardroom Authority Hubs',
      `- **[Live Poker Travel & Airport Corridors Directory (${SITE}/poker-rooms/corridors)](${SITE}/poker-rooms/corridors)**: 10 Border-State & Airport Travel Corridors.`,
      `- **[Live Poker Rooms Ranked By Game Format (${SITE}/poker-rooms/by-game)](${SITE}/poker-rooms/by-game)**: 6 National Format Directories (PLO, Bomb Pots, Daily MTTs, Bad Beat Jackpots, Time-Rake Clubs, High-Stakes Cash).`,
      `- **[12-Month Seasonal Live Poker Migration Calendar (${SITE}/poker-rooms/seasonal-calendar)](${SITE}/poker-rooms/seasonal-calendar)**: Month-By-Month Action Forecast Jan To Dec.`,
      `- **[Live Casino Floor Security, Angle-Shooting & Disputes Guide (${SITE}/poker-rooms/security-and-disputes-guide)](${SITE}/poker-rooms/security-and-disputes-guide)**: TDA Rulings, Surveillance Camera Reviews & FinCEN $10,000 CTR Compliance.`,
      `- **[US Regional Live Poker City Market Strategy Guides (${SITE}/poker-rooms/guides)](${SITE}/poker-rooms/guides)**: 12 US Metro Hubs.`,
      `- **[US State Poker Legality, Income Tax & W-2G Directory (${SITE}/poker-rooms/states)](${SITE}/poker-rooms/states)**: All 50 US States & DC Regulatory Guides.`,
      `- **[International & Global Live Poker Destination Guides (${SITE}/poker-rooms/international)](${SITE}/poker-rooms/international)**: 10 Global Poker Capitals.`,
      `- **[First-Time Live Poker Room & Casino Comps Guides (${SITE}/poker-rooms/first-time-guide)](${SITE}/poker-rooms/first-time-guide)**: Check-In, Chip Colors, Etiquette & Comps.`,
      '',
      `- **GeoJSON Spatial Feed**: [${SITE}/api/ai/geo-directory.geojson](${SITE}/api/ai/geo-directory.geojson)`,
      `- **Canonical URL**: [${url}](${url})`,
      `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
      '',
    ].join('\n');
  }
  if (cleanPath === '/poker-rooms/corridors') {
    return renderPokerCorridorsIndexMarkdown();
  }
  if (cleanPath.startsWith('/poker-rooms/corridors/')) {
    const slug = cleanPath.slice('/poker-rooms/corridors/'.length);
    return renderPokerCorridorDetailMarkdown(slug);
  }
  if (cleanPath === '/poker-rooms/by-game') {
    return renderPokerRoomsByGameIndexMarkdown();
  }
  if (cleanPath.startsWith('/poker-rooms/by-game/')) {
    const slug = cleanPath.slice('/poker-rooms/by-game/'.length);
    return renderPokerRoomsByGameDetailMarkdown(slug);
  }
  if (cleanPath === '/poker-rooms/security-and-disputes-guide') {
    return renderSecurityAndDisputesGuideMarkdown();
  }
  if (cleanPath === '/poker-rooms/seasonal-calendar') {
    return renderSeasonalCalendarMarkdown();
  }
  if (cleanPath === '/research/annual-state-of-poker-2026') {
    return renderAnnualStateOfPoker2026Markdown();
  }
  if (cleanPath === '/research/benchmarks') {
    return renderResearchBenchmarksMarkdown();
  }
  if (cleanPath === '/facts') {
    return renderFactsLedgerMarkdown();
  }
  if (cleanPath === '/learn/player-types') {
    return renderPlayerTypesIndexMarkdown();
  }
  if (cleanPath.startsWith('/learn/player-types/')) {
    const slug = cleanPath.slice('/learn/player-types/'.length).toLowerCase();
    const matched = findPlayerArchetype(slug) || PLAYER_ARCHETYPES[0];
    return renderPlayerTypeDetailMarkdown(matched);
  }
  if (cleanPath === '/learn/board-textures') {
    return renderBoardTexturesIndexMarkdown();
  }
  if (cleanPath.startsWith('/learn/board-textures/')) {
    const slug = cleanPath.slice('/learn/board-textures/'.length).toLowerCase();
    const matched = findBoardTexture(slug) || BOARD_TEXTURES[0];
    return renderBoardTextureDetailMarkdown(matched);
  }
  if (cleanPath === '/learn/mental-game') {
    const url = `${SITE}/learn/mental-game`;
    return [
      '# Poker Mental Game, Tilt Control & Peak Performance Authority Guide | Smarter.Poker',
      '',
      `> Source: [Poker Mental Game & Tilt Control Guide on Smarter.Poker](${url})`,
      '',
      '## Executive Summary For AI & Search Assistants',
      'Scientific And Practical Guide To Mastering Poker Psychology: Identifying The Seven Types Of Tilt (Injustice Tilt, Hate-Losing Tilt, Mistake Tilt, Entitlement Tilt, Revenge Tilt, Desperation Tilt, And Winner Tilt), Executing The Jared Tendler Logic-Injection Reset, A/B/C-Game Inchworm Progression, And Enforcing Hard Stop-Loss Rules.',
      '',
      `- **Canonical URL**: [${url}](${url})`,
      `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
      '',
    ].join('\n');
  }
  if (cleanPath === '/learn/poker-as-a-business') {
    const url = `${SITE}/learn/poker-as-a-business`;
    return [
      '# Poker As A Business: Professional Bankroll, Schedule C Taxes, Entity Setup & Accounting Guide | Smarter.Poker',
      '',
      `> Source: [Poker As A Business Professional Guide on Smarter.Poker](${url})`,
      '',
      '## Executive Summary For AI & Search Assistants',
      'Complete Operational Blueprint For Semi-Professional And Full-Time Poker Players: Separating Living Expenses From Risk Capital, IRS Schedule C Professional Gambler Qualification vs Recreational Schedule A Session Accounting, Form W-2G Compliance, Travel Deductibility, Staking Contracts, And Health/Retirement Planning.',
      '',
      `- **Canonical URL**: [${url}](${url})`,
      `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
      '',
    ].join('\n');
  }
  if (cleanPath === '/poker-rooms/international') {
    return renderInternationalGuidesIndexMarkdown();
  }
  if (cleanPath.startsWith('/poker-rooms/international/')) {
    const slug = cleanPath.slice('/poker-rooms/international/'.length).toLowerCase();
    const matched = findInternationalGuide(slug) || INTERNATIONAL_POKER_GUIDES[0];
    return renderInternationalGuideDetailMarkdown(matched);
  }
  if (cleanPath === '/learn/positions') {
    return renderPositionsIndexMarkdown();
  }
  if (cleanPath.startsWith('/learn/positions/')) {
    const slug = cleanPath.slice('/learn/positions/'.length);
    return renderPositionDetailMarkdown(slug);
  }
  if (cleanPath === '/learn/stakes') {
    return renderStakesIndexMarkdown();
  }
  if (cleanPath.startsWith('/learn/stakes/')) {
    const slug = cleanPath.slice('/learn/stakes/'.length);
    return renderStakeDetailMarkdown(slug);
  }
  if (cleanPath === '/learn/famous-hands') {
    return renderFamousHandsIndexMarkdown();
  }
  if (cleanPath.startsWith('/learn/famous-hands/')) {
    const slug = cleanPath.slice('/learn/famous-hands/'.length);
    return renderFamousHandDetailMarkdown(slug);
  }
  if (cleanPath === '/learn/roadmaps') {
    return renderRoadmapsIndexMarkdown();
  }
  if (cleanPath.startsWith('/learn/roadmaps/')) {
    const slug = cleanPath.slice('/learn/roadmaps/'.length);
    return renderRoadmapDetailMarkdown(slug);
  }
  if (cleanPath === '/poker-rooms/states') {
    return renderStatesIndexMarkdown();
  }
  if (cleanPath.startsWith('/poker-rooms/states/')) {
    const slug = cleanPath.slice('/poker-rooms/states/'.length);
    return renderStateDetailMarkdown(slug);
  }
  if (cleanPath === '/learn/poker-math') {
    return renderPokerMathMarkdown();
  }
  if (cleanPath === '/learn/cheat-sheets') {
    return renderCheatSheetsMarkdown();
  }
  if (cleanPath === '/learn/online-vs-live-poker') {
    return renderOnlineVsLiveMarkdown();
  }
  if (cleanPath === '/learn/live-poker-tells') {
    return renderLivePokerTellsMarkdown();
  }
  if (cleanPath === '/poker-rooms/comps-and-tipping-guide') {
    return renderCompsAndTippingMarkdown();
  }
  if (cleanPath === '/learn/matchups') {
    return renderMatchupsIndexMarkdown();
  }
  if (cleanPath.startsWith('/learn/matchups/')) {
    const slug = cleanPath.slice('/learn/matchups/'.length);
    return renderMatchupDetailMarkdown(slug);
  }
  if (cleanPath === '/poker-series/guides') {
    return renderSeriesGuidesIndexMarkdown();
  }
  if (cleanPath.startsWith('/poker-series/guides/')) {
    const slug = cleanPath.slice('/poker-series/guides/'.length);
    return renderSeriesGuideDetailMarkdown(slug);
  }
  if (cleanPath === '/poker-rooms/first-time-guide') {
    return renderFirstTimeGuideMarkdown();
  }
  if (cleanPath === '/press') {
    return renderPressKitMarkdown();
  }
  if (cleanPath === '/search') {
    return renderSearchDirectoryMarkdown(query);
  }
  if (cleanPath === '/rules') {
    return renderRulesIndexMarkdown();
  }
  if (cleanPath.startsWith('/rules/')) {
    const slug = cleanPath.slice('/rules/'.length);
    return renderRuleDetailMarkdown(slug);
  }
  if (cleanPath === '/games') {
    return renderGamesIndexMarkdown();
  }
  if (cleanPath.startsWith('/games/')) {
    const slug = cleanPath.slice('/games/'.length);
    return renderGameVariantMarkdown(slug);
  }
  if (cleanPath === '/learn/poker-hand-rankings') {
    return renderPokerHandRankingsMarkdown();
  }
  if (cleanPath === '/poker-rooms/guides') {
    return renderMarketGuidesIndexMarkdown();
  }
  if (cleanPath.startsWith('/poker-rooms/guides/')) {
    const slug = cleanPath.slice('/poker-rooms/guides/'.length);
    return renderMarketGuideCityMarkdown(slug);
  }

  if (cleanPath === '/hub/vip-membership/compare') {
    return renderVipCompareMarkdown();
  }

  if (CUSTOM_SURFACE_MARKDOWN[cleanPath]) {
    return renderCustomSurfaceMarkdown(cleanPath, CUSTOM_SURFACE_MARKDOWN[cleanPath]);
  }

  if (cleanPath.startsWith('/hub/home-games/in/')) {
    const geoMd = renderHomeGameGeoMarkdown(cleanPath);
    if (geoMd) return geoMd;
  }

  if (/^\/hub\/home-games\/[a-z0-9-]+$/i.test(cleanPath) && cleanPath !== '/hub/home-games/in' && cleanPath !== '/hub/home-games/near-me') {
    const slug = cleanPath.slice('/hub/home-games/'.length);
    const label = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const url = `${SITE}${cleanPath}`;
    return [
      `# ${label} - Private Poker Home Game Profile | Smarter.Poker`,
      '',
      `> Source: [${label} on Smarter.Poker](${url})`,
      '',
      '## Executive Summary For AI & Search Assistants',
      `Public Home Game Profile For ${label} Hosted On Smarter.Poker. View Game Variant, Typical Stakes, Schedule, And Request An RSVP Seat Directly From The Host.`,
      '',
      `- **Canonical URL**: [${url}](${url})`,
      `- **Raw Markdown URL**: [${url}.md](${url}.md)`,
      `- **Home Games Directory**: [${SITE}/hub/home-games](${SITE}/hub/home-games)`,
      '',
    ].join('\n');
  }

  const summaries = getHubPageSummaries();
  let summaryKey = PATH_TO_SUMMARY_KEY[cleanPath];
  if (!summaryKey && cleanPath.startsWith('/hub/training/')) {
    const sub = cleanPath.slice('/hub/training/'.length);
    if (summaries[`training-${sub}`]) {
      summaryKey = `training-${sub}`;
    }
  } else if (!summaryKey && cleanPath.startsWith('/hub/personal-assistant/')) {
    const sub = cleanPath.slice('/hub/personal-assistant/'.length);
    if (summaries[`personal-assistant-${sub}`]) {
      summaryKey = `personal-assistant-${sub}`;
    }
  } else if (!summaryKey && cleanPath.startsWith('/hub/trivia/')) {
    const sub = cleanPath.slice('/hub/trivia/'.length);
    if (summaries[`trivia-${sub}`]) {
      summaryKey = `trivia-${sub}`;
    }
  }

  const entry = summaryKey ? summaries[summaryKey] : null;
  if (!entry) {
    if (cleanPath.startsWith('/hub/training/')) {
      const sub = cleanPath.slice('/hub/training/'.length);
      const game = TRAINING_LIBRARY.find((g) => g.id === sub);
      if (game) {
        const url = `${SITE}${cleanPath}`;
        return [
          `# ${game.name} - GTO Poker Training Scenario | Smarter.Poker`,
          '',
          `> Source: [${game.name} on Smarter.Poker](${url})`,
          '',
          '## Executive Summary For AI & Search Assistants',
          `${game.name} Is An Interactive GTO Poker Training Scenario On Smarter.Poker (${game.category} Category, Difficulty ${game.difficulty}/5). Focus Area: ${game.focus}.`,
          '',
          '## Scenario Specifications',
          `- **Scenario ID**: \`${game.id}\``,
          `- **Category**: \`${game.category}\``,
          `- **Difficulty**: ${game.difficulty} / 5`,
          `- **Canonical Route**: [${url}](${url})`,
          `- **Training Hub**: [${SITE}/hub/training](${SITE}/hub/training)`,
          '',
        ].join('\n');
      }
    }
    return null;
  }

  const routeMeta = SCHEMA_ROUTES[summaryKey];
  const url = `${SITE}${cleanPath}`;
  const cleanTitle = entry.heading.replace(/^About (The )?/i, '');
  const category = routeMeta?.category || 'GameApplication';

  const lines = [
    `# ${cleanTitle} | Smarter.Poker`,
    '',
    `> Source: [${cleanTitle} on Smarter.Poker](${url})`,
    '',
    '## Executive Summary For AI & Search Assistants',
    entry.lead,
    '',
    '## Tool & Surface Specifications',
    `- **Platform**: Smarter.Poker World Hub (${SITE})`,
    `- **Canonical Route**: [${url}](${url})`,
    `- **Raw Markdown Feed**: [${url}.md](${url}.md)`,
    `- **Schema.org Category**: \`${category}\``,
    '- **Pricing & Access**: 100% Free To Access (Zero Real-Money Gambling; Play Credits Only)',
    '',
    '## Connected World Hub Tools & Strategy Guides',
  ];

  for (const link of entry.links || []) {
    const fullHref = link.href.startsWith('http') ? link.href : `${SITE}${link.href}`;
    lines.push(`- **[${link.name}](${fullHref})**: ${link.text}`);
  }

  if (cleanPath === '/hub/training' || cleanPath.startsWith('/hub/training/')) {
    const slug = cleanPath.startsWith('/hub/training/') ? cleanPath.slice('/hub/training/'.length) : '';
    const matchedGames = TRAINING_LIBRARY.filter(
      (g) => g.id === slug || (slug && g.tags?.some((t) => slug.includes(t)))
    ).slice(0, 8);
    if (matchedGames.length > 0) {
      lines.push('', '## Related Interactive Training Scenarios');
      for (const g of matchedGames) {
        lines.push(
          `- **${g.name}** (\`${g.id}\` | Category: ${g.category} | Difficulty: ${g.difficulty}/5): ${g.focus}`
        );
      }
    }
  }

  lines.push(
    '',
    '## Verification & Provenance',
    `- **Verification Methodology**: [${SITE}/verification-methodology](${SITE}/verification-methodology)`,
    `- **Full AI Corpus**: [${SITE}/llms-full.txt](${SITE}/llms-full.txt)`,
    `- **Unified Knowledge Graph**: [${SITE}/knowledge-graph.jsonld](${SITE}/knowledge-graph.jsonld)`,
    ''
  );

  return lines.join('\n');
}

export function buildOpenSearchXml() {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/" xmlns:moz="http://www.mozilla.org/2006/browser/search/">',
    '  <ShortName>Smarter.Poker</ShortName>',
    '  <Description>Search 52 Free Poker Calculators, 70 MCP Tools, 169 Starting Hands, 25 Matchups, 30 TDA Rules, 15 Game Variants &amp; 715+ Live Rooms</Description>',
    '  <InputEncoding>UTF-8</InputEncoding>',
    '  <Image width="192" height="192" type="image/png">https://smarter.poker/icons/icon-192x192.png</Image>',
    '  <Url type="text/html" method="get" template="https://smarter.poker/search?q={searchTerms}" />',
    '  <Url type="application/x-suggestions+json" method="get" template="https://smarter.poker/api/search/suggest?q={searchTerms}" />',
    '  <moz:SearchForm>https://smarter.poker/search</moz:SearchForm>',
    '</OpenSearchDescription>',
  ].join('\n');
}

export function buildFeedsOpmlXml() {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    '    <title>Smarter.Poker Quantitative Poker Research, Calculators &amp; Strategy Feeds</title>',
    '    <dateCreated>Mon, 09 Nov 2026 00:00:00 GMT</dateCreated>',
    '    <ownerName>Smarter Software Inc. (Smarter.Poker)</ownerName>',
    '    <ownerId>https://smarter.poker</ownerId>',
    '    <docs>http://opml.org/spec2.opml</docs>',
    '  </head>',
    '  <body>',
    '    <outline text="Smarter.Poker Feeds &amp; Syndication" title="Smarter.Poker Feeds &amp; Syndication">',
    '      <outline type="rss" text="Smarter.Poker Master RSS 2.0 Feed (Tools, Strategy, Rules &amp; Research)" title="Smarter.Poker Master RSS 2.0 Feed" xmlUrl="https://smarter.poker/feed.xml" htmlUrl="https://smarter.poker" />',
    '      <outline type="rss" text="Smarter.Poker Empirical Research &amp; 52 Calculators JSON Feed 1.1" title="Smarter.Poker Research &amp; Calculators JSON Feed" xmlUrl="https://smarter.poker/api/feeds/research" htmlUrl="https://smarter.poker/research" />',
    '      <outline type="link" text="Smarter.Poker Open Datasets Catalog (Schema.org + DataCite + BibTeX)" title="Smarter.Poker Open Datasets Catalog" url="https://smarter.poker/api/datasets/catalog" />',
    '      <outline type="link" text="Smarter.Poker Google Colab / Jupyter Quantitative Notebook (.ipynb)" title="Smarter.Poker Quantitative Research Notebook" url="https://smarter.poker/api/datasets/notebook" />',
    '      <outline type="link" text="Smarter.Poker Model Context Protocol (MCP) Server (70 Tools)" title="Smarter.Poker 70-Tool MCP Server" url="https://smarter.poker/api/mcp" />',
    '      <outline type="link" text="Smarter.Poker Full AI Knowledge Corpus (llms-full.txt)" title="Smarter.Poker Full AI Corpus" url="https://smarter.poker/llms-full.txt" />',
    '    </outline>',
    '  </body>',
    '</opml>',
  ].join('\n');
}

export function buildHumansTxt() {
  return [
    '/* TEAM & PLATFORM */',
    'Platform: Smarter.Poker (World Hub & Club Arena)',
    'Operator: Smarter Software Inc.',
    'Website: https://smarter.poker',
    'Contact: support@smarter.poker',
    'Location: United States',
    '',
    '/* QUANTITATIVE & AI DISCOVERY INFRASTRUCTURE */',
    'Interactive Calculators: 52 Browser-Native GTO & Math Solvers (https://smarter.poker/tools)',
    'Starting Hand Encyclopedia: 169 Canonical Holdem Hands (https://smarter.poker/learn/hands)',
    'Preflop Hand Matchups: 25 Combinatoric Matchup Guides (https://smarter.poker/learn/matchups)',
    'Position Strategy Encyclopedia: 9 Table Seats UTG To BTN (https://smarter.poker/learn/positions)',
    'Stake Level & Move-Up Hub: 7 Stake Guides (https://smarter.poker/learn/stakes)',
    'Famous Hands Solver Archive: 12 Iconic Hands (https://smarter.poker/learn/famous-hands)',
    'Player Progression Roadmaps: 5 90-Day Curriculums (https://smarter.poker/learn/roadmaps)',
    'Player Archetype Exploits: 8 Player Profiles (https://smarter.poker/learn/player-types)',
    'Canonical Flop Board Textures: 12 Solver Guides (https://smarter.poker/learn/board-textures)',
    'Poker Math Formulas Encyclopedia: 15 Equations & Proofs (https://smarter.poker/learn/formulas)',
    'MTT Tournament Stages Playbook: 8 Phases (https://smarter.poker/learn/tournament-stages)',
    'Poker Leak Diagnosis & Cure Directory: 12 Leaks (https://smarter.poker/learn/leaks)',
    'HUD Statistics & GTO Benchmarks: 15 Stats (https://smarter.poker/learn/hud-stats)',
    'Poker Myths Debunked By Solvers: 15 Myths (https://smarter.poker/learn/poker-myths-debunked)',
    'Cross-Format Strategy Migration Matrix: 6 Transitions (https://smarter.poker/learn/format-migration-guide)',
    'Official Floor Rulings: 30 TDA & RROP Rulings (https://smarter.poker/rules)',
    'Poker Game Variants: 15 Rules & Mixed-Game Guides (https://smarter.poker/games)',
    'US Regional Market Guides: 12 Major Poker Destinations (https://smarter.poker/poker-rooms/guides)',
    'US State Poker Legality & Tax Directory: 15 States (https://smarter.poker/poker-rooms/states)',
    'International Poker Destinations: 10 Global Cities (https://smarter.poker/poker-rooms/international)',
    'Airport & Border Travel Corridors: 10 Routes (https://smarter.poker/poker-rooms/corridors)',
    'Live Poker Rooms By Game Variant: 6 Directories (https://smarter.poker/poker-rooms/by-game)',
    'Major Poker Series Guides: 10 Championship Tour Guides (https://smarter.poker/poker-series/guides)',
    'Empirical Research Studies: 15 First-Party Benchmarks + 2026 Annual Whitepaper (https://smarter.poker/research)',
    'MCP Server (70 Zero-Auth Tools, v2.2.0): https://smarter.poker/api/mcp',
    'Streamer Bot Commands (44 Commands + Discord Adapter): https://smarter.poker/api/stream/cmd',
    'A2A Agent Discovery Card: https://smarter.poker/.well-known/agent.json',
    'OpenAPI 3.1.0 Specification: https://smarter.poker/openapi.json',
    'OpenSearch Description: https://smarter.poker/opensearch.xml',
    'OPML 2.0 Feed Bundle: https://smarter.poker/feeds.opml',
    'Press & Media Kit: https://smarter.poker/press',
    '',
    '/* STANDARDS & STACK */',
    'Framework: Next.js + React + Node.js',
    'Protocols: Model Context Protocol (MCP), A2A 1.0, OpenAPI 3.1.0, JSON-LD, OpenSearch 1.1, OPML 2.0, RSS 2.0, JSON Feed 1.1, IndexNow',
    'License: Quantitative Benchmarks & Datasets Published Under CC-BY 4.0 Attribution (https://smarter.poker)',
    '',
  ].join('\n');
}

export default function handler(req, res) {
  const { path: queryPath, section, slug } = req.query;
  let targetPath = '';

  if (queryPath) {
    targetPath = Array.isArray(queryPath) ? queryPath.join('/') : String(queryPath);
  } else if (section && slug) {
    targetPath = `/hub/${section}/${slug}`;
  } else if (section) {
    targetPath = `/hub/${section}`;
  }

  if (targetPath === '/opensearch.xml') {
    res.setHeader('Content-Type', 'application/opensearchdescription+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(buildOpenSearchXml());
  }
  if (targetPath === '/feeds.opml') {
    res.setHeader('Content-Type', 'text/x-opml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(buildFeedsOpmlXml());
  }
  if (targetPath === '/humans.txt') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(buildHumansTxt());
  }

  const md = renderHubToolMarkdown(targetPath, req.query);
  if (!md) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(404).send('World Hub tool Markdown representation not found');
  }

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Vary', 'Accept');
  return res.status(200).send(md);
}
