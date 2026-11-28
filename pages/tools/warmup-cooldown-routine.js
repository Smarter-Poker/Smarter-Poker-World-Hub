/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  PRE-SESSION WARMUP FLASH DRILL, READINESS & POST-SESSION COOLDOWN AUDITOR
 *  (pages/tools/warmup-cooldown-routine.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive Pre-Session Warmup Flash Math Drill + A-Game Readiness Score +
 * Post-Session Cooldown Leak & Decision Quality Audit.
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
import SmarterConversionCta from '../../src/components/seo/SmarterConversionCta';
import SmarterAccountUnlockGate from '../../src/components/seo/SmarterAccountUnlockGate';
import SmarterCalculatorSaveBar from '../../src/components/seo/SmarterCalculatorSaveBar';
import CalculatorShareAndPresets from '../../src/components/tools/CalculatorShareAndPresets';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';
import { useSolvedSpotUrlSync } from '../../src/lib/seo/solvedSpotEngine';
import { setPublicSeoHtmlCache } from '../../src/lib/seo/edgeCacheHeaders.mjs';

const WARMUP_PRESETS = [
  {
    id: 'agame_peak_readiness',
    label: 'A-Game Peak Readiness (Live Cash 6 Hrs | Tilt 1/10 | Focus 9/10)',
    game: 'LIVE_CASH',
    duration: 6,
    tiltScore: 1,
    focusScore: 9,
  },
  {
    id: 'sunday_mtt_marathon',
    label: 'Sunday MTT Marathon (Online MTT 8 Hrs | Tilt 2/10 | Focus 8/10)',
    game: 'ONLINE_MTT',
    duration: 8,
    tiltScore: 2,
    focusScore: 8,
  },
  {
    id: 'bgame_fatigue_warning',
    label: 'B-Game Fatigue Warning (PLO Cash 5 Hrs | Tilt 5/10 | Focus 6/10)',
    game: 'PLO_CASH',
    duration: 5,
    tiltScore: 5,
    focusScore: 6,
  },
  {
    id: 'cgame_tilt_abort',
    label: 'C-Game Tilt Danger (Chasing Losses | Tilt 8/10 | Focus 4/10)',
    game: 'LIVE_CASH',
    duration: 4,
    tiltScore: 8,
    focusScore: 4,
  },
];

const FLASH_DRILLS = [
  {
    prompt: 'Flash Drill 1: Villain Bets 75% Pot On The River. What Is Your Exact Break-Even Calling Equity And MDF?',
    options: [
      { id: 'a', label: '30.0% Required Equity / 57.1% MDF', correct: true },
      { id: 'b', label: '25.0% Required Equity / 66.7% MDF', correct: false },
      { id: 'c', label: '33.3% Required Equity / 50.0% MDF', correct: false },
    ],
  },
  {
    prompt: 'Flash Drill 2: You Hold A 9-Out Nut Flush Draw On The Flop (47 Unseen Cards). What Is Your Exact Flop-To-River Completion Equity?',
    options: [
      { id: 'a', label: '19.1% By The River', correct: false },
      { id: 'b', label: '35.0% By The River', correct: true },
      { id: 'c', label: '42.5% By The River', correct: false },
    ],
  },
  {
    prompt: 'Flash Drill 3: At 100 BB 6-Max, CO Opens To 2.5 BB And BTN Cold-Calls. What Is The Solver-Approved SB Squeeze Size?',
    options: [
      { id: 'a', label: '7.5 BB (3.0x Open)', correct: false },
      { id: 'b', label: '10.0 BB (4.0x Open)', correct: false },
      { id: 'c', label: '12.5 BB (5.0x Open: 4.0x OOP Base + 1.0x Caller)', correct: true },
    ],
  },
];

const WARMUP_BENCHMARK_TABLE = [
  {
    readinessTier: '90-100 Score (Peak A-Game Readiness)',
    winrateRetention: '100% Of True Skill Winrate',
    maxDuration: '6 To 8 Hours With 5-Min Hourly Resets',
    stopLossRule: 'Standard 3-Buy-In Stop-Loss Or Drop To B-Game Trigger',
  },
  {
    readinessTier: '75-89 Score (Solid B+ Operational State)',
    winrateRetention: '80% To 90% Of True Winrate',
    maxDuration: '4 To 5 Hours (Reduce Table Count By 25%)',
    stopLossRule: 'Tighten Stop-Loss To 2.5 Buy-Ins; Avoid High-Variance Hero Calls',
  },
  {
    readinessTier: '60-74 Score (Marginal B/C-Game Drift)',
    winrateRetention: '40% To 60% Of True Winrate',
    maxDuration: '2.5 Hours Maximum Or 30-Min Study Only',
    stopLossRule: 'Mandatory 1.5-Buy-In Stop-Loss; Play Single Table Only',
  },
  {
    readinessTier: 'Under 60 Score (C-Game / Active Tilt Hazard)',
    winrateRetention: 'Negative Expectation (-EV)',
    maxDuration: '0 Hours (Do Not Sit Down)',
    stopLossRule: 'Replace Live Play With Off-Table Solver Review Or Physical Rest',
  },
];

const WARMUP_FAQS = [
  {
    question: 'Why Do Professional Poker Players Run A 5-Minute Pre-Session Warmup Drill?',
    answer:
      'The First 30 Minutes Of A Cold Poker Session Often Account For Disproportionate Autopilot Mistakes Because Working Memory And Pot-Odds Recall Are Not Yet Activated. Running Three Quick Quantitative Drills And Auditing Sleep, Focus, And Tilt Triggers Before Sitting Down Locks In A-Game Execution From Hand 1.',
  },
  {
    question: 'What Is The Jared Tendler Inchworm Concept In Post-Session Cooldowns?',
    answer:
      'Your Overall Winrate Is Determined Not Only By How Good Your Peak A-Game Is, But By How Costly Your Worst C-Game Mistakes Are. Auditing Your Worst Emotional Or Technical Leak After Every Session Gradually Eliminates The Back End Of Your C-Game So Your Baseline Floor Moves Upward.',
  },
  {
    question: 'When Should Your Readiness Score Trigger An Immediate Session Cancellation?',
    answer:
      'Whenever Pre-Session Residual Tilt Is 6/10 Or Higher Or Mental Focus Is 5/10 Or Lower (Composite Readiness Score Below 60/100), Sitting In A Tough Raked Game Carries A Negative Expected Winrate Even For A Proven Winner.',
  },
];

export default function WarmupCooldownRoutinePage({
  initialGame = 'LIVE_CASH',
  initialDuration = 6,
  initialTiltScore = 1,
  initialFocusScore = 9,
}) {
  const router = useRouter();
  const [game, setGame] = useState(initialGame);
  const [duration, setDuration] = useState(initialDuration);
  const [tiltScore, setTiltScore] = useState(initialTiltScore);
  const [focusScore, setFocusScore] = useState(initialFocusScore);
  const [drillAnswers, setDrillAnswers] = useState({ 0: 'a', 1: 'b', 2: 'c' });
  const [activePresetId, setActivePresetId] = useState('agame_peak_readiness');

  useSolvedSpotUrlSync(
    { game, duration, tiltScore, focusScore },
    {
      game: (v) => setGame(String(v || 'LIVE_CASH').toUpperCase()),
      duration: (v) => setDuration(Math.max(1, Math.min(18, Number(v) || 6))),
      tiltScore: (v) => setTiltScore(Math.max(1, Math.min(10, Number(v) || 1))),
      focusScore: (v) => setFocusScore(Math.max(1, Math.min(10, Number(v) || 9))),
    }
  );

  const handleSelectPreset = (preset) => {
    setActivePresetId(preset.id);
    setGame(preset.game);
    setDuration(preset.duration);
    setTiltScore(preset.tiltScore);
    setFocusScore(preset.focusScore);
  };

  const metrics = useMemo(() => {
    const safeDuration = Math.max(1, Math.min(18, Math.round(Number(duration) || 6)));
    const safeTilt = Math.max(1, Math.min(10, Math.round(Number(tiltScore) || 1)));
    const safeFocus = Math.max(1, Math.min(10, Math.round(Number(focusScore) || 9)));

    let correctDrills = 0;
    FLASH_DRILLS.forEach((d, idx) => {
      const selected = drillAnswers[idx];
      const opt = d.options.find((o) => o.id === selected);
      if (opt && opt.correct) correctDrills += 1;
    });

    const drillBonus = (correctDrills / 3) * 15;
    const fatiguePenalty = safeDuration > 8 ? (safeDuration - 8) * 3.5 : 0;
    const rawReadiness =
      45 + safeFocus * 4.5 - (safeTilt - 1) * 5.2 + drillBonus - fatiguePenalty;
    const readinessScore = Math.max(15, Math.min(100, Math.round(rawReadiness)));

    let grade = 'A-Game Peak Readiness';
    let gradeColor = '#34d399';
    let stopLossBi = '3.0 Buy-Ins';
    if (readinessScore >= 88) {
      grade = 'A-Game Peak Readiness';
      gradeColor = '#34d399';
      stopLossBi = '3.0 Buy-Ins';
    } else if (readinessScore >= 74) {
      grade = 'B+ Solid Grind State';
      gradeColor = '#25c8ff';
      stopLossBi = '2.5 Buy-Ins';
    } else if (readinessScore >= 60) {
      grade = 'B/C-Game Caution Cap';
      gradeColor = '#38bdf8';
      stopLossBi = '1.5 Buy-Ins (Cap Session At 2.5 Hrs)';
    } else {
      grade = 'C-Game Tilt Danger (Abort Session)';
      gradeColor = '#ef4444';
      stopLossBi = '0 Buy-Ins (Study Only)';
    }

    return {
      safeDuration,
      safeTilt,
      safeFocus,
      correctDrills,
      readinessScore,
      grade,
      gradeColor,
      stopLossBi,
    };
  }, [duration, tiltScore, focusScore, drillAnswers]);

  const canonicalPath = '/tools/warmup-cooldown-routine';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Poker Warmup And Cooldown Tool';
  const pageDesc =
    'Execute A 3-Minute Pre-Session Poker Warmup Flash Math Drill, Compute Your 0-100 A-Game Mental Readiness Score, And Log Post-Session Cooldown Decision Audits.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: pageTitle,
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Pre-Session Warmup & Post-Session Cooldown Auditor',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Poker Warmup And Cooldown Tool', canonicalPath],
      ],
      faqs: WARMUP_FAQS,
      howTo: {
        name: 'How To Run A Pre-Session Poker Warmup And Post-Session Cooldown Audit',
        description: pageDesc,
        steps: [
          {
            name: 'Select Game Format, Planned Session Hours, Tilt Level, And Focus Score',
            text: 'Rate Your Pre-Session Mental Energy (1-10) And Residual Tilt Triggers (1-10).',
          },
          {
            name: 'Complete The 3 Quantitative Pot-Odds And Sizing Flash Drills',
            text: 'Verify Working-Memory Recall Across River MDF, Hypergeometric Draw Equity, And 3-Bet Sizing.',
          },
          {
            name: 'Lock In Your A-Game Readiness Grade And Stop-Loss Rule',
            text: 'Enforce The Recommended Buy-In Stop-Loss And Session Duration Cap Before Sitting Down.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const summaryText = `Pre-Session Readiness (${game}, ${metrics.safeDuration} Hrs, Focus ${metrics.safeFocus}/10, Tilt ${metrics.safeTilt}/10, Flash Drills ${metrics.correctDrills}/3): Readiness Score = ${metrics.readinessScore}/100 (${metrics.grade}) | Enforced Stop-Loss = ${metrics.stopLossBi}`;
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
            <span>Poker Warmup And Cooldown Tool</span>
          </nav>
        )}

        <h1 style={{ fontSize: isEmbed ? 22 : 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Pre-Session Poker Warmup Flash Drill, A-Game Readiness &amp; Cooldown Auditor
        </h1>

        {!isEmbed && (
          <>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 24px 0' }}>
              <strong>Direct Answer:</strong> A 3-Minute <strong>Pre-Session Quantitative Warmup</strong> Activates Pot-Odds And MDF Recall Before Hand 1, While A <strong>Post-Session Cooldown Audit</strong> Separates Standard Statistical Variance From Emotional Tilt Leaks.
            </p>

            <CalculatorShareAndPresets
              toolTitle="Poker Warmup And Cooldown Tool"
              toolPath={canonicalPath}
              summaryText={summaryText}
              presets={WARMUP_PRESETS}
              onSelectPreset={handleSelectPreset}
              activePresetId={activePresetId}
            />
          </>
        )}

        <section
          aria-label="Interactive Pre-Session Readiness And Flash Drill Console"
          style={{
            background: '#101a20',
            border: '1px solid #1e293b',
            borderRadius: '2px',
            padding: 24,
            marginBottom: 36,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#25c8ff', margin: '0 0 18px 0' }}>
            1. Pre-Session Mental State &amp; Session Duration Inputs
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 22 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Primary Session Format
                <select
                  value={game}
                  onChange={(e) => setGame(e.target.value)}
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
                  <option value="LIVE_CASH">Live NLH Cash Game</option>
                  <option value="ONLINE_CASH">Online 6-Max Cash Game</option>
                  <option value="ONLINE_MTT">Multi-Table Tournament (MTT)</option>
                  <option value="PLO_CASH">Pot-Limit Omaha (PLO)</option>
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Planned Session Duration (Hrs)
                <input
                  type="number"
                  min="1"
                  max="18"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
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
                Residual Tilt / Frustration (1-10)
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={tiltScore}
                  onChange={(e) => setTiltScore(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f87171',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Mental Focus &amp; Rest Score (1-10)
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={focusScore}
                  onChange={(e) => setFocusScore(e.target.value)}
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
          </div>

          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#38bdf8', margin: '0 0 12px 0' }}>
            2. 60-Second Quantitative Poker Math Activation Drills
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 22 }}>
            {FLASH_DRILLS.map((drill, idx) => (
              <div key={drill.prompt} style={{ background: '#020608', padding: 14, borderRadius: '2px', border: '1px solid #1e293b' }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#f8fafc', marginBottom: 8 }}>
                  {drill.prompt}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {drill.options.map((opt) => {
                    const isSelected = drillAnswers[idx] === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setDrillAnswers((prev) => ({ ...prev, [idx]: opt.id }))}
                        style={{
                          padding: '6px 11px',
                          borderRadius: '2px',
                          border: isSelected
                            ? `1px solid ${opt.correct ? '#34d399' : '#f87171'}`
                            : '1px solid #334155',
                          background: isSelected
                            ? opt.correct
                              ? 'rgba(52, 211, 153, 0.18)'
                              : 'rgba(248, 113, 113, 0.18)'
                            : '#101a20',
                          color: isSelected ? (opt.correct ? '#34d399' : '#f87171') : '#cbd5e1',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: `1px solid ${metrics.gradeColor}` }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Composite Readiness Score
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: metrics.gradeColor, marginTop: 4 }}>
                {metrics.readinessScore} / 100
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                {metrics.grade}
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Flash Drill Accuracy
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                {metrics.correctDrills} / 3 Correct
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Pot Odds, Hypergeometric Outs &amp; Squeeze Math
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #38bdf8' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Enforced Session Stop-Loss
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#38bdf8', marginTop: 4 }}>
                {metrics.stopLossBi}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Quit Immediately If Tilt Reaches 7/10
              </div>
            </div>
          </div>
        </section>

        {!isEmbed && (
          <div style={{ marginBottom: 32 }}>
            <SmarterCalculatorSaveBar
              toolSlug="warmup-cooldown-routine"
              toolName="Poker Warmup & Cooldown Routine Builder"
              eyebrow="Free Mindset Cloud Sync"
              title="Save This Poker Warmup & Cooldown Routine Free"
              description="Keep Pre-Session Mindset Checklists, Tilt Breakers & Post-Session Review Steps Synced Free."
              ctaLabel="Save Routine Free"
              summaryText={summaryText}
              redirectPath={canonicalPath}
            />
            <SmarterAccountUnlockGate
              variant="calculator-pro"
              context="tools-warmup-cooldown-routine"
              redirectPath={canonicalPath}
            />
          </div>
        )}

        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Pre-Session Readiness Tier &amp; Winrate Retention Matrix
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                How Pre-Session Mental Readiness Governs Winrate Realization And Mandatory Stop-Loss Rules
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Readiness Score</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Winrate Retention</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Session Duration Cap</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Mandatory Stop-Loss Protocol</th>
                </tr>
              </thead>
              <tbody>
                {WARMUP_BENCHMARK_TABLE.map((row) => (
                  <tr key={row.readinessTier} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.readinessTier}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.winrateRetention}</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 700 }}>{row.maxDuration}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.stopLossRule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Mental Game &amp; Session Tools
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/learn/mental-game" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Poker Mental Game Hub
            </Link>
            <Link href="/tools/session-planner" style={{ padding: '8px 14px', background: '#020608', color: '#38bdf8', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Cash Game Session Planner
            </Link>
            <Link href="/tools/poker-iq-test" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              10-Question GTO Poker IQ Test
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#34d399', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Explore All 52 Free Poker Calculators
            </Link>
          </div>
        </section>

        {!isEmbed && (
          <>
            <SmarterConversionCta
              compact
              eyebrow="Free Smarter.Poker Account"
              title="Save Your Pre-Session Routine & Track A-Game Hours Free"
              description="Pair Daily Warmup Drills With 107 Free GTO Training Games And Track Mental-Game Progress In Bankroll Manager."
              primaryLabel="Create Free Account"
              primaryHref="/auth/signup?redirect=/tools/warmup-cooldown-routine&src=warmup-routine"
              secondaryLabel="Sign In"
              secondaryHref="/auth/login?redirect=/tools/warmup-cooldown-routine"
            />

            <FaqSection faqs={WARMUP_FAQS} />

            <HubPageSummary page="poker-tools" path={canonicalPath} />

            <CitationBacklinkBox
              title="Poker Warmup And Cooldown Tool"
              canonicalUrl={canonicalUrl}
              badgeType="gto"
              badgeLabel="A-Game Readiness Engine"
              badgeValue="Warmup Drill & Cooldown Audit"
              summary="Interactive Pre-Session Poker Warmup Flash Math Drill, A-Game Readiness Scorer, And Post-Session Cooldown Auditor."
              slug="warmup-cooldown-routine"
            />

            <AiPromptLauncher
              title="Poker Warmup And Cooldown Tool"
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
    const md = renderHubToolMarkdown('/tools/warmup-cooldown-routine', query);
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
      initialGame: String(query?.game || 'LIVE_CASH').toUpperCase(),
      initialDuration: Number(query?.duration) || 6,
      initialTiltScore: Number(query?.tiltScore) || 1,
      initialFocusScore: Number(query?.focusScore) || 9,
    },
  };
}
