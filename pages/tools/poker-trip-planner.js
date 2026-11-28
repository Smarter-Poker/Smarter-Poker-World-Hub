/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  LIVE POKER TRIP & FESTIVAL BUDGET PLANNER (/tools/poker-trip-planner)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Computes Total Trip Overhead ($), Effective Expense Rake % on Buy-Ins,
 * Minimum Gross Winnings Needed to Break Even ($), Projected Net Trip Profit ($),
 * and Recommended Total Trip Bankroll to Bring ($).
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
import SmarterConversionCta from '../../src/components/seo/SmarterConversionCta';
import SmarterAccountUnlockGate from '../../src/components/seo/SmarterAccountUnlockGate';
import SmarterCalculatorSaveBar from '../../src/components/seo/SmarterCalculatorSaveBar';
import CalculatorShareAndPresets from '../../src/components/tools/CalculatorShareAndPresets';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';
import { useSolvedSpotUrlSync } from '../../src/lib/seo/solvedSpotEngine';
import { setPublicSeoHtmlCache } from '../../src/lib/seo/edgeCacheHeaders.mjs';
import { VENUE_COUNT_LABEL } from '../../src/lib/venueCount.mjs';

const TRIP_PRESETS = [
  {
    id: 'preset_wsop_vegas',
    label: 'WSOP Vegas 10-Day Trip',
    tripDays: 10,
    flightCost: 480,
    hotelPerNight: 165,
    dailyPerDiem: 85,
    plannedBuyInsTotal: 12000,
    expectedBulletsMultiplier: 1.35,
    expectedRoiPct: 22,
    cashHoursPerDay: 2,
    cashHourlyRate: 45,
  },
  {
    id: 'preset_texas_cash',
    label: 'Texas Cash Game Weekend',
    tripDays: 4,
    flightCost: 320,
    hotelPerNight: 140,
    dailyPerDiem: 75,
    plannedBuyInsTotal: 1500,
    expectedBulletsMultiplier: 1.0,
    expectedRoiPct: 18,
    cashHoursPerDay: 9,
    cashHourlyRate: 65,
  },
  {
    id: 'preset_wpt_seminole',
    label: 'WPT Seminole Hard Rock Week',
    tripDays: 7,
    flightCost: 420,
    hotelPerNight: 210,
    dailyPerDiem: 95,
    plannedBuyInsTotal: 8500,
    expectedBulletsMultiplier: 1.3,
    expectedRoiPct: 20,
    cashHoursPerDay: 3,
    cashHourlyRate: 50,
  },
  {
    id: 'preset_local_weekend',
    label: 'Local Weekend Series',
    tripDays: 3,
    flightCost: 60,
    hotelPerNight: 110,
    dailyPerDiem: 55,
    plannedBuyInsTotal: 2200,
    expectedBulletsMultiplier: 1.25,
    expectedRoiPct: 24,
    cashHoursPerDay: 2,
    cashHourlyRate: 35,
  },
];

const TRIP_BENCHMARK_TABLE = [
  {
    festivalType: 'WSOP Las Vegas 10-Day Series',
    typicalOverhead: '$2,500 To $3,400 Overhead',
    minSchedule: '$12,000+ Total Buy-Ins',
    expenseRakeCap: 'Under 20% Expense Drag',
    guidance: 'Split Hotel Rooms Or Book Off-Strip Condos To Keep Travel Overhead Below 50% Of Expected Pre-Expense EV',
  },
  {
    festivalType: 'Texas Card House 4-Day Cash Trip',
    typicalOverhead: '$950 To $1,300 Overhead',
    minSchedule: '32+ Cash Game Grind Hours',
    expenseRakeCap: '$30/Hr Overhead Offset',
    guidance: 'Target 8 To 10 Hours Daily During Peak Thursday-Sunday Evening Sessions To Amortize Flight Cost',
  },
  {
    festivalType: 'WPT / Wynn Destination 7-Day Stop',
    typicalOverhead: '$2,200 To $3,100 Overhead',
    minSchedule: '$9,000+ Total Buy-Ins',
    expenseRakeCap: 'Under 22% Expense Drag',
    guidance: 'Sell 20% To 30% Action At Slight Markup Or Mix In $2/$5 Evening Cash Games To Cover Hotel',
  },
  {
    festivalType: 'Regional Drive-In Circuit Weekend',
    typicalOverhead: '$450 To $650 Overhead',
    minSchedule: '$2,500+ Total Buy-Ins',
    expenseRakeCap: 'Under 18% Expense Drag',
    guidance: 'Highest Net ROI Per Dollar Deployed Because Zero Airfare Preserves Almost All Pre-Expense Edge',
  },
];

const TRIP_PLANNER_FAQS = [
  {
    question: 'What Is Effective Expense Rake Percentage On A Live Poker Trip?',
    answer:
      'Effective Expense Rake Divides Your Total Non-Poker Travel Overhead (Flights, Hotel Nights, Food, And Rideshares) By Your Total Tournament Buy-In Volume. If You Spend $2,500 In Travel Expenses To Play Only $5,000 In Tournaments, Your Travel Adds An Extra 50% Hidden Rake On Top Of Casino Entry Fees.',
  },
  {
    question: 'How Much Total Buy-In Volume Do You Need To Justify A Flight And Hotel Poker Trip?',
    answer:
      'Professional Tournament Grinders Aim To Keep Total Trip Overhead Below 15% To 20% Of Total Action Deployed (Or Below 50% Of Pre-Expense Expected Value) So That Travel Costs Do Not Wipe Out Their Long-Term Skill ROI.',
  },
  {
    question: 'How Much Liquid Cash Bankroll Should You Bring On A 7-To-10 Day Poker Festival?',
    answer:
      'Bring 100% Of Your Planned Tournament Schedule Including Expected Re-Entry Bullets, Plus At Least 4 To 5 Full Cash Game Buy-Ins And 100% Of Your Travel Overhead Set Aside In A Separate Envelope.',
  },
];

export default function PokerTripPlannerPage() {
  const router = useRouter();
  const [tripDays, setTripDays] = useState(10);
  const [flightCost, setFlightCost] = useState(480);
  const [hotelPerNight, setHotelPerNight] = useState(165);
  const [dailyPerDiem, setDailyPerDiem] = useState(85);
  const [plannedBuyInsTotal, setPlannedBuyInsTotal] = useState(12000);
  const [expectedBulletsMultiplier, setExpectedBulletsMultiplier] = useState(1.35);
  const [expectedRoiPct, setExpectedRoiPct] = useState(22);
  const [cashHoursPerDay, setCashHoursPerDay] = useState(2);
  const [cashHourlyRate, setCashHourlyRate] = useState(45);
  const [activePresetId, setActivePresetId] = useState('preset_wsop_vegas');

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
    if (q.days !== undefined) setTripDays(Math.max(1, Number(q.days) || 10));
    if (q.flight !== undefined) setFlightCost(Math.max(0, Number(q.flight) || 480));
    if (q.hotel !== undefined) setHotelPerNight(Math.max(0, Number(q.hotel) || 165));
    if (q.food !== undefined) setDailyPerDiem(Math.max(0, Number(q.food) || 85));
    if (q.buyins !== undefined) setPlannedBuyInsTotal(Math.max(0, Number(q.buyins) || 12000));
    if (q.bullets !== undefined) setExpectedBulletsMultiplier(Math.max(1, Number(q.bullets) || 1.35));
    if (q.roi !== undefined) setExpectedRoiPct(Number(q.roi) || 22);
    if (q.chrs !== undefined) setCashHoursPerDay(Math.max(0, Number(q.chrs) || 2));
    if (q.crate !== undefined) setCashHourlyRate(Number(q.crate) || 45);
  }, [router.isReady, router.query]);

  useSolvedSpotUrlSync({
    days: tripDays,
    flight: flightCost,
    hotel: hotelPerNight,
    food: dailyPerDiem,
    buyins: plannedBuyInsTotal,
    bullets: expectedBulletsMultiplier,
    roi: expectedRoiPct,
    chrs: cashHoursPerDay,
    crate: cashHourlyRate,
  });

  const handleSelectPreset = (preset) => {
    setActivePresetId(preset.id);
    setTripDays(preset.tripDays);
    setFlightCost(preset.flightCost);
    setHotelPerNight(preset.hotelPerNight);
    setDailyPerDiem(preset.dailyPerDiem);
    setPlannedBuyInsTotal(preset.plannedBuyInsTotal);
    setExpectedBulletsMultiplier(preset.expectedBulletsMultiplier);
    setExpectedRoiPct(preset.expectedRoiPct);
    setCashHoursPerDay(preset.cashHoursPerDay);
    setCashHourlyRate(preset.cashHourlyRate);
    if (router.isReady) {
      router.replace(
        {
          pathname: '/tools/poker-trip-planner',
          query: {
            days: preset.tripDays,
            flight: preset.flightCost,
            hotel: preset.hotelPerNight,
            food: preset.dailyPerDiem,
            buyins: preset.plannedBuyInsTotal,
            bullets: preset.expectedBulletsMultiplier,
            roi: preset.expectedRoiPct,
            chrs: preset.cashHoursPerDay,
            crate: preset.cashHourlyRate,
          },
        },
        undefined,
        { shallow: true }
      );
    }
  };

  const metrics = useMemo(() => {
    const safeDays = Math.max(1, Math.round(Number(tripDays) || 10));
    const safeFlight = Math.max(0, Number(flightCost) || 0);
    const safeHotel = Math.max(0, Number(hotelPerNight) || 0);
    const safeFood = Math.max(0, Number(dailyPerDiem) || 0);
    const safeBaseBuyIns = Math.max(0, Number(plannedBuyInsTotal) || 0);
    const safeBullets = Math.max(1, Math.min(3, Number(expectedBulletsMultiplier) || 1.35));
    const safeRoi = Number(expectedRoiPct) || 0;
    const safeCashHrs = Math.max(0, Number(cashHoursPerDay) || 0);
    const safeCashRate = Number(cashHourlyRate) || 0;

    const totalTripOverhead = safeFlight + safeDays * safeHotel + safeDays * safeFood;
    const totalTournamentAction = safeBaseBuyIns * safeBullets;
    const effectiveExpenseRakePct =
      totalTournamentAction > 0 ? (totalTripOverhead / totalTournamentAction) * 100 : 0;

    const grossMttEv = totalTournamentAction * (safeRoi / 100);
    const grossCashEv = safeDays * safeCashHrs * safeCashRate;
    const totalGrossEv = grossMttEv + grossCashEv;
    const projectedNetTripProfit = totalGrossEv - totalTripOverhead;
    const minGrossWinningsToBreakEven = totalTournamentAction + totalTripOverhead;
    const recommendedTripBankroll = Math.round(
      totalTournamentAction * 1.15 + totalTripOverhead + (safeCashHrs > 0 ? 3000 : 0)
    );

    return {
      safeDays,
      totalTripOverhead: Math.round(totalTripOverhead),
      totalTournamentAction: Math.round(totalTournamentAction),
      effectiveExpenseRakePct: effectiveExpenseRakePct.toFixed(1),
      totalGrossEv: Math.round(totalGrossEv),
      projectedNetTripProfit: Math.round(projectedNetTripProfit),
      minGrossWinningsToBreakEven: Math.round(minGrossWinningsToBreakEven),
      recommendedTripBankroll,
    };
  }, [
    tripDays,
    flightCost,
    hotelPerNight,
    dailyPerDiem,
    plannedBuyInsTotal,
    expectedBulletsMultiplier,
    expectedRoiPct,
    cashHoursPerDay,
    cashHourlyRate,
  ]);

  const canonicalPath = '/tools/poker-trip-planner';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageDesc =
    'Plan Your WSOP, WPT, Or Texas Cash Game Poker Trip Budget: Calculate Total Travel Overhead, Effective Expense Rake %, Break-Even Gross Winnings, And Net Trip EV.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'Poker Trip And Series Budget Planner',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Live Poker Trip & Tournament Series Budget Calculator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Poker Trip Budget Planner', canonicalPath],
      ],
      faqs: TRIP_PLANNER_FAQS,
      howTo: {
        name: 'How To Calculate Your Live Poker Trip Budget And Expense Rake',
        description: pageDesc,
        steps: [
          {
            name: 'Enter Trip Duration, Flights, Hotel Nightly Rate, And Daily Per Diem',
            text: 'Input Your Total Travel Days And Fixed Lodging, Airfare, And Food Overhead Costs.',
          },
          {
            name: 'Set Planned Tournament Buy-Ins, Re-Entry Multiplier, And Cash Game Hours',
            text: 'Enter Your Tournament Schedule Action, Expected ROI, And Supplemental Cash Game Hourly Winrate.',
          },
          {
            name: 'Review Expense Rake Percentage, Break-Even Winnings, And Net Trip EV',
            text: 'Verify That Your Projected Gross Poker EV Exceeds Travel Overhead And Check Recommended Trip Bankroll.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const summaryText = `${metrics.safeDays}-Day Poker Trip: Total Travel Overhead = $${metrics.totalTripOverhead.toLocaleString('en-US')} | Planned Action = $${metrics.totalTournamentAction.toLocaleString('en-US')} (${metrics.effectiveExpenseRakePct}% Expense Rake) | Projected Net Profit = $${metrics.projectedNetTripProfit.toLocaleString('en-US')} | Recommended Bankroll = $${metrics.recommendedTripBankroll.toLocaleString('en-US')}`;

  return (
    <div style={{ minHeight: '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="Poker Trip And Series Budget Planner"
        description={pageDesc}
        canonical={canonicalPath}
        jsonLd={schema}
      />

      <main style={{ maxWidth: 1060, margin: '0 auto', padding: '40px 20px 80px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
          <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8' }}>
            <Link href="/" style={{ color: '#25c8ff', textDecoration: 'none' }}>Smarter.Poker</Link>
            {' / '}
            <Link href="/tools" style={{ color: '#25c8ff', textDecoration: 'none' }}>Poker Tools</Link>
            {' / '}
            <span>Poker Trip &amp; Series Budget Planner</span>
          </nav>
          <Link
            href="/search"
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#38bdf8',
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

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Live Poker Trip &amp; Festival Budget Planner
        </h1>

        <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 24px 0' }}>
          <strong>Direct Answer:</strong> Flights, Hotels, And Daily Food Act As An Invisible <strong>Expense Rake</strong> On Your Live Tournament And Cash Game Schedule. Keep Total Travel Overhead Below <strong>15% To 20% Of Total Buy-In Volume</strong> So Your Pre-Expense Skill ROI Remains Profitable After Travel Costs.
        </p>

        <CalculatorShareAndPresets
          toolTitle="Poker Trip And Series Budget Planner"
          toolPath={canonicalPath}
          summaryText={summaryText}
          presets={TRIP_PRESETS}
          onSelectPreset={handleSelectPreset}
          activePresetId={activePresetId}
        />

        <section
          aria-label="Interactive Poker Trip Budget Planner"
          style={{
            background: '#101a20',
            border: '1px solid #1e293b',
            borderRadius: '2px',
            padding: 24,
            marginBottom: 36,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#25c8ff', margin: '0 0 16px 0' }}>
            Enter Travel Costs, Tournament Buy-In Volume &amp; Cash Grind Hours
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 20 }}>
            {[
              { label: 'Trip Duration (Days)', val: tripDays, set: setTripDays, step: 1, color: '#25c8ff' },
              { label: 'Flight / Travel Cost ($)', val: flightCost, set: setFlightCost, step: 25, color: '#f8fafc' },
              { label: 'Hotel Rate Per Night ($)', val: hotelPerNight, set: setHotelPerNight, step: 15, color: '#f8fafc' },
              { label: 'Daily Food / Uber Per Diem ($)', val: dailyPerDiem, set: setDailyPerDiem, step: 10, color: '#f8fafc' },
              { label: 'Base Tournament Buy-Ins ($)', val: plannedBuyInsTotal, set: setPlannedBuyInsTotal, step: 500, color: '#34d399' },
              { label: 'Expected Bullets Multiplier (1.0-2.5x)', val: expectedBulletsMultiplier, set: setExpectedBulletsMultiplier, step: 0.05, color: '#38bdf8' },
              { label: 'Expected Pre-Expense MTT ROI (%)', val: expectedRoiPct, set: setExpectedRoiPct, step: 1, color: '#34d399' },
              { label: 'Side Cash Game Hours / Day', val: cashHoursPerDay, set: setCashHoursPerDay, step: 1, color: '#25c8ff' },
              { label: 'Cash Game Hourly Rate ($/Hr)', val: cashHourlyRate, set: setCashHourlyRate, step: 5, color: '#34d399' },
            ].map((item) => (
              <div key={item.label}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                  {item.label}
                  <input
                    type="number"
                    step={item.step}
                    value={item.val}
                    onChange={(e) => item.set(e.target.value)}
                    style={{
                      width: '100%',
                      marginTop: 6,
                      padding: '10px 12px',
                      borderRadius: '2px',
                      border: '1px solid #334155',
                      background: '#020608',
                      color: item.color,
                      fontSize: 15,
                      fontWeight: 700,
                    }}
                  />
                </label>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f87171' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Total Trip Travel Overhead
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f87171', marginTop: 4 }}>
                ${metrics.totalTripOverhead.toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Effective Expense Rake: {metrics.effectiveExpenseRakePct}% Of Buy-Ins
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Minimum Gross Cash To Break Even
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                ${metrics.minGrossWinningsToBreakEven.toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Includes ${metrics.totalTournamentAction.toLocaleString('en-US')} Bullet Exposure
              </div>
            </div>

            <div
              style={{
                background: '#020608',
                padding: 16,
                borderRadius: '2px',
                border: `1px solid ${metrics.projectedNetTripProfit >= 0 ? '#34d399' : '#f87171'}`,
              }}
            >
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Projected Net Trip Profit
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  color: metrics.projectedNetTripProfit >= 0 ? '#34d399' : '#f87171',
                  marginTop: 4,
                }}
              >
                {metrics.projectedNetTripProfit >= 0 ? '+' : ''}${metrics.projectedNetTripProfit.toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Pre-Expense Gross EV: +${metrics.totalGrossEv.toLocaleString('en-US')}
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #38bdf8' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Recommended Trip Bankroll To Bring
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#38bdf8', marginTop: 4 }}>
                ${metrics.recommendedTripBankroll.toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Covers Bullets + 15% Buffer + Cash Cushion
              </div>
            </div>
          </div>
        </section>

        <div style={{ marginBottom: 32 }}>
          <SmarterCalculatorSaveBar
            toolSlug="poker-trip-planner"
            toolName="Poker Trip & Series Budget Planner"
            eyebrow="Free Trip Budget Cloud Sync"
            title="Save This Poker Trip & Series Budget Free"
            description="Sync Buy-In Allocations, Travel Overhead & Required ROI Targets For Your Next Series Free."
            ctaLabel="Save Trip Plan Free"
            summaryText={summaryText}
            redirectPath={canonicalPath}
          />
          <SmarterAccountUnlockGate
            variant="calculator-pro"
            context="tools-poker-trip-planner"
            redirectPath={canonicalPath}
          />
        </div>

        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Live Poker Trip &amp; Festival Overhead Benchmarks
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Recommended Action Volume And Expense Rake Ceilings Across Major North American Poker Destinations
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Trip Archetype</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Typical Overhead</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Target Action Volume</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Expense Drag Ceiling</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Bankroll Optimization Rule</th>
                </tr>
              </thead>
              <tbody>
                {TRIP_BENCHMARK_TABLE.map((row) => (
                  <tr key={row.festivalType} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.festivalType}</td>
                    <td style={{ padding: '10px 14px', color: '#f87171', fontWeight: 700 }}>{row.typicalOverhead}</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 700 }}>{row.minSchedule}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.expenseRakeCap}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.guidance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <SmarterConversionCta
          compact
          eyebrow="Free Smarter.Poker Account"
          title="Save Your Poker Trip Budget & Track Live Series Free"
          description={`Plan Festival Travel Costs, Browse ${VENUE_COUNT_LABEL} Poker Rooms, And Track Series Results In Bankroll Manager.`}
          primaryLabel="Create Free Account"
          primaryHref="/auth/signup?redirect=/tools/poker-trip-planner&src=trip-planner"
          secondaryLabel="Sign In"
          secondaryHref="/auth/login?redirect=/tools/poker-trip-planner"
        />

        <FaqSection faqs={TRIP_PLANNER_FAQS} />

        <CitationBacklinkBox
          title="Poker Trip And Series Budget Planner"
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel="Series Logistics Engine"
          badgeValue="Festival ROI & Overhead Planner"
          summary="Calculates Live Poker Trip Overhead, Effective Expense Rake %, Break-Even Winnings, And Net Trip EV."
          slug="poker-trip-planner"
        />

        <AiPromptLauncher
          title="Poker Trip And Series Budget Planner"
          canonicalUrl={canonicalUrl}
          markdownUrl={`${canonicalUrl}.md`}
        />
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
    const { renderHubToolMarkdown } = await import('../api/hub-tool-markdown');
    const md = renderHubToolMarkdown('/tools/poker-trip-planner', query);
    if (md) {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Vary', 'Accept');
      res.write(md);
      res.end();
      return { props: {} };
    }
  }
  setPublicSeoHtmlCache(res);
  return { props: {} };
}
