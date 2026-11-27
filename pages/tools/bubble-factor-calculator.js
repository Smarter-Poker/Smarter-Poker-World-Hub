/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  FINAL TABLE PAIRWISE ICM BUBBLE FACTOR & REQUIRED EQUITY MATRIX
 *  (pages/tools/bubble-factor-calculator.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Final Table N x N Pairwise ICM Bubble Factor & Required All-In Equity Matrix
 * showing every Hero vs. Villain pair's exact Bubble Factor BF = dEV_lose / dEV_win
 * and required calling equity BF / (BF + 1).
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
import { computeMalmuthHarvilleIcm, useSolvedSpotUrlSync } from '../../src/lib/seo/solvedSpotEngine';
import { setPublicSeoHtmlCache } from '../../src/lib/seo/edgeCacheHeaders.mjs';

const BUBBLE_FACTOR_PRESETS = [
  {
    id: 'ft_4handed_classic',
    label: '4-Handed Final Table (50 BB / 32 BB / 22 BB / 8 BB Micro Stack)',
    s1: 50,
    s2: 32,
    s3: 22,
    s4: 8,
    p1: 45000,
    p2: 30000,
    p3: 18000,
    p4: 11000,
  },
  {
    id: 'direct_bubble_4for3',
    label: 'Direct Money Bubble (4 Left For 3 Paid Places: $0 4th Place)',
    s1: 60,
    s2: 35,
    s3: 30,
    s4: 15,
    p1: 50000,
    p2: 30000,
    p3: 20000,
    p4: 0,
  },
  {
    id: 'flat_equal_stacks',
    label: '4 Equal 30 BB Stacks At Major Final Table Pay Jumps',
    s1: 30,
    s2: 30,
    s3: 30,
    s4: 30,
    p1: 100000,
    p2: 65000,
    p3: 42000,
    p4: 28000,
  },
  {
    id: 'massive_chipleader_bully',
    label: 'Massive Chip Leader (85 BB) Bullying Three 18 BB Medium Stacks',
    s1: 85,
    s2: 18,
    s3: 18,
    s4: 18,
    p1: 60000,
    p2: 38000,
    p3: 24000,
    p4: 15000,
  },
];

const BUBBLE_FACTOR_FAQS = [
  {
    question: 'What Is The Exact Mathematical Formula For ICM Bubble Factor (BF)?',
    answer:
      'In Tournament ICM, Your Bubble Factor Against A Specific Opponent Equals The Dollar Equity You Lose If You Lose An All-In Confrontation Divided By The Dollar Equity You Gain If You Win That Exact Confrontation: BF = Delta_EV_Lose / Delta_EV_Win. In A Chip-EV Cash Game, BF Is Always 1.00.',
  },
  {
    question: 'How Do You Convert Your Pairwise Bubble Factor Into Required All-In Calling Equity?',
    answer:
      'Ignoring Pot Odds Discounts From Blinds, Your Required All-In Equity Against An Opponent Equals BF / (BF + 1). A Bubble Factor Of 1.00 Requires 50.0% Equity; A Bubble Factor Of 1.50 Requires 60.0% Equity (+10% ICM Risk Premium); And A Bubble Factor Of 2.20 Requires 68.8% Equity (+18.8% Risk Premium).',
  },
  {
    question: 'Why Do Medium Stacks Experience The Highest Bubble Factors At A Final Table?',
    answer:
      'When A 32BB Second-Place Stack Collides All-In With The 50BB Chip Leader While An 8BB Micro-Stack Sits At The Table, Busting Before The 8BB Stack Forfeits Multiple Guaranteed Pay Ladders, Driving The Medium Stack Bubble Factor Above 1.85x To 2.30x.',
  },
];

export default function BubbleFactorCalculatorPage({
  initialS1 = 50,
  initialS2 = 32,
  initialS3 = 22,
  initialS4 = 8,
  initialP1 = 45000,
  initialP2 = 30000,
  initialP3 = 18000,
  initialP4 = 11000,
}) {
  const router = useRouter();
  const [s1, setS1] = useState(initialS1);
  const [s2, setS2] = useState(initialS2);
  const [s3, setS3] = useState(initialS3);
  const [s4, setS4] = useState(initialS4);
  const [p1, setP1] = useState(initialP1);
  const [p2, setP2] = useState(initialP2);
  const [p3, setP3] = useState(initialP3);
  const [p4, setP4] = useState(initialP4);
  const [activePresetId, setActivePresetId] = useState('ft_4handed_classic');

  useSolvedSpotUrlSync(
    { s1, s2, s3, s4, p1, p2, p3, p4 },
    {
      s1: (v) => setS1(Math.max(1, Number(v) || 50)),
      s2: (v) => setS2(Math.max(1, Number(v) || 32)),
      s3: (v) => setS3(Math.max(1, Number(v) || 22)),
      s4: (v) => setS4(Math.max(1, Number(v) || 8)),
      p1: (v) => setP1(Math.max(100, Number(v) || 45000)),
      p2: (v) => setP2(Math.max(0, Number(v) || 30000)),
      p3: (v) => setP3(Math.max(0, Number(v) || 18000)),
      p4: (v) => setP4(Math.max(0, Number(v) || 11000)),
    }
  );

  const handleSelectPreset = (preset) => {
    setActivePresetId(preset.id);
    setS1(preset.s1);
    setS2(preset.s2);
    setS3(preset.s3);
    setS4(preset.s4);
    setP1(preset.p1);
    setP2(preset.p2);
    setP3(preset.p3);
    setP4(preset.p4);
  };

  const metrics = useMemo(() => {
    const stacks = [
      Math.max(1, Number(s1) || 50),
      Math.max(1, Number(s2) || 32),
      Math.max(1, Number(s3) || 22),
      Math.max(1, Number(s4) || 8),
    ];
    const payouts = [
      Math.max(100, Number(p1) || 45000),
      Math.max(0, Number(p2) || 30000),
      Math.max(0, Number(p3) || 18000),
      Math.max(0, Number(p4) ?? 11000),
    ];

    const baseEquities = computeMalmuthHarvilleIcm(stacks, payouts);

    // Build 4x4 Pairwise Matrix: Hero i vs Villain j
    const matrix = [];
    let maxBfPair = { hero: 1, villain: 1, bf: 1.0, reqEq: 50.0, riskPrem: 0 };

    for (let i = 0; i < 4; i += 1) {
      const row = [];
      for (let j = 0; j < 4; j += 1) {
        if (i === j) {
          row.push(null);
          continue;
        }
        const effBattle = Math.min(stacks[i], stacks[j]);

        // Case 1: Hero i wins effBattle from Villain j
        const winStacks = [...stacks];
        winStacks[i] += effBattle;
        winStacks[j] -= effBattle;
        let winEquities;
        if (winStacks[j] <= 0) {
          // Villain j busts in 4th place (receives payouts[3])
          const aliveIndices = [0, 1, 2, 3].filter((idx) => idx !== j);
          const aliveStacks = aliveIndices.map((idx) => winStacks[idx]);
          const alivePayouts = payouts.slice(0, 3);
          const subEq = computeMalmuthHarvilleIcm(aliveStacks, alivePayouts);
          winEquities = [0, 0, 0, 0];
          aliveIndices.forEach((origIdx, k) => {
            winEquities[origIdx] = subEq[k];
          });
          winEquities[j] = payouts[3];
        } else {
          winEquities = computeMalmuthHarvilleIcm(winStacks, payouts);
        }

        // Case 2: Hero i loses effBattle to Villain j
        const loseStacks = [...stacks];
        loseStacks[i] -= effBattle;
        loseStacks[j] += effBattle;
        let loseEquities;
        if (loseStacks[i] <= 0) {
          const aliveIndices = [0, 1, 2, 3].filter((idx) => idx !== i);
          const aliveStacks = aliveIndices.map((idx) => loseStacks[idx]);
          const alivePayouts = payouts.slice(0, 3);
          const subEq = computeMalmuthHarvilleIcm(aliveStacks, alivePayouts);
          loseEquities = [0, 0, 0, 0];
          aliveIndices.forEach((origIdx, k) => {
            loseEquities[origIdx] = subEq[k];
          });
          loseEquities[i] = payouts[3];
        } else {
          loseEquities = computeMalmuthHarvilleIcm(loseStacks, payouts);
        }

        const deltaWin = Math.max(0.01, winEquities[i] - baseEquities[i]);
        const deltaLose = Math.max(0.01, baseEquities[i] - loseEquities[i]);
        const bf = deltaLose / deltaWin;
        const reqEq = (bf / (bf + 1)) * 100;
        const riskPrem = Math.max(0, reqEq - 50);

        const cell = {
          hero: i + 1,
          villain: j + 1,
          bf: bf.toFixed(2),
          reqEq: reqEq.toFixed(1),
          riskPrem: riskPrem.toFixed(1),
          deltaWin: Math.round(deltaWin),
          deltaLose: Math.round(deltaLose),
        };
        row.push(cell);

        if (bf > maxBfPair.bf) {
          maxBfPair = {
            hero: i + 1,
            villain: j + 1,
            bf: Number(bf.toFixed(2)),
            reqEq: Number(reqEq.toFixed(1)),
            riskPrem: Number(riskPrem.toFixed(1)),
          };
        }
      }
      matrix.push(row);
    }

    return {
      stacks,
      payouts,
      baseEquities: baseEquities.map((v) => Math.round(v)),
      matrix,
      maxBfPair,
      p2VsP1Cell: matrix[1][0],
    };
  }, [s1, s2, s3, s4, p1, p2, p3, p4]);

  const canonicalPath = '/tools/bubble-factor-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Final Table Bubble Factor Matrix';
  const pageDesc =
    'Compute The Complete N x N Pairwise Final Table ICM Bubble Factor Matrix (BF = Delta EV Lose / Delta EV Win), Risk Premiums, And Required All-In Calling Equities.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: pageTitle,
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Tournament ICM Bubble Factor & Risk Premium Matrix Solver',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Final Table Bubble Factor Matrix', canonicalPath],
      ],
      faqs: BUBBLE_FACTOR_FAQS,
      howTo: {
        name: 'How To Compute Pairwise Final Table ICM Bubble Factors And Risk Premiums',
        description: pageDesc,
        steps: [
          {
            name: 'Enter Remaining Final Table Stacks And Payout Ladder',
            text: 'Input The Chip Or Big Blind Stacks And Prize Pool Payouts For Seats 1 Through 4.',
          },
          {
            name: 'Inspect The N x N Pairwise Hero Vs. Villain Bubble Factor Grid',
            text: 'Read The Exact Bubble Factor (BF = dEV Lose / dEV Win) For Every Hero Row Against Every Villain Column.',
          },
          {
            name: 'Apply Required Calling Equity And ICM Risk Premium',
            text: 'Add The Computed ICM Risk Premium To Your 50% Chip-EV Baseline Before Calling All-In Shoves.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const summaryText = `4-Handed Final Table Bubble Factor Matrix (Stacks ${metrics.stacks.join('/')} BB): P2 Vs P1 Bubble Factor = ${metrics.p2VsP1Cell.bf}x (${metrics.p2VsP1Cell.reqEq}% Req Equity, +${metrics.p2VsP1Cell.riskPrem}% Risk Premium) | Peak Table Pressure: P${metrics.maxBfPair.hero} Vs P${metrics.maxBfPair.villain} = ${metrics.maxBfPair.bf}x (${metrics.maxBfPair.reqEq}% Eq)`;
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
            <span>Final Table Bubble Factor Matrix</span>
          </nav>
        )}

        <h1 style={{ fontSize: isEmbed ? 22 : 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Final Table Pairwise ICM Bubble Factor &amp; Risk Premium Matrix
        </h1>

        {!isEmbed && (
          <>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 24px 0' }}>
              <strong>Direct Answer:</strong> Your Pairwise ICM Bubble Factor <strong>BF = &Delta;EV<sub>Lose</sub> / &Delta;EV<sub>Win</sub></strong> Determines Your Exact Required All-In Equity <strong>BF / (BF + 1)</strong> Against Each Specific Seat At The Table. Medium Stacks Facing The Chip Leader While A Micro-Stack Hangs On Routinely Face <strong>1.80x To 2.35x Bubble Factors (64% To 70% Required Equity)</strong>.
            </p>

            <CalculatorShareAndPresets
              toolTitle="Final Table Bubble Factor Matrix"
              toolPath={canonicalPath}
              summaryText={summaryText}
              presets={BUBBLE_FACTOR_PRESETS}
              onSelectPreset={handleSelectPreset}
              activePresetId={activePresetId}
            />
          </>
        )}

        <section
          aria-label="Interactive Pairwise ICM Bubble Factor Matrix Solver"
          style={{
            background: '#101a20',
            border: '1px solid #1e293b',
            borderRadius: '2px',
            padding: 24,
            marginBottom: 36,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#25c8ff', margin: '0 0 18px 0' }}>
            Configure 4-Handed Final Table Stacks &amp; Payout Ladder
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 22 }}>
            {[
              { label: 'Seat 1 Stack (BB Or Chips)', val: s1, set: setS1, step: 2, color: '#25c8ff' },
              { label: 'Seat 2 Stack (BB Or Chips)', val: s2, set: setS2, step: 2, color: '#25c8ff' },
              { label: 'Seat 3 Stack (BB Or Chips)', val: s3, set: setS3, step: 2, color: '#25c8ff' },
              { label: 'Seat 4 Stack (BB Or Chips)', val: s4, set: setS4, step: 2, color: '#25c8ff' },
              { label: '1st Place Prize ($)', val: p1, set: setP1, step: 1000, color: '#34d399' },
              { label: '2nd Place Prize ($)', val: p2, set: setP2, step: 1000, color: '#34d399' },
              { label: '3rd Place Prize ($)', val: p3, set: setP3, step: 1000, color: '#34d399' },
              { label: '4th Place Prize ($)', val: p4, set: setP4, step: 1000, color: '#f2b84b' },
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: 14, marginBottom: 22 }}>
            {metrics.baseEquities.map((eqVal, idx) => (
              <div key={`seat-eq-${idx + 1}`} style={{ background: '#020608', padding: 14, borderRadius: '2px', border: '1px solid #1e293b' }}>
                <div style={{ fontSize: 11.5, color: '#94a3b8', textTransform: 'uppercase' }}>
                  Seat {idx + 1} ({metrics.stacks[idx]} BB) Baseline ICM
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                  ${eqVal.toLocaleString('en-US')}
                </div>
              </div>
            ))}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, background: '#020608', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Pairwise 4x4 Hero (Row) Vs. Villain (Column) Bubble Factor, Required Calling Equity, And Risk Premium
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 12px' }}>Hero \ Villain</th>
                  {[0, 1, 2, 3].map((j) => (
                    <th key={`col-${j}`} scope="col" style={{ padding: '10px 12px' }}>
                      Vs Seat {j + 1} ({metrics.stacks[j]} BB)
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.matrix.map((row, i) => (
                  <tr key={`row-${i}`} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 800, color: '#f8fafc' }}>
                      Hero Seat {i + 1} ({metrics.stacks[i]} BB)
                    </td>
                    {row.map((cell, j) => {
                      if (!cell) {
                        return (
                          <td key={`cell-${i}-${j}`} style={{ padding: '10px 12px', color: '#475569' }}>
                            --
                          </td>
                        );
                      }
                      const highPressure = Number(cell.bf) >= 1.65;
                      return (
                        <td
                          key={`cell-${i}-${j}`}
                          style={{
                            padding: '10px 12px',
                            background: highPressure ? 'rgba(248, 113, 113, 0.08)' : 'transparent',
                          }}
                        >
                          <div style={{ fontWeight: 800, color: highPressure ? '#f87171' : '#34d399', fontSize: 15 }}>
                            {cell.bf}x BF ({cell.reqEq}% Eq)
                          </div>
                          <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
                            +{cell.riskPrem}% Prem (-${cell.deltaLose} / +${cell.deltaWin})
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker ICM &amp; Tournament Calculators
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/icm-calculator" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Malmuth-Harville ICM Calculator
            </Link>
            <Link href="/tools/chop-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Final Table ICM Chop Calculator
            </Link>
            <Link href="/tools/satellite-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Satellite Seat-Lock Calculator
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#34d399', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Explore All 52 Free Poker Calculators
            </Link>
          </div>
        </section>

        {!isEmbed && (
          <>
            <FaqSection faqs={BUBBLE_FACTOR_FAQS} />

            <HubPageSummary page="poker-tools" path={canonicalPath} />

            <CitationBacklinkBox
              title="Final Table Bubble Factor Matrix"
              canonicalUrl={canonicalUrl}
              badgeType="gto"
              badgeLabel="Pairwise ICM Matrix"
              badgeValue="N x N Bubble Factor Solver"
              summary="Calculates Exact Pairwise Final Table ICM Bubble Factors (dEV Lose / dEV Win), Risk Premiums, And Required All-In Equities."
              slug="bubble-factor-calculator"
            />

            <AiPromptLauncher
              title="Final Table Bubble Factor Matrix"
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
    const md = renderHubToolMarkdown('/tools/bubble-factor-calculator', query);
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
      initialS1: Number(query?.s1) || 50,
      initialS2: Number(query?.s2) || 32,
      initialS3: Number(query?.s3) || 22,
      initialS4: Number(query?.s4) || 8,
      initialP1: Number(query?.p1) || 45000,
      initialP2: Number(query?.p2) || 30000,
      initialP3: Number(query?.p3) || 18000,
      initialP4: query?.p4 !== undefined ? Number(query.p4) : 11000,
    },
  };
}
