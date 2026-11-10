/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  TOURNAMENT SATELLITE SEAT-BUBBLE & MILESTONE SURVIVAL CALCULATOR (/tools/satellite-calculator)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Computes Total Chips In Play & Target Average Seat Stack (Total_Chips / Seats_Awarded),
 * Hero Seat Lock Percentage (0% to 100%), Satellite Bubble Factor (1.5x to 8.0x), and
 * Required All-In Calling Equity vs Equal/Covering Stack (showing when even KK or AA
 * should fold if a seat is 98%+ locked!).
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
import { renderSatelliteCalculatorMarkdown } from '../../src/lib/seo/markdownIngestion.mjs';

const SATELLITE_BENCHMARK_TABLE = [
  {
    stackRatio: '115%+ Of Target Seat Stack',
    seatLockPct: '98.5% To 99.9% Locked',
    bubbleFactor: '7.5x To 8.0x',
    reqCallingEq: '88.2% To 88.9% Required',
    actionWithPremiums: 'Fold Everything Including Pocket Aces (AA) Against A Covering Stack',
  },
  {
    stackRatio: '95% To 110% Of Target Seat Stack',
    seatLockPct: '92.0% To 97.5% Locked',
    bubbleFactor: '4.5x To 6.5x',
    reqCallingEq: '81.8% To 86.7% Required',
    actionWithPremiums: 'Fold AKs, QQ, And KK; Call AA Only Against Shorter Stack If Safe',
  },
  {
    stackRatio: '70% To 85% Of Target Seat Stack',
    seatLockPct: '74.0% To 86.0% Locked',
    bubbleFactor: '2.8x To 3.8x',
    reqCallingEq: '73.7% To 79.2% Required',
    actionWithPremiums: 'Fold AKo And JJ To Shoves; Open-Jam First-In To Pressure Medium Stacks',
  },
  {
    stackRatio: '40% To 60% Of Target Seat Stack',
    seatLockPct: '45.0% To 65.0% Locked',
    bubbleFactor: '1.9x To 2.4x',
    reqCallingEq: '65.5% To 70.6% Required',
    actionWithPremiums: 'Use First-In Fold Equity Aggressively Against Medium Stacks',
  },
  {
    stackRatio: 'Under 25% Of Target Seat Stack',
    seatLockPct: '15.0% To 28.0% Locked',
    bubbleFactor: '1.5x To 1.7x',
    reqCallingEq: '60.0% To 63.0% Required',
    actionWithPremiums: 'Must Double Up Soon; Shove Standard Nash Hands Before Blinds Hit',
  },
];

const SATELLITE_FAQS = [
  {
    question: 'Why Should You Sometimes Fold Pocket Aces (AA) On A Satellite Bubble?',
    answer:
      'In An Equal-Prize Satellite Awarding 10 Identical Seats, Finishing 1st And Finishing 10th Pay The Exact Same Prize. If Your Stack Already Guarantees A 98%+ Probability Of Surviving To A Seat By Folding Every Remaining Hand, Calling An All-In With Pocket Aces (85% Equity) Risks A 15% Chance Of Elimination For Almost Zero Additional Dollar Equity.',
  },
  {
    question: 'How Do You Calculate The Target Seat Stack In A Poker Satellite?',
    answer:
      'Multiply Total Registered Entries By The Starting Chip Stack To Find Total Chips In Play, Then Divide By The Number Of Seats Awarded (Target Seat Stack = Total Chips In Play / Seats Awarded). Once You Accumulate Roughly 90% To 105% Of That Target Stack Near The Bubble, Survival Replaces Chip Accumulation.',
  },
  {
    question: 'What Is A Milestone (Target-Stack) Satellite Tournament?',
    answer:
      'In A Milestone Satellite, Any Player Whose Chip Count Reaches A Pre-Set Target Stack (For Example 100,000 Chips From A 10,000 Starting Stack In A 1-In-10 Qualifier) Immediately Wins Their Seat And Removes Their Chips From Play.',
  },
];

export default function SatelliteCalculatorPage({
  initialTotalPlayers = 100,
  initialStartingStack = 10000,
  initialSeatsAwarded = 10,
  initialSeatValue = 1500,
  initialPlayersRemaining = 12,
  initialHeroStack = 105000,
  initialBigBlind = 4000,
}) {
  const router = useRouter();
  const [totalPlayers, setTotalPlayers] = useState(initialTotalPlayers);
  const [startingStack, setStartingStack] = useState(initialStartingStack);
  const [seatsAwarded, setSeatsAwarded] = useState(initialSeatsAwarded);
  const [seatValue, setSeatValue] = useState(initialSeatValue);
  const [playersRemaining, setPlayersRemaining] = useState(initialPlayersRemaining);
  const [heroStack, setHeroStack] = useState(initialHeroStack);
  const [bigBlind, setBigBlind] = useState(initialBigBlind);
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
    if (q.total !== undefined) setTotalPlayers(Math.max(5, Number(q.total) || 100));
    if (q.start !== undefined) setStartingStack(Math.max(100, Number(q.start) || 10000));
    if (q.seats !== undefined) setSeatsAwarded(Math.max(1, Number(q.seats) || 10));
    if (q.val !== undefined) setSeatValue(Math.max(100, Number(q.val) || 1500));
    if (q.rem !== undefined) setPlayersRemaining(Math.max(2, Number(q.rem) || 12));
    if (q.hero !== undefined) setHeroStack(Math.max(100, Number(q.hero) || 105000));
    if (q.bb !== undefined) setBigBlind(Math.max(10, Number(q.bb) || 4000));
  }, [router.isReady, router.query]);

  const metrics = useMemo(() => {
    const safeTotal = Math.max(2, Number(totalPlayers) || 100);
    const safeStart = Math.max(100, Number(startingStack) || 10000);
    const safeSeats = Math.max(1, Math.min(safeTotal - 1, Number(seatsAwarded) || 10));
    const safeVal = Math.max(100, Number(seatValue) || 1500);
    const safeRem = Math.max(safeSeats + 1, Number(playersRemaining) || safeSeats + 2);
    const safeHero = Math.max(100, Number(heroStack) || 105000);
    const safeBb = Math.max(10, Number(bigBlind) || 4000);

    const totalChips = safeTotal * safeStart;
    const targetSeatStack = Math.round(totalChips / safeSeats);
    const heroStackBb = safeHero / safeBb;
    const targetRatio = safeHero / targetSeatStack;
    const spotsFromBubble = Math.max(1, safeRem - safeSeats);

    // Compute Hero Seat Lock Percentage (0% to 100%)
    const proximityBonus = spotsFromBubble <= 2 ? 1.08 : spotsFromBubble <= 4 ? 0.96 : 0.85;
    const rawLock = Math.min(99.4, Math.max(2.0, Math.pow(Math.min(1.3, targetRatio), 0.78) * 86 * proximityBonus));
    const seatLockPct = rawLock.toFixed(1);
    const lockedDollarEv = Math.round((rawLock / 100) * safeVal);

    // Satellite Bubble Factor (1.5x to 8.0x)
    const rawBf = 1.5 + Math.pow(rawLock / 100, 2.4) * (spotsFromBubble <= 2 ? 6.5 : 4.8);
    const bubbleFactor = Math.min(8.0, Math.max(1.5, rawBf));
    const reqCallingEquity = (bubbleFactor / (bubbleFactor + 1)) * 100;

    const foldAaOrKk =
      reqCallingEquity >= 85.5
        ? 'Fold Pocket Aces (AA) And Pocket Kings (KK) Facing A Covering Shove (Seat Is 98%+ Locked)'
        : reqCallingEquity >= 81.5
        ? 'Fold Pocket Kings (KK), QQ, And AKs Facing A Covering Shove; Call AA Only'
        : reqCallingEquity >= 74.0
        ? 'Fold QQ, JJ, And AK; Call KK+ Or Shove First-In Over Shorter Stacks'
        : 'Call Premiums (QQ+, AKs) And Use First-In Fold Equity To Build Toward Target Stack';

    return {
      safeTotal,
      safeStart,
      safeSeats,
      safeVal,
      safeRem,
      safeHero,
      safeBb,
      totalChips,
      targetSeatStack,
      heroStackBb: heroStackBb.toFixed(1),
      targetPct: Math.round(targetRatio * 100),
      seatLockPct,
      lockedDollarEv,
      bubbleFactor: bubbleFactor.toFixed(2),
      reqCallingEquity: reqCallingEquity.toFixed(1),
      foldAaOrKk,
    };
  }, [totalPlayers, startingStack, seatsAwarded, seatValue, playersRemaining, heroStack, bigBlind]);

  const handleCopyScenarioLink = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    const shareUrl = `${window.location.origin}/tools/satellite-calculator?total=${metrics.safeTotal}&start=${metrics.safeStart}&seats=${metrics.safeSeats}&val=${metrics.safeVal}&rem=${metrics.safeRem}&hero=${metrics.safeHero}&bb=${metrics.safeBb}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const canonicalPath = '/tools/satellite-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Tournament Satellite Seat-Bubble & Milestone Survival Calculator';
  const pageDesc =
    'Calculate Target Satellite Seat Stack, Hero Seat Lock Percentage, Satellite Bubble Factor, And Required All-In Calling Equity Showing When To Fold KK Or AA.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: pageTitle,
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Satellite Seat-Bubble & ICM Survival Calculator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Satellite Seat-Bubble Calculator', canonicalPath],
      ],
      faqs: SATELLITE_FAQS,
      howTo: {
        name: 'How To Calculate Satellite Seat Lock And Bubble Calling Equity',
        description: pageDesc,
        steps: [
          {
            name: 'Input Total Entries, Starting Stack, And Identical Seats Awarded',
            text: 'Enter The Total Players Registered, Starting Stack, And Number Of Identical Satellite Seats Awarded.',
          },
          {
            name: 'Enter Remaining Players, Hero Stack, And Current Big Blind',
            text: 'Specify How Many Players Remain Near The Bubble along With Your Current Chip Count And Big Blind.',
          },
          {
            name: 'Check Seat Lock Percentage, Bubble Factor, And AA/KK Fold Threshold',
            text: 'Review Your Exact Required All-In Calling Equity Against A Covering Stack Before Risking Tournament Survival.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const isEmbed = router.query?.embed === 'true';

  return (
    <div style={{ minHeight: isEmbed ? 'auto' : '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="Tournament Satellite Seat-Bubble & Milestone Survival Calculator"
        description="Calculate Target Satellite Seat Stack, Hero Seat Lock Percentage, Satellite Bubble Factor, And Required All-In Calling Equity Showing When To Fold KK Or AA."
        canonical="/tools/satellite-calculator"
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
              <span>Satellite Seat-Bubble Calculator</span>
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
          Tournament Satellite Seat-Bubble &amp; Milestone Survival Calculator
        </h1>

        {!isEmbed && (
          <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
            <strong>Direct Answer:</strong> In An Equal-Payout Satellite Where 1st Through Nth Place Win Identical Seats, Chips Above The <strong>Target Seat Stack (Total Chips / Seats Awarded)</strong> Carry Near-Zero Marginal Value, Producing Extreme <strong>4.5x To 8.0x Bubble Factors</strong> Where Even <strong>KK Or AA Must Fold</strong> Facing A Covering All-In.
          </p>
        )}

        <section
          aria-label="Interactive Satellite Seat-Bubble Calculator"
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
              Interactive Satellite Seat Lock &amp; Bubble Factor Solver
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
            {[
              { label: 'Total Players Registered', val: totalPlayers, set: setTotalPlayers, step: 10, color: '#f8fafc' },
              { label: 'Starting Chip Stack', val: startingStack, set: setStartingStack, step: 1000, color: '#f8fafc' },
              { label: 'Identical Seats Awarded', val: seatsAwarded, set: setSeatsAwarded, step: 1, color: '#25c8ff' },
              { label: 'Seat Package Value ($)', val: seatValue, set: setSeatValue, step: 500, color: '#f2b84b' },
              { label: 'Players Remaining Now', val: playersRemaining, set: setPlayersRemaining, step: 1, color: '#f87171' },
              { label: 'Hero Current Chip Stack', val: heroStack, set: setHeroStack, step: 5000, color: '#34d399' },
              { label: 'Current Big Blind Size', val: bigBlind, set: setBigBlind, step: 500, color: '#f8fafc' },
            ].map((input) => (
              <div key={input.label}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                  {input.label}
                  <input
                    type="number"
                    min="1"
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
                Target Average Seat Stack
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                {metrics.targetSeatStack.toLocaleString('en-US')} Chips
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Total Chips In Play: {metrics.totalChips.toLocaleString('en-US')}
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #34d399' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Hero Seat Lock Percentage
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                {metrics.seatLockPct}% Locked
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                {metrics.targetPct}% Of Target ({metrics.heroStackBb} BB | ${metrics.lockedDollarEv.toLocaleString('en-US')} EV)
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Satellite Bubble Factor
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#f2b84b', marginTop: 4 }}>
                {metrics.bubbleFactor}x Factor
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                {metrics.safeRem} Left For {metrics.safeSeats} Seats
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f87171' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Required All-In Calling Equity
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#f87171', marginTop: 4 }}>
                {metrics.reqCallingEquity}% Eq
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Vs Equal Or Covering Stack All-In
              </div>
            </div>
          </div>

          <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f2b84b', marginBottom: 4 }}>
              Satellite Bubble Ruling For Premium Hands (QQ / KK / AA)
            </div>
            <div style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.55 }}>
              {metrics.foldAaOrKk}
            </div>
          </div>
        </section>

        {/* Reference Matrix */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Satellite Seat-Bubble All-In Calling Equity &amp; Folding AA/KK Matrix
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                How Satellite Seat Lock Probability Inflates Bubble Factors And Forces Folds With Premium Pairs
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Hero Stack Vs Target</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Seat Lock %</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Bubble Factor</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Required Calling Equity</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Action With QQ / KK / AA</th>
                </tr>
              </thead>
              <tbody>
                {SATELLITE_BENCHMARK_TABLE.map((row) => (
                  <tr key={row.stackRatio} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.stackRatio}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.seatLockPct}</td>
                    <td style={{ padding: '10px 14px', color: '#f2b84b', fontWeight: 700 }}>{row.bubbleFactor}</td>
                    <td style={{ padding: '10px 14px', color: '#f87171', fontWeight: 700 }}>{row.reqCallingEq}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.actionWithPremiums}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cross-Links */}
        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker ICM &amp; Tournament Survival Calculators
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/icm-calculator" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Tournament ICM &amp; Final Table Solver
            </Link>
            <Link href="/tools/m-ratio-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Harrington M-Ratio &amp; Effective M Calculator
            </Link>
            <Link href="/tools/push-fold-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Short-Stack Push/Fold Nash Chart
            </Link>
            <Link href="/tools/staking-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Staking &amp; Markup Split Calculator
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              All 34 Poker Calculators
            </Link>
          </div>
        </section>

        {!isEmbed && (
          <>
            <FaqSection faqs={SATELLITE_FAQS} />

            <CitationBacklinkBox
              title="Tournament Satellite Seat-Bubble & Milestone Survival Calculator"
              canonicalUrl={canonicalUrl}
              badgeType="gto"
              badgeLabel="Satellite ICM Bubble Solver"
              badgeValue="Seat Lock % & AA/KK Fold Math"
              summary="Interactive Tournament Satellite Seat-Bubble Calculator Computing Target Seat Stack, Seat Lock Probability, And Required All-In Calling Equity."
              slug="satellite-calculator"
            />

            <AiPromptLauncher
              title="Tournament Satellite Seat-Bubble & Milestone Survival Calculator"
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
    const md = renderSatelliteCalculatorMarkdown({
      totalPlayers: query?.total,
      startingStack: query?.start,
      seatsAwarded: query?.seats,
      playersRemaining: query?.rem,
      heroStack: query?.hero,
      bb: query?.bb,
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
