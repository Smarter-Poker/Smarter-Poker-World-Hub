/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  LIVE CASH GAME SESSION, STOP-LOSS & ANNUAL HOURLY PLANNER (/tools/session-planner)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Computes Gross & Net Hourly Win Rate ($/hr including Casino Comps minus Tips &
 * Expenses), Projected Monthly & Annual Net Income, Recommended Stop-Loss Limit,
 * Hydration/Break Milestones, and Required Bankroll (20-35 Buy-Ins).
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
import { renderSessionPlannerMarkdown } from '../../src/lib/seo/markdownIngestion.mjs';

const STAKES = [
  { id: '1/2', label: '$1/$2 Live NLH', bb: 2 },
  { id: '1/3', label: '$1/$3 Live NLH', bb: 3 },
  { id: '2/5', label: '$2/$5 Live NLH', bb: 5 },
  { id: '5/10', label: '$5/$10 Live NLH', bb: 10 },
  { id: '10/25', label: '$10/$25 Live NLH', bb: 25 },
];

const SESSION_BENCHMARK_TABLE = [
  {
    stake: '$1/$2 Live NLH ($200 Buy-In)',
    targetWinrate: '10.0 BB/Hr ($20.00/Hr)',
    stopLoss: '2.5 Buy-Ins ($500)',
    bankrollRange: '$4,000 To $7,000 (20-35 Buy-Ins)',
    annualNetAt1150Hrs: '$21,500 / Year',
  },
  {
    stake: '$1/$3 Live NLH ($300 Buy-In)',
    targetWinrate: '9.5 BB/Hr ($28.50/Hr)',
    stopLoss: '2.5 Buy-Ins ($750)',
    bankrollRange: '$6,000 To $10,500 (20-35 Buy-Ins)',
    annualNetAt1150Hrs: '$31,200 / Year',
  },
  {
    stake: '$2/$5 Live NLH ($500 Buy-In)',
    targetWinrate: '9.0 BB/Hr ($45.00/Hr)',
    stopLoss: '3.0 Buy-Ins ($1,500)',
    bankrollRange: '$10,000 To $17,500 (20-35 Buy-Ins)',
    annualNetAt1150Hrs: '$50,600 / Year',
  },
  {
    stake: '$5/$10 Live NLH ($1,000 Buy-In)',
    targetWinrate: '7.5 BB/Hr ($75.00/Hr)',
    stopLoss: '3.0 Buy-Ins ($3,000)',
    bankrollRange: '$20,000 To $35,000 (20-35 Buy-Ins)',
    annualNetAt1150Hrs: '$85,100 / Year',
  },
  {
    stake: '$10/$25 Live NLH ($2,500 Buy-In)',
    targetWinrate: '6.0 BB/Hr ($150.00/Hr)',
    stopLoss: '3.0 Buy-Ins ($7,500)',
    bankrollRange: '$50,000 To $87,500 (20-35 Buy-Ins)',
    annualNetAt1150Hrs: '$171,000 / Year',
  },
];

const SESSION_PLANNER_FAQS = [
  {
    question: 'What Is The Optimal Stop-Loss Limit For A Live Cash Game Session?',
    answer:
      'Most Professional Live Cash Grinders Set A Hard Session Stop-Loss Of 2.5 To 3.0 Full Buy-Ins (250 To 300 Big Blinds). Once You Lose Three Buy-Ins In A Single Sitting, Table Image Deteriorates And Fatigue Or Tilt Degrades Your A-Game Winrate.',
  },
  {
    question: 'How Do Casino Comps And Dealer Tips Affect Net Live Hourly Winrates?',
    answer:
      'Casino Player Card Comps ($1.50 To $3.00 Per Hour) Offset Food And Lodging Costs, While Dealer Tips ($1 To $2 Per Won Pot), Parking, And Meals Subtract $3 To $6 Per Hour From Your Gross Table Winrate. Tracking Net Hourly Winrate Prevents Overestimating Annual Income.',
  },
  {
    question: 'How Many Buy-Ins Do You Need For Live Cash Game Bankroll Management?',
    answer:
      'Because Live Full-Ring Cash Games Carry Lower Standard Deviation (~70 BB/100) And Higher Winrates Than Online 6-Max, A Winning Live Player Needs 20 Buy-Ins For Aggressive Shot-Taking (<5% Risk Of Ruin) To 35 Buy-Ins For Full-Time Professional Security (<1% Risk Of Ruin).',
  },
];

export default function SessionPlannerPage({
  initialStake = '2/5',
  initialBuyInBb = 100,
  initialWinRateBbHr = 9,
  initialHoursPerSession = 6,
  initialSessionsPerWeek = 4,
  initialWeeksPerYear = 48,
  initialCompRate = 2,
  initialExpensesPerSession = 18,
}) {
  const router = useRouter();
  const [stake, setStake] = useState(initialStake);
  const [buyInBb, setBuyInBb] = useState(initialBuyInBb);
  const [winRateBbHr, setWinRateBbHr] = useState(initialWinRateBbHr);
  const [hoursPerSession, setHoursPerSession] = useState(initialHoursPerSession);
  const [sessionsPerWeek, setSessionsPerWeek] = useState(initialSessionsPerWeek);
  const [weeksPerYear, setWeeksPerYear] = useState(initialWeeksPerYear);
  const [compRate, setCompRate] = useState(initialCompRate);
  const [expensesPerSession, setExpensesPerSession] = useState(initialExpensesPerSession);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        router.push('/search');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);

  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;
    if (q.stake && STAKES.some((s) => s.id === q.stake)) setStake(String(q.stake));
    if (q.buyin !== undefined) setBuyInBb(Math.max(40, Math.min(300, Number(q.buyin) || 100)));
    if (q.wr !== undefined) setWinRateBbHr(Math.max(1, Math.min(30, Number(q.wr) || 9)));
    if (q.hrs !== undefined) setHoursPerSession(Math.max(1, Math.min(16, Number(q.hrs) || 6)));
    if (q.sess !== undefined) setSessionsPerWeek(Math.max(1, Math.min(7, Number(q.sess) || 4)));
    if (q.weeks !== undefined) setWeeksPerYear(Math.max(1, Math.min(52, Number(q.weeks) || 48)));
    if (q.comp !== undefined) setCompRate(Math.max(0, Math.min(20, Number(q.comp) || 2)));
    if (q.exp !== undefined) setExpensesPerSession(Math.max(0, Math.min(500, Number(q.exp) || 18)));
  }, [router.isReady, router.query]);

  const metrics = useMemo(() => {
    const stakeObj = STAKES.find((s) => s.id === stake) || STAKES[2];
    const bbDollars = stakeObj.bb;
    const safeBuyInBb = Math.max(40, Math.min(300, Number(buyInBb) || 100));
    const buyInDollars = safeBuyInBb * bbDollars;
    const safeWrBbHr = Math.max(0.5, Number(winRateBbHr) || 9);
    const grossHourly = safeWrBbHr * bbDollars;
    const safeHrs = Math.max(1, Math.min(16, Number(hoursPerSession) || 6));
    const safeSess = Math.max(1, Math.min(7, Number(sessionsPerWeek) || 4));
    const safeWeeks = Math.max(1, Math.min(52, Number(weeksPerYear) || 48));
    const safeComp = Math.max(0, Number(compRate) || 2);
    const safeExp = Math.max(0, Number(expensesPerSession) || 18);

    const hourlyExpenseDrag = safeExp / safeHrs;
    const netHourly = grossHourly + safeComp - hourlyExpenseDrag;
    const annualHours = safeHrs * safeSess * safeWeeks;
    const monthlyHours = Math.round(annualHours / 12);
    const monthlyNet = Math.round(netHourly * (annualHours / 12));
    const annualNet = Math.round(netHourly * annualHours);

    const stopLossBuyIns = safeBuyInBb >= 150 ? 2.5 : 3.0;
    const stopLossDollars = Math.round(stopLossBuyIns * buyInDollars);

    const minBankroll = 20 * buyInDollars;
    const proBankroll = 35 * buyInDollars;
    const breakCount = Math.max(1, Math.floor(safeHrs / 2));

    return {
      stakeObj,
      bbDollars,
      safeBuyInBb,
      buyInDollars,
      safeWrBbHr,
      grossHourly: grossHourly.toFixed(2),
      netHourly: netHourly.toFixed(2),
      safeHrs,
      safeSess,
      safeWeeks,
      safeComp: safeComp.toFixed(2),
      safeExp,
      monthlyHours,
      annualHours,
      monthlyNet,
      annualNet,
      stopLossBuyIns,
      stopLossDollars,
      minBankroll,
      proBankroll,
      breakCount,
    };
  }, [stake, buyInBb, winRateBbHr, hoursPerSession, sessionsPerWeek, weeksPerYear, compRate, expensesPerSession]);

  const handleCopyScenarioLink = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    const shareUrl = `${window.location.origin}/tools/session-planner?stake=${encodeURIComponent(stake)}&buyin=${metrics.safeBuyInBb}&wr=${metrics.safeWrBbHr}&hrs=${metrics.safeHrs}&sess=${metrics.safeSess}&weeks=${metrics.safeWeeks}&comp=${metrics.safeComp}&exp=${metrics.safeExp}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const canonicalPath = '/tools/session-planner';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Live Cash Game Session, Stop-Loss & Annual Hourly Planner';
  const pageDesc =
    'Plan Your Live Cash Game Sessions With Gross And Net Hourly Winrates, Casino Comps, A-Game Stop-Loss Limits, Annual Income Projections, And Bankroll Requirements.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: pageTitle,
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Cash Game Session & Stop-Loss Planner',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Live Cash Session Planner', canonicalPath],
      ],
      faqs: SESSION_PLANNER_FAQS,
      howTo: {
        name: 'How To Plan A Live Cash Game Session And Annual Poker Schedule',
        description: pageDesc,
        steps: [
          {
            name: 'Select Your Live Cash Game Stake And Buy-In Depth',
            text: 'Choose Between $1/$2, $1/$3, $2/$5, $5/$10, Or $10/$25 And Enter Your Standard Buy-In In Big Blinds.',
          },
          {
            name: 'Input Target Hourly Winrate, Session Hours, And Comps/Expenses',
            text: 'Enter Expected BB/Hr Winrate, Weekly Session Schedule, Casino Comp Rate, And Per-Session Expenses.',
          },
          {
            name: 'Apply Net Hourly EV, Stop-Loss Limit, And Required Bankroll',
            text: 'Review Your Projected Monthly And Annual Net Income, Hard Stop-Loss Threshold, And 20-35 Buy-In Bankroll Range.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const isEmbed = router.query?.embed === 'true';

  return (
    <div style={{ minHeight: isEmbed ? 'auto' : '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="Live Cash Game Session And Hourly Planner"
        description="Plan Your Live Cash Game Sessions With Gross And Net Hourly Winrates, Casino Comps, A-Game Stop-Loss Limits, Annual Income Projections, And Bankroll Requirements."
        canonical="/tools/session-planner"
        jsonLd={schema}
      />

      <main style={{ maxWidth: 1060, margin: '0 auto', padding: isEmbed ? '16px 14px 24px' : '40px 20px 80px' }}>
        {!isEmbed && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
            <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8' }}>
              <Link href="/" style={{ color: '#25c8ff', textDecoration: 'none' }}>Smarter.Poker</Link>
              {' / '}
              <Link href="/tools" style={{ color: '#25c8ff', textDecoration: 'none' }}>Poker Tools</Link>
              {' / '}
              <span>Live Cash Game Session Planner</span>
            </nav>
            <Link
              href="/search"
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#f2b84b',
                background: '#101a20',
                border: '1px solid #334155',
                borderRadius: '2px',
                padding: '5px 10px',
                textDecoration: 'none',
              }}
            >
              Press Cmd+K To Search All 400+ Tools &amp; Guides
            </Link>
          </div>
        )}

        <h1 style={{ fontSize: isEmbed ? 22 : 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Live Cash Game Session, Stop-Loss &amp; Annual Hourly Planner
        </h1>

        {!isEmbed && (
          <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
            <strong>Direct Answer:</strong> True Live Cash Game Profitability Equals <strong>Gross Hourly Winrate + Casino Comps Minus Session Expenses And Tips</strong>, Protected By A Strict <strong>2.5 To 3.0 Buy-In Session Stop-Loss</strong> And A Dedicated Bankroll Of <strong>20 To 35 Full Buy-Ins</strong> To Keep Risk Of Ruin Under 5%.
          </p>
        )}

        <section
          aria-label="Interactive Live Cash Game Session Planner"
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
              Interactive Session Hourly EV, Stop-Loss &amp; Bankroll Solver
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 22 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Live Cash Game Stake
                <select
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#25c8ff',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                >
                  {STAKES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {[
              { label: 'Buy-In Depth (BBs)', val: buyInBb, set: setBuyInBb, step: 10, color: '#f8fafc' },
              { label: 'Expected Win Rate (BB/Hr)', val: winRateBbHr, set: setWinRateBbHr, step: 0.5, color: '#34d399' },
              { label: 'Hours Per Session', val: hoursPerSession, set: setHoursPerSession, step: 1, color: '#f8fafc' },
              { label: 'Sessions Per Week', val: sessionsPerWeek, set: setSessionsPerWeek, step: 1, color: '#f8fafc' },
              { label: 'Weeks Played Per Year', val: weeksPerYear, set: setWeeksPerYear, step: 1, color: '#f8fafc' },
              { label: 'Casino Comp Rate ($/Hr)', val: compRate, set: setCompRate, step: 0.5, color: '#f2b84b' },
              { label: 'Tips & Expenses / Session ($)', val: expensesPerSession, set: setExpensesPerSession, step: 2, color: '#f87171' },
            ].map((input) => (
              <div key={input.label}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                  {input.label}
                  <input
                    type="number"
                    min="0"
                    step={input.step}
                    value={input.val}
                    onChange={(e) => input.set(e.target.value)}
                    style={{
                      width: '100%',
                      marginTop: 6,
                      padding: '10px 12px',
                      borderRadius: '2px',
                      border: '1px solid #334155',
                      background: '#020608',
                      color: input.color,
                      fontSize: 15,
                      fontWeight: 700,
                    }}
                  />
                </label>
              </div>
            ))}
          </div>

          {/* KPI Output Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 18 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Gross &amp; Net Hourly Win Rate
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                ${metrics.netHourly}/Hr Net
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Gross: ${metrics.grossHourly}/Hr + ${metrics.safeComp}/Hr Comps
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #34d399' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Projected Monthly &amp; Annual Net
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                ${metrics.annualNet.toLocaleString('en-US')}/Yr
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                ${metrics.monthlyNet.toLocaleString('en-US')}/Mo ({metrics.annualHours} Hrs/Yr)
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f87171' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Recommended Stop-Loss Limit
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#f87171', marginTop: 4 }}>
                -${metrics.stopLossDollars.toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                {metrics.stopLossBuyIns} Buy-Ins (${metrics.buyInDollars} Buy-In)
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Required Bankroll (20-35 Buy-Ins)
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#f2b84b', marginTop: 6 }}>
                ${metrics.minBankroll.toLocaleString('en-US')} - ${metrics.proBankroll.toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                &lt; 5% Risk Of Ruin Threshold
              </div>
            </div>
          </div>

          <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#25c8ff', marginBottom: 4 }}>
              Optimal Session Duration &amp; Hydration / Break Milestones
            </div>
            <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.55 }}>
              For Your {metrics.safeHrs}-Hour Session Plan, Schedule <strong>{metrics.breakCount} Mandatory 10-Minute Table Walk &amp; Hydration Breaks</strong> (Every 120 Minutes On The Button Pass) And Quit Immediately If Your Stack Drops Below The <strong>-${metrics.stopLossDollars.toLocaleString('en-US')} A-Game Stop-Loss</strong>.
            </div>
          </div>
        </section>

        {/* Reference Matrix */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Live Cash Game Stake, Stop-Loss &amp; Annual Income Benchmark Matrix
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Standard Live Cash Game Winrates, Stop-Loss Limits, Required Bankroll Cushion, And Annual Net Income At 1,150 Hours/Year
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Live Cash Stake</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Target Crusher Winrate</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Session Stop-Loss</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Required Bankroll</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Annual Net EV (1,150 Hrs)</th>
                </tr>
              </thead>
              <tbody>
                {SESSION_BENCHMARK_TABLE.map((row) => (
                  <tr key={row.stake} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.stake}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.targetWinrate}</td>
                    <td style={{ padding: '10px 14px', color: '#f87171', fontWeight: 700 }}>{row.stopLoss}</td>
                    <td style={{ padding: '10px 14px', color: '#f2b84b', fontWeight: 700 }}>{row.bankrollRange}</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 700 }}>{row.annualNetAt1150Hrs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cross-Links */}
        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Bankroll &amp; Live Cash Game Calculators
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/bankroll-calculator" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Bankroll &amp; Risk Of Ruin Calculator
            </Link>
            <Link href="/tools/poker-winrate-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Winrate (BB/100 To $/Hr) Calculator
            </Link>
            <Link href="/tools/rake-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Live Cash Game Rake Calculator
            </Link>
            <Link href="/tools/poker-tax-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              US Poker Tax &amp; Form W-2G Calculator
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              All 34 Poker Calculators
            </Link>
          </div>
        </section>

        {!isEmbed && (
          <>
            <FaqSection faqs={SESSION_PLANNER_FAQS} />

            <CitationBacklinkBox
              title="Live Cash Game Session And Hourly Planner"
              canonicalUrl={canonicalUrl}
              badgeType="gto"
              badgeLabel="Live Cash Session Planner"
              badgeValue="Hourly EV, Stop-Loss & Bankroll"
              summary="Interactive Live Cash Game Session Planner Computing Net Hourly Winrate With Comps, Stop-Loss Limits, Annual Income, And Bankroll Depth."
              slug="session-planner"
            />

            <AiPromptLauncher
              title="Live Cash Game Session And Hourly Planner"
              canonicalUrl={canonicalUrl}
              markdownUrl={`${canonicalUrl}.md`}
            />
          </>
        )}
      </main>
    </div>
  );
}

export async function getServerSideProps({ req, res, query }) {
  const accept = String(req?.headers?.accept || '');
  if (
    query?.format === 'md' ||
    query?.format === 'markdown' ||
    accept.includes('text/markdown') ||
    req?.url?.includes('format=md')
  ) {
    const md = renderSessionPlannerMarkdown({
      stake: query?.stake,
      winRateHr: query?.wr,
      hoursPerSession: query?.hrs,
      sessionsPerWeek: query?.sess,
      weeksPerYear: query?.weeks,
      compRate: query?.comp,
      expenses: query?.exp,
    });
    if (md) {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Vary', 'Accept');
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      res.write(md);
      res.end();
      return { props: {} };
    }
  }
  return { props: {} };
}
