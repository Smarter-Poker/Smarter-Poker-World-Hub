/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER SIDE POT & MULTI-WAY ALL-IN PAYOUT CALCULATOR (/tools/side-pot-calculator)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive multi-way all-in main pot and side pot calculator at
 * /tools/side-pot-calculator (and raw Markdown at /tools/side-pot-calculator.md).
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';

const SIDE_POT_BENCHMARKS = [
  {
    scenario: '3-Way All-In (2,000 / 5,000 / 9,000 + 300 Dead Blinds)',
    mainPot: '6,300 Chips (3 Players x 2,000 + 300 Dead)',
    sidePot1: '6,000 Chips (2 Players x 3,000 Slice)',
    sidePot2: '4,000 Chips Returned Uncalled To 9,000 Stack',
    ruleNote: 'Shortest Stack Can Win At Most 6,300 From Main Pot',
  },
  {
    scenario: '4-Way All-In With Equal Top Stacks (1,500 / 4,000 / 10,000 / 10,000)',
    mainPot: '6,000 Chips (4 Players x 1,500)',
    sidePot1: '7,500 Chips (3 Players x 2,500 Slice)',
    sidePot2: '12,000 Chips (2 Players x 6,000 Slice)',
    ruleNote: 'Three Distinct Contested Pots With Zero Uncalled Overbet',
  },
  {
    scenario: '3-Way Tie Between Two Short Stacks (3,000 / 3,000 / 8,000 + 450 Dead)',
    mainPot: '9,450 Chips (3 Players x 3,000 + 450 Dead)',
    sidePot1: '5,000 Chips Returned Uncalled To 8,000 Stack',
    sidePot2: 'None (Identical All-In Commitments Consolidate)',
    ruleNote: 'Equal Short Stacks Merge Into A Single Contested Main Pot',
  },
  {
    scenario: '5-Way Final Table All-In Chaos (10BB / 18BB / 25BB / 40BB / 60BB)',
    mainPot: '50BB + Dead Antes (All 5 Players Eligible)',
    sidePot1: '32BB (4 Players x 8BB Slice)',
    sidePot2: '21BB Side Pot 2 + 30BB Side Pot 3 + 20BB Uncalled',
    ruleNote: 'Dealer Resolves Highest Side Pot First Down To Main Pot',
  },
];

export default function SidePotCalculatorPage({
  initialStacks = [2500, 6000, 12000, 12000],
  initialDeadMoney = 450,
}) {
  const [stacks, setStacks] = useState(initialStacks);
  const [deadMoney, setDeadMoney] = useState(initialDeadMoney);

  const updateStack = (index, val) => {
    const next = [...stacks];
    next[index] = Math.max(0, Math.round(Number(val) || 0));
    setStacks(next);
  };

  const addPlayer = () => {
    if (stacks.length >= 9) return;
    setStacks([...stacks, 10000]);
  };

  const removePlayer = (index) => {
    if (stacks.length <= 2) return;
    setStacks(stacks.filter((_, i) => i !== index));
  };

  const metrics = useMemo(() => {
    const safeDead = Math.max(0, Math.round(Number(deadMoney) || 0));
    const activePlayers = stacks
      .map((amt, idx) => ({
        id: idx + 1,
        name: `Player ${idx + 1}`,
        committed: Math.max(10, Math.round(Number(amt) || 10)),
      }));

    const uniqueLevels = [...new Set(activePlayers.map((p) => p.committed))].sort((a, b) => a - b);
    const pots = [];
    let prevLevel = 0;

    uniqueLevels.forEach((level, idx) => {
      const slice = level - prevLevel;
      const eligible = activePlayers.filter((p) => p.committed >= level);
      const deadAdded = idx === 0 ? safeDead : 0;
      const totalChips = slice * eligible.length + deadAdded;
      pots.push({
        tier: idx === 0 ? 'Main Pot' : eligible.length === 1 ? 'Uncalled Bet Return' : `Side Pot ${idx}`,
        slicePerPlayer: slice,
        cumulativeCap: level,
        deadAdded,
        totalChips,
        eligibleCount: eligible.length,
        eligibleNames: eligible.map((p) => p.name).join(', '),
        isUncalled: eligible.length === 1,
      });
      prevLevel = level;
    });

    const totalPotInPlay = pots.reduce((sum, p) => sum + p.totalChips, 0);
    const contestedPots = pots.filter((p) => !p.isUncalled);
    const uncalledReturn = pots.find((p) => p.isUncalled)?.totalChips || 0;

    return {
      safeDead,
      activePlayers,
      pots,
      totalPotInPlay,
      contestedPotCount: contestedPots.length,
      uncalledReturn,
    };
  }, [stacks, deadMoney]);

  const canonicalPath = '/tools/side-pot-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Poker Side Pot & Multi-Way All-In Payout Calculator';
  const pageDesc =
    'Calculate Exact Poker Main Pots, Multi-Way All-In Side Pots, Dead Blind Contributions, Uncalled Overbet Returns, And Eligible Contenders For Up To 9 Players.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'Smarter.Poker Multi-Way All-In Side Pot Calculator',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Rules & Side Pot Calculator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Side Pot Calculator', canonicalPath],
      ],
      faqs: [
        {
          question: 'How Do Side Pots Work In A Multi-Way All-In Poker Hand?',
          answer:
            'When Players Are All-In With Different Stack Sizes, Contributions Are Matched Dollar-For-Dollar Up To The Shortest Stack To Form The Main Pot. Remaining Deeper Stacks Continue Matching Each Subsequent Stack Tier Into Side Pot 1, Side Pot 2, And So On.',
        },
        {
          question: 'Where Does Dead Money (Folded Blinds And Antes) Go In A Side Pot?',
          answer:
            'Under Official Tournament Directors Association (TDA) And Robert\'s Rules Of Poker, All Dead Money From Folded Blinds, Big Blind Antes, And Folded Street Bets Always Goes Into The Main Pot.',
        },
        {
          question: 'Which Pot Is Awarded First At Showdown When There Are Side Pots?',
          answer:
            'Dealers Always Verify Hands And Award The Last (Highest) Side Pot First Between The Deepest Eligible Stacks Before Working Backward Down To The Main Pot.',
        },
      ],
      steps: [
        {
          name: 'Enter All-In Chip Commitments For Each Player',
          text: 'Input The Total Chips Committed By Up To 9 All-In Or Calling Players.',
        },
        {
          name: 'Add Dead Money From Folded Blinds Or Antes',
          text: 'Enter Any Dead Chips From Folded Players Or Big Blind Antes That Belong In The Main Pot.',
        },
        {
          name: 'Review Main Pot, Side Pots, And Uncalled Returns',
          text: 'Inspect The Exact Chip Total And Eligible Contenders For The Main Pot And Every Sequential Side Pot.',
        },
      ],
    });
  }, [pageDesc]);

  return (
    <div style={{ minHeight: '100vh', background: '#070b14', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title={pageTitle}
        description={pageDesc}
        canonical={canonicalUrl}
        jsonLd={schema}
      />

      <main style={{ maxWidth: 1020, margin: '0 auto', padding: '40px 20px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
          <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none' }}>Smarter.Poker</Link>
          {' / '}
          <Link href="/tools" style={{ color: '#38bdf8', textDecoration: 'none' }}>Poker Tools</Link>
          {' / '}
          <span>Side Pot Calculator</span>
        </nav>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Poker Side Pot &amp; Multi-Way All-In Payout Calculator
        </h1>

        <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
          <strong>Direct Answer:</strong> In Any Multi-Way All-In Poker Hand, No Player May Win More Chips From An Opponent Than The Exact Stack Amount That Player Risked. Contributions Up To The Shortest All-In Stack Form The <strong>Main Pot</strong> (Plus All Dead Blinds, Antes, And Folded Bets), While Deeper Stacks Are Sliced Into Sequential <strong>Side Pots</strong> Contested Only By Players Who Covered Those Tiers.
        </p>

        {/* Interactive Side Pot Builder */}
        <section
          aria-label="Interactive Side Pot Calculator"
          style={{
            background: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: 14,
            padding: 24,
            marginBottom: 36,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#38bdf8', margin: 0 }}>
              Interactive Multi-Way All-In Side Pot Solver (2 To 9 Players)
            </h2>
            <button
              type="button"
              onClick={addPlayer}
              disabled={stacks.length >= 9}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid #38bdf8',
                background: '#0284c7',
                color: '#ffffff',
                fontSize: 13,
                fontWeight: 700,
                cursor: stacks.length >= 9 ? 'not-allowed' : 'pointer',
              }}
            >
              + Add All-In Player ({stacks.length}/9)
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 20 }}>
            {stacks.map((amt, idx) => (
              <div key={`player-stack-${idx}`} style={{ background: '#070b14', padding: 12, borderRadius: 10, border: '1px solid #1e293b' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1' }}>Player {idx + 1} Commitment</span>
                  {stacks.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removePlayer(idx)}
                      style={{ background: 'transparent', border: 'none', color: '#f87171', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  min="10"
                  step="50"
                  aria-label={`Player ${idx + 1} Commitment`}
                  value={amt}
                  onChange={(e) => updateStack(idx, e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid #334155',
                    background: '#0f172a',
                    color: '#f8fafc',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                />
              </div>
            ))}

            <div style={{ background: '#070b14', padding: 12, borderRadius: 10, border: '1px solid #38bdf8' }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#38bdf8', marginBottom: 6 }}>
                Dead Money (Folded Blinds &amp; Antes)
                <input
                  type="number"
                  min="0"
                  step="25"
                  value={deadMoney}
                  onChange={(e) => setDeadMoney(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid #334155',
                    background: '#0f172a',
                    color: '#f8fafc',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>
          </div>

          {/* Summary KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
            <div style={{ background: '#070b14', padding: 16, borderRadius: 10, border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Total Chips Committed
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#38bdf8', marginTop: 4 }}>
                {metrics.totalPotInPlay.toLocaleString('en-US')} Chips
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Includes {metrics.safeDead.toLocaleString('en-US')} Dead Chips In Main Pot
              </div>
            </div>

            <div style={{ background: '#070b14', padding: 16, borderRadius: 10, border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Contested Pots Created
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                {metrics.contestedPotCount} {metrics.contestedPotCount === 1 ? 'Pot' : 'Pots'}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Awarded Highest Side Pot First Down To Main Pot
              </div>
            </div>

            <div style={{ background: '#070b14', padding: 16, borderRadius: 10, border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Uncalled Overbet Return
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#f59e0b', marginTop: 4 }}>
                {metrics.uncalledReturn.toLocaleString('en-US')} Chips
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Returned Immediately To Deepest Covering Stack
              </div>
            </div>
          </div>

          {/* Step-by-Step Pot Breakdown Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#070b14', borderRadius: 10 }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Exact Step-By-Step Main Pot And Side Pot Breakdown For Active Commitments
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#38bdf8', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Pot Tier</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Per-Player Slice</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Cumulative Stack Cap</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Dead Money Added</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Total Pot Chips</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Eligible Contenders</th>
                </tr>
              </thead>
              <tbody>
                {metrics.pots.map((pot) => (
                  <tr key={pot.tier} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: pot.isUncalled ? '#f59e0b' : '#f8fafc' }}>
                      {pot.tier}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>
                      {pot.slicePerPlayer.toLocaleString('en-US')} Chips
                    </td>
                    <td style={{ padding: '10px 14px', color: '#94a3b8' }}>
                      {pot.cumulativeCap.toLocaleString('en-US')} Chips
                    </td>
                    <td style={{ padding: '10px 14px', color: '#38bdf8', fontWeight: 700 }}>
                      {pot.deadAdded.toLocaleString('en-US')} Chips
                    </td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>
                      {pot.totalChips.toLocaleString('en-US')} Chips
                    </td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>
                      {pot.eligibleNames} ({pot.eligibleCount} {pot.eligibleCount === 1 ? 'Player' : 'Players'})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Reference Table: Standard Multi-Way Side Pot Scenarios */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Standard Multi-Way All-In Side Pot Reference Examples
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#0f172a', borderRadius: 10 }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Pre-Computed Main Pot And Side Pot Allocations Under Official TDA Poker Rules
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#38bdf8', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>All-In Stack Scenario</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Main Pot Allocation</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Side Pot 1 Allocation</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Side Pot 2 / Uncalled Return</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Official Dealer Procedure</th>
                </tr>
              </thead>
              <tbody>
                {SIDE_POT_BENCHMARKS.map((row) => (
                  <tr key={row.scenario} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.scenario}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.mainPot}</td>
                    <td style={{ padding: '10px 14px', color: '#38bdf8', fontWeight: 700 }}>{row.sidePot1}</td>
                    <td style={{ padding: '10px 14px', color: '#f59e0b' }}>{row.sidePot2}</td>
                    <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{row.ruleNote}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cross-Link Navigation */}
        <section style={{ marginBottom: 32, padding: 20, background: '#0f172a', borderRadius: 12, border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Calculators &amp; Tournament Tools
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#0284c7', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              All Poker Calculators
            </Link>
            <Link href="/tools/poker-odds-calculator" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Multiway Equity Calculator
            </Link>
            <Link href="/tools/icm-calculator" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Tournament ICM Calculator
            </Link>
            <Link href="/tools/blind-structure-calculator" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Blind Structure Generator
            </Link>
            <Link href="/tools/spr-calculator" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              SPR &amp; Geometric Sizing
            </Link>
            <Link href="/hub/commander/home-games" style={{ padding: '8px 14px', background: '#1e293b', color: '#38bdf8', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Host A Home Game
            </Link>
          </div>
        </section>

        <AiPromptLauncher
          title="Poker Side Pot & Multi-Way All-In Payout Calculator"
          canonicalUrl={canonicalUrl}
          markdownUrl={`${canonicalUrl}.md`}
        />
      </main>
    </div>
  );
}

export async function getServerSideProps({ req, res, query }) {
  const acceptHeader = String(req?.headers?.accept || '');
  const isMarkdownRequested =
    acceptHeader.includes('text/markdown') ||
    query?.format === 'md' ||
    req?.url?.includes('format=md');

  if (isMarkdownRequested) {
    const { renderSidePotCalculatorMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderSidePotCalculatorMarkdown({
      stacks: query?.stacks || '2500,6000,12000,12000',
      deadMoney: query?.deadMoney ?? 450,
    });
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }

  const parsedStacks = query?.stacks
    ? String(query.stacks)
        .split(',')
        .map((n) => Math.max(10, Math.round(Number(n.trim()) || 0)))
        .filter((n) => n > 0)
        .slice(0, 9)
    : [2500, 6000, 12000, 12000];

  return {
    props: {
      initialStacks: parsedStacks.length >= 2 ? parsedStacks : [2500, 6000, 12000, 12000],
      initialDeadMoney: query?.deadMoney !== undefined ? Math.max(0, Number(query.deadMoney) || 0) : 450,
    },
  };
}
