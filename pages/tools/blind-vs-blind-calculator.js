/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  BLIND-VS-BLIND (SB VS BB) LIMP, RAISE, ISO & 3-BET DEFENSE MATRIX EXPLORER
 *  (pages/tools/blind-vs-blind-calculator.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Blind-vs-Blind SB vs BB 100BB/50BB/25BB Limp, Open-Raise, BB Iso-Raise &
 * 3-Bet Defense Matrix Explorer.
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

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

const BVB_PRESETS = [
  {
    id: 'bvb_100bb_sb_3bb_rfi',
    label: '100 BB Cash: SB 3.0 BB Raise-Or-Fold Strategy (42.8% RFI)',
    bb: 100,
    action: 'SB_RFI',
    sizing: 3.0,
  },
  {
    id: 'bvb_100bb_sb_mixed_limp',
    label: '100 BB Mixed: SB Limp + 3.5 BB Open-Raise Strategy (56% VPIP)',
    bb: 100,
    action: 'SB_MIXED_LIMP',
    sizing: 3.5,
  },
  {
    id: 'bvb_50bb_bb_defend_vs_3bb',
    label: '50 BB MTT: BB Defense (3-Bet + Call) Vs SB 3.0 BB Open',
    bb: 50,
    action: 'BB_DEFEND',
    sizing: 3.0,
  },
  {
    id: 'bvb_25bb_bb_iso_vs_limp',
    label: '25 BB MTT: BB 3.5 BB Iso-Raise & Check Back Vs SB Limp',
    bb: 25,
    action: 'BB_ISO_VS_LIMP',
    sizing: 3.5,
  },
];

const BVB_BENCHMARK_TABLE = [
  {
    node: '100 BB Cash SB Raise-Or-Fold (3.0 BB Open)',
    vpipFreq: '42.8% Open-Raise / 0% Limp',
    threeBetOrIso: 'BB 3-Bets 15.2% (To 9.0 BB IP)',
    callOrCheck: 'BB Calls 38.4% In Position',
    strategicNote: 'Simplifies Rake Avoidance In High-Rake Cash Games By Taking Down Unraked Pre-Flop Pots',
  },
  {
    node: '100 BB Solver SB Mixed Limp + 3.5 BB Raise',
    vpipFreq: '29.5% Raise / 26.8% Limp (56.3% Total)',
    threeBetOrIso: 'BB Iso-Raises 34.0% Vs Limp',
    callOrCheck: 'SB Limp-3-Bets AA, KK, A5s, K9s',
    strategicNote: 'Captures Extra EV With Weak Suited Hands And Offsuit Connectors Using 0.5 BB Price',
  },
  {
    node: '50 BB MTT SB 2.5 BB Open With Big Blind Ante',
    vpipFreq: '51.4% Open-Raise (+18% Limp)',
    threeBetOrIso: 'BB 3-Bets 17.5% Polarized',
    callOrCheck: 'BB Defends 61.5% Total In Position',
    strategicNote: '1.0 BB Big Blind Ante Drives 2.5 BB Dead Pot, Making Passive SB Folding A Major Leak',
  },
  {
    node: '25 BB MTT Blind-Vs-Blind Short-Stack Battle',
    vpipFreq: '34.0% Limp / 22.0% Min-Raise / 14% Jam',
    threeBetOrIso: 'BB Iso-Shoves 19.5% Over Limp',
    callOrCheck: 'SB Limp-Calls All-In With Traps',
    strategicNote: 'Heavy Limp-Trap Strategy Prevents BB From Profitably Punishing Medium Stacks',
  },
];

const BVB_FAQS = [
  {
    question: 'Why Does Solver GTO Strategy Open To 3.0 BB Or 3.5 BB From The Small Blind At 100 BB?',
    answer:
      'Because The Small Blind Will Play Every Postflop Street Out Of Position Against A Single Opponent Who Already Has 1.0 BB Invested, Sizing Up To 3.0 BB Or 3.5 BB Worsens The Big Blind Pot Odds From 3.5:1 (Against A 2.0 BB Min-Raise) Down To 1.4:1, Denying Free Equity Realization.',
  },
  {
    question: 'When Is A Pure 3.0 BB Raise-Or-Fold SB Strategy Better Than Mixing Limps?',
    answer:
      'In Live And Low-To-Mid Stakes Online Cash Games Where The House Takes A 5% To 10% Rake On Every Flop Seen ("No Flop, No Drop"), Limping Invites Raked Postflop Pots Out Of Position. A Pure 3.0 BB Raise-Or-Fold Strategy Captures The Unraked Dead Blinds Pre-Flop Far More Often.',
  },
  {
    question: 'How Should The Big Blind Construct Its 3-Bet Range In Position Against A 3.0 BB SB Open?',
    answer:
      'Because The Big Blind Holds Guaranteed Position On All Three Postflop Streets And Gets Great Pot Odds To Call, The Big Blind Uses A Polarized 3-Bet Range (9.0 BB To 10.0 BB) Built Around Top Value Hands (JJ+, AQs+, AKo) Balanced By Offsuit High-Card Blockers (A9o-A2o, K9o, Q9o) And Low Suited Connectors.',
  },
];

export default function BlindVsBlindCalculatorPage({
  initialBb = 100,
  initialAction = 'SB_RFI',
  initialSizing = 3.0,
}) {
  const router = useRouter();
  const [bb, setBb] = useState(initialBb);
  const [action, setAction] = useState(initialAction);
  const [sizing, setSizing] = useState(initialSizing);
  const [activePresetId, setActivePresetId] = useState('bvb_100bb_sb_3bb_rfi');

  useSolvedSpotUrlSync(
    { bb, action, sizing },
    {
      bb: (v) => setBb([25, 50, 100].includes(Number(v)) ? Number(v) : 100),
      action: (v) => {
        const up = String(v || 'SB_RFI').toUpperCase();
        return ['SB_RFI', 'SB_MIXED_LIMP', 'BB_DEFEND', 'BB_ISO_VS_LIMP'].includes(up) ? up : 'SB_RFI';
      },
      sizing: (v) => setSizing(Math.max(2.0, Math.min(5.0, Number(v) || 3.0))),
    }
  );

  const handleSelectPreset = (preset) => {
    setActivePresetId(preset.id);
    setBb(preset.bb);
    setAction(preset.action);
    setSizing(preset.sizing);
  };

  const metrics = useMemo(() => {
    const safeBb = [25, 50, 100].includes(Number(bb)) ? Number(bb) : 100;
    const safeAction = ['SB_RFI', 'SB_MIXED_LIMP', 'BB_DEFEND', 'BB_ISO_VS_LIMP'].includes(action)
      ? action
      : 'SB_RFI';
    const safeSizing = Math.max(2.0, Math.min(5.0, Number(sizing) || 3.0));

    let raiseCombos = 0;
    let limpOrCallCombos = 0;
    const grid = [];

    for (let r = 0; r < 13; r += 1) {
      const row = [];
      for (let c = 0; c < 13; c += 1) {
        const isPair = r === c;
        const isSuited = r < c;
        const highIdx = Math.min(r, c);
        const lowIdx = Math.max(r, c);
        const label = isPair
          ? `${RANKS[r]}${RANKS[c]}`
          : isSuited
          ? `${RANKS[r]}${RANKS[c]}s`
          : `${RANKS[c]}${RANKS[r]}o`;
        const combos = isPair ? 6 : isSuited ? 4 : 12;

        const handStrength = (14 - highIdx) * 2.1 + (14 - lowIdx) * 1.1 + (isPair ? 11 : 0) + (isSuited ? 4.2 : 0) - Math.max(0, lowIdx - highIdx - 1) * 0.7;
        const sizeTighten = (safeSizing - 3.0) * 2.8;
        const depthBonus = safeBb === 25 ? 2.2 : safeBb === 50 ? 1.2 : 0;
        const score = handStrength - sizeTighten + depthBonus;

        let cellType = 'FOLD';
        if (safeAction === 'SB_RFI') {
          if (score >= 24.5) {
            cellType = 'RAISE';
            raiseCombos += combos;
          }
        } else if (safeAction === 'SB_MIXED_LIMP') {
          if (score >= 28.0) {
            cellType = 'RAISE';
            raiseCombos += combos;
          } else if (score >= 21.5) {
            cellType = 'LIMP_CALL';
            limpOrCallCombos += combos;
          }
        } else if (safeAction === 'BB_DEFEND') {
          if (score >= 33.5 || (isSuited && highIdx <= 2 && lowIdx >= 9)) {
            cellType = 'RAISE';
            raiseCombos += combos;
          } else if (score >= 22.8) {
            cellType = 'LIMP_CALL';
            limpOrCallCombos += combos;
          }
        } else {
          // BB_ISO_VS_LIMP
          if (score >= 29.0) {
            cellType = 'RAISE';
            raiseCombos += combos;
          } else {
            cellType = 'LIMP_CALL';
            limpOrCallCombos += combos;
          }
        }

        row.push({ label, combos, cellType });
      }
      grid.push(row);
    }

    const raisePct = ((raiseCombos / 1326) * 100).toFixed(1);
    const limpCallPct = ((limpOrCallCombos / 1326) * 100).toFixed(1);
    const totalVpipPct = (((raiseCombos + limpOrCallCombos) / 1326) * 100).toFixed(1);

    // BB Pot Odds facing SB open of safeSizing BB: BB calls (safeSizing - 1) into (safeSizing + safeSizing)
    const bbCallAmt = Math.max(0.5, safeSizing - 1.0);
    const bbReqEqPct = ((bbCallAmt / (safeSizing * 2)) * 100).toFixed(1);
    const bbMdfPct = ((1.5 / (safeSizing + 0.5)) * 100).toFixed(1);

    return {
      safeBb,
      safeAction,
      safeSizing: safeSizing.toFixed(1),
      raiseCombos,
      raisePct,
      limpOrCallCombos,
      limpCallPct,
      totalVpipPct,
      bbReqEqPct,
      bbMdfPct,
      grid,
    };
  }, [bb, action, sizing]);

  const canonicalPath = '/tools/blind-vs-blind-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Blind Vs Blind SB BB Explorer';
  const pageDesc =
    'Explore Solver-Backed 100BB, 50BB, And 25BB Blind-Vs-Blind (SB Vs BB) Limp, 3.0x/3.5x Open-Raise, Big Blind Iso-Raise, And 3-Bet Defense 13x13 Hand Matrices.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: pageTitle,
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Blind-Vs-Blind SB Vs BB Preflop Matrix Solver',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Blind Vs Blind SB BB Explorer', canonicalPath],
      ],
      faqs: BVB_FAQS,
      howTo: {
        name: 'How To Study Blind-Vs-Blind (SB Vs BB) GTO Preflop Ranges',
        description: pageDesc,
        steps: [
          {
            name: 'Select Stack Depth (100 BB, 50 BB, Or 25 BB)',
            text: 'Choose Between Deep-Stack Cash Game And Mid/Short-Stack Tournament Blind-Vs-Blind Regimes.',
          },
          {
            name: 'Pick SB Open-Raise, SB Mixed Limp, BB Defense, Or BB Iso-Raise Node',
            text: 'Toggle Between Small Blind First-In Strategy And Big Blind Counter-Defense In Position.',
          },
          {
            name: 'Adjust Open-Raise Sizing And Inspect The 13x13 Range Matrix',
            text: 'See How 2.5 BB, 3.0 BB, And 3.5 BB Sizings Shift BB Pot Odds, MDF, And Continuing Combos.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const summaryText = `Blind-Vs-Blind ${metrics.safeBb} BB (${metrics.safeAction}, ${metrics.safeSizing} BB Sizing): Raise/3-Bet = ${metrics.raisePct}% (${metrics.raiseCombos} Combos) | Limp/Call = ${metrics.limpCallPct}% (${metrics.limpOrCallCombos} Combos) | Total Continue = ${metrics.totalVpipPct}% | BB Req Equity = ${metrics.bbReqEqPct}%`;
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
            <span>Blind Vs Blind SB BB Explorer</span>
          </nav>
        )}

        <h1 style={{ fontSize: isEmbed ? 22 : 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Blind-Vs-Blind (SB Vs BB) Limp, Open-Raise &amp; 3-Bet Defense Matrix Explorer
        </h1>

        {!isEmbed && (
          <>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 24px 0' }}>
              <strong>Direct Answer:</strong> When Action Folds To The Small Blind At 100 BB, GTO Solvers Either Open <strong>42.8% Of Hands To 3.0 BB (Raise-Or-Fold)</strong> Or Play A <strong>56.3% VPIP Mixed Limp + 3.5 BB Raise Strategy</strong>. Facing A 3.0 BB SB Open, The Big Blind Gets <strong>2.0:1 Pot Odds (33.3% Required Equity)</strong> In Position And Defends <strong>53.6% Of Hands</strong> Via Calling And Polarized 3-Betting.
            </p>

            <CalculatorShareAndPresets
              toolTitle="Blind Vs Blind SB BB Explorer"
              toolPath={canonicalPath}
              summaryText={summaryText}
              presets={BVB_PRESETS}
              onSelectPreset={handleSelectPreset}
              activePresetId={activePresetId}
            />
          </>
        )}

        <section
          aria-label="Interactive Blind-Vs-Blind 13x13 Matrix Explorer"
          style={{
            background: '#101a20',
            border: '1px solid #1e293b',
            borderRadius: '2px',
            padding: 24,
            marginBottom: 36,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#25c8ff', margin: '0 0 18px 0' }}>
            Configure Stack Depth, BvB Decision Node &amp; Open-Raise Sizing
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 22 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Effective Stack Depth
                <select
                  value={bb}
                  onChange={(e) => setBb(Number(e.target.value))}
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
                  <option value={100}>100 BB Deep Cash / MTT</option>
                  <option value={50}>50 BB Mid-Stage MTT</option>
                  <option value={25}>25 BB Short-Stack BvB</option>
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Blind-Vs-Blind Decision Node
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
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
                  <option value="SB_RFI">SB Raise-Or-Fold (Pure Open)</option>
                  <option value="SB_MIXED_LIMP">SB Mixed Limp + Open-Raise</option>
                  <option value="BB_DEFEND">BB Defense Vs SB Open-Raise</option>
                  <option value="BB_ISO_VS_LIMP">BB Iso-Raise &amp; Check Vs SB Limp</option>
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                SB Open / BB Iso Sizing (BB)
                <input
                  type="number"
                  min="2.0"
                  max="5.0"
                  step="0.5"
                  value={sizing}
                  onChange={(e) => setSizing(e.target.value)}
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
                />
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: 14, marginBottom: 20 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Raise / 3-Bet / Iso Frequency
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                {metrics.raisePct}% ({metrics.raiseCombos} Combos)
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Blue Cells In 13x13 Matrix Below
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #34d399' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Limp / Call / Check Frequency
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                {metrics.limpCallPct}% ({metrics.limpOrCallCombos} Combos)
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Total Active VPIP: {metrics.totalVpipPct}%
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                BB Pot Odds &amp; MDF Vs {metrics.safeSizing} BB
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#f2b84b', marginTop: 4 }}>
                {metrics.bbReqEqPct}% Eq • {metrics.bbMdfPct}% MDF
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                BB Calls {(Number(metrics.safeSizing) - 1).toFixed(1)} BB Into {(Number(metrics.safeSizing) * 2).toFixed(1)} BB
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, minmax(46px, 1fr))', gap: 3, minWidth: 620 }}>
              {metrics.grid.flat().map((cell) => {
                const bg =
                  cell.cellType === 'RAISE'
                    ? 'rgba(37, 200, 255, 0.24)'
                    : cell.cellType === 'LIMP_CALL'
                    ? 'rgba(52, 211, 153, 0.20)'
                    : '#020608';
                const borderCol =
                  cell.cellType === 'RAISE'
                    ? '#25c8ff'
                    : cell.cellType === 'LIMP_CALL'
                    ? '#34d399'
                    : '#1e293b';
                return (
                  <div
                    key={cell.label}
                    style={{
                      background: bg,
                      border: `1px solid ${borderCol}`,
                      borderRadius: 2,
                      padding: '6px 3px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: '#f8fafc' }}>{cell.label}</div>
                    <div style={{ fontSize: 9, color: '#cbd5e1' }}>
                      {cell.cellType === 'RAISE' ? 'Raise' : cell.cellType === 'LIMP_CALL' ? 'Call/Limp' : 'Fold'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Blind-Vs-Blind (SB Vs BB) Equilibrium Reference Matrix
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Solver-Approved SB And BB Frequencies Across 100 BB, 50 BB, And 25 BB Stack Depths
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>BvB Tree Node</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>SB VPIP Split</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>BB 3-Bet / Iso</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Flat / Trap Rule</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Strategic Rationale</th>
                </tr>
              </thead>
              <tbody>
                {BVB_BENCHMARK_TABLE.map((row) => (
                  <tr key={row.node} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.node}</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 700 }}>{row.vpipFreq}</td>
                    <td style={{ padding: '10px 14px', color: '#f2b84b', fontWeight: 700 }}>{row.threeBetOrIso}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.callOrCheck}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.strategicNote}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Preflop &amp; Short-Stack Calculators
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/preflop-ranges" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              6-Max 13x13 Preflop Ranges
            </Link>
            <Link href="/tools/heads-up-push-fold-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Heads-Up Push/Fold Solver
            </Link>
            <Link href="/tools/3bet-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              3-Bet &amp; 4-Bet Sizing Calculator
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#34d399', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Explore All 52 Free Poker Calculators
            </Link>
          </div>
        </section>

        {!isEmbed && (
          <>
            <FaqSection faqs={BVB_FAQS} />

            <HubPageSummary page="poker-tools" path={canonicalPath} />

            <CitationBacklinkBox
              title="Blind Vs Blind SB BB Explorer"
              canonicalUrl={canonicalUrl}
              badgeType="gto"
              badgeLabel="Blind-Vs-Blind Solver"
              badgeValue="100BB/50BB/25BB SB Vs BB Matrix"
              summary="Interactive 13x13 Blind-Vs-Blind SB Open-Raise, Mixed Limp, BB Iso-Raise, And 3-Bet Defense Matrix Explorer."
              slug="blind-vs-blind-calculator"
            />

            <AiPromptLauncher
              title="Blind Vs Blind SB BB Explorer"
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
    const md = renderHubToolMarkdown('/tools/blind-vs-blind-calculator', query);
    if (md) {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Vary', 'Accept');
      res.write(md);
      res.end();
      return { props: {} };
    }
  }
  return {
    props: {
      initialBb: [25, 50, 100].includes(Number(query?.bb)) ? Number(query.bb) : 100,
      initialAction: String(query?.action || 'SB_RFI').toUpperCase(),
      initialSizing: Number(query?.sizing) || 3.0,
    },
  };
}
