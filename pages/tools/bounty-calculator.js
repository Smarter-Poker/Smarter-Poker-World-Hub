/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  PKO & MYSTERY BOUNTY CHIP EQUITY & POT ODDS CALCULATOR
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive public calculator & reference hub at /tools/bounty-calculator
 * (and raw Markdown at /tools/bounty-calculator.md).
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';

const PKO_STAGE_CONVERSIONS = [
  { stage: 'Tournament Start (Level 1 - 100% Starting Stacks)', bountyRatio: '1.0x Starting Bounty', bountyPowerPct: '33.3% Of Starting Stack', chipValue20k: '6,667 Chips', equityDiscount: '5% To 7% Wider Call' },
  { stage: 'Late Registration Close (Average Stack 2x Starting)', bountyRatio: '1.0x Base Bounty', bountyPowerPct: '37.0% Of Starting Stack', chipValue20k: '7,400 Chips', equityDiscount: '6% To 8% Wider Call' },
  { stage: 'Mid-Stage PKO (2x Doubled Bounty Target)', bountyRatio: '2.0x Progressive Bounty', bountyPowerPct: '74.0% Of Starting Stack', chipValue20k: '14,800 Chips', equityDiscount: '11% To 14% Wider Call' },
  { stage: 'Late-Stage PKO (4x Super Bounty Target)', bountyRatio: '4.0x Progressive Bounty', bountyPowerPct: '160.0% Of Starting Stack', chipValue20k: '32,000 Chips', equityDiscount: '18% To 24% Wider Call' },
  { stage: 'Final Table PKO (ICM Pressure + Large Bounties)', bountyRatio: '6.0x+ Progressive Bounty', bountyPowerPct: '240.0% Of Starting Stack', chipValue20k: '48,000 Chips', equityDiscount: 'Adjusted By Bubble Factor' },
];

const MYSTERY_BOUNTY_EXAMPLES = [
  { scenario: 'Standard Mystery Phase Start (All Top Envelopes Live)', avgEnvelope: '1.0x Base Buy-In', chipEquivPct: '50% To 66% Starting Stack', callAdjustment: 'Call 10% To 14% Wider When Covering', strategyNote: 'Prioritize Chip Accumulation Before ITM' },
  { scenario: 'Top Jackpot Envelope Still Unclaimed (15 Players Left)', avgEnvelope: '2.2x Base Buy-In', chipEquivPct: '120%+ Starting Stack', callAdjustment: 'Call 18% To 25% Wider When Covering', strategyNote: 'Aggressively Isolate Short Stacks' },
  { scenario: 'Top Jackpot Envelope Already Pulled Early', avgEnvelope: '0.55x Base Buy-In', chipEquivPct: '28% Starting Stack', callAdjustment: 'Revert Near Standard MTT ICM Ranges', strategyNote: 'Avoid High-Variance Marginal Calls' },
  { scenario: 'Short Stack Covered By All Opponents (Cannot Win Bounty)', avgEnvelope: '0.0x Effective Value', chipEquivPct: '0 Chips Won On Shove', callAdjustment: 'Zero Bounty Discount (Tighter Shove Range)', strategyNote: 'Shove High-Card Equity Hands Only' },
];

export default function BountyCalculatorPage({
  initialStartingStack = 20000,
  initialStartBounty = 50,
  initialTargetBounty = 100,
  initialPotChips = 15000,
  initialCallChips = 10000,
}) {
  const [startingStack, setStartingStack] = useState(initialStartingStack);
  const [startBounty, setStartBounty] = useState(initialStartBounty);
  const [targetBounty, setTargetBounty] = useState(initialTargetBounty);
  const [potChips, setPotChips] = useState(initialPotChips);
  const [callChips, setCallChips] = useState(initialCallChips);

  const metrics = useMemo(() => {
    const safeStartStack = Math.max(1000, Number(startingStack) || 20000);
    const safeStartBounty = Math.max(1, Number(startBounty) || 50);
    const safeTargetBounty = Math.max(0, Number(targetBounty) || 100);
    const safePot = Math.max(100, Number(potChips) || 15000);
    const safeCall = Math.max(100, Number(callChips) || 10000);

    // Standard PKO Bounty Power Factor: 1 starting knockout (50% captured in cash, 50% added to head)
    // equals 1/3 (33.33%) of a starting stack in early/mid stages.
    const oneStartingBountyChips = safeStartStack / 3;
    const bountyMultiplier = safeTargetBounty / safeStartBounty;
    const bountyChipEquivalent = Math.round(oneStartingBountyChips * bountyMultiplier);

    const standardFinalPot = safePot + safeCall;
    const standardReqEquity = (safeCall / standardFinalPot) * 100;

    const bountyAdjustedPot = safePot + safeCall + bountyChipEquivalent;
    const bountyAdjustedReqEquity = (safeCall / bountyAdjustedPot) * 100;
    const equityDiscount = Math.max(0, standardReqEquity - bountyAdjustedReqEquity);
    const effectivePotOddsRatio = (safePot + bountyChipEquivalent) / safeCall;

    return {
      safeStartStack: safeStartStack.toLocaleString('en-US'),
      safeStartBounty,
      safeTargetBounty,
      bountyMultiplier: bountyMultiplier.toFixed(2),
      bountyChipEquivalent: bountyChipEquivalent.toLocaleString('en-US'),
      standardReqEquity: standardReqEquity.toFixed(1),
      bountyAdjustedReqEquity: bountyAdjustedReqEquity.toFixed(1),
      equityDiscount: equityDiscount.toFixed(1),
      effectivePotOddsRatio: effectivePotOddsRatio.toFixed(2),
    };
  }, [startingStack, startBounty, targetBounty, potChips, callChips]);

  const canonicalPath = '/tools/bounty-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'PKO & Mystery Bounty Chip Equity Calculator';
  const pageDesc =
    'Convert Progressive Knockout (PKO) And Mystery Bounty Dollar Values Into Exact Tournament Chip Equivalents, Bounty Power Ratios, And Adjusted Calling Pot Odds.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'Smarter.Poker PKO & Mystery Bounty Calculator',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Bounty Equity Calculator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools/poker-odds-calculator'],
        ['PKO & Mystery Bounty Calculator', canonicalPath],
      ],
      faqs: [
        {
          question: 'How Do You Convert A PKO Bounty Into Tournament Chips?',
          answer:
            'In A Standard 50% Progressive Knockout (PKO) Tournament, An Initial Starting Knockout Is Worth Exactly 33.3% (One-Third) Of A Starting Stack In Chips. If The Starting Stack Is 20,000 Chips, Each Starting Bounty Unit Adds 6,667 Extra Chips To The Pot When You Cover The All-In Player.',
        },
        {
          question: 'How Does Bounty Power Change Required Calling Equity?',
          answer:
            'Add The Bounty Chip Equivalent Directly To The Current Pot Before Dividing Your Call Size: Adjusted Required Equity = Call / (PotBeforeCall + Call + BountyChips). This Reduces Break-Even Calling Equity By 5% To 20% Depending On Stack Size.',
        },
        {
          question: 'How Do Mystery Bounty Calculations Differ From PKO Tournaments?',
          answer:
            'In A Mystery Bounty Tournament, Bounties Only Activate In The Money And Have Zero Progressive Head Growth. You Calculate The Average Remaining Envelope Value And Convert It Into Chip Equity Relative To The Remaining Regular Prize Pool.',
        },
      ],
      steps: [
        {
          name: 'Enter Tournament Starting Stack And Initial Bounty',
          text: 'Input The Event Starting Chip Count And Initial Knockout Value To Establish The Baseline 33.3% Bounty Power Factor.',
        },
        {
          name: 'Input Target Opponent Bounty And Pot Size',
          text: 'Enter The Covered Opponent Current Bounty Alongside The Chip Pot And Required Call Amount.',
        },
        {
          name: 'Compare Standard Vs. Bounty-Adjusted Required Equity',
          text: 'Review The Exact Chip Equivalent Added To The Pot And The Reduced Break-Even Equity Needed To Call Profitably.',
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
          <Link href="/tools/poker-odds-calculator" style={{ color: '#38bdf8', textDecoration: 'none' }}>Poker Tools</Link>
          {' / '}
          <span>PKO &amp; Mystery Bounty Calculator</span>
        </nav>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          PKO &amp; Mystery Bounty Chip Equity &amp; Pot Odds Calculator
        </h1>

        <p style={{ fontSize: 17, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
          In Progressive Knockout (PKO) And Mystery Bounty Tournaments, Eliminating A Covered Opponent Awards Immediate Cash Plus Added Bounty Equity, Lowering The Break-Even Equity Required To Call An All-In. Enter Your Tournament Starting Stack, Bounty Values, And Current Pot Below To Calculate Exact Bounty Chip Equivalents And Adjusted Calling Thresholds.
        </p>

        {/* Interactive Calculator Grid */}
        <section style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 20,
          marginBottom: 36,
        }}>
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 16px 0' }}>
              1. Tournament &amp; Bounty Inputs
            </h2>

            <div style={{ marginBottom: 14 }}>
              <label htmlFor="start-stack-input" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                Tournament Starting Stack (Chips)
              </label>
              <input
                id="start-stack-input"
                type="number"
                min="1000"
                step="1000"
                value={startingStack}
                onChange={(e) => setStartingStack(Number(e.target.value))}
                style={{ width: '100%', padding: '10px 12px', background: '#070b14', border: '1px solid #334155', borderRadius: 8, color: '#f8fafc', fontSize: 16, fontWeight: 700 }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label htmlFor="start-bounty-input" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                  Initial Bounty ($)
                </label>
                <input
                  id="start-bounty-input"
                  type="number"
                  min="1"
                  value={startBounty}
                  onChange={(e) => setStartBounty(Number(e.target.value))}
                  style={{ width: '100%', padding: '10px 12px', background: '#070b14', border: '1px solid #334155', borderRadius: 8, color: '#f8fafc', fontSize: 16, fontWeight: 700 }}
                />
              </div>
              <div>
                <label htmlFor="target-bounty-input" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                  Target Bounty ($)
                </label>
                <input
                  id="target-bounty-input"
                  type="number"
                  min="0"
                  value={targetBounty}
                  onChange={(e) => setTargetBounty(Number(e.target.value))}
                  style={{ width: '100%', padding: '10px 12px', background: '#070b14', border: '1px solid #334155', borderRadius: 8, color: '#f8fafc', fontSize: 16, fontWeight: 700 }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label htmlFor="pot-chips-input" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                  Pot Before Call (Chips)
                </label>
                <input
                  id="pot-chips-input"
                  type="number"
                  min="100"
                  step="500"
                  value={potChips}
                  onChange={(e) => setPotChips(Number(e.target.value))}
                  style={{ width: '100%', padding: '10px 12px', background: '#070b14', border: '1px solid #334155', borderRadius: 8, color: '#f8fafc', fontSize: 16, fontWeight: 700 }}
                />
              </div>
              <div>
                <label htmlFor="call-chips-input" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                  Chips To Call All-In
                </label>
                <input
                  id="call-chips-input"
                  type="number"
                  min="100"
                  step="500"
                  value={callChips}
                  onChange={(e) => setCallChips(Number(e.target.value))}
                  style={{ width: '100%', padding: '10px 12px', background: '#070b14', border: '1px solid #334155', borderRadius: 8, color: '#f8fafc', fontSize: 16, fontWeight: 700 }}
                />
              </div>
            </div>
          </div>

          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 16px 0' }}>
              2. Bounty Power &amp; Adjusted Equity Output
            </h2>
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9, color: '#cbd5e1', fontSize: 15 }}>
              <li><strong>Bounty Chip Equivalent:</strong> <span style={{ color: '#38bdf8', fontWeight: 700 }}>+{metrics.bountyChipEquivalent} Chips</span> ({metrics.bountyMultiplier}x Starting Bounty)</li>
              <li><strong>Bounty-Adjusted Required Equity:</strong> <span style={{ color: '#34d399', fontWeight: 700 }}>{metrics.bountyAdjustedReqEquity}%</span> (When Covering Opponent)</li>
              <li><strong>Standard Non-Bounty Equity Needed:</strong> <span style={{ color: '#f59e0b', fontWeight: 700 }}>{metrics.standardReqEquity}%</span> (If Covered By Opponent)</li>
              <li><strong>Bounty Equity Discount:</strong> <span style={{ color: '#34d399', fontWeight: 700 }}>-{metrics.equityDiscount}%</span> Less Equity Required To Call</li>
              <li><strong>Effective Bounty Pot Odds Ratio:</strong> {metrics.effectivePotOddsRatio} : 1</li>
            </ul>
          </div>
        </section>

        {/* Reference Table 1: PKO Bounty Power Conversions */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            PKO Bounty Power Chip Conversion Chart (20,000 Starting Stack)
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#0f172a', borderRadius: 10 }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Progressive Knockout Bounty Power Multipliers And Chip Equivalents Across Tournament Stages
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#38bdf8', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Tournament Stage</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Target Bounty Multiplier</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Bounty Power (% Starting Stack)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Chip Value (20K Start Stack)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Typical Calling Equity Discount</th>
                </tr>
              </thead>
              <tbody>
                {PKO_STAGE_CONVERSIONS.map((row) => (
                  <tr key={row.stage} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.stage}</td>
                    <td style={{ padding: '10px 14px', color: '#38bdf8', fontWeight: 700 }}>{row.bountyRatio}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.bountyPowerPct}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.chipValue20k}</td>
                    <td style={{ padding: '10px 14px', color: '#f59e0b', fontWeight: 700 }}>{row.equityDiscount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Reference Table 2: Mystery Bounty Envelope Valuation */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Mystery Bounty Envelope Valuation &amp; Strategy Adjustments
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#0f172a', borderRadius: 10 }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Expected Mystery Envelope Values And Strategic Range Adjustments Based On Remaining Jackpot Prizes
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#38bdf8', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Mystery Bounty Scenario</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Average Envelope Value</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Chip Stack Equivalent</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Calling Range Adjustment</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Key Strategic Priority</th>
                </tr>
              </thead>
              <tbody>
                {MYSTERY_BOUNTY_EXAMPLES.map((m) => (
                  <tr key={m.scenario} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{m.scenario}</td>
                    <td style={{ padding: '10px 14px', color: '#38bdf8', fontWeight: 700 }}>{m.avgEnvelope}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{m.chipEquivPct}</td>
                    <td style={{ padding: '10px 14px', color: '#f59e0b', fontWeight: 700 }}>{m.callAdjustment}</td>
                    <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{m.strategyNote}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cross-Link Navigation */}
        <section style={{ marginBottom: 32, padding: 20, background: '#0f172a', borderRadius: 12, border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Calculators &amp; Strategy Guides
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/poker-odds-calculator" style={{ padding: '8px 14px', background: '#0284c7', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Multiway Equity Calculator
            </Link>
            <Link href="/tools/icm-calculator" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Tournament ICM Calculator
            </Link>
            <Link href="/tools/pot-odds-calculator" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Pot Odds &amp; MDF Calculator
            </Link>
            <Link href="/tools/bankroll-calculator" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Bankroll &amp; Risk Of Ruin Calculator
            </Link>
            <Link href="/tools/preflop-ranges" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              13x13 GTO Preflop Ranges
            </Link>
            <Link href="/learn/hands" style={{ padding: '8px 14px', background: '#1e293b', color: '#38bdf8', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              169 Starting Hand Guides
            </Link>
          </div>
        </section>

        <AiPromptLauncher
          title="PKO & Mystery Bounty Chip Equity Calculator"
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
    const { renderBountyCalculatorMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderBountyCalculatorMarkdown({
      startingStack: query?.startingStack || 20000,
      startBounty: query?.startBounty || 50,
      targetBounty: query?.targetBounty || 100,
      potChips: query?.potChips || 15000,
      callChips: query?.callChips || 10000,
    });
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }

  return {
    props: {
      initialStartingStack: Number(query?.startingStack) || 20000,
      initialStartBounty: Number(query?.startBounty) || 50,
      initialTargetBounty: Number(query?.targetBounty) || 100,
      initialPotChips: Number(query?.potChips) || 15000,
      initialCallChips: Number(query?.callChips) || 10000,
    },
  };
}
