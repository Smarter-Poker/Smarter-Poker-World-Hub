/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POT-LIMIT OMAHA (PLO) MAX BET & DOUBLE-BOARD BOMB POT CALCULATOR
 *  (/tools/plo-bet-calculator)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive Pot-Limit maximum bet/raise solver, preflop pot progression table,
 * and double-board bomb pot split equity & quartering risk calculator at
 * /tools/plo-bet-calculator.
 *
 * House style: Title Case, zero em dashes, #SmarterCasinoRealism theme.
 */

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import FaqSection from '../../src/components/seo/FaqSection';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';
import { useSolvedSpotUrlSync } from '../../src/lib/seo/solvedSpotEngine';

const PLO_PRESETS = [
  {
    id: 'utg-open',
    label: 'Pre-Flop UTG Pot Open',
    description: '1/2 Blinds Posted, UTG Opens For Full Pot (3.5 BB)',
    previousPot: 1.5,
    lastBet: 1.0,
    trailCalls: 0,
    heroAlreadyIn: 0,
  },
  {
    id: 'pot-vs-caller',
    label: 'Pot Raise Vs 1 Caller',
    description: '1/2 Blinds, 1 Limper (1 BB), Hero Isolates Full Pot (4.5 BB)',
    previousPot: 1.5,
    lastBet: 1.0,
    trailCalls: 1.0,
    heroAlreadyIn: 0,
  },
  {
    id: '3bet-squeeze',
    label: '3-Bet Pot Vs Open + 2 Callers',
    description: '1.5 BB Blinds, 3.5 BB Open, Two 3.5 BB Callers, Hero Squeezes Pot (19.5 BB)',
    previousPot: 1.5,
    lastBet: 3.5,
    trailCalls: 7.0,
    heroAlreadyIn: 0,
  },
  {
    id: 'postflop-raise',
    label: 'Postflop Pot Raise After C-Bet',
    description: '20 BB Flop Pot, Villain Bets 15 BB (75% Pot), Hero Raises Full Pot (65 BB)',
    previousPot: 20,
    lastBet: 15,
    trailCalls: 0,
    heroAlreadyIn: 0,
  },
];

const PLO_PREFLOP_PROGRESSION_TABLE = [
  {
    actionStep: '1. UTG Pot-Sized Open (1st Action)',
    potBefore: '1.5 BB (SB + BB)',
    lastBetToCall: '1.0 BB (BB)',
    maxPotBet: '3.5 BB Total',
    resultingPotIfCalled: '8.5 BB (Heads-Up Vs BB)',
    shortcutMath: '3 * 1.0 BB + 0.5 BB SB = 3.5 BB',
  },
  {
    actionStep: '2. Pot Open Over 1 Limper (Isolation)',
    potBefore: '2.5 BB (Blinds + 1 Limp)',
    lastBetToCall: '1.0 BB',
    maxPotBet: '4.5 BB Total',
    resultingPotIfCalled: '10.5 BB (Heads-Up)',
    shortcutMath: '3.5 BB Base + 1.0 BB Per Limper = 4.5 BB',
  },
  {
    actionStep: '3. Heads-Up 3-Bet Vs 3.5 BB Pot Open',
    potBefore: '5.0 BB (1.5 BB + 3.5 BB)',
    lastBetToCall: '3.5 BB',
    maxPotBet: '12.0 BB Total',
    resultingPotIfCalled: '25.5 BB Flop Pot',
    shortcutMath: '3 * 3.5 BB + 1.5 BB Blinds = 12.0 BB',
  },
  {
    actionStep: '4. Squeeze 3-Bet Vs 3.5 BB Open + 1 Caller',
    potBefore: '8.5 BB (Blinds + Open + Call)',
    lastBetToCall: '3.5 BB',
    maxPotBet: '15.5 BB Total',
    resultingPotIfCalled: '36.0 BB (If 1 Calls)',
    shortcutMath: '3 * 3.5 BB + 3.5 BB Call + 1.5 BB = 15.5 BB',
  },
  {
    actionStep: '5. Heads-Up 4-Bet Vs 12.0 BB 3-Bet',
    potBefore: '17.0 BB (Blinds + Open + 3-Bet)',
    lastBetToCall: '12.0 BB',
    maxPotBet: '37.5 BB Total',
    resultingPotIfCalled: '76.5 BB (SPR ~0.82 At 100 BB)',
    shortcutMath: '3 * 12.0 BB + 1.5 BB Blinds = 37.5 BB',
  },
  {
    actionStep: '6. Heads-Up 5-Bet Jam Vs 37.5 BB 4-Bet',
    potBefore: '51.0 BB',
    lastBetToCall: '37.5 BB',
    maxPotBet: '114.0 BB Total (Caps 100 BB Stack)',
    resultingPotIfCalled: '201.5 BB All-In Pot',
    shortcutMath: '3 * 37.5 BB + 1.5 BB = 114.0 BB',
  },
];

const PLO_BET_CALCULATOR_FAQS = [
  {
    question: 'How Do You Quickly Calculate A Maximum Pot-Sized Raise In PLO?',
    answer:
      'Use The Casino Dealer 3x Shortcut Formula: Multiply The Last Bet Facing You By 3, Then Add All Trailing Calls In Between And The Previous Pot Before Betting Started On This Street (Max Total Bet = 3 * Last Bet + Trail Calls + Previous Pot).',
  },
  {
    question: 'What Is A Pot-Sized Open Raise From UTG In Pot-Limit Omaha?',
    answer:
      'In A Standard 2-Blind PLO Game (0.5 BB Small Blind And 1.0 BB Big Blind), A Pot-Sized Open From Under The Gun Equals 3.5 Big Blinds (3 * 1.0 BB Big Blind + 0.5 BB Small Blind). Each Limper Adds Exactly 1.0 BB To The Maximum Pot Raise.',
  },
  {
    question: 'How Does Quartering Work In A Double-Board PLO Bomb Pot?',
    answer:
      'In A Double-Board Bomb Pot Where Half The Pot Is Awarded To Each Board, Holding The Nuts On Board 1 Only Guarantees 50% Equity Unless You Also Contest Board 2. If You Tie Board 1 And Lose Board 2, You Receive Only 25% Of The Pot (Quartered), Which Loses Money When Calling A Full-Pot River Bet.',
  },
];

export default function PloBetCalculatorPage({
  initialPreviousPot = 20,
  initialLastBet = 15,
  initialTrailCalls = 0,
  initialHeroAlreadyIn = 0,
  initialBombPotPool = 160,
  initialRiverBetToCall = 120,
  initialBoard1Equity = 100,
  initialBoard2Equity = 25,
}) {
  const [previousPot, setPreviousPot] = useState(initialPreviousPot);
  const [lastBet, setLastBet] = useState(initialLastBet);
  const [trailCalls, setTrailCalls] = useState(initialTrailCalls);
  const [heroAlreadyIn, setHeroAlreadyIn] = useState(initialHeroAlreadyIn);

  const [bombPotPool, setBombPotPool] = useState(initialBombPotPool);
  const [riverBetToCall, setRiverBetToCall] = useState(initialRiverBetToCall);
  const [board1Equity, setBoard1Equity] = useState(initialBoard1Equity);
  const [board2Equity, setBoard2Equity] = useState(initialBoard2Equity);

  useSolvedSpotUrlSync(
    {
      pot: previousPot,
      bet: lastBet,
      calls: trailCalls,
      hero: heroAlreadyIn,
      bomb: bombPotPool,
      riverCall: riverBetToCall,
      b1: board1Equity,
      b2: board2Equity,
    },
    {
      pot: (v) => setPreviousPot(Math.max(0, Number(v) || 20)),
      bet: (v) => setLastBet(Math.max(0, Number(v) || 15)),
      calls: (v) => setTrailCalls(Math.max(0, Math.min(8, Math.round(Number(v) || 0)))),
      hero: (v) => setHeroAlreadyIn(Math.max(0, Number(v) || 0)),
      bomb: (v) => setBombPotPool(Math.max(0, Number(v) || 160)),
      riverCall: (v) => setRiverBetToCall(Math.max(0, Number(v) || 120)),
      b1: (v) => setBoard1Equity(Math.max(0, Math.min(100, Number(v) || 100))),
      b2: (v) => setBoard2Equity(Math.max(0, Math.min(100, Number(v) || 25))),
    }
  );

  const applyPreset = (preset) => {
    setPreviousPot(preset.previousPot);
    setLastBet(preset.lastBet);
    setTrailCalls(preset.trailCalls);
    setHeroAlreadyIn(preset.heroAlreadyIn);
  };

  const betMetrics = useMemo(() => {
    const safePrevPot = Math.max(0, Number(previousPot) || 0);
    const safeLastBet = Math.max(0, Number(lastBet) || 0);
    const safeTrail = Math.max(0, Number(trailCalls) || 0);
    const safeHeroIn = Math.max(0, Math.min(safeLastBet, Number(heroAlreadyIn) || 0));

    // Exact Dealer Shortcut Formula:
    // Max Total Bet = 3 * LastBet + TrailCalls + PreviousPotBeforeStreetBets - HeroAlreadyCommittedOnStreet
    // Wait: If PreviousPot includes only the pot before LastBet and TrailCalls:
    // Pot on table right now = safePrevPot + safeLastBet + safeTrail + safeHeroIn
    // Amount Hero needs to call = safeLastBet - safeHeroIn
    // Pot after Hero calls = safePrevPot + 2 * safeLastBet + safeTrail
    // Max Raise ON TOP of call = safePrevPot + 2 * safeLastBet + safeTrail
    // Total Bet Hero puts in front on this street = safeLastBet + (safePrevPot + 2 * safeLastBet + safeTrail) = 3 * safeLastBet + safeTrail + safePrevPot
    const callAmountNeeded = Math.max(0, safeLastBet - safeHeroIn);
    const currentTablePot = safePrevPot + safeLastBet + safeTrail + safeHeroIn;
    const potAfterHeroCall = currentTablePot + callAmountNeeded;
    const maxRaiseOnTop = potAfterHeroCall;
    const maxTotalBetToLine = safeLastBet + maxRaiseOnTop;
    const additionalChipsRequired = maxTotalBetToLine - safeHeroIn;
    const resultingPotIfVillainCalls = potAfterHeroCall + 2 * maxRaiseOnTop;
    const halfPotTotalBet = safeLastBet + 0.5 * potAfterHeroCall;
    const twoThirdsPotTotalBet = safeLastBet + (2 / 3) * potAfterHeroCall;

    return {
      safePrevPot: safePrevPot.toFixed(1),
      safeLastBet: safeLastBet.toFixed(1),
      safeTrail: safeTrail.toFixed(1),
      safeHeroIn: safeHeroIn.toFixed(1),
      callAmountNeeded: callAmountNeeded.toFixed(1),
      currentTablePot: currentTablePot.toFixed(1),
      potAfterHeroCall: potAfterHeroCall.toFixed(1),
      maxRaiseOnTop: maxRaiseOnTop.toFixed(1),
      maxTotalBetToLine: maxTotalBetToLine.toFixed(1),
      additionalChipsRequired: additionalChipsRequired.toFixed(1),
      resultingPotIfVillainCalls: resultingPotIfVillainCalls.toFixed(1),
      halfPotTotalBet: halfPotTotalBet.toFixed(1),
      twoThirdsPotTotalBet: twoThirdsPotTotalBet.toFixed(1),
    };
  }, [previousPot, lastBet, trailCalls, heroAlreadyIn]);

  const bombMetrics = useMemo(() => {
    const safePool = Math.max(10, Number(bombPotPool) || 160);
    const safeBet = Math.max(0, Number(riverBetToCall) || 120);
    const eq1 = Math.max(0, Math.min(100, Number(board1Equity) || 0)) / 100;
    const eq2 = Math.max(0, Math.min(100, Number(board2Equity) || 0)) / 100;

    const combinedEquity = (eq1 + eq2) / 2;
    const finalPotAfterCall = safePool + 2 * safeBet;
    const requiredEquityToCall = safeBet > 0 ? safeBet / finalPotAfterCall : 0;
    const expectedReturn = combinedEquity * finalPotAfterCall;
    const netCallEv = expectedReturn - safeBet;
    const quarterLossIfChoppedOneBoard = 0.25 * finalPotAfterCall - safeBet;

    return {
      safePool: safePool.toFixed(0),
      safeBet: safeBet.toFixed(0),
      combinedEquityPct: (combinedEquity * 100).toFixed(1),
      requiredEquityPct: (requiredEquityToCall * 100).toFixed(1),
      finalPotAfterCall: finalPotAfterCall.toFixed(0),
      expectedReturn: expectedReturn.toFixed(1),
      netCallEv: netCallEv.toFixed(1),
      isProfitableCall: netCallEv >= 0,
      quarterLossIfChoppedOneBoard: quarterLossIfChoppedOneBoard.toFixed(1),
    };
  }, [bombPotPool, riverBetToCall, board1Equity, board2Equity]);

  const canonicalPath = '/tools/plo-bet-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Pot-Limit Omaha (PLO) Max Bet & Bomb Pot Calculator';
  const pageDesc =
    'Calculate Exact Pot-Limit Omaha (PLO) Maximum Bet And Raise Sizes Using The 3x Plus Trail Dealer Shortcut, Pre-Flop Pot Progressions, And Double-Board Bomb Pot Split Equity.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'Smarter.Poker Pot-Limit Omaha (PLO) Max Bet & Bomb Pot Calculator',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Pot-Limit Omaha Bet Sizing & Bomb Pot Calculator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['PLO Max Bet & Bomb Pot Calculator', canonicalPath],
      ],
      faqs: PLO_BET_CALCULATOR_FAQS,
      howTo: {
        name: 'How To Calculate Maximum Pot-Limit Bets And Double-Board Bomb Pot EV',
        description: pageDesc,
        steps: [
          {
            name: 'Enter Previous Pot, Last Bet, And Trailing Calls',
            text: 'Input The Pot At The Start Of The Street, The Bet Facing You, And Any Callers In Between.',
          },
          {
            name: 'Read The Exact 3x Shortcut Total Bet And Raise On Top',
            text: 'Inspect The Total Bet To The Betting Line And The Additional Chips Required From Your Stack.',
          },
          {
            name: 'Evaluate Double-Board Bomb Pot Split Equity And Quartering Risk',
            text: 'Enter Your Equity On Board 1 And Board 2 To Compute Net Call EV Against A Pot-Sized Bet.',
          },
        ],
      },
    });
  }, [pageDesc]);

  return (
    <div style={{ minHeight: '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title={pageTitle}
        description={pageDesc}
        canonical={canonicalUrl}
        jsonLd={schema}
      />

      <main style={{ maxWidth: 1060, margin: '0 auto', padding: '40px 20px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
          <Link href="/" style={{ color: '#25c8ff', textDecoration: 'none' }}>Smarter.Poker</Link>
          {' / '}
          <Link href="/tools" style={{ color: '#25c8ff', textDecoration: 'none' }}>Poker Tools</Link>
          {' / '}
          <span>PLO Max Bet &amp; Bomb Pot Calculator</span>
        </nav>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Pot-Limit Omaha (PLO) Max Bet &amp; Double-Board Bomb Pot Calculator
        </h1>

        <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
          <strong>Direct Answer:</strong> In Pot-Limit Omaha, The Maximum Legal Raise Equals The <strong>Full Size Of The Pot After You First Call The Bet Facing You</strong>. Professional Dealers Compute The Total Bet In One Step Using The <strong>3x Plus Trail Formula</strong>: <code>Max Bet = (3 * Last Bet) + Trailing Calls + Previous Pot</code>.
        </p>

        {/* Interactive Pot-Limit Bet Solver */}
        <section
          aria-label="Interactive Pot-Limit Bet Calculator"
          style={{
            background: '#101a20',
            border: '1px solid #1e293b',
            borderRadius: '2px',
            padding: 24,
            marginBottom: 36,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#25c8ff', margin: 0 }}>
              1. Interactive Pot-Limit Maximum Raise Solver (3x Dealer Formula)
            </h2>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#f2b84b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Formula: 3 * Last Bet + Trail + Previous Pot
            </span>
          </div>

          {/* Preset Scenario Buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {PLO_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                style={{
                  padding: '8px 14px',
                  background: '#020608',
                  border: '1px solid #25c8ff',
                  borderRadius: '2px',
                  color: '#25c8ff',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16, marginBottom: 22 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Previous Pot (Before Current Street Bets)
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={previousPot}
                  onChange={(e) => setPreviousPot(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f8fafc',
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Last Bet / Raise Facing Hero
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={lastBet}
                  onChange={(e) => setLastBet(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f8fafc',
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Trailing Calls In Between
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={trailCalls}
                  onChange={(e) => setTrailCalls(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f8fafc',
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Hero Chips Already Posted This Street
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={heroAlreadyIn}
                  onChange={(e) => setHeroAlreadyIn(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f8fafc',
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>
          </div>

          {/* KPI Output Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 18 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Maximum Pot-Sized Total Bet
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                {betMetrics.maxTotalBetToLine}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                3 * {betMetrics.safeLastBet} + {betMetrics.safeTrail} + {betMetrics.safePrevPot}
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Pot After Hero Calls ({betMetrics.callAmountNeeded})
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#f2b84b', marginTop: 4 }}>
                {betMetrics.potAfterHeroCall}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Exact Raise Amount Added On Top Of Call
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                New Pot If Villain Calls
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                {betMetrics.resultingPotIfVillainCalls}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                50% Pot Total: {betMetrics.halfPotTotalBet} · 67% Pot: {betMetrics.twoThirdsPotTotalBet}
              </div>
            </div>
          </div>
        </section>

        {/* Double-Board Bomb Pot Split Equity & Quartering Calculator */}
        <section
          aria-label="Double-Board Bomb Pot Split Equity Calculator"
          style={{
            background: '#101a20',
            border: '1px solid #1e293b',
            borderRadius: '2px',
            padding: 24,
            marginBottom: 36,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#f2b84b', margin: '0 0 12px 0' }}>
            2. Double-Board PLO Bomb Pot Split Equity &amp; Quartering Risk Solver
          </h2>
          <p style={{ fontSize: 14, color: '#cbd5e1', margin: '0 0 18px 0', lineHeight: 1.55 }}>
            In Double-Board PLO Bomb Pots, Half Of The Pot Is Awarded To Board 1 And Half To Board 2. Getting <strong>Freerolled Or Quartered</strong> On One Board While Blanked On The Other Is The Single Largest EV Leak In Modern Live Cash Games.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Current Bomb Pot Size ($)
                <input
                  type="number"
                  min="10"
                  step="10"
                  value={bombPotPool}
                  onChange={(e) => setBombPotPool(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f8fafc',
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Villain Bet Facing Hero ($)
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={riverBetToCall}
                  onChange={(e) => setRiverBetToCall(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f8fafc',
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Hero Board 1 Equity (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="5"
                  value={board1Equity}
                  onChange={(e) => setBoard1Equity(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f8fafc',
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Hero Board 2 Equity (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="5"
                  value={board2Equity}
                  onChange={(e) => setBoard2Equity(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f8fafc',
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Combined Two-Board Equity
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                {bombMetrics.combinedEquityPct}%
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Required Break-Even Equity: {bombMetrics.requiredEquityPct}%
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Expected Net Call EV ($)
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: bombMetrics.isProfitableCall ? '#34d399' : '#f87171', marginTop: 4 }}>
                ${bombMetrics.netCallEv}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Final Pot After Call: ${bombMetrics.finalPotAfterCall}
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Quartered Outcome (25% Share)
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#f2b84b', marginTop: 4 }}>
                ${bombMetrics.quarterLossIfChoppedOneBoard}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Net Result If Tied On 1 Board &amp; Scooped On 2nd
              </div>
            </div>
          </div>
        </section>

        {/* Reference Table: Preflop Pot-Limit Progression */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Standard PLO Pre-Flop Pot-Sized Raise Progression Chart (100 BB)
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Exact Pre-Flop Open, Isolation, 3-Bet, Squeeze, And 4-Bet Pot-Limit Sizing Milestones
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Pre-Flop Action Step</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Pot Before Action</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Bet Facing</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Max Pot Bet</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Pot If Called</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Dealer 3x Shortcut Math</th>
                </tr>
              </thead>
              <tbody>
                {PLO_PREFLOP_PROGRESSION_TABLE.map((row) => (
                  <tr key={row.actionStep} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.actionStep}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.potBefore}</td>
                    <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{row.lastBetToCall}</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 700 }}>{row.maxPotBet}</td>
                    <td style={{ padding: '10px 14px', color: '#f2b84b', fontWeight: 700 }}>{row.resultingPotIfCalled}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.shortcutMath}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cross-Links */}
        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker PLO &amp; Postflop Math Tools
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              All Poker Calculators
            </Link>
            <Link href="/tools/poker-odds-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              PLO4 / PLO5 / PLO6 Equity Calculator
            </Link>
            <Link href="/tools/spr-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              SPR &amp; Geometric Bet Calculator
            </Link>
            <Link href="/tools/pot-odds-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Pot Odds &amp; MDF Calculator
            </Link>
            <Link href="/tools/rake-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Live Cash Rake &amp; Time Calculator
            </Link>
          </div>
        </section>

        <FaqSection faqs={PLO_BET_CALCULATOR_FAQS} />

        <CitationBacklinkBox
          title="Pot-Limit Omaha (PLO) Max Bet & Double-Board Bomb Pot Calculator"
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel="Pot-Limit Math Solver"
          badgeValue="PLO Max Bet & Bomb Pot EV"
          summary="Interactive Pot-Limit Omaha (PLO) Maximum Bet Calculator Using The 3x Plus Trail Dealer Shortcut And Double-Board Bomb Pot Split Equity Solver."
          slug="plo-bet-calculator"
        />

        <AiPromptLauncher
          title="Pot-Limit Omaha (PLO) Max Bet & Double-Board Bomb Pot Calculator"
          canonicalUrl={canonicalUrl}
          markdownUrl={`${canonicalUrl}.md`}
        />
      </main>
    </div>
  );
}

export async function getServerSideProps({ req, res, query }) {
  const accept = req?.headers?.accept || '';
  const isMarkdownRequested =
    accept.includes('text/markdown') ||
    query?.format === 'md' ||
    query?.format === 'markdown' ||
    req?.url?.includes('format=md');

  if (isMarkdownRequested) {
    const { renderPloBetCalculatorMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderPloBetCalculatorMarkdown({
      previousPot: query?.previousPot || query?.pot || 1.5,
      lastBet: query?.lastBet || query?.bet || 1.0,
      trailCalls: query?.trailCalls || query?.trail || 0,
      heroAlreadyIn: query?.heroAlreadyIn || query?.hero || 0,
    });
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }

  return {
    props: {
      initialPreviousPot: Number(query?.previousPot || query?.pot) || 20,
      initialLastBet: Number(query?.lastBet || query?.bet) || 15,
      initialTrailCalls: query?.trailCalls !== undefined ? Number(query.trailCalls) : 0,
      initialHeroAlreadyIn: query?.heroAlreadyIn !== undefined ? Number(query.heroAlreadyIn) : 0,
      initialBombPotPool: Number(query?.bombPotPool) || 160,
      initialRiverBetToCall: Number(query?.riverBetToCall) || 120,
      initialBoard1Equity: query?.board1Equity !== undefined ? Number(query.board1Equity) : 100,
      initialBoard2Equity: query?.board2Equity !== undefined ? Number(query.board2Equity) : 25,
    },
  };
}
