/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER FORMAT SELECTOR & STUDY ROADMAP QUIZ (/tools/format-quiz)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive 5-parameter poker format diagnostic matching a player's session
 * block hours, bankroll buy-ins, variance tolerance, mathematical focus, and
 * preferred environment to their optimal game format and 7-day study plan.
 *
 * House style: Title Case, zero em dashes, #SmarterCasinoRealism theme.
 */

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import FaqSection from '../../src/components/seo/FaqSection';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';

const FORMAT_PROFILES = {
  'live-cash': {
    id: 'live-cash',
    name: 'Live $1/$3-$2/$5 Cash',
    bankrollCushion: '20 To 30 Buy-Ins ($6,000 - $15,000)',
    stdDevProfile: '70 To 80 BB/100 (Low Relative Variance Due To High 8-12 BB/100 Winrates)',
    targetWinrate: '8 To 12 BB/100 ($25 To $60/Hr)',
    summary:
      'Ideal For Flexible Session Schedules, Low Risk Of Ruin, Exploitative Pre-Flop Isolation Against Multiway Limpers, And Deep-Stack Value Extraction.',
    roadmap: [
      { day: 'Day 1: Pre-Flop Isolation Sizing', task: 'Master 4BB + 1BB/Limper Sizing And Live Low-Stakes Linear Ranges.', href: '/tools/iso-calculator', label: 'Open ISO Raise Calculator' },
      { day: 'Day 2: Live Rake & Time-Drop Economics', task: 'Audit Your Local Card Room Pot-Drop Vs Timed Seat Charge Drag.', href: '/tools/rake-calculator', label: 'Open Live Rake Calculator' },
      { day: 'Day 3: 100BB 6-Max & Full-Ring GTO Ranges', task: 'Drill Tight Early-Position RFI Floors And Blind Defense.', href: '/tools/preflop-ranges', label: 'Open 13x13 GTO Ranges' },
      { day: 'Day 4: Postflop SPR & Geometric Sizing', task: 'Plan 2-Street And 3-Street Value Commitments In Low-SPR Bloated Pots.', href: '/tools/spr-calculator', label: 'Open SPR Calculator' },
      { day: 'Day 5: Hypergeometric Draw & Implied Odds', task: 'Calculate Exact Turn And River Outs Before Chasing Multiway Draws.', href: '/tools/outs-calculator', label: 'Open Outs Calculator' },
      { day: 'Day 6: Hourly Winrate & Volume Projection', task: 'Convert Your Target BB/100 Into Monthly Live Cash Income.', href: '/tools/poker-winrate-calculator', label: 'Open Winrate Converter' },
      { day: 'Day 7: Session Log & IRS Tax Compliance', task: 'Set Up A Contemporaneous Session Diary Under Rev. Proc. 77-29.', href: '/tools/poker-tax-calculator', label: 'Open Poker Tax Calculator' },
    ],
  },
  'online-6max': {
    id: 'online-6max',
    name: 'Online 6-Max NLHE Cash',
    bankrollCushion: '45 To 65 Buy-Ins (4,500 - 6,500 BB)',
    stdDevProfile: '85 To 95 BB/100 (Moderate-High Multi-Table Variance)',
    targetWinrate: '3.5 To 6.5 BB/100 Across 400+ Hands/Hr',
    summary:
      'Built For Analytical Players Who Want 1-To-2 Hour Stop-Anytime Sessions, High Hand Volume, And Pure 100BB Unexploitable Game Theory Execution.',
    roadmap: [
      { day: 'Day 1: 100BB 6-Max Positional RFI Mastery', task: 'Memorize Exact UTG, MP, CO, BTN, And SB Opening Combos.', href: '/tools/preflop-ranges', label: 'Open 13x13 Range Matrix' },
      { day: 'Day 2: IP & OOP 3-Bet, Squeeze & 4-Bet Sizing', task: 'Calibrate 3.0x IP And 4.0x OOP 3-Bets Plus Villain MDF.', href: '/tools/3bet-calculator', label: 'Open 3-Bet Sizing Solver' },
      { day: 'Day 3: Pot Odds & Minimum Defense Frequency', task: 'Balance Polarized Bluff-To-Value Ratios Across All Three Streets.', href: '/tools/pot-odds-calculator', label: 'Open Pot Odds & MDF Tool' },
      { day: 'Day 4: Geometric Bet Sizing By Street', task: 'Compute Exact Pot Percentages To Jam River Cleanly.', href: '/tools/spr-calculator', label: 'Open SPR & Geometric Tool' },
      { day: 'Day 5: Combinatorial Hand-Vs-Range Equity', task: 'Run Dead-Card Blocker Simulations On Dynamic Board Textures.', href: '/tools/poker-odds-calculator', label: 'Open Equity Calculator' },
      { day: 'Day 6: Sample Variance & Confidence Intervals', task: 'Model 1-SD, 2-SD, And 3-SD Swings Over 100,000 Hands.', href: '/tools/variance-calculator', label: 'Open Variance Simulator' },
      { day: 'Day 7: Brownian Risk Of Ruin Audit', task: 'Verify Your Exact Shot-Taking And Move-Down Buy-In Thresholds.', href: '/tools/bankroll-calculator', label: 'Open Bankroll Calculator' },
    ],
  },
  'mtt': {
    id: 'mtt',
    name: 'Live & Online MTT Tournaments',
    bankrollCushion: '125 To 200 Buy-Ins (High Top-Heavy Payout Variance)',
    stdDevProfile: 'High Payout Skew (Top 1% To 3% Of Finishes Drive Long-Term Profit)',
    targetWinrate: '18% To 35% Net Tournament ROI',
    summary:
      'Designed For Players With 6-To-10+ Hour Session Blocks Who Thrive On Short-Stack Push/Fold Math, PKO Bounty Discounts, And Final Table ICM Pressure.',
    roadmap: [
      { day: 'Day 1: Short-Stack Push/Fold Nash Equilibrium', task: 'Master 5BB To 20BB Shove And Call Charts With Big Blind Antes.', href: '/tools/push-fold-calculator', label: 'Open Push/Fold Charts' },
      { day: 'Day 2: Malmuth-Harville ICM & Bubble Factors', task: 'Convert Chip Stacks Into Real Dollar Equity On Final Table Bubbles.', href: '/tools/icm-calculator', label: 'Open ICM Calculator' },
      { day: 'Day 3: PKO & Mystery Bounty Chip Equivalents', task: 'Discount Calling Thresholds Using The 33.3% Starting Stack Rule.', href: '/tools/bounty-calculator', label: 'Open Bounty Calculator' },
      { day: 'Day 4: Final Table ICM Vs. Chip Chop Deals', task: 'Compare Exact ICM Chops Against Linear Chip Chops And Trophy Saves.', href: '/tools/chop-calculator', label: 'Open Final Table Chop Tool' },
      { day: 'Day 5: Tournament Payout & Bubble Curve Math', task: 'Analyze Top 10%, Top 15%, And Top 20% Prize Pool Escalation.', href: '/tools/payout-calculator', label: 'Open Payout Calculator' },
      { day: 'Day 6: Staking Markup & Backing Packages', task: 'Calculate Investor Breakeven ROI And Post-Series Payout Splits.', href: '/tools/staking-calculator', label: 'Open Staking Calculator' },
      { day: 'Day 7: Form W-2G $5,000 Net Score Planning', task: 'Prepare For Automatic Casino W-2G Reporting And Session Deductions.', href: '/tools/poker-tax-calculator', label: 'Open Poker Tax Calculator' },
    ],
  },
  'plo': {
    id: 'plo',
    name: 'Pot-Limit Omaha (PLO4/PLO5)',
    bankrollCushion: '80 To 150 Buy-Ins (8,000 - 15,000 BB)',
    stdDevProfile: '135 To 165 BB/100 (Extreme Multiway Nut-Draw Variance)',
    targetWinrate: '5 To 10 BB/100 In High-Action Live & Club Games',
    summary:
      'Built For Action-Oriented Strategists With Deep Bankrolls Who Excel At Multiway Nut-Draw Math, Pot-Limit 3x Plus Trail Sizing, And Double-Board Bomb Pots.',
    roadmap: [
      { day: 'Day 1: Exact Pot-Limit 3x + Trail Sizing & Bomb Pots', task: 'Master Dealer Pot-Limit Raise Math And Double-Board Quartering Risk.', href: '/tools/plo-bet-calculator', label: 'Open PLO Max Bet Calculator' },
      { day: 'Day 2: PLO4, PLO5 & PLO6 Multiway Hand Equity', task: 'Run 4-Card And 5-Card Combinatorial Equity Simulations.', href: '/tools/poker-odds-calculator', label: 'Open Multiway Odds Tool' },
      { day: 'Day 3: 12-To-20 Out Wrap & Flush Draw Probabilities', task: 'Replace The Broken Rule Of 4 With Exact Hypergeometric Draw Math.', href: '/tools/outs-calculator', label: 'Open Outs Calculator' },
      { day: 'Day 4: Low-SPR Postflop Commitment Thresholds', task: 'Identify Automatic 1-Street And 2-Street Pot Commitment Zones.', href: '/tools/spr-calculator', label: 'Open SPR Calculator' },
      { day: 'Day 5: Multi-Way All-In Main & Side Pot Slicing', task: 'Audit Complex 4-Way All-In Pot Splits And Uncalled Bet Returns.', href: '/tools/side-pot-calculator', label: 'Open Side Pot Calculator' },
      { day: 'Day 6: 135-165 BB/100 PLO Variance Simulation', task: 'Stress-Test Your Bankroll Against 30-To-50 Buy-In PLO Downswings.', href: '/tools/variance-calculator', label: 'Open Variance Simulator' },
      { day: 'Day 7: PLO Risk Of Ruin Cushion Verification', task: 'Calculate Exact Buy-In Cushions For <1% Career Risk Of Ruin.', href: '/tools/bankroll-calculator', label: 'Open Bankroll Calculator' },
    ],
  },
};

const FORMAT_QUIZ_FAQS = [
  {
    question: 'Should Beginners Start With Cash Games Or Poker Tournaments?',
    answer:
      'Players With Limited Session Windows (1 To 3 Hours) Or Smaller Bankrolls (20 To 40 Buy-Ins) Should Start With 100BB Cash Games Because You Can Sit Down Or Leave At Any Time And Experience Much Lower Payout Variance Than Multi-Table Tournaments.',
  },
  {
    question: 'Why Do Multi-Table Tournaments Require 100 To 200 Buy-Ins?',
    answer:
      'Even Though You Only Risk 1 Buy-In Per Tournament, Only 12% To 15% Of The Field Gets Paid And Roughly 50% Of The Total Prize Pool Is Concentrated In The Top 3 Spots. Going 30 To 50 Tournaments Without A Final Table Is Standard Mathematical Variance.',
  },
  {
    question: 'When Should A Hold\'em Player Transition To Pot-Limit Omaha (PLO)?',
    answer:
      'Transition To PLO4 Or PLO5 When You Have At Least 75 To 120 Buy-Ins Dedicated To The Stake, Strong Discipline To Draw Only To The Nuts In Multiway Pots, And Comfort With 135 To 165 BB/100 Standard Deviation.',
  },
];

export default function FormatQuizPage({
  initialHours = '3-5h',
  initialBankroll = '50-100',
  initialVariance = 'balanced',
  initialFocus = 'postflop',
  initialEnv = 'live',
}) {
  const router = useRouter();
  const [hours, setHours] = useState(initialHours);
  const [bankroll, setBankroll] = useState(initialBankroll);
  const [variance, setVariance] = useState(initialVariance);
  const [focus, setFocus] = useState(initialFocus);
  const [env, setEnv] = useState(initialEnv);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;
    if (q.hours && ['1-2h', '3-5h', '6-10h'].includes(String(q.hours))) setHours(String(q.hours));
    if (q.br && ['20-30', '50-100', '150+'].includes(String(q.br))) setBankroll(String(q.br));
    if (q.var && ['low', 'balanced', 'high'].includes(String(q.var))) setVariance(String(q.var));
    if (q.focus && ['postflop', 'icm', 'multiway'].includes(String(q.focus))) setFocus(String(q.focus));
    if (q.env && ['live', 'online'].includes(String(q.env))) setEnv(String(q.env));
  }, [router.isReady, router.query]);

  const diagnosis = useMemo(() => {
    const scores = {
      'live-cash': 20,
      'online-6max': 20,
      mtt: 20,
      plo: 20,
    };

    // 1. Session block hours
    if (hours === '1-2h') {
      scores['online-6max'] += 28;
      scores['live-cash'] += 10;
      scores.plo += 14;
    } else if (hours === '3-5h') {
      scores['live-cash'] += 28;
      scores['online-6max'] += 18;
      scores.plo += 20;
    } else {
      scores.mtt += 32;
      scores['live-cash'] += 16;
      scores.plo += 16;
    }

    // 2. Bankroll Comfort
    if (bankroll === '20-30') {
      scores['live-cash'] += 28;
      scores['online-6max'] += 12;
    } else if (bankroll === '50-100') {
      scores['online-6max'] += 26;
      scores.plo += 22;
      scores['live-cash'] += 18;
    } else {
      scores.mtt += 28;
      scores.plo += 28;
      scores['online-6max'] += 16;
    }

    // 3. Variance Tolerance
    if (variance === 'low') {
      scores['live-cash'] += 28;
      scores['online-6max'] += 14;
    } else if (variance === 'balanced') {
      scores['online-6max'] += 26;
      scores['live-cash'] += 18;
      scores.mtt += 14;
    } else {
      scores.mtt += 28;
      scores.plo += 28;
    }

    // 4. Mathematical Focus
    if (focus === 'postflop') {
      scores['online-6max'] += 26;
      scores['live-cash'] += 24;
    } else if (focus === 'icm') {
      scores.mtt += 36;
    } else {
      scores.plo += 36;
      scores['live-cash'] += 12;
    }

    // 5. Environment
    if (env === 'live') {
      scores['live-cash'] += 24;
      scores.plo += 14;
      scores.mtt += 12;
    } else {
      scores['online-6max'] += 26;
      scores.mtt += 16;
      scores.plo += 14;
    }

    const ranked = Object.entries(scores)
      .map(([id, rawScore]) => ({
        profile: FORMAT_PROFILES[id],
        matchPct: Math.min(99, Math.max(52, Math.round((rawScore / 150) * 100))),
        rawScore,
      }))
      .sort((a, b) => b.rawScore - a.rawScore);

    return {
      winner: ranked[0],
      runnerUp: ranked[1],
      allRanked: ranked,
    };
  }, [hours, bankroll, variance, focus, env]);

  const handleCopyScenarioLink = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    const shareUrl = `${window.location.origin}/tools/format-quiz?hours=${hours}&br=${bankroll}&var=${variance}&focus=${focus}&env=${env}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const canonicalPath = '/tools/format-quiz';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageDesc =
    'Interactive Poker Format Diagnostic Quiz Matching Your Bankroll, Session Schedule, And Risk Tolerance To Your Optimal Game Format And Study Plan.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'Smarter.Poker Format Selector & Study Roadmap Quiz',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Format Diagnostic & Study Roadmap Generator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Poker Format Selector Quiz', canonicalPath],
      ],
      faqs: FORMAT_QUIZ_FAQS,
      howTo: {
        name: 'How To Find Your Optimal Poker Game Format And 7-Day Study Roadmap',
        description: pageDesc,
        steps: [
          {
            name: 'Select Your Available Session Block Hours And Bankroll Cushion',
            text: 'Specify Whether You Can Play 1-2 Hours, 3-5 Hours, Or 6-10+ Hours And How Many Buy-Ins You Maintain.',
          },
          {
            name: 'Choose Your Variance Tolerance, Math Focus, And Environment',
            text: 'Indicate Whether You Prefer Deep Postflop Trees, Short-Stack ICM Math, Or Multiway Nut-Drawing.',
          },
          {
            name: 'Follow Your Personalized 7-Day Smarter.Poker Calculator & Study Plan',
            text: 'Review Your Top Format Match Score And Launch Each Day\'s Linked Calculator.',
          },
        ],
      },
    });
  }, [pageDesc]);

  return (
    <div style={{ minHeight: '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="Poker Format Selector & Study Plan Quiz"
        description="Interactive Poker Format Diagnostic Quiz Matching Your Bankroll, Session Schedule, And Risk Tolerance To Your Optimal Game Format And Study Plan."
        canonical="/tools/format-quiz"
        jsonLd={schema}
      />

      <main style={{ maxWidth: 1060, margin: '0 auto', padding: '40px 20px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
          <Link href="/" style={{ color: '#25c8ff', textDecoration: 'none' }}>Smarter.Poker</Link>
          {' / '}
          <Link href="/tools" style={{ color: '#25c8ff', textDecoration: 'none' }}>Poker Tools</Link>
          {' / '}
          <span>Poker Format Selector &amp; Study Roadmap Quiz</span>
        </nav>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Poker Format Selector &amp; Study Roadmap Quiz
        </h1>

        <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
          <strong>Direct Answer:</strong> Choosing The Right Primary Poker Format Depends On Five Quantitative Constraints: <strong>Session Block Duration</strong>, <strong>Bankroll Depth In Buy-Ins</strong>, <strong>Standard Deviation Tolerance</strong>, <strong>Mathematical Preference</strong>, And <strong>Live Vs. Online Environment</strong>. Use This 5-Parameter Diagnostic To Match Your Profile And Generate A Custom 7-Day Study Roadmap.
        </p>

        {/* Interactive 5-Parameter Diagnostic */}
        <section
          aria-label="Interactive Poker Format Diagnostic Quiz"
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
              Interactive 5-Parameter Poker Format Diagnostic
            </h2>
            <button
              type="button"
              onClick={handleCopyScenarioLink}
              style={{
                padding: '8px 14px',
                background: copiedLink ? '#059669' : '#25c8ff',
                color: '#020608',
                border: 0,
                borderRadius: '2px',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {copiedLink ? 'Copied Scenario Link!' : 'Copy Shareable Scenario Link'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                1. Available Session Block Hours
                <select
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f8fafc',
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  <option value="1-2h">1-2h (Stop Anytime Sprint)</option>
                  <option value="3-5h">3-5h (Standard Evening Session)</option>
                  <option value="6-10h">6-10h+ (Full Marathon Block)</option>
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                2. Bankroll Comfort In Buy-Ins
                <select
                  value={bankroll}
                  onChange={(e) => setBankroll(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#25c8ff',
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  <option value="20-30">20-30 BI (Compact Roll)</option>
                  <option value="50-100">50-100 BI (Professional Cushion)</option>
                  <option value="150+">150+ BI (Deep Series Roll)</option>
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                3. Variance Tolerance
                <select
                  value={variance}
                  onChange={(e) => setVariance(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f2b84b',
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  <option value="low">Low Steady Hourly</option>
                  <option value="balanced">Balanced</option>
                  <option value="high">High Trophy Hunting</option>
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                4. Mathematical Focus
                <select
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#34d399',
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  <option value="postflop">Deep Postflop Tree</option>
                  <option value="icm">ICM &amp; Short-Stack Math</option>
                  <option value="multiway">Multiway Nut-Drawing</option>
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                5. Preferred Environment
                <select
                  value={env}
                  onChange={(e) => setEnv(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f8fafc',
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  <option value="live">Live Casino Social</option>
                  <option value="online">Online Multi-Table</option>
                </select>
              </label>
            </div>
          </div>

          {/* Primary Recommendation Banner */}
          <div style={{ background: '#020608', border: '1px solid #25c8ff', borderRadius: '2px', padding: 20, marginBottom: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: '#25c8ff', textTransform: 'uppercase', fontWeight: 700 }}>
                  Top Recommended Primary Format ({diagnosis.winner.matchPct}% Profile Match)
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#f8fafc', marginTop: 4 }}>
                  {diagnosis.winner.profile.name}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>Recommended Bankroll Cushion</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#34d399', marginTop: 2 }}>
                  {diagnosis.winner.profile.bankrollCushion}
                </div>
              </div>
            </div>
            <p style={{ fontSize: 14, color: '#cbd5e1', margin: '12px 0 8px 0', lineHeight: 1.6 }}>
              {diagnosis.winner.profile.summary}
            </p>
            <div style={{ fontSize: 13, color: '#f2b84b', fontWeight: 600 }}>
              Target Winrate: {diagnosis.winner.profile.targetWinrate} | Secondary Format Match: {diagnosis.runnerUp.profile.name} ({diagnosis.runnerUp.matchPct}%)
            </div>
          </div>

          {/* 7-Day Smarter.Poker Training & Tool Roadmap */}
          <h3 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            7-Day Smarter.Poker Training &amp; Tool Roadmap For {diagnosis.winner.profile.name}
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#020608', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 12px', color: '#94a3b8' }}>
                Structured 7-Day Curriculum Connecting Your Primary Format To Smarter.Poker Solvers And Calculators
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Study Day &amp; Module</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Daily Drill Objective</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Interactive Smarter.Poker Tool</th>
                </tr>
              </thead>
              <tbody>
                {diagnosis.winner.profile.roadmap.map((step) => (
                  <tr key={step.day} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{step.day}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{step.task}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <Link
                        href={step.href}
                        style={{
                          display: 'inline-block',
                          padding: '6px 12px',
                          background: '#101a20',
                          border: '1px solid #25c8ff',
                          borderRadius: '2px',
                          color: '#25c8ff',
                          fontSize: 12,
                          fontWeight: 700,
                          textDecoration: 'none',
                        }}
                      >
                        {step.label}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* All 4 Format Comparison Table */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Complete Comparison Of Major Poker Formats
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Side-By-Side Match Scores, Bankroll Requirements, Variance Profiles, And Winrate Benchmarks
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Poker Format</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Your Match Score</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Recommended Bankroll</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Variance Profile</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Target Winrate / ROI</th>
                </tr>
              </thead>
              <tbody>
                {diagnosis.allRanked.map((item) => (
                  <tr key={item.profile.id} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{item.profile.name}</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 800 }}>{item.matchPct}% Match</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{item.profile.bankrollCushion}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{item.profile.stdDevProfile}</td>
                    <td style={{ padding: '10px 14px', color: '#f2b84b', fontWeight: 600 }}>{item.profile.targetWinrate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cross-Links */}
        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Explore All Smarter.Poker Training Hubs &amp; Calculators
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              All 24 Free Poker Calculators
            </Link>
            <Link href="/tools/bankroll-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Bankroll &amp; Risk Of Ruin Calculator
            </Link>
            <Link href="/tools/variance-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Variance &amp; Downswing Simulator
            </Link>
            <Link href="/games" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              15 Poker Variants Guide
            </Link>
            <Link href="/learn" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              GTO Strategy Academy
            </Link>
          </div>
        </section>

        <FaqSection faqs={FORMAT_QUIZ_FAQS} />

        <CitationBacklinkBox
          title="Poker Format Selector & Study Roadmap Quiz"
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel="Format Diagnostic Engine"
          badgeValue="7-Day Personalized Study Plan"
          summary="Interactive 5-Parameter Poker Format Diagnostic Matching Bankroll, Session Hours, And Variance Tolerance To A 7-Day Study Roadmap."
          slug="format-quiz"
        />

        <AiPromptLauncher
          title="Poker Format Selector & Study Roadmap Quiz"
          canonicalUrl={canonicalUrl}
          markdownUrl={`${canonicalUrl}.md`}
        />
      </main>
    </div>
  );
}
