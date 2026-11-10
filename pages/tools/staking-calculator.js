/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER STAKING & MARKUP SPLIT CALCULATOR (/tools/staking-calculator)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive tournament staking markup, investor share cost, package EV
 * breakeven ROI, and post-series payout split calculator with copyable X/Discord
 * backing summaries and deep-link scenario permalinks.
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
import { renderStakingCalculatorMarkdown } from '../../src/lib/seo/markdownIngestion.mjs';

const MARKUP_BENCHMARK_TABLE = [
  {
    markup: '1.00x (Zero Markup / Par)',
    breakevenRoi: '0.0% Player ROI',
    investorEvAt20Roi: '+20.0% Net Return',
    recommendedField: 'High-Roller Mains, Satellite Packages, Or Unproven Sample Sizes',
  },
  {
    markup: '1.08x (Conservative Club Series)',
    breakevenRoi: '+8.0% Player ROI',
    investorEvAt20Roi: '+11.1% Net Return',
    recommendedField: 'Mid-Stakes Regional Series ($600 - $1,650 Buy-Ins) With Verified Hendon Mob',
  },
  {
    markup: '1.15x (Standard WSOP / WPT Package)',
    breakevenRoi: '+15.0% Player ROI',
    investorEvAt20Roi: '+4.3% Net Return',
    recommendedField: 'Soft Live Championship Fields ($1,000 - $3,500) With 25%+ True Player ROI',
  },
  {
    markup: '1.25x (Premium Soft-Field Grinder)',
    breakevenRoi: '+25.0% Player ROI',
    investorEvAt20Roi: '-4.0% Negative Investor EV At 20% ROI',
    recommendedField: 'Requires Proven 35%+ Live ROI In Small-Buy-In Large-Field Live Events',
  },
  {
    markup: '1.35x+ (Aggressive High Markup)',
    breakevenRoi: '+35.0% Player ROI',
    investorEvAt20Roi: '-11.1% Negative Investor EV At 20% ROI',
    recommendedField: 'Almost Always -EV For Backers Unless Event Has Massive Overlay',
  },
];

const STAKING_CALCULATOR_FAQS = [
  {
    question: 'How Do You Calculate Investor Breakeven ROI On A Poker Staking Markup?',
    answer:
      'To Break Even On A Staking Package Sold At Markup M, The Player Must Achieve A Return On Investment Equal To (Markup - 1) * 100%. For Example, If A Player Sells Action At 1.15x Markup, They Must Generate At Least A +15.0% True ROI Over The Series Just For Investors To Reach $0 EV.',
  },
  {
    question: 'Does Markup Apply To Post-Series Tournament Cashes Or Only The Initial Buy-In?',
    answer:
      'In Standard Poker Staking Agreements (Without Make-Up), Markup Applies Only To The Initial Purchase Price Of The Share. If An Investor Buys 10% Of A $10,000 Package At 1.20x Markup For $1,200, That Investor Receives Exactly 10% Of All Gross Tournament Cashes, Refunds, And Bounties.',
  },
  {
    question: 'How Do Unused Bullet Refunds Work In A Tournament Staking Package?',
    answer:
      'When A Scheduled Tournament Or Re-Entry Bullet In A Staking Package Is Not Fired, The Unplayed Buy-In Plus The Exact Markup Charged On That Specific Bullet Must Be Refunded Pro-Rata To Investors So Backers Never Pay Markup On Unplayed Action.',
  },
];

export default function StakingCalculatorPage({
  initialPackageBuyIns = 10000,
  initialMarkup = 1.15,
  initialActionSoldPct = 50,
  initialInvestorSharePct = 10,
  initialTotalCashes = 24000,
  initialTrueRoiPct = 25,
}) {
  const router = useRouter();
  const [packageBuyIns, setPackageBuyIns] = useState(initialPackageBuyIns);
  const [markup, setMarkup] = useState(initialMarkup);
  const [actionSoldPct, setActionSoldPct] = useState(initialActionSoldPct);
  const [investorSharePct, setInvestorSharePct] = useState(initialInvestorSharePct);
  const [totalCashes, setTotalCashes] = useState(initialTotalCashes);
  const [trueRoiPct, setTrueRoiPct] = useState(initialTrueRoiPct);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPackage, setCopiedPackage] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;
    if (q.package !== undefined) setPackageBuyIns(Math.max(100, Number(q.package) || 10000));
    if (q.markup !== undefined) setMarkup(Math.max(1.0, Math.min(1.5, Number(q.markup) || 1.15)));
    if (q.sold !== undefined) setActionSoldPct(Math.max(10, Math.min(90, Number(q.sold) || 50)));
    if (q.share !== undefined) setInvestorSharePct(Math.max(1, Math.min(50, Number(q.share) || 10)));
    if (q.cashes !== undefined) setTotalCashes(Math.max(0, Number(q.cashes) || 24000));
    if (q.roi !== undefined) setTrueRoiPct(Number(q.roi) || 25);
  }, [router.isReady, router.query]);

  const metrics = useMemo(() => {
    const safePackage = Math.max(100, Number(packageBuyIns) || 10000);
    const safeMarkup = Math.max(1.0, Math.min(1.5, Number(markup) || 1.15));
    const safeSoldPct = Math.max(10, Math.min(90, Number(actionSoldPct) || 50));
    const safeInvestorPct = Math.max(1, Math.min(50, Number(investorSharePct) || 10));
    const safeCashes = Math.max(0, Number(totalCashes) || 0);
    const safeRoi = Number.isFinite(Number(trueRoiPct)) ? Number(trueRoiPct) : 25;

    const costPerOnePctAtPar = safePackage * 0.01;
    const costPerOnePctAtMarkup = costPerOnePctAtPar * safeMarkup;
    const totalSoldActionCollected = safePackage * (safeSoldPct / 100) * safeMarkup;
    const markupPremiumCollected = safePackage * (safeSoldPct / 100) * (safeMarkup - 1);
    const playerNetOutOfPocket = Math.max(0, safePackage - totalSoldActionCollected);

    const investorShareCost = safePackage * (safeInvestorPct / 100) * safeMarkup;
    const requiredBreakevenRoiPct = (safeMarkup - 1) * 100;

    // Expected EV of the investor's share given player's True ROI
    const expectedTotalReturn = safePackage * (1 + safeRoi / 100);
    const investorExpectedGrossReturn = expectedTotalReturn * (safeInvestorPct / 100);
    const investorExpectedNetEv = investorExpectedGrossReturn - investorShareCost;
    const investorExpectedRoiPct =
      investorShareCost > 0 ? (investorExpectedNetEv / investorShareCost) * 100 : 0;

    // Post-series settlement
    const totalPayoutToAllInvestors = safeCashes * (safeSoldPct / 100);
    const singleInvestorPayout = safeCashes * (safeInvestorPct / 100);
    const singleInvestorNetProfit = singleInvestorPayout - investorShareCost;
    const playerRetainedCashes = safeCashes * ((100 - safeSoldPct) / 100);
    const playerTotalNetProfit =
      playerRetainedCashes + totalSoldActionCollected - safePackage;

    return {
      safePackage,
      safeMarkup: safeMarkup.toFixed(2),
      safeSoldPct,
      safeInvestorPct,
      safeCashes,
      safeRoi,
      costPerOnePctAtMarkup: costPerOnePctAtMarkup.toFixed(2),
      totalSoldActionCollected: Math.round(totalSoldActionCollected),
      markupPremiumCollected: Math.round(markupPremiumCollected),
      playerNetOutOfPocket: Math.round(playerNetOutOfPocket),
      investorShareCost: Math.round(investorShareCost),
      requiredBreakevenRoiPct: requiredBreakevenRoiPct.toFixed(1),
      investorExpectedNetEv: Math.round(investorExpectedNetEv),
      investorExpectedRoiPct: investorExpectedRoiPct.toFixed(1),
      totalPayoutToAllInvestors: Math.round(totalPayoutToAllInvestors),
      singleInvestorPayout: Math.round(singleInvestorPayout),
      singleInvestorNetProfit: Math.round(singleInvestorNetProfit),
      playerRetainedCashes: Math.round(playerRetainedCashes),
      playerTotalNetProfit: Math.round(playerTotalNetProfit),
    };
  }, [packageBuyIns, markup, actionSoldPct, investorSharePct, totalCashes, trueRoiPct]);

  const handleCopyScenarioLink = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    const shareUrl = `${window.location.origin}/tools/staking-calculator?package=${metrics.safePackage}&markup=${metrics.safeMarkup}&sold=${metrics.safeSoldPct}&share=${metrics.safeInvestorPct}&cashes=${metrics.safeCashes}&roi=${metrics.safeRoi}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyStakingPackage = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    const summaryText = [
      `Tournament Staking Package Summary (Verified On Smarter.Poker)`,
      `Total Package Buy-Ins: $${metrics.safePackage.toLocaleString('en-US')} @ ${metrics.safeMarkup}x Markup`,
      `Action Available: ${metrics.safeSoldPct}% Total ($${metrics.costPerOnePctAtMarkup} Per 1% | $${(Number(metrics.costPerOnePctAtMarkup) * 5).toFixed(0)} Per 5% | $${(Number(metrics.costPerOnePctAtMarkup) * 10).toFixed(0)} Per 10%)`,
      `Investor Breakeven ROI: +${metrics.requiredBreakevenRoiPct}% | Unused Bullets Refunded With Markup`,
      `Verify Math: ${window.location.origin}/tools/staking-calculator?package=${metrics.safePackage}&markup=${metrics.safeMarkup}&sold=${metrics.safeSoldPct}`,
    ].join('\n');
    navigator.clipboard.writeText(summaryText);
    setCopiedPackage(true);
    setTimeout(() => setCopiedPackage(false), 2500);
  };

  const canonicalPath = '/tools/staking-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageDesc =
    'Calculate Tournament Staking Markup, Investor Share Cost, Package EV Breakeven ROI, And Post-Series Payout Splits With Copyable Backing Summaries.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'Smarter.Poker Tournament Staking & Markup Split Calculator',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Tournament Staking & Markup Calculator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Poker Staking & Markup Calculator', canonicalPath],
      ],
      faqs: STAKING_CALCULATOR_FAQS,
      howTo: {
        name: 'How To Calculate Poker Tournament Staking Markup And Payout Splits',
        description: pageDesc,
        steps: [
          {
            name: 'Input Total Package Buy-Ins, Markup Multiplier, And Action Sold %',
            text: 'Enter Your Total Tournament Schedule Buy-Ins ($), Markup Multiplier (1.00x To 1.50x), And Total Percentage Sold (10% To 90%).',
          },
          {
            name: 'Select Investor Share % And Estimated True Player ROI',
            text: 'Check Exact Cost Per 1%, Required Breakeven ROI, And Expected Dollar EV For Any Backer Tranche.',
          },
          {
            name: 'Compute Post-Series Investor Payouts And Copy Backing Summary',
            text: 'Enter Total Series Cashes To Split Investor Distributions From Player Retained Profit And Copy Your X/Discord Staking Post.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const isEmbed = router.query?.embed === 'true';

  return (
    <div style={{ minHeight: isEmbed ? 'auto' : '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="Poker Staking & Markup Split Calculator"
        description="Calculate Tournament Staking Markup, Investor Share Cost, Package EV Breakeven ROI, And Post-Series Payout Splits With Copyable Backing Summaries."
        canonical="/tools/staking-calculator"
        jsonLd={schema}
      />

      <main style={{ maxWidth: 1060, margin: '0 auto', padding: isEmbed ? '16px 14px 24px' : '40px 20px 80px' }}>
        {!isEmbed && (
          <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
            <Link href="/" style={{ color: '#25c8ff', textDecoration: 'none' }}>Smarter.Poker</Link>
            {' / '}
            <Link href="/tools" style={{ color: '#25c8ff', textDecoration: 'none' }}>Poker Tools</Link>
            {' / '}
            <span>Poker Staking &amp; Markup Split Calculator</span>
          </nav>
        )}

        <h1 style={{ fontSize: isEmbed ? 22 : 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Poker Staking &amp; Markup Split Calculator
        </h1>

        {!isEmbed && (
          <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
            <strong>Direct Answer:</strong> In Tournament Staking, An Investor Buying Share <strong>S%</strong> Of A Package At <strong>Markup M</strong> Pays <strong>Package * S% * M</strong> Upfront And Receives <strong>S% Of Gross Cashes</strong>. For An Investor To Break Even ($0 EV), The Player True ROI Must At Least Equal <strong>(Markup - 1) * 100%</strong>.
          </p>
        )}

        {/* Interactive Staking Calculator */}
        <section
          aria-label="Interactive Poker Staking Calculator"
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
              Interactive Staking Package, Markup EV &amp; Settlement Builder
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <button
                type="button"
                onClick={handleCopyStakingPackage}
                style={{
                  padding: '8px 14px',
                  background: copiedPackage ? '#059669' : '#020608',
                  color: '#f2b84b',
                  border: '1px solid #f2b84b',
                  borderRadius: '2px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {copiedPackage ? 'Copied X / Discord Post!' : 'Copy Staking Package For X / Discord'}
              </button>
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
          </div>

          {/* 6 Interactive Inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 22 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Total Package Buy-Ins ($)
                <input
                  type="number"
                  min="100"
                  step="500"
                  value={packageBuyIns}
                  onChange={(e) => setPackageBuyIns(e.target.value)}
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
                Markup Multiplier (1.00x To 1.50x)
                <input
                  type="number"
                  min="1.00"
                  max="1.50"
                  step="0.01"
                  value={markup}
                  onChange={(e) => setMarkup(e.target.value)}
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
                Action Sold Percentage (10% To 90%)
                <input
                  type="number"
                  min="10"
                  max="90"
                  step="5"
                  value={actionSoldPct}
                  onChange={(e) => setActionSoldPct(e.target.value)}
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
                Investor Share Purchased (1% To 50%)
                <input
                  type="number"
                  min="1"
                  max="50"
                  step="1"
                  value={investorSharePct}
                  onChange={(e) => setInvestorSharePct(e.target.value)}
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

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Total Series Cashes ($)
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={totalCashes}
                  onChange={(e) => setTotalCashes(e.target.value)}
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
                Player True Estimated ROI (%)
                <input
                  type="number"
                  min="-50"
                  max="200"
                  step="5"
                  value={trueRoiPct}
                  onChange={(e) => setTrueRoiPct(e.target.value)}
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
          </div>

          {/* KPI Output Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 18 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Total Sold Action Collected
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                ${metrics.totalSoldActionCollected.toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Cost Per 1%: ${metrics.costPerOnePctAtMarkup} | Player Net Risk: ${metrics.playerNetOutOfPocket.toLocaleString('en-US')}
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Investor Breakeven ROI &amp; EV ({metrics.safeInvestorPct}%)
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  color: metrics.investorExpectedNetEv >= 0 ? '#34d399' : '#f87171',
                  marginTop: 4,
                }}
              >
                {metrics.investorExpectedNetEv >= 0 ? '+' : '-'}${Math.abs(metrics.investorExpectedNetEv).toLocaleString('en-US')} EV ({metrics.investorExpectedRoiPct}%)
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Share Cost: ${metrics.investorShareCost.toLocaleString('en-US')} | Breakeven ROI: +{metrics.requiredBreakevenRoiPct}%
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Post-Series Payout To Investors ({metrics.safeSoldPct}%)
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                ${metrics.totalPayoutToAllInvestors.toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                {metrics.safeInvestorPct}% Investor Payout: ${metrics.singleInvestorPayout.toLocaleString('en-US')} (Net {metrics.singleInvestorNetProfit >= 0 ? '+' : '-'}${Math.abs(metrics.singleInvestorNetProfit).toLocaleString('en-US')})
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Player Retained Profit (After Splits)
              </div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: metrics.playerTotalNetProfit >= 0 ? '#f2b84b' : '#f87171',
                  marginTop: 4,
                }}
              >
                {metrics.playerTotalNetProfit >= 0 ? '+' : '-'}${Math.abs(metrics.playerTotalNetProfit).toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Retained Cashes: ${metrics.playerRetainedCashes.toLocaleString('en-US')} + Markup: ${metrics.markupPremiumCollected.toLocaleString('en-US')}
              </div>
            </div>
          </div>
        </section>

        {/* Reference Matrix */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Tournament Staking Markup &amp; Investor EV Benchmark Matrix
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                How Markup Multipliers Affect Investor Breakeven ROI And Net Expected Return
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Markup Tier</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Required Breakeven ROI</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Investor Net Return (At 20% Player ROI)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Appropriate Tournament Environment</th>
                </tr>
              </thead>
              <tbody>
                {MARKUP_BENCHMARK_TABLE.map((row) => (
                  <tr key={row.markup} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.markup}</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 700 }}>{row.breakevenRoi}</td>
                    <td style={{ padding: '10px 14px', color: '#f2b84b', fontWeight: 700 }}>{row.investorEvAt20Roi}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.recommendedField}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cross-Links */}
        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Tournament, Chop &amp; Tax Tools
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/chop-calculator" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Final Table Deal &amp; ICM Chop Calculator
            </Link>
            <Link href="/tools/poker-tax-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              US Poker Tax &amp; Form W-2G Calculator
            </Link>
            <Link href="/tools/payout-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Tournament Payout Calculator
            </Link>
            <Link href="/tools/variance-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Variance &amp; Downswing Simulator
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              All 24 Poker Calculators
            </Link>
          </div>
        </section>

        {!isEmbed && (
          <>
            <FaqSection faqs={STAKING_CALCULATOR_FAQS} />

            <CitationBacklinkBox
              title="Poker Staking & Markup Split Calculator"
              canonicalUrl={canonicalUrl}
              badgeType="gto"
              badgeLabel="Tournament Backing Engine"
              badgeValue="Staking Markup & Payout Splits"
              summary="Interactive Tournament Staking Markup, Investor Share Cost, Package EV Breakeven ROI, And Post-Series Payout Split Calculator."
              slug="staking-calculator"
            />

            <AiPromptLauncher
              title="Poker Staking & Markup Split Calculator"
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
    const renderToolDocumentationMarkdown = () => renderStakingCalculatorMarkdown();
    const md = renderToolDocumentationMarkdown('staking-calculator');
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
