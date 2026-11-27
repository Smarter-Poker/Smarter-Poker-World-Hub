/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  MYSTERY BOUNTY ENVELOPE REMOVAL & LIVE EV TRACKER
 *  (pages/tools/mystery-bounty-tracker.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Live Day-2 Mystery Bounty Remaining Envelope Removal Tracker with interactive
 * counts for top/mid/min tiers, dynamically recomputing average bounty value,
 * chip-equivalence, and bounty odds discount.
 *
 * House style: Title Case, zero em dashes, #SmarterCasinoRealism theme.
 */

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import HubPageSummary from '../../src/components/seo/HubPageSummary';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import FaqSection from '../../src/components/seo/FaqSection';
import CalculatorShareAndPresets from '../../src/components/tools/CalculatorShareAndPresets';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';
import { useSolvedSpotUrlSync } from '../../src/lib/seo/solvedSpotEngine';
import { setPublicSeoHtmlCache } from '../../src/lib/seo/edgeCacheHeaders.mjs';

const MYSTERY_PRESETS = [
  {
    id: 'wsop_millions_fresh',
    label: 'Day-2 Start: $100K Top Bounty Still In Drum (40 Envelopes)',
    pool: 200000,
    topBounty: 50000,
    envelopes: 40,
    players: 1000,
    startChips: 40000,
    fee: 300,
  },
  {
    id: 'top_bounty_pulled',
    label: 'Post-Pull: $50K Top Envelope Pulled ($85K Left / 28 Envelopes)',
    pool: 85000,
    topBounty: 10000,
    envelopes: 28,
    players: 1000,
    startChips: 40000,
    fee: 300,
  },
  {
    id: 'late_drum_jackpot_hunt',
    label: 'Jackpot Hunt: $50K Still Alive In Only 8 Envelopes!',
    pool: 68000,
    topBounty: 50000,
    envelopes: 8,
    players: 1000,
    startChips: 40000,
    fee: 300,
  },
  {
    id: 'regional_500_mystery',
    label: 'Regional $500 Mystery Bounty ($25K Pool / 25 Envelopes)',
    pool: 25000,
    topBounty: 7500,
    envelopes: 25,
    players: 220,
    startChips: 30000,
    fee: 150,
  },
];

const MYSTERY_BENCHMARK_TABLE = [
  {
    drumState: 'Day-2 Start (100% Of Envelopes & Top Jackpot In Drum)',
    avgEnvelopeMultiple: '1.00x Base Day-2 Bounty Average',
    chipEquivalent: '33% To 45% Of Average Tournament Stack',
    strategicAdjustment: 'Widen Covering All-In Calls By +6% To +9% Equity Against Short Stacks',
  },
  {
    drumState: 'Concentrated Jackpot Drum (Top Bounty Alive In Last 20% Envelopes)',
    avgEnvelopeMultiple: '1.85x To 2.60x Base Bounty Average',
    chipEquivalent: '65% To 110% Of Average Tournament Stack',
    strategicAdjustment: 'Ultra-Loose Covering Calls: Call Any Two Suited Or Connected Cards Covering <12BB Shoves',
  },
  {
    drumState: 'Depleted Drum (Top 2 Jackpots Already Pulled Early On Day 2)',
    avgEnvelopeMultiple: '0.45x To 0.62x Base Bounty Average',
    chipEquivalent: '15% To 22% Of Average Tournament Stack',
    strategicAdjustment: 'Revert Immediately To Standard Malmuth-Harville ICM Ladder Preservation',
  },
];

const MYSTERY_FAQS = [
  {
    question: 'How Do You Calculate The Expected Value Of A Mystery Bounty Envelope On Day 2?',
    answer:
      'At Any Moment On Day 2, Every Unopened Envelope In The Drum Has An Identical Mathematical Expectation Equal To The Remaining Unclaimed Bounty Prize Pool Divided By The Number Of Remaining Unopened Envelopes.',
  },
  {
    question: 'How Do You Convert A Mystery Bounty Dollar Average Into Tournament Chips?',
    answer:
      'In A Standard 50% Regular Pool / 50% Mystery Bounty Tournament, One Starting Bounty Unit Is Worth Roughly 33.3% Of A Starting Stack At The Start Of Day 1, Scaling On Day 2 By The Ratio Of Current Average Envelope Dollar Value To The Base Bounty Contribution Per Entry.',
  },
  {
    question: 'What Happens Strategically The Moment The Top Mystery Bounty Envelope Is Pulled?',
    answer:
      'Because The Top Jackpot Often Represents 20% To 35% Of The Total Bounty Pool, Seeing It Pulled Instantly Cuts The Remaining Envelope Average By Up To 40%, Meaning Covering Stacks Must Immediately Stop Making Wide Speculative Bounty Calls And Pivot Back To Standard Final Table ICM.',
  },
];

export default function MysteryBountyTrackerPage({
  initialPool = 200000,
  initialTopBounty = 50000,
  initialEnvelopes = 40,
  initialPlayers = 1000,
  initialStartChips = 40000,
  initialFee = 300,
}) {
  const router = useRouter();
  const [pool, setPool] = useState(initialPool);
  const [topBounty, setTopBounty] = useState(initialTopBounty);
  const [envelopes, setEnvelopes] = useState(initialEnvelopes);
  const [players, setPlayers] = useState(initialPlayers);
  const [startChips, setStartChips] = useState(initialStartChips);
  const [fee, setFee] = useState(initialFee);
  const [topPulled, setTopPulled] = useState(false);
  const [activePresetId, setActivePresetId] = useState('wsop_millions_fresh');

  useSolvedSpotUrlSync(
    { pool, topBounty, envelopes, players, startChips, fee },
    {
      pool: (v) => setPool(Math.max(500, Number(v) || 200000)),
      topBounty: (v) => setTopBounty(Math.max(100, Number(v) || 50000)),
      envelopes: (v) => setEnvelopes(Math.max(1, Math.round(Number(v) || 40))),
      players: (v) => setPlayers(Math.max(10, Math.round(Number(v) || 1000))),
      startChips: (v) => setStartChips(Math.max(1000, Math.round(Number(v) || 40000))),
      fee: (v) => setFee(Math.max(10, Number(v) || 300)),
    }
  );

  const handleSelectPreset = (preset) => {
    setActivePresetId(preset.id);
    setPool(preset.pool);
    setTopBounty(preset.topBounty);
    setEnvelopes(preset.envelopes);
    setPlayers(preset.players);
    setStartChips(preset.startChips);
    setFee(preset.fee);
    setTopPulled(false);
  };

  const metrics = useMemo(() => {
    const safePool = Math.max(500, Number(pool) || 200000);
    const safeTop = Math.max(100, Math.min(safePool, Number(topBounty) || 50000));
    const safeEnvelopes = Math.max(1, Math.round(Number(envelopes) || 40));
    const safePlayers = Math.max(10, Math.round(Number(players) || 1000));
    const safeStartChips = Math.max(1000, Math.round(Number(startChips) || 40000));
    const safeFee = Math.max(10, Number(fee) || 300);

    const activePool = topPulled ? Math.max(100, safePool - safeTop) : safePool;
    const activeEnvelopes = topPulled ? Math.max(1, safeEnvelopes - 1) : safeEnvelopes;

    const avgEnvelopeDollars = activePool / activeEnvelopes;
    const onePullTopProbPct = topPulled ? 0 : (1 / activeEnvelopes) * 100;

    // Chip equivalence conversion:
    // Total tournament chips in play = safePlayers * safeStartChips
    // Base regular prize pool approx = safePlayers * safeFee
    // 1 Dollar of Mystery Bounty in tournament chips (using 0.78 ICM discount on Day 2)
    const totalChipsInPlay = safePlayers * safeStartChips;
    const estRegularPool = safePlayers * safeFee;
    const chipsPerRegularDollar = totalChipsInPlay / Math.max(1, estRegularPool);
    const bountyChipEquivalent = Math.round(avgEnvelopeDollars * chipsPerRegularDollar * 0.78);

    // Calling equity discount facing a 15-starting-stack (or average Day-2 20BB = 2.5x starting stack) all-in
    const samplePotChips = safeStartChips * 3.5;
    const sampleShoveChips = safeStartChips * 2.5;
    const stdReqEquity = (sampleShoveChips / (samplePotChips + sampleShoveChips)) * 100;
    const bountyAdjReqEquity =
      (sampleShoveChips / (samplePotChips + sampleShoveChips + bountyChipEquivalent)) * 100;
    const equityDiscountPct = Math.max(0, stdReqEquity - bountyAdjReqEquity);

    return {
      activePool: Math.round(activePool),
      activeEnvelopes,
      avgEnvelopeDollars: Math.round(avgEnvelopeDollars),
      onePullTopProbPct: onePullTopProbPct.toFixed(2),
      bountyChipEquivalent,
      stdReqEquity: stdReqEquity.toFixed(1),
      bountyAdjReqEquity: bountyAdjReqEquity.toFixed(1),
      equityDiscountPct: equityDiscountPct.toFixed(1),
    };
  }, [pool, topBounty, envelopes, players, startChips, fee, topPulled]);

  const canonicalPath = '/tools/mystery-bounty-tracker';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Mystery Bounty Envelope Tracker';
  const pageDesc =
    'Track Day-2 Mystery Bounty Remaining Envelopes And Top Jackpots In Real Time: Calculate Live Average Envelope EV, Tournament Chip Equivalence, And Calling Odds Discounts.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: pageTitle,
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Mystery Bounty Envelope Removal & Chip EV Tracker',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Mystery Bounty Envelope Tracker', canonicalPath],
      ],
      faqs: MYSTERY_FAQS,
      howTo: {
        name: 'How To Track Live Day-2 Mystery Bounty Envelopes And Chip Equivalents',
        description: pageDesc,
        steps: [
          {
            name: 'Enter Remaining Unclaimed Bounty Pool And Unopened Envelopes',
            text: 'Input Total Remaining Bounty Dollars In The Drum, Top Jackpot Prize, And Number Of Unopened Envelopes.',
          },
          {
            name: 'Toggle Top Envelope Removal As Jackpots Are Pulled',
            text: 'Check Off Pulled Top Envelopes To Instantly Recompute The Dropped Average Envelope Dollar Value.',
          },
          {
            name: 'Apply Live Chip Equivalence And Calling Equity Discount',
            text: 'Use The Computed Tournament Chip Bonus To Adjust Your Covering All-In Calling Ranges.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const summaryText = `Day-2 Mystery Bounty Drum ($${metrics.activePool.toLocaleString('en-US')} Pool Across ${metrics.activeEnvelopes} Envelopes): Avg Envelope = $${metrics.avgEnvelopeDollars.toLocaleString('en-US')} (+${metrics.bountyChipEquivalent.toLocaleString('en-US')} Chips) | Calling Equity Discount = -${metrics.equityDiscountPct}%`;
  const isEmbed = router.query?.embed === 'true';

  return (
    <div style={{ minHeight: isEmbed ? 'auto' : '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title={pageTitle}
        description={pageDesc}
        canonical={canonicalUrl}
        jsonLd={schema}
      />

      <main style={{ maxWidth: 1060, margin: '0 auto', padding: isEmbed ? '16px 14px 24px' : '40px 20px 80px' }}>
        {!isEmbed && (
          <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
            <Link href="/" style={{ color: '#25c8ff', textDecoration: 'none' }}>Smarter.Poker</Link>
            {' / '}
            <Link href="/tools" style={{ color: '#25c8ff', textDecoration: 'none' }}>Poker Tools</Link>
            {' / '}
            <span>Mystery Bounty Envelope Tracker</span>
          </nav>
        )}

        <h1 style={{ fontSize: isEmbed ? 22 : 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Live Day-2 Mystery Bounty Envelope Removal &amp; Chip Equity Tracker
        </h1>

        {!isEmbed && (
          <>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 24px 0' }}>
              <strong>Direct Answer:</strong> Unlike Fixed Knockouts, Day-2 <strong>Mystery Bounty Envelope Value Fluctuates After Every Single Elimination</strong>. Whenever Small Envelopes Are Pulled While The Top Jackpot Remains In The Drum, Average Bounty Value Surges; The Instant The Top Jackpot Is Pulled, Average Envelope Value Plummets By Up To 40%.
            </p>

            <CalculatorShareAndPresets
              toolTitle="Mystery Bounty Envelope Tracker"
              toolPath={canonicalPath}
              summaryText={summaryText}
              presets={MYSTERY_PRESETS}
              onSelectPreset={handleSelectPreset}
              activePresetId={activePresetId}
            />
          </>
        )}

        <section
          aria-label="Interactive Mystery Bounty Envelope Drum Tracker"
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
              Live Day-2 Mystery Bounty Drum &amp; Envelope Removal Console
            </h2>
            <button
              type="button"
              onClick={() => setTopPulled((prev) => !prev)}
              style={{
                padding: '8px 14px',
                background: topPulled ? '#ef4444' : '#34d399',
                color: '#020608',
                border: 0,
                borderRadius: '2px',
                fontSize: 12.5,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {topPulled ? 'Top Jackpot Pulled (Click To Restore)' : 'Simulate Top Jackpot Pulled From Drum'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 22 }}>
            {[
              { label: 'Remaining Bounty Pool ($)', val: pool, set: setPool, step: 5000, color: '#34d399' },
              { label: 'Top Jackpot Envelope ($)', val: topBounty, set: setTopBounty, step: 2500, color: '#f2b84b' },
              { label: 'Remaining Unopened Envelopes', val: envelopes, set: setEnvelopes, step: 1, color: '#25c8ff' },
              { label: 'Total Day-1 Tournament Entries', val: players, set: setPlayers, step: 50, color: '#f8fafc' },
              { label: 'Day-1 Starting Chip Stack', val: startChips, set: setStartChips, step: 5000, color: '#f8fafc' },
              { label: 'Regular Prize Pool Per Entry ($)', val: fee, set: setFee, step: 25, color: '#cbd5e1' },
            ].map((inp) => (
              <div key={inp.label}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                  {inp.label}
                  <input
                    type="number"
                    step={inp.step}
                    value={inp.val}
                    onChange={(e) => inp.set(e.target.value)}
                    style={{
                      width: '100%',
                      marginTop: 6,
                      padding: '10px 12px',
                      borderRadius: '2px',
                      border: '1px solid #334155',
                      background: '#020608',
                      color: inp.color,
                      fontSize: 15,
                      fontWeight: 700,
                    }}
                  />
                </label>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: 14 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #34d399' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Live Average Envelope EV
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                ${metrics.avgEnvelopeDollars.toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                ${metrics.activePool.toLocaleString('en-US')} Across {metrics.activeEnvelopes} Envelopes
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Tournament Chip Equivalence
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                +{metrics.bountyChipEquivalent.toLocaleString('en-US')} Chips
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Added To Pot For Covering Stack Calls
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                1-Pull Top Jackpot Odds
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#f2b84b', marginTop: 4 }}>
                {metrics.onePullTopProbPct}%
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                {topPulled ? 'Top Jackpot Already Claimed' : `1 In ${metrics.activeEnvelopes} Next Pull`}
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                All-In Calling Equity Discount
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#f8fafc', marginTop: 4 }}>
                -{metrics.equityDiscountPct}% Req Eq
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Drops From {metrics.stdReqEquity}% To {metrics.bountyAdjReqEquity}%
              </div>
            </div>
          </div>
        </section>

        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Day-2 Mystery Bounty Drum State &amp; Tactical Adjustment Matrix
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                How Envelope Removal Shifts Average Knockout Value And Covering All-In Calling Ranges
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Day-2 Drum Configuration</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Envelope EV Multiple</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Chip Equivalence</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Covering Stack Strategy</th>
                </tr>
              </thead>
              <tbody>
                {MYSTERY_BENCHMARK_TABLE.map((row) => (
                  <tr key={row.drumState} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.drumState}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.avgEnvelopeMultiple}</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 700 }}>{row.chipEquivalent}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.strategicAdjustment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Bounty &amp; Tournament ICM Calculators
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/bounty-calculator" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              PKO Bounty Chip Calculator
            </Link>
            <Link href="/tools/icm-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Final Table ICM Calculator
            </Link>
            <Link href="/tools/bubble-factor-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Bubble Factor Matrix
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#34d399', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Explore All 52 Free Poker Calculators
            </Link>
          </div>
        </section>

        {!isEmbed && (
          <>
            <FaqSection faqs={MYSTERY_FAQS} />

            <HubPageSummary page="poker-tools" path={canonicalPath} />

            <CitationBacklinkBox
              title="Mystery Bounty Envelope Tracker"
              canonicalUrl={canonicalUrl}
              badgeType="gto"
              badgeLabel="Mystery Bounty Engine"
              badgeValue="Day-2 Drum & Chip EV Tracker"
              summary="Live Day-2 Mystery Bounty Envelope Removal Tracker Computing Average Envelope Dollar EV And Tournament Chip Equivalence."
              slug="mystery-bounty-tracker"
            />

            <AiPromptLauncher
              title="Mystery Bounty Envelope Tracker"
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
    const { renderHubToolMarkdown } = await import('../api/hub-tool-markdown');
    const md = renderHubToolMarkdown('/tools/mystery-bounty-tracker', query);
    if (md) {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Vary', 'Accept');
      res.write(md);
      res.end();
      return { props: {} };
    }
  }
  setPublicSeoHtmlCache(res);
  return {
    props: {
      initialPool: Number(query?.pool) || 200000,
      initialTopBounty: Number(query?.topBounty) || 50000,
      initialEnvelopes: Number(query?.envelopes) || 40,
      initialPlayers: Number(query?.players) || 1000,
      initialStartChips: Number(query?.startChips) || 40000,
      initialFee: Number(query?.fee) || 300,
    },
  };
}
