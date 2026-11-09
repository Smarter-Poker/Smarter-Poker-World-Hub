/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  LIVE CASH GAME RAKE & TIMED SEAT COLLECTION CALCULATOR
 *  (/tools/rake-calculator)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive comparison calculator for percentage pot drop rake (10% up to cap
 * + promo/BBJ drop) vs timed seat collection ($6-$15 per half-hour) at
 * /tools/rake-calculator.
 *
 * House style: Title Case, zero em dashes, #SmarterCasinoRealism theme.
 */

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';

const REGIONAL_RAKE_BENCHMARK_TABLE = [
  {
    regionModel: 'Las Vegas Strip $1/$3 & $2/$5 NLH',
    collectionRule: '10% Pot Drop Up To $5 - $6 Cap (+ $1 - $2 Promo)',
    tableHourlyExtracted: '~$145 - $175 / Hr Across 9 Seats',
    perPlayerCostPerHr: '$16 - $21 / Hr (3.2 - 5.5 BB/Hr)',
    costInBbPer100: '11.5 To 19.6 BB/100',
  },
  {
    regionModel: 'Los Angeles Card Rooms ($2/$3 & $5/$5 Drop)',
    collectionRule: 'Flat $6 - $7 Flop Drop + $1 Jackpot (No Percentage)',
    tableHourlyExtracted: '~$190 - $220 / Hr Across 8 - 9 Seats',
    perPlayerCostPerHr: '$22 - $27 / Hr (Tight Preflop VPIP Required)',
    costInBbPer100: '15.0 To 28.0 BB/100 At Small Stakes',
  },
  {
    regionModel: 'Texas Membership Card Clubs ($1/$2 & $2/$5)',
    collectionRule: '$0 Pot Rake · $10 - $15 Per Hour Seat Time Rental',
    tableHourlyExtracted: 'Fixed $90 - $135 / Hr Total Table Time',
    perPlayerCostPerHr: 'Fixed $10 - $15 / Hr Regardless Of VPIP',
    costInBbPer100: '7.1 To 17.8 BB/100 (Rewards Loose Action)',
  },
  {
    regionModel: 'South Florida & East Coast $2/$5 NLH',
    collectionRule: '10% Pot Drop Up To $6 - $7 Cap + $2 BBJ/High-Hand',
    tableHourlyExtracted: '~$165 - $200 / Hr Across 9 Seats',
    perPlayerCostPerHr: '$18 - $24 / Hr',
    costInBbPer100: '12.8 To 17.1 BB/100',
  },
  {
    regionModel: 'Casino $5/$10+ Timed Collection Game',
    collectionRule: '$7 - $9 Collected Every 30 Minutes ($14 - $18/Hr)',
    tableHourlyExtracted: 'Fixed $126 - $162 / Hr Across 9 Seats',
    perPlayerCostPerHr: 'Fixed $14 - $18 / Hr (1.4 - 1.8 BB/Hr)',
    costInBbPer100: '5.0 To 6.4 BB/100 (Lowest Rake Burden)',
  },
];

export default function RakeCalculatorPage({
  initialBigBlind = 5,
  initialRakePercent = 10,
  initialRakeCap = 6,
  initialPromoDrop = 2,
  initialHandsPerHour = 28,
  initialPotsWonPerHour = 3.5,
  initialTimeChargeHalfHour = 7,
}) {
  const [bigBlind, setBigBlind] = useState(initialBigBlind);
  const [rakePercent, setRakePercent] = useState(initialRakePercent);
  const [rakeCap, setRakeCap] = useState(initialRakeCap);
  const [promoDrop, setPromoDrop] = useState(initialPromoDrop);
  const [handsPerHour, setHandsPerHour] = useState(initialHandsPerHour);
  const [potsWonPerHour, setPotsWonPerHour] = useState(initialPotsWonPerHour);
  const [timeChargeHalfHour, setTimeChargeHalfHour] = useState(initialTimeChargeHalfHour);

  const metrics = useMemo(() => {
    const safeBb = Math.max(1, Number(bigBlind) || 5);
    const safePct = Math.max(0, Math.min(25, Number(rakePercent) || 10));
    const safeCap = Math.max(0, Number(rakeCap) || 6);
    const safePromo = Math.max(0, Number(promoDrop) || 2);
    const safeHph = Math.max(10, Math.min(500, Number(handsPerHour) || 28));
    const safePotsWon = Math.max(0.5, Math.min(25, Number(potsWonPerHour) || 3.5));
    const safeHalfHourFee = Math.max(0, Number(timeChargeHalfHour) || 7);

    // Average raked pot reaches ~82% of cap in live $1/$3-$2/$5 games plus full promo drop on flop
    const avgRakePerPotWon = safeCap * 0.82 + safePromo;
    const hourlyPotRakeDollars = safePotsWon * avgRakePerPotWon;
    const hourlyPotRakeBb = hourlyPotRakeDollars / safeBb;
    const potRakeBbPer100 = (hourlyPotRakeBb / safeHph) * 100;
    const annualPotRake1000Hrs = Math.round(hourlyPotRakeDollars * 1000);

    // Timed seat collection
    const hourlyTimeChargeDollars = safeHalfHourFee * 2;
    const hourlyTimeChargeBb = hourlyTimeChargeDollars / safeBb;
    const timeChargeBbPer100 = (hourlyTimeChargeBb / safeHph) * 100;
    const annualTimeCharge1000Hrs = Math.round(hourlyTimeChargeDollars * 1000);

    const hourlyDiffDollars = hourlyPotRakeDollars - hourlyTimeChargeDollars;
    const annualSavingsDollars = Math.round(Math.abs(hourlyDiffDollars) * 1000);
    const cheaperModel =
      hourlyDiffDollars >= 0 ? 'Timed Seat Collection' : 'Percentage Pot Drop Rake';

    return {
      safeBb: safeBb.toFixed(0),
      safePct: safePct.toFixed(1),
      safeCap: safeCap.toFixed(2),
      safePromo: safePromo.toFixed(2),
      safeHph,
      safePotsWon: safePotsWon.toFixed(1),
      avgRakePerPotWon: avgRakePerPotWon.toFixed(2),
      hourlyPotRakeDollars: hourlyPotRakeDollars.toFixed(2),
      hourlyPotRakeBb: hourlyPotRakeBb.toFixed(2),
      potRakeBbPer100: potRakeBbPer100.toFixed(2),
      annualPotRake1000Hrs: annualPotRake1000Hrs.toLocaleString('en-US'),
      hourlyTimeChargeDollars: hourlyTimeChargeDollars.toFixed(2),
      hourlyTimeChargeBb: hourlyTimeChargeBb.toFixed(2),
      timeChargeBbPer100: timeChargeBbPer100.toFixed(2),
      annualTimeCharge1000Hrs: annualTimeCharge1000Hrs.toLocaleString('en-US'),
      hourlyDiffDollars: Math.abs(hourlyDiffDollars).toFixed(2),
      annualSavingsDollars: annualSavingsDollars.toLocaleString('en-US'),
      cheaperModel,
    };
  }, [bigBlind, rakePercent, rakeCap, promoDrop, handsPerHour, potsWonPerHour, timeChargeHalfHour]);

  const canonicalPath = '/tools/rake-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Live Cash Game Rake & Time-Charge Calculator';
  const pageDesc =
    'Compare Live Poker Room Percentage Pot Drop Rake (10% Cap Plus Promo Drop) Against Timed Seat Collection ($/Half-Hour) In $/Hour, BB/100, And 1,000-Hour Annual Cost.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'Smarter.Poker Live Cash Game Rake & Time-Charge Calculator',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Rake & Hourly Cost Calculator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Live Cash Rake Calculator', canonicalPath],
      ],
      faqs: [
        {
          question: 'How Much Rake Does A Live Cash Game Player Pay Per Hour?',
          answer:
            'In A Standard US Casino $1/$3 Or $2/$5 Cash Game With A 10% Up To $6 Cap Plus $2 Bad Beat Jackpot Drop, An Active Player Winning 3.5 Pots Per Hour Pays Roughly $21 To $26 Per Hour In Total Rake And Promotional Drops, Equivalent To $21,000 To $26,000 Over 1,000 Hours.',
        },
        {
          question: 'Is Timed Seat Charge Cheaper Than Percentage Pot Rake?',
          answer:
            'For Loose Or Aggressive Players Who Win 3.5 Or More Pots Per Hour, A $12 To $14 Per Hour Timed Seat Collection Saves $8 To $14 Per Hour ($8,000 To $14,000 Annually) Compared To A $6+$2 Pot Drop. Tight Players Who Win Fewer Than 2 Pots Per Hour Pay Less Under Percentage Drop Rake.',
        },
        {
          question: 'How Do You Convert Live Cash Game Rake Into BB/100?',
          answer:
            'Divide Your Hourly Rake Paid In Dollars By The Big Blind Size To Find Big Blinds Raked Per Hour, Then Multiply By 100 And Divide By Hands Dealt Per Hour (Typically 28 Hands/Hr Live). Paying $21/Hr At $2/$5 (4.2 BB/Hr) Equals 15.0 BB/100.',
        },
      ],
      howTo: {
        name: 'How To Compare Percentage Pot Drop Rake Vs Timed Seat Charge',
        description: pageDesc,
        steps: [
          {
            name: 'Enter Stake Size, Rake Cap, And Promo Drop',
            text: 'Input The Big Blind Size, Percentage Rake Cap ($), And Promotional/Bad Beat Drop ($).',
          },
          {
            name: 'Input Hands Dealt Per Hour And Pots Won Per Hour',
            text: 'Set Your Table Pace (28 Hands/Hr Standard) And How Many Raked Pots You Win Per Hour.',
          },
          {
            name: 'Compare Hourly Cost, BB/100 Impact, And 1,000-Hour Annual Savings',
            text: 'Review The Side-By-Side Percentage Rake Vs Time Collection Breakdown.',
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
          <span>Live Cash Rake &amp; Time Calculator</span>
        </nav>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Live Cash Game Rake &amp; Time-Charge Comparison Calculator
        </h1>

        <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
          <strong>Direct Answer:</strong> In A Standard US Live Cash Game Charging <strong>10% Up To A $6 Cap Plus A $2 Promotional Drop</strong>, A Player Winning 3.5 Pots Per Hour Pays <strong>$24.22 Per Hour ($24,220 Per 1,000 Hours)</strong> In Combined Rake. Switching To A <strong>$7 Per Half-Hour Timed Seat Charge ($14/Hr)</strong> Saves Active Players Over <strong>$10,000 Per Year</strong> And Enables Profitable Wider Preflop Ranges.
        </p>

        {/* Interactive Rake vs Time Calculator */}
        <section
          aria-label="Interactive Rake And Time-Charge Calculator"
          style={{
            background: '#101a20',
            border: '1px solid #1e293b',
            borderRadius: '2px',
            padding: 24,
            marginBottom: 36,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#25c8ff', margin: '0 0 18px 0' }}>
            Interactive Percentage Drop Rake Vs. Timed Seat Collection Solver
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: 14, marginBottom: 22 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Big Blind Size ($)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={bigBlind}
                  onChange={(e) => setBigBlind(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f8fafc',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Rake Percentage (%)
                <input
                  type="number"
                  min="0"
                  max="25"
                  step="1"
                  value={rakePercent}
                  onChange={(e) => setRakePercent(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f8fafc',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Max Pot Rake Cap ($)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={rakeCap}
                  onChange={(e) => setRakeCap(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f8fafc',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Promo / BBJ Drop ($)
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={promoDrop}
                  onChange={(e) => setPromoDrop(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f8fafc',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Hands Dealt Per Hour
                <input
                  type="number"
                  min="10"
                  max="500"
                  value={handsPerHour}
                  onChange={(e) => setHandsPerHour(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f8fafc',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Pots Won Per Hour
                <input
                  type="number"
                  min="0.5"
                  max="20"
                  step="0.5"
                  value={potsWonPerHour}
                  onChange={(e) => setPotsWonPerHour(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f8fafc',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Time Charge / 30 Mins ($)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={timeChargeHalfHour}
                  onChange={(e) => setTimeChargeHalfHour(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f8fafc',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>
          </div>

          {/* Side-by-Side Comparison Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            <div style={{ background: '#020608', padding: 18, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Percentage Pot Drop Rake Cost
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#25c8ff', marginTop: 6 }}>
                ${metrics.hourlyPotRakeDollars} / Hr
              </div>
              <ul style={{ margin: '10px 0 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.75, color: '#cbd5e1' }}>
                <li><strong>Effective BB/100 Cost:</strong> {metrics.potRakeBbPer100} BB/100 ({metrics.hourlyPotRakeBb} BB/Hr)</li>
                <li><strong>Avg Drop Per Pot Won:</strong> ${metrics.avgRakePerPotWon} Across {metrics.safePotsWon} Pots/Hr</li>
                <li><strong>1,000-Hour Annual Rake Paid:</strong> ${metrics.annualPotRake1000Hrs} / Year</li>
              </ul>
            </div>

            <div style={{ background: '#020608', padding: 18, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Timed Seat Collection Cost
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#f2b84b', marginTop: 6 }}>
                ${metrics.hourlyTimeChargeDollars} / Hr
              </div>
              <ul style={{ margin: '10px 0 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.75, color: '#cbd5e1' }}>
                <li><strong>Effective BB/100 Cost:</strong> {metrics.timeChargeBbPer100} BB/100 ({metrics.hourlyTimeChargeBb} BB/Hr)</li>
                <li><strong>Collection Schedule:</strong> ${timeChargeHalfHour} Every 30 Minutes ($0 Pot Drop)</li>
                <li><strong>1,000-Hour Annual Time Paid:</strong> ${metrics.annualTimeCharge1000Hrs} / Year</li>
              </ul>
            </div>

            <div style={{ background: '#020608', padding: 18, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                1,000-Hour Net Model Advantage
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#34d399', marginTop: 6 }}>
                Save ${metrics.annualSavingsDollars} / Yr
              </div>
              <p style={{ fontSize: 13, color: '#cbd5e1', margin: '10px 0 0 0', lineHeight: 1.6 }}>
                <strong>Lowest-Cost Structure:</strong> {metrics.cheaperModel} Saves You <strong>${metrics.hourlyDiffDollars} Per Hour</strong> At Your Current {metrics.safePotsWon} Pots/Hr Winning Frequency.
              </p>
            </div>
          </div>
        </section>

        {/* Reference Table: US Regional Rake Models */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            US Regional Live Cash Game Rake &amp; Time Collection Benchmarks
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Comparison Of Las Vegas, Los Angeles, Texas Time Clubs, East Coast, And High-Stakes Timed Games
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Regional Market &amp; Stake</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>House Collection Rule</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Table Hourly Extracted</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Per-Player Hourly Cost</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Effective BB/100 Drag</th>
                </tr>
              </thead>
              <tbody>
                {REGIONAL_RAKE_BENCHMARK_TABLE.map((row) => (
                  <tr key={row.regionModel} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.regionModel}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.collectionRule}</td>
                    <td style={{ padding: '10px 14px', color: '#f2b84b', fontWeight: 700 }}>{row.tableHourlyExtracted}</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 700 }}>{row.perPlayerCostPerHr}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.costInBbPer100}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cross-Links */}
        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Live Cash &amp; Regional Research Resources
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/research/us-live-poker-room-rake-and-jackpot-benchmark" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              US Live Poker Room Rake Study
            </Link>
            <Link href="/tools/poker-winrate-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Poker Winrate &amp; BB/100 Calculator
            </Link>
            <Link href="/poker-rooms/guides" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              12 US Regional Poker Market Guides
            </Link>
            <Link href="/tools/bankroll-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Bankroll &amp; Risk Of Ruin Calculator
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              All Poker Calculators
            </Link>
          </div>
        </section>

        <CitationBacklinkBox
          title="Live Cash Game Rake & Time-Charge Comparison Calculator"
          canonicalUrl={canonicalUrl}
          badgeType="research"
          badgeLabel="Cash Game Economics"
          badgeValue="Pot Rake Vs Time Collection"
          summary="Interactive Live Cash Game Rake And Timed Seat Collection Calculator Converting Casino Drops Into $/Hour, BB/100, And 1,000-Hour Annual Cost."
          slug="rake-calculator"
        />

        <AiPromptLauncher
          title="Live Cash Game Rake & Time-Charge Comparison Calculator"
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
    const { renderRakeCalculatorMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderRakeCalculatorMarkdown({
      bigBlind: query?.bigBlind || query?.bb || 5,
      rakeCap: query?.rakeCap || query?.cap || 6,
      promoDrop: query?.promoDrop !== undefined ? query.promoDrop : 2,
      potsWonPerHour: query?.potsWonPerHour || 3.5,
      timeChargeHalfHour: query?.timeChargeHalfHour || query?.timeCharge || 7,
      handsPerHour: query?.handsPerHour || 30,
    });
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }

  return {
    props: {
      initialBigBlind: Number(query?.bigBlind || query?.bb) || 5,
      initialRakePercent: query?.rakePercent !== undefined ? Number(query.rakePercent) : 10,
      initialRakeCap: query?.rakeCap !== undefined ? Number(query.rakeCap) : 6,
      initialPromoDrop: query?.promoDrop !== undefined ? Number(query.promoDrop) : 2,
      initialHandsPerHour: Number(query?.handsPerHour) || 28,
      initialPotsWonPerHour: Number(query?.potsWonPerHour) || 3.5,
      initialTimeChargeHalfHour: query?.timeChargeHalfHour !== undefined ? Number(query.timeChargeHalfHour) : 7,
    },
  };
}
