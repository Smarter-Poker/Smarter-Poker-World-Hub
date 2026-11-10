/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  BAD BEAT JACKPOT (BBJ) & HIGH-HAND PROMOTION EV CALCULATOR (/tools/promo-ev-calculator)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Computes Exact Probability Per Hand of Hitting Qualifier, Expected Value ($EV)
 * Per Hand From BBJ + High-Hand Promo, Net Promo EV Per Hand & Per Hour After
 * $1/$2 Promo Drop, and Breakeven Jackpot Pool Threshold Where Sitting at the
 * Table Turns +EV.
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
import { renderPromoEvCalculatorMarkdown } from '../../src/lib/seo/markdownIngestion.mjs';

const QUALIFIER_TIERS = [
  { id: 'ACES_FULL_TENS', label: 'Aces Full Of Tens+ Beaten', oneInHands: 11500 },
  { id: 'QUAD_2S', label: 'Quad 2s+ Beaten', oneInHands: 32000 },
  { id: 'QUAD_8S', label: 'Quad 8s+ Beaten', oneInHands: 68000 },
  { id: 'QUAD_TENS', label: 'Quad Tens+ Beaten', oneInHands: 125000 },
];

const PROMO_BENCHMARK_TABLE = [
  {
    qualifier: 'Aces Full Of Tens+ Beaten',
    hitOdds: '1 In 11,500 Hands (~380 Table Hrs)',
    breakevenPool1Drop: '$41,400 Pool',
    breakevenPool2Drop: '$82,800 Pool',
    strategicNote: 'See Cheap Flops With Pocket Pairs And Broadway Aces; Never Overfold Quads Draws',
  },
  {
    qualifier: 'Quad 2s+ Beaten',
    hitOdds: '1 In 32,000 Hands (~1,060 Table Hrs)',
    breakevenPool1Drop: '$115,200 Pool',
    breakevenPool2Drop: '$230,400 Pool',
    strategicNote: 'Set-Mine All 13 Pocket Pairs In Multiway Pots When Pool Exceeds $150,000',
  },
  {
    qualifier: 'Quad 8s+ Beaten',
    hitOdds: '1 In 68,000 Hands (~2,260 Table Hrs)',
    breakevenPool1Drop: '$244,800 Pool',
    breakevenPool2Drop: '$489,600 Pool',
    strategicNote: 'Prioritize 88+ And Suited Straight-Flush Connectors; Table Share Drives Steady EV',
  },
  {
    qualifier: 'Quad Tens+ Beaten',
    hitOdds: '1 In 125,000 Hands (~4,160 Table Hrs)',
    breakevenPool1Drop: '$450,000 Pool',
    breakevenPool2Drop: '$900,000 Pool',
    strategicNote: 'Strict High-Threshold Jackpot; Only Chase When Mega Pool Tops $500,000+',
  },
];

const PROMO_EV_FAQS = [
  {
    question: 'How Do You Calculate Expected Value ($EV) From A Casino Bad Beat Jackpot?',
    answer:
      'In A 9-Handed Game Where Your Table Triggers The Bad Beat Jackpot, You Have A 1/9 Chance Of Being The Qualifying Loser, A 1/9 Chance Of Being The Winner, And A 7/9 Chance Of Earning A Table Share. Multiply The Total Table Payout By (1/9) And Divide By The Qualifier Odds (Such As 1 In 68,000 Hands For Quad 8s) Plus Any Room-Wide Share From Other Tables.',
  },
  {
    question: 'Does The $1 Or $2 Promotional Drop Apply To Every Hand You Sit At The Table?',
    answer:
      'No. You Only Pay The Promotional Drop When You Actually Win A Qualifying Pot. At A 9-Handed Table Where 85% Of Hands Reach A Flop Drop, An Average Player Wins Roughly 11.1% Of Dealt Hands, Meaning Your Personal Cost Is About $0.10 To $0.22 Per Dealt Hand ($3.00 To $6.50 Per Hour).',
  },
  {
    question: 'What Are The Mandatory Rules To Qualify For A Casino Bad Beat Jackpot?',
    answer:
      'Nearly Every US Card Room Requires Both The Winning And Losing Hands To Use Both Hole Cards (Pocket Pair Required For Quads), A Minimum Pot Size ($15 To $30), At Least 4 Or 5 Players Dealt In, And Zero Verbal Discussion Of The Jackpot During The Hand.',
  },
];

export default function PromoEvCalculatorPage({
  initialJackpotPool = 250000,
  initialQualifier = 'QUAD_8S',
  initialLoserPct = 45,
  initialWinnerPct = 25,
  initialTablePct = 15,
  initialRoomPct = 15,
  initialPlayersAtTable = 9,
  initialPromoDrop = 2,
  initialHighHandPrize = 500,
  initialActiveTables = 12,
}) {
  const router = useRouter();
  const [jackpotPool, setJackpotPool] = useState(initialJackpotPool);
  const [qualifier, setQualifier] = useState(initialQualifier);
  const [loserPct, setLoserPct] = useState(initialLoserPct);
  const [winnerPct, setWinnerPct] = useState(initialWinnerPct);
  const [tablePct, setTablePct] = useState(initialTablePct);
  const [roomPct, setRoomPct] = useState(initialRoomPct);
  const [playersAtTable, setPlayersAtTable] = useState(initialPlayersAtTable);
  const [promoDrop, setPromoDrop] = useState(initialPromoDrop);
  const [highHandPrize, setHighHandPrize] = useState(initialHighHandPrize);
  const [activeTables, setActiveTables] = useState(initialActiveTables);
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
    if (q.pool !== undefined) setJackpotPool(Math.max(10000, Number(q.pool) || 250000));
    if (q.tier && QUALIFIER_TIERS.some((t) => t.id === q.tier)) setQualifier(String(q.tier));
    if (q.loser !== undefined) setLoserPct(Math.max(20, Math.min(70, Number(q.loser) || 45)));
    if (q.winner !== undefined) setWinnerPct(Math.max(10, Math.min(40, Number(q.winner) || 25)));
    if (q.table !== undefined) setTablePct(Math.max(5, Math.min(40, Number(q.table) || 15)));
    if (q.room !== undefined) setRoomPct(Math.max(0, Math.min(40, Number(q.room) || 15)));
    if (q.players !== undefined) setPlayersAtTable(Number(q.players) === 8 ? 8 : 9);
    if (q.drop !== undefined) setPromoDrop(Math.max(0, Math.min(5, Number(q.drop) || 2)));
    if (q.hh !== undefined) setHighHandPrize(Math.max(0, Number(q.hh) || 500));
    if (q.tables !== undefined) setActiveTables(Math.max(1, Math.min(100, Number(q.tables) || 12)));
  }, [router.isReady, router.query]);

  const metrics = useMemo(() => {
    const safePool = Math.max(10000, Number(jackpotPool) || 250000);
    const tierObj = QUALIFIER_TIERS.find((t) => t.id === qualifier) || QUALIFIER_TIERS[2];
    const safeLoser = Math.max(10, Number(loserPct) || 45);
    const safeWinner = Math.max(5, Number(winnerPct) || 25);
    const safeTable = Math.max(0, Number(tablePct) || 15);
    const safeRoom = Math.max(0, Number(roomPct) || 15);
    const safePlayers = Number(playersAtTable) === 8 ? 8 : 9;
    const safeDrop = Math.max(0, Number(promoDrop) || 2);
    const safeHh = Math.max(0, Number(highHandPrize) || 500);
    const safeTables = Math.max(1, Number(activeTables) || 12);

    const probPerHand = 1 / tierObj.oneInHands;
    const totalTableCapturePct = (safeLoser + safeWinner + safeTable + safeRoom) / 100;

    // EV per hand played at your table (including room-wide share from other tables hitting)
    const evPerPlayerWhenTableHits = (safePool * totalTableCapturePct) / safePlayers;
    const bbjEvPerHand = evPerPlayerWhenTableHits * probPerHand;

    // High-Hand EV per hand (assuming 30 hands/hr across safeTables * safePlayers active seats)
    const handsPerHour = 30;
    const totalPlayersInRoom = safeTables * safePlayers;
    const hhEvPerHour = totalPlayersInRoom > 0 ? safeHh / totalPlayersInRoom : 0;
    const hhEvPerHand = hhEvPerHour / handsPerHour;

    // Personal promo drop cost per hand (assuming 85% of hands drop promo and Hero wins 1/safePlayers of pots)
    const dropCostPerHand = (safeDrop * 0.85) / safePlayers;
    const grossPromoEvHand = bbjEvPerHand + hhEvPerHand;
    const netPromoEvHand = grossPromoEvHand - dropCostPerHand;
    const netPromoEvHour = netPromoEvHand * handsPerHour;

    // Breakeven Jackpot Pool Threshold (where BBJ + High Hand = Drop Cost)
    const remainingCostAfterHh = Math.max(0, dropCostPerHand - hhEvPerHand);
    const breakevenPool =
      probPerHand * totalTableCapturePct > 0
        ? Math.round((remainingCostAfterHh * safePlayers) / (probPerHand * totalTableCapturePct))
        : 0;

    return {
      safePool,
      tierObj,
      safeLoser,
      safeWinner,
      safeTable,
      safeRoom,
      safePlayers,
      safeDrop,
      safeHh,
      safeTables,
      probPct: (probPerHand * 100).toFixed(5),
      bbjEvPerHand: bbjEvPerHand.toFixed(2),
      hhEvPerHand: hhEvPerHand.toFixed(2),
      grossPromoEvHand: grossPromoEvHand.toFixed(2),
      dropCostPerHand: dropCostPerHand.toFixed(2),
      netPromoEvHand: netPromoEvHand.toFixed(2),
      netPromoEvHour: netPromoEvHour.toFixed(2),
      breakevenPool,
      loserPayout: Math.round((safePool * safeLoser) / 100),
      winnerPayout: Math.round((safePool * safeWinner) / 100),
      tableSeatPayout: Math.round((safePool * (safeTable / 100)) / Math.max(1, safePlayers - 2)),
    };
  }, [jackpotPool, qualifier, loserPct, winnerPct, tablePct, roomPct, playersAtTable, promoDrop, highHandPrize, activeTables]);

  const handleCopyScenarioLink = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    const shareUrl = `${window.location.origin}/tools/promo-ev-calculator?pool=${metrics.safePool}&tier=${qualifier}&loser=${metrics.safeLoser}&winner=${metrics.safeWinner}&table=${metrics.safeTable}&room=${metrics.safeRoom}&players=${metrics.safePlayers}&drop=${metrics.safeDrop}&hh=${metrics.safeHh}&tables=${metrics.safeTables}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const canonicalPath = '/tools/promo-ev-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Bad Beat Jackpot (BBJ) & High-Hand Promotion EV Calculator';
  const pageDesc =
    'Calculate Exact Qualifier Hit Odds, Per-Hand And Hourly Expected Value ($EV) From Bad Beat Jackpots And High-Hand Promotions, And The Breakeven Jackpot Pool Threshold.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: pageTitle,
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Bad Beat Jackpot & High-Hand EV Calculator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Bad Beat Jackpot & Promo EV Calculator', canonicalPath],
      ],
      faqs: PROMO_EV_FAQS,
      howTo: {
        name: 'How To Calculate Bad Beat Jackpot And High-Hand Promotion EV',
        description: pageDesc,
        steps: [
          {
            name: 'Enter Current Bad Beat Jackpot Pool And Qualifier Tier',
            text: 'Input The Casino Current Bad Beat Jackpot Pool And Choose The Minimum Losing Hand Qualifier (Aces Full Of Tens Up To Quad Tens).',
          },
          {
            name: 'Configure Payout Shares, Promo Drop, And High-Hand Prize',
            text: 'Specify Loser, Winner, Table, And Room Payout Shares Along With The $1/$2 Promo Drop And Hourly High-Hand Bonus.',
          },
          {
            name: 'Compare Net Promo EV Per Hour Against Breakeven Pool Threshold',
            text: 'Review Whether The Current Jackpot Pool Exceeds The Breakeven Threshold Where Sitting At The Table Turns +EV.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const isEmbed = router.query?.embed === 'true';

  return (
    <div style={{ minHeight: isEmbed ? 'auto' : '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="Bad Beat Jackpot And High-Hand EV Calculator"
        description="Calculate Exact Qualifier Hit Odds, Per-Hand And Hourly Expected Value ($EV) From Bad Beat Jackpots And High-Hand Promotions, And The Breakeven Jackpot Pool Threshold."
        canonical="/tools/promo-ev-calculator"
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
              <span>Bad Beat Jackpot &amp; Promo EV Calculator</span>
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
          Bad Beat Jackpot (BBJ) &amp; High-Hand Promotion EV Calculator
        </h1>

        {!isEmbed && (
          <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
            <strong>Direct Answer:</strong> Live Casino <strong>Bad Beat Jackpots</strong> And <strong>Hourly High-Hand Promotions</strong> Turn Mathematically Positive EV (+EV) Once The Progressive Pool Crosses The <strong>Breakeven Jackpot Threshold</strong> For Its Qualifier Tier (Approximately <strong>$42,000 For Aces Full Of Tens</strong>, <strong>$115,000 For Quad 2s</strong>, And <strong>$245,000 For Quad 8s</strong> Under A Standard Promo Drop).
          </p>
        )}

        <section
          aria-label="Interactive Bad Beat Jackpot And High-Hand EV Calculator"
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
              Interactive Bad Beat Jackpot &amp; High-Hand EV Solver
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
                Bad Beat Jackpot Pool ($)
                <input
                  type="number"
                  min="10000"
                  step="10000"
                  value={jackpotPool}
                  onChange={(e) => setJackpotPool(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#34d399',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Minimum Losing Qualifier Tier
                <select
                  value={qualifier}
                  onChange={(e) => setQualifier(e.target.value)}
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
                  {QUALIFIER_TIERS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {[
              { label: 'Loser Share % (40%-50%)', val: loserPct, set: setLoserPct, step: 5, color: '#f8fafc' },
              { label: 'Winner Share % (20%-25%)', val: winnerPct, set: setWinnerPct, step: 5, color: '#f8fafc' },
              { label: 'Table Share % (15%-20%)', val: tablePct, set: setTablePct, step: 5, color: '#f8fafc' },
              { label: 'Room Share % (10%-20%)', val: roomPct, set: setRoomPct, step: 5, color: '#f8fafc' },
              { label: 'Promo Drop Per Pot ($1 Or $2)', val: promoDrop, set: setPromoDrop, step: 1, color: '#f87171' },
              { label: 'High-Hand Hourly Prize ($)', val: highHandPrize, set: setHighHandPrize, step: 100, color: '#f2b84b' },
              { label: 'Active Tables In Room', val: activeTables, set: setActiveTables, step: 1, color: '#f8fafc' },
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

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Active Players At Table (8 Or 9)
                <select
                  value={playersAtTable}
                  onChange={(e) => setPlayersAtTable(Number(e.target.value))}
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
                  <option value={8}>8 Players At Table</option>
                  <option value={9}>9 Players At Table</option>
                </select>
              </label>
            </div>
          </div>

          {/* KPI Output Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 18 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Qualifier Hit Probability
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                1 In {metrics.tierObj.oneInHands.toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                {metrics.probPct}% Per Dealt Hand
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Gross Promo EV Per Hand
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f2b84b', marginTop: 4 }}>
                +${metrics.grossPromoEvHand} / Hand
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                BBJ +${metrics.bbjEvPerHand} | High-Hand +${metrics.hhEvPerHand}
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: Number(metrics.netPromoEvHour) >= 0 ? '1px solid #34d399' : '1px solid #f87171' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Net Promo EV (After Drop)
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: Number(metrics.netPromoEvHour) >= 0 ? '#34d399' : '#f87171', marginTop: 4 }}>
                {Number(metrics.netPromoEvHour) >= 0 ? '+' : ''}${metrics.netPromoEvHour} / Hr
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                {Number(metrics.netPromoEvHand) >= 0 ? '+' : ''}${metrics.netPromoEvHand}/Hand (Drop Cost -${metrics.dropCostPerHand})
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Breakeven Jackpot Pool Threshold
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#f8fafc', marginTop: 4 }}>
                ${metrics.breakevenPool.toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Loser: ${metrics.loserPayout.toLocaleString('en-US')} | Table Seat: ${metrics.tableSeatPayout.toLocaleString('en-US')}
              </div>
            </div>
          </div>
        </section>

        {/* Reference Matrix */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Bad Beat Jackpot Qualifier Odds &amp; Breakeven Pool Benchmark Matrix
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Exact Qualifier Hit Frequencies And Breakeven Jackpot Pool Thresholds Across Common US Card Room Rules
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Qualifier Tier</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>9-Handed Hit Odds</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Breakeven ($1 Drop)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Breakeven ($2 Drop)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Strategic Adjustment</th>
                </tr>
              </thead>
              <tbody>
                {PROMO_BENCHMARK_TABLE.map((row) => (
                  <tr key={row.qualifier} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.qualifier}</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 700 }}>{row.hitOdds}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.breakevenPool1Drop}</td>
                    <td style={{ padding: '10px 14px', color: '#f2b84b', fontWeight: 700 }}>{row.breakevenPool2Drop}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.strategicNote}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cross-Links */}
        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Live Cash Game &amp; Rake Calculators
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/rake-calculator" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Live Cash Game Rake &amp; Drop Calculator
            </Link>
            <Link href="/tools/session-planner" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Live Cash Session &amp; Stop-Loss Planner
            </Link>
            <Link href="/tools/poker-tax-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              US Poker Tax &amp; Form W-2G Calculator
            </Link>
            <Link href="/poker-rooms/guides" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              12 Regional Live Poker Market Guides
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              All 34 Poker Calculators
            </Link>
          </div>
        </section>

        {!isEmbed && (
          <>
            <FaqSection faqs={PROMO_EV_FAQS} />

            <CitationBacklinkBox
              title="Bad Beat Jackpot And High-Hand EV Calculator"
              canonicalUrl={canonicalUrl}
              badgeType="gto"
              badgeLabel="BBJ & High-Hand EV Solver"
              badgeValue="Qualifier Odds & Breakeven Pool"
              summary="Interactive Bad Beat Jackpot And High-Hand Promotion EV Calculator Computing Qualifier Hit Odds, Net Hourly Promo EV, And Breakeven Pools."
              slug="promo-ev-calculator"
            />

            <AiPromptLauncher
              title="Bad Beat Jackpot And High-Hand EV Calculator"
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
    const md = renderPromoEvCalculatorMarkdown({
      jackpotPool: query?.pool,
      qualifier: query?.tier,
      promoDrop: query?.drop,
      highHandPrize: query?.hh,
      activeTables: query?.tables,
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
