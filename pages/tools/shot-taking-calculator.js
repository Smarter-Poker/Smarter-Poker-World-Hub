/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  2-TIER BANKROLL SHOT-TAKING, STOP-LOSS & BLENDED RISK-OF-RUIN PLANNER
 *  (pages/tools/shot-taking-calculator.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 2-Tier Bankroll Shot-Taking, Mandatory Move-Down Stop-Loss Trigger, Blended
 * Risk-of-Ruin, and Expected Shot Duration Planner.
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

const SHOT_TAKING_PRESETS = [
  {
    id: 'live_2_5_to_5_10_shot',
    label: 'Live Cash Move-Up: $15,000 Bankroll ($2/$5 Base -> 3-BI Shot At $5/$10)',
    bankroll: 15000,
    baseBb: 5,
    shotBb: 10,
    stopLossBi: 3,
    wrBase: 8.5,
    wrShot: 4.5,
  },
  {
    id: 'live_1_3_to_2_5_shot',
    label: 'Live $1/$3 To $2/$5 Shot: $7,500 Bankroll (3-BI Stop-Loss = $1,500)',
    bankroll: 7500,
    baseBb: 3,
    shotBb: 5,
    stopLossBi: 3,
    wrBase: 10.0,
    wrShot: 6.0,
  },
  {
    id: 'online_100nl_to_200nl',
    label: 'Online 6-Max: $5,000 Bankroll (100NL Base -> 4-BI Shot At 200NL)',
    bankroll: 5000,
    baseBb: 1,
    shotBb: 2,
    stopLossBi: 4,
    wrBase: 5.5,
    wrShot: 3.0,
  },
  {
    id: 'high_stakes_10_20_shot',
    label: 'High-Stakes Shot: $45,000 Bankroll ($5/$10 Base -> 3-BI Shot At $10/$20)',
    bankroll: 45000,
    baseBb: 10,
    shotBb: 20,
    stopLossBi: 3,
    wrBase: 6.5,
    wrShot: 3.5,
  },
];

const SHOT_BENCHMARK_TABLE = [
  {
    transition: 'Live $1/$3 ($300 BI) -> $2/$5 ($500 BI)',
    minShotBr: '$7,500 (15 Shot BIs / 25 Base BIs)',
    stopLossTrigger: '3 Shot Buy-Ins ($1,500 Drop To $6,000)',
    rebuildHours: 'Approx 50 Live Hours At $1/$3 (+10 BB/Hr)',
  },
  {
    transition: 'Live $2/$5 ($500 BI) -> $5/$10 ($1,000 BI)',
    minShotBr: '$18,000 (18 Shot BIs / 36 Base BIs)',
    stopLossTrigger: '3 Shot Buy-Ins ($3,000 Drop To $15,000)',
    rebuildHours: 'Approx 75 Live Hours At $2/$5 (+8 BB/Hr)',
  },
  {
    transition: 'Online 50NL ($50 BI) -> 100NL ($100 BI)',
    minShotBr: '$2,500 (25 Shot BIs / 50 Base BIs)',
    stopLossTrigger: '4 Shot Buy-Ins ($400 Drop To $2,100)',
    rebuildHours: 'Approx 60 Online Hours At 50NL (+5.5 BB/100)',
  },
  {
    transition: 'Online 200NL ($200 BI) -> 500NL ($500 BI)',
    minShotBr: '$15,000 (30 Shot BIs / 75 Base BIs)',
    stopLossTrigger: '4 Shot Buy-Ins ($2,000 Drop To $13,000)',
    rebuildHours: 'Approx 115 Online Hours At 200NL (+3.5 BB/100)',
  },
];

const SHOT_TAKING_FAQS = [
  {
    question: 'Why Does A Mandatory Move-Down Stop-Loss Eliminate Shot-Taking Risk Of Ruin?',
    answer:
      'If You Stay Permanently At A Higher Stake With Only 15 Buy-Ins And A 4.0 BB/100 Winrate, Your Uncapped Risk Of Ruin Exceeds 25%. By Enforcing A Hard 3-Buy-In Or 4-Buy-In Shot Stop-LossAnd Dropping Back To Your Crushing Base Stake Where You Hold 24+ Buy-Ins, Your Blended Career Risk Of Ruin Remains Below 1%.',
  },
  {
    question: 'How Many Shot Buy-Ins Should You Risk Before Moving Back Down?',
    answer:
      'Professional Cash Game Grinders Risk Exactly 3 To 5 Buy-Ins Of The Higher Stake On A Single Shot, Ensuring That Even A Worst-Case Immediate Downswing Leaves At Least 20 To 25 Full Buy-Ins For Their Base Stake.',
  },
  {
    question: 'When Should You Take A Shot At The Next Poker Stake Level?',
    answer:
      'Take A Disciplined Shot When Your Total Bankroll Reaches 18 To 22 Buy-Ins Of The Target Higher Stake And You Have A Weekend Or Prime-Evening Table Selection Window With Multiple Recreational Players At The Higher Limit.',
  },
];

export default function ShotTakingCalculatorPage({
  initialBankroll = 15000,
  initialBaseBb = 5,
  initialShotBb = 10,
  initialStopLossBi = 3,
  initialWrBase = 8.5,
  initialWrShot = 4.5,
}) {
  const router = useRouter();
  const [bankroll, setBankroll] = useState(initialBankroll);
  const [baseBb, setBaseBb] = useState(initialBaseBb);
  const [shotBb, setShotBb] = useState(initialShotBb);
  const [stopLossBi, setStopLossBi] = useState(initialStopLossBi);
  const [wrBase, setWrBase] = useState(initialWrBase);
  const [wrShot, setWrShot] = useState(initialWrShot);
  const [activePresetId, setActivePresetId] = useState('live_2_5_to_5_10_shot');

  useSolvedSpotUrlSync(
    { bankroll, baseBb, shotBb, stopLossBi, wrBase, wrShot },
    {
      bankroll: (v) => setBankroll(Math.max(200, Number(v) || 15000)),
      baseBb: (v) => setBaseBb(Math.max(0.1, Number(v) || 5)),
      shotBb: (v) => setShotBb(Math.max(0.2, Number(v) || 10)),
      stopLossBi: (v) => setStopLossBi(Math.max(1, Math.min(15, Number(v) || 3))),
      wrBase: (v) => setWrBase(Math.max(0.5, Math.min(40, Number(v) || 8.5))),
      wrShot: (v) => setWrShot(Math.max(-5, Math.min(40, Number(v) ?? 4.5))),
    }
  );

  const handleSelectPreset = (preset) => {
    setActivePresetId(preset.id);
    setBankroll(preset.bankroll);
    setBaseBb(preset.baseBb);
    setShotBb(preset.shotBb);
    setStopLossBi(preset.stopLossBi);
    setWrBase(preset.wrBase);
    setWrShot(preset.wrShot);
  };

  const metrics = useMemo(() => {
    const safeBr = Math.max(200, Number(bankroll) || 15000);
    const safeBaseBb = Math.max(0.1, Number(baseBb) || 5);
    const safeShotBb = Math.max(safeBaseBb * 1.2, Number(shotBb) || 10);
    const safeStopBi = Math.max(1, Math.min(15, Math.round(Number(stopLossBi) || 3)));
    const safeWrBase = Math.max(0.5, Number(wrBase) || 8.5);
    const safeWrShot = Math.max(-5, Number(wrShot) ?? 4.5);

    const baseBuyInDollars = safeBaseBb * 100;
    const shotBuyInDollars = safeShotBb * 100;
    const shotStopLossDollars = safeStopBi * shotBuyInDollars;
    const moveDownTriggerDollars = Math.max(baseBuyInDollars * 5, safeBr - shotStopLossDollars);

    const remainingBaseBuyInsAfterFail = moveDownTriggerDollars / baseBuyInDollars;
    const totalCurrentShotBuyIns = safeBr / shotBuyInDollars;

    // Probability of sticking the shot vs hitting the stop-loss (Brownian barrier formula)
    const sdBb100 = 88;
    const shotBankrollBb = safeStopBi * 100;
    const hitStopLossProbDec =
      safeWrShot > 0
        ? Math.min(0.95, Math.max(0.05, Math.exp((-2 * safeWrShot * shotBankrollBb) / (sdBb100 * sdBb100))))
        : 0.85;
    const shotStickSuccessPct = (1 - hitStopLossProbDec) * 100;

    // Base bankroll RoR after dropping down
    const baseRemainingBb = remainingBaseBuyInsAfterFail * 100;
    const baseRorDec = Math.exp((-2 * safeWrBase * baseRemainingBb) / (sdBb100 * sdBb100));
    const blendedCareerRorPct = Math.min(100, Math.max(0.01, hitStopLossProbDec * baseRorDec * 100));

    // Hours at Base Stake to rebuild the lost shot capital (assuming 30 hands/hr live or 200 online)
    const hph = safeBaseBb >= 2 ? 30 : 200;
    const baseHourlyDollars = (safeWrBase / 100) * hph * safeBaseBb;
    const rebuildHours = shotStopLossDollars / Math.max(1, baseHourlyDollars);

    return {
      safeBr: Math.round(safeBr),
      baseBuyInDollars: Math.round(baseBuyInDollars),
      shotBuyInDollars: Math.round(shotBuyInDollars),
      safeStopBi,
      shotStopLossDollars: Math.round(shotStopLossDollars),
      moveDownTriggerDollars: Math.round(moveDownTriggerDollars),
      remainingBaseBuyInsAfterFail: remainingBaseBuyInsAfterFail.toFixed(1),
      totalCurrentShotBuyIns: totalCurrentShotBuyIns.toFixed(1),
      shotStickSuccessPct: shotStickSuccessPct.toFixed(1),
      blendedCareerRorPct: blendedCareerRorPct < 0.05 ? '<0.05' : blendedCareerRorPct.toFixed(2),
      rebuildHours: Math.round(rebuildHours),
    };
  }, [bankroll, baseBb, shotBb, stopLossBi, wrBase, wrShot]);

  const canonicalPath = '/tools/shot-taking-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Bankroll Shot-Taking Planner';
  const pageDesc =
    'Plan A Disciplined 2-Tier Poker Bankroll Move-Up Shot: Calculate Mandatory Move-Down Stop-Loss Triggers, Shot Success Probability, Blended Risk Of Ruin, And Rebuild Hours.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: pageTitle,
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: '2-Tier Bankroll Shot-Taking & Stop-Loss Risk Calculator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Bankroll Shot-Taking Planner', canonicalPath],
      ],
      faqs: SHOT_TAKING_FAQS,
      howTo: {
        name: 'How To Plan A 2-Tier Bankroll Move-Up Shot With A Hard Stop-Loss',
        description: pageDesc,
        steps: [
          {
            name: 'Enter Total Bankroll, Base Stake BB, And Target Shot Stake BB',
            text: 'Input Your Total Liquid Poker Bankroll Along With Your Current Base Stake And Higher Shot Stake.',
          },
          {
            name: 'Set Your Shot Buy-In Stop-Loss Budget And Expected Winrates',
            text: 'Choose How Many Higher-Stake Buy-Ins (Typically 3 To 5) You Will Risk Before Moving Back Down.',
          },
          {
            name: 'Lock In Your Mandatory Move-Down Bankroll Trigger And Blended RoR',
            text: 'Record The Exact Dollar Bankroll Floor Where You Drop Back To Your Base Stake.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const summaryText = `$${metrics.safeBr.toLocaleString('en-US')} Bankroll (${metrics.safeStopBi}-BI Shot At $${shotBb} BB = $${metrics.shotStopLossDollars.toLocaleString('en-US')} Risk): Mandatory Move-Down At $${metrics.moveDownTriggerDollars.toLocaleString('en-US')} (${metrics.remainingBaseBuyInsAfterFail} Base BIs Left) | Shot Success = ${metrics.shotStickSuccessPct}% | Blended RoR = ${metrics.blendedCareerRorPct}%`;
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
            <span>Bankroll Shot-Taking Planner</span>
          </nav>
        )}

        <h1 style={{ fontSize: isEmbed ? 22 : 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          2-Tier Bankroll Shot-Taking, Mandatory Move-Down &amp; Blended RoR Planner
        </h1>

        {!isEmbed && (
          <>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 24px 0' }}>
              <strong>Direct Answer:</strong> Taking A <strong>3-To-4 Buy-In Shot</strong> At The Next Stake With A Hard <strong>Move-Down Stop-Loss Trigger</strong> Lets You Attempt Higher Stakes At 15 To 18 Buy-Ins While Keeping Your Blended Career Risk Of Ruin Below <strong>1.0%</strong>.
            </p>

            <CalculatorShareAndPresets
              toolTitle="Bankroll Shot-Taking Planner"
              toolPath={canonicalPath}
              summaryText={summaryText}
              presets={SHOT_TAKING_PRESETS}
              onSelectPreset={handleSelectPreset}
              activePresetId={activePresetId}
            />
          </>
        )}

        <section
          aria-label="Interactive 2-Tier Bankroll Shot-Taking Solver"
          style={{
            background: '#101a20',
            border: '1px solid #1e293b',
            borderRadius: '2px',
            padding: 24,
            marginBottom: 36,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#25c8ff', margin: '0 0 18px 0' }}>
            Configure Total Bankroll, Base Stake, Shot Stake &amp; Stop-Loss Buy-Ins
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 22 }}>
            {[
              { label: 'Total Liquid Bankroll ($)', val: bankroll, set: setBankroll, step: 500, color: '#34d399' },
              { label: 'Base Stake Big Blind ($)', val: baseBb, set: setBaseBb, step: 1, color: '#25c8ff' },
              { label: 'Target Shot Big Blind ($)', val: shotBb, set: setShotBb, step: 1, color: '#f2b84b' },
              { label: 'Shot Stop-Loss Budget (Buy-Ins)', val: stopLossBi, set: setStopLossBi, step: 1, color: '#f87171' },
              { label: 'Base Stake Winrate (BB/100)', val: wrBase, set: setWrBase, step: 0.5, color: '#34d399' },
              { label: 'Shot Stake Winrate (BB/100)', val: wrShot, set: setWrShot, step: 0.5, color: '#25c8ff' },
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
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f87171' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Mandatory Move-Down Trigger
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#f87171', marginTop: 4 }}>
                ${metrics.moveDownTriggerDollars.toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Risking {metrics.safeStopBi} Shot BIs (${metrics.shotStopLossDollars.toLocaleString('en-US')})
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Base Cushion If Shot Fails
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                {metrics.remainingBaseBuyInsAfterFail} Base BIs
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Rebuild Time At Base Stake: ~{metrics.rebuildHours} Hrs
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #34d399' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Blended 2-Tier Risk Of Ruin
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                {metrics.blendedCareerRorPct}% RoR
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Protected By Mandatory Move-Down Floor
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                First-Shot Stick Probability
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#f2b84b', marginTop: 4 }}>
                {metrics.shotStickSuccessPct}%
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Starting Depth: {metrics.totalCurrentShotBuyIns} Shot BIs
              </div>
            </div>
          </div>
        </section>

        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            2-Tier Cash Game Move-Up &amp; Stop-Loss Reference Benchmarks
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Recommended Shot-Taking Bankrolls, Stop-Loss Triggers, And Base-Stake Rebuild Horizons
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Stake Transition</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Recommended Shot Bankroll</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Mandatory Stop-Loss</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Expected Rebuild Time</th>
                </tr>
              </thead>
              <tbody>
                {SHOT_BENCHMARK_TABLE.map((row) => (
                  <tr key={row.transition} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.transition}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.minShotBr}</td>
                    <td style={{ padding: '10px 14px', color: '#f87171', fontWeight: 700 }}>{row.stopLossTrigger}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.rebuildHours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Bankroll &amp; Variance Calculators
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/bankroll-calculator" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Risk Of Ruin Calculator
            </Link>
            <Link href="/tools/variance-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Variance &amp; Downswing Simulator
            </Link>
            <Link href="/tools/table-selection-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Live Table Selection Grader
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#34d399', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Explore All 52 Free Poker Calculators
            </Link>
          </div>
        </section>

        {!isEmbed && (
          <>
            <FaqSection faqs={SHOT_TAKING_FAQS} />

            <HubPageSummary page="poker-tools" path={canonicalPath} />

            <CitationBacklinkBox
              title="Bankroll Shot-Taking Planner"
              canonicalUrl={canonicalUrl}
              badgeType="gto"
              badgeLabel="2-Tier Bankroll Engine"
              badgeValue="Shot-Taking & Stop-Loss Solver"
              summary="Calculates 2-Tier Bankroll Move-Up Shot Stop-Loss Triggers, Blended Risk Of Ruin, And Rebuild Hours."
              slug="shot-taking-calculator"
            />

            <AiPromptLauncher
              title="Bankroll Shot-Taking Planner"
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
    const md = renderHubToolMarkdown('/tools/shot-taking-calculator', query);
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
      initialBankroll: Number(query?.bankroll) || 15000,
      initialBaseBb: Number(query?.baseBb) || 5,
      initialShotBb: Number(query?.shotBb) || 10,
      initialStopLossBi: Number(query?.stopLossBi) || 3,
      initialWrBase: Number(query?.wrBase) || 8.5,
      initialWrShot: query?.wrShot !== undefined ? Number(query.wrShot) : 4.5,
    },
  };
}
