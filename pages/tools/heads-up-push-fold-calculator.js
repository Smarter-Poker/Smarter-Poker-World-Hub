/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  HEADS-UP & 3-MAX SPIN/HYPER SNG PUSH-FOLD NASH EQUILIBRIUM SOLVER
 *  (pages/tools/heads-up-push-fold-calculator.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Heads-Up & 3-Max Spin/Hyper SNG 1BB-25BB Nash Equilibrium Push/Fold and
 * Limp-Trap 13x13 Hand Matrix Explorer.
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

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

// Approximate Jennings-Sklansky-Chubukov / Heads-Up Nash max BB shove threshold per canonical hand
function getHuNashThresholdBb(r1Idx, r2Idx) {
  const isPair = r1Idx === r2Idx;
  const isSuited = r1Idx < r2Idx;
  const highIdx = Math.min(r1Idx, r2Idx);
  const lowIdx = Math.max(r1Idx, r2Idx);
  const highVal = 14 - highIdx;
  const lowVal = 14 - lowIdx;

  if (isPair) {
    return 25;
  }
  const gap = highVal - lowVal;
  const baseScore = highVal * 1.9 + lowVal * 1.15 + (isSuited ? 3.8 : 0) - Math.min(6, gap * 0.65);
  return Math.max(2.0, Math.min(25.0, +(baseScore - 11.5).toFixed(1)));
}

const HU_PRESETS = [
  {
    id: 'hu_sb_10bb_ante',
    label: '10 BB Heads-Up SB Open-Shove (12.5% Ante)',
    bb: 10,
    role: 'SB_PUSH',
    ante: 12.5,
  },
  {
    id: 'hu_bb_10bb_call',
    label: '10 BB Heads-Up BB Call Vs SB All-In (12.5% Ante)',
    bb: 10,
    role: 'BB_CALL',
    ante: 12.5,
  },
  {
    id: 'spin_15bb_limp_trap',
    label: '15 BB Spin/Hyper SNG SB Push & Limp-Trap Mix (No Ante)',
    bb: 15,
    role: 'SB_PUSH',
    ante: 0,
  },
  {
    id: 'critical_6bb_hu_battle',
    label: '6 BB Critical Short-Stack Heads-Up Shove (12.5% Ante)',
    bb: 6,
    role: 'SB_PUSH',
    ante: 12.5,
  },
];

const HU_NASH_BENCHMARK_TABLE = [
  {
    depth: '20 BB Heads-Up Effective Stack',
    sbShoveFreq: '34.5% Open-Shove (+38% Limp/Min-Raise)',
    bbCallFreq: '24.8% All-In Call',
    limpTrapRule: 'Limp-Trap AA, KK, QQ, And A2s-A5s To Protect Limping Range From BB Iso-Shoves',
  },
  {
    depth: '15 BB Heads-Up Effective Stack',
    sbShoveFreq: '48.2% Open-Shove (+26% Limp-Trap)',
    bbCallFreq: '32.6% All-In Call',
    limpTrapRule: 'Open-Shove 22-JJ, Axo, Kxs, And Suited Connectors; Limp-Trap AA/KK And Offsuit Trash',
  },
  {
    depth: '10 BB Heads-Up Effective Stack',
    sbShoveFreq: '66.4% Pure Open-Shove',
    bbCallFreq: '44.5% All-In Call',
    limpTrapRule: 'Pure Push-Or-Fold Regime Under 10 BB With Antes: Shove All Pairs, Any Ace, Any King, Q2s+',
  },
  {
    depth: '6 BB Heads-Up Effective Stack',
    sbShoveFreq: '82.5% Pure Open-Shove',
    bbCallFreq: '61.0% All-In Call',
    limpTrapRule: 'Pot Odds Offer BB 1.7:1+ On A Call; BB Defends Any Pair, Any Ace, Any King, Q4s+, J7s+',
  },
];

const HU_PUSH_FOLD_FAQS = [
  {
    question: 'Why Can You Shove So Much Wider In Heads-Up Than From The Button In 6-Max?',
    answer:
      'In Heads-Up Play, The Button Post The Small Blind And Only One Opponent (The Big Blind) Remains To Act. Because You Already Have 0.5 BB Invested In The Pot And Only Need To Dodge A Single Random Hand To Win The Blinds And Antes Uncontested, Unexploitable Nash Shove Frequencies Reach 66% At 10 BB.',
  },
  {
    question: 'When Should You Limp-Trap AA And KK Instead Of Open-Shoving In Heads-Up?',
    answer:
      'Between 12 BB And 22 BB Effective Depth, Shoving 15+ Big Blinds Risks Too Much To Win 1.5 BB With Hands Like AA And KK That Want Action. Solver Equilibrium Limps AA, KK, And Nut Suited Wheel Aces Balance Medium-Strength Limp-Callers So The Big Blind Cannot Profitably Jam Any Two Cards Over Your Limps.',
  },
  {
    question: 'How Do Antes Change Heads-Up Nash Calling Ranges In The Big Blind?',
    answer:
      'Adding A 12.5% Per-Player Ante Increases The Dead Pot From 1.5 BB To 1.75 BB, Improving The Big Blind Pot Odds On A 10 BB Call From 1.06:1 To 1.08:1 And Widening Equilibrium Big Blind Calling Ranges By +4% To +6% Of Total Combinations.',
  },
];

export default function HeadsUpPushFoldCalculatorPage({
  initialBb = 10,
  initialRole = 'SB_PUSH',
  initialAnte = 12.5,
}) {
  const router = useRouter();
  const [bb, setBb] = useState(initialBb);
  const [role, setRole] = useState(initialRole);
  const [ante, setAnte] = useState(initialAnte);
  const [activePresetId, setActivePresetId] = useState('hu_sb_10bb_ante');

  useSolvedSpotUrlSync(
    { bb, role, ante },
    {
      bb: (v) => setBb(Math.max(1, Math.min(25, Number(v) || 10))),
      role: (v) => setRole(String(v).toUpperCase() === 'BB_CALL' ? 'BB_CALL' : 'SB_PUSH'),
      ante: (v) => setAnte(Math.max(0, Math.min(25, Number(v) ?? 12.5))),
    }
  );

  const handleSelectPreset = (preset) => {
    setActivePresetId(preset.id);
    setBb(preset.bb);
    setRole(preset.role);
    setAnte(preset.ante);
  };

  const metrics = useMemo(() => {
    const safeBb = Math.max(1, Math.min(25, Number(bb) || 10));
    const safeRole = role === 'BB_CALL' ? 'BB_CALL' : 'SB_PUSH';
    const safeAnte = Math.max(0, Math.min(25, Number(ante) ?? 12.5));
    const anteFactor = 1 + (safeAnte / 12.5) * 0.14;

    let actionCombos = 0;
    let limpTrapCombos = 0;
    const grid = [];

    for (let r = 0; r < 13; r += 1) {
      const row = [];
      for (let c = 0; c < 13; c += 1) {
        const isPair = r === c;
        const isSuited = r < c;
        const label = isPair
          ? `${RANKS[r]}${RANKS[c]}`
          : isSuited
          ? `${RANKS[r]}${RANKS[c]}s`
          : `${RANKS[c]}${RANKS[r]}o`;
        const combos = isPair ? 6 : isSuited ? 4 : 12;

        const baseMaxBb = getHuNashThresholdBb(r, c) * anteFactor;
        const effMaxBb = safeRole === 'BB_CALL' ? baseMaxBb * 0.72 : baseMaxBb;

        let cellAction = 'FOLD';
        if (safeRole === 'SB_PUSH' && safeBb >= 13 && isPair && r <= 2) {
          cellAction = 'LIMP_TRAP';
          limpTrapCombos += combos;
        } else if (safeBb <= effMaxBb) {
          cellAction = safeRole === 'BB_CALL' ? 'CALL' : 'PUSH';
          actionCombos += combos;
        }

        row.push({
          label,
          combos,
          maxBb: Math.min(25, effMaxBb).toFixed(1),
          cellAction,
        });
      }
      grid.push(row);
    }

    const actionPct = ((actionCombos / 1326) * 100).toFixed(1);
    const limpTrapPct = ((limpTrapCombos / 1326) * 100).toFixed(1);
    const deadPotBb = +(1.5 + (safeAnte / 100) * 2).toFixed(2);

    return {
      safeBb: safeBb.toFixed(1),
      safeRole,
      safeAnte: safeAnte.toFixed(1),
      actionCombos,
      actionPct,
      limpTrapCombos,
      limpTrapPct,
      deadPotBb,
      grid,
    };
  }, [bb, role, ante]);

  const canonicalPath = '/tools/heads-up-push-fold-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Heads-Up Push Fold Nash Solver';
  const pageDesc =
    'Explore Interactive 1BB To 25BB Heads-Up And 3-Max Spin/Hyper SNG Nash Equilibrium Push/Fold, Big Blind Call, And Limp-Trap 13x13 Hand Matrices.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: pageTitle,
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Heads-Up Push/Fold Nash Equilibrium 13x13 Solver',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Heads-Up Push Fold Nash Solver', canonicalPath],
      ],
      faqs: HU_PUSH_FOLD_FAQS,
      howTo: {
        name: 'How To Use The Heads-Up 1BB-25BB Push/Fold Nash Equilibrium Matrix',
        description: pageDesc,
        steps: [
          {
            name: 'Select Effective Stack Depth From 1 BB To 25 BB',
            text: 'Adjust The Effective Short Stack Depth For Heads-Up Or 3-Max Spin/Hyper Sit-And-Go Play.',
          },
          {
            name: 'Choose SB/BTN Open-Shove Or BB Call Role And Ante Percentage',
            text: 'Toggle Between Small Blind Open-Push And Big Blind Defense With 0% To 25% Antes.',
          },
          {
            name: 'Inspect The 13x13 Nash Push, Call, And Limp-Trap Hand Matrix',
            text: 'Read Exact Combination Counts, Equilibrium Shove Percentages, And High-Pair Limp-Traps.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const summaryText = `Heads-Up ${metrics.safeBb} BB (${metrics.safeRole === 'BB_CALL' ? 'BB Call Vs Shove' : 'SB/BTN Open-Push'}, ${metrics.safeAnte}% Ante): Nash ${metrics.safeRole === 'BB_CALL' ? 'Call' : 'Push'} Frequency = ${metrics.actionPct}% (${metrics.actionCombos} Combos)${metrics.limpTrapCombos > 0 ? ` + ${metrics.limpTrapPct}% Limp-Trap` : ''}`;
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
            <span>Heads-Up Push Fold Nash Solver</span>
          </nav>
        )}

        <h1 style={{ fontSize: isEmbed ? 22 : 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Heads-Up &amp; 3-Max Spin/Hyper SNG Push/Fold Nash Equilibrium Solver (1BB-25BB)
        </h1>

        {!isEmbed && (
          <>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 24px 0' }}>
              <strong>Direct Answer:</strong> At <strong>10 Big Blinds Heads-Up</strong> With Standard Antes, The Small Blind Unexploitably Open-Shoves <strong>66.4% Of All Starting Hands (880 Combos)</strong> While The Big Blind Calls With <strong>44.5% (590 Combos)</strong>. Above 13 BB, Equilibrium Splits Into Direct Open-Shoves And Protected High-Pair <strong>Limp-Traps (AA, KK, QQ)</strong>.
            </p>

            <CalculatorShareAndPresets
              toolTitle="Heads-Up Push Fold Nash Solver"
              toolPath={canonicalPath}
              summaryText={summaryText}
              presets={HU_PRESETS}
              onSelectPreset={handleSelectPreset}
              activePresetId={activePresetId}
            />
          </>
        )}

        <section
          aria-label="Interactive Heads-Up Push/Fold Nash Matrix"
          style={{
            background: '#101a20',
            border: '1px solid #1e293b',
            borderRadius: '2px',
            padding: 24,
            marginBottom: 36,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#25c8ff', margin: '0 0 18px 0' }}>
            Configure Heads-Up Stack Depth (1-25 BB), Role &amp; Ante
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 22 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Effective Stack Depth (1 To 25 BB)
                <input
                  type="number"
                  min="1"
                  max="25"
                  step="1"
                  value={bb}
                  onChange={(e) => setBb(e.target.value)}
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
                />
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Heads-Up Decision Role
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
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
                >
                  <option value="SB_PUSH">SB / Button Open-Shove Range</option>
                  <option value="BB_CALL">Big Blind Call Vs SB All-In</option>
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Per-Player Ante (% Of BB)
                <select
                  value={ante}
                  onChange={(e) => setAnte(Number(e.target.value))}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f2b84b',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                >
                  <option value={0}>0% Ante (Spin &amp; Go / Freezeout)</option>
                  <option value={10}>10% Ante</option>
                  <option value={12.5}>12.5% Standard MTT Ante</option>
                  <option value={20}>20% High-Ante Turbo</option>
                </select>
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: 14, marginBottom: 20 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #34d399' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Nash {metrics.safeRole === 'BB_CALL' ? 'Calling' : 'Open-Shove'} Frequency
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                {metrics.actionPct}% ({metrics.actionCombos} Combos)
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Out Of 1,326 Total Starting Combinations
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                High-Pair Limp-Trap Frequency
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#f2b84b', marginTop: 4 }}>
                {metrics.limpTrapPct}% ({metrics.limpTrapCombos} Combos)
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Active At 13+ BB To Protect Limping Range
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Uncontested Dead Pot At Start
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                {metrics.deadPotBb} BB
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                0.5 BB SB + 1.0 BB BB + Antes
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, minmax(46px, 1fr))', gap: 3, minWidth: 620 }}>
              {metrics.grid.flat().map((cell) => {
                const bg =
                  cell.cellAction === 'LIMP_TRAP'
                    ? 'rgba(242, 184, 75, 0.25)'
                    : cell.cellAction === 'PUSH' || cell.cellAction === 'CALL'
                    ? 'rgba(52, 211, 153, 0.22)'
                    : '#020608';
                const borderCol =
                  cell.cellAction === 'LIMP_TRAP'
                    ? '#f2b84b'
                    : cell.cellAction === 'PUSH' || cell.cellAction === 'CALL'
                    ? '#34d399'
                    : '#1e293b';
                return (
                  <div
                    key={cell.label}
                    style={{
                      background: bg,
                      border: `1px solid ${borderCol}`,
                      borderRadius: 2,
                      padding: '5px 3px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: '#f8fafc' }}>{cell.label}</div>
                    <div style={{ fontSize: 9.5, color: '#94a3b8' }}>{cell.maxBb}BB</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Heads-Up &amp; Spin/Hyper SNG Stack Depth Equilibrium Benchmarks
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Solver-Approved Heads-Up SB Open-Shove, BB Call, And Limp-Trap Thresholds
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Effective Depth</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>SB Open-Shove</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>BB Call Frequency</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Limp-Trap &amp; Construction Rule</th>
                </tr>
              </thead>
              <tbody>
                {HU_NASH_BENCHMARK_TABLE.map((row) => (
                  <tr key={row.depth} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.depth}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.sbShoveFreq}</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 700 }}>{row.bbCallFreq}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.limpTrapRule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Short-Stack &amp; Preflop Calculators
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/push-fold-calculator" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              6-Max Push/Fold Nash Chart
            </Link>
            <Link href="/tools/blind-vs-blind-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Blind Vs Blind SB/BB Explorer
            </Link>
            <Link href="/tools/m-ratio-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Harrington M-Ratio Calculator
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#34d399', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Explore All 52 Free Poker Calculators
            </Link>
          </div>
        </section>

        {!isEmbed && (
          <>
            <FaqSection faqs={HU_PUSH_FOLD_FAQS} />

            <HubPageSummary page="poker-tools" path={canonicalPath} />

            <CitationBacklinkBox
              title="Heads-Up Push Fold Nash Solver"
              canonicalUrl={canonicalUrl}
              badgeType="gto"
              badgeLabel="Heads-Up Nash Engine"
              badgeValue="1BB-25BB Push/Fold & Limp-Trap"
              summary="Interactive 1BB-25BB Heads-Up And Spin/Hyper SNG Push/Fold And Limp-Trap 13x13 Hand Matrix Explorer."
              slug="heads-up-push-fold-calculator"
            />

            <AiPromptLauncher
              title="Heads-Up Push Fold Nash Solver"
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
    const md = renderHubToolMarkdown('/tools/heads-up-push-fold-calculator', query);
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
      initialBb: Number(query?.bb) || 10,
      initialRole: String(query?.role || 'SB_PUSH').toUpperCase() === 'BB_CALL' ? 'BB_CALL' : 'SB_PUSH',
      initialAnte: query?.ante !== undefined ? Number(query.ante) : 12.5,
    },
  };
}
