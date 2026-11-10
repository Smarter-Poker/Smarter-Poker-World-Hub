/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  US POKER TAX & FORM W-2G CALCULATOR (/tools/poker-tax-calculator)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive US Federal and State Poker Tax Estimator covering IRS Form W-2G
 * $5,000 net tournament triggers, 24% federal backup withholding, Recreational
 * (Schedule A Itemized) vs Professional Gambler (Schedule C) deductions, and
 * IRS Revenue Procedure 77-29 session log compliance.
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

const SESSION_LOG_CHECKLIST = [
  {
    field: 'Date & Exact Session Timestamps',
    requirement: 'Start And Stop Date/Time For Every Individual Cash Or Tournament Session',
    irsReference: 'IRS Rev. Proc. 77-29 & IRC Sec. 165(d)',
  },
  {
    field: 'Gaming Establishment Name & Location',
    requirement: 'Full Casino Name, Card Room Address, Or Licensed Online Platform Jurisdiction',
    irsReference: 'Contemporaneous Diary Standard',
  },
  {
    field: 'Game Variant, Stakes & Table Number',
    requirement: 'Game Type (E.G., $2/$5 NLHE Cash Or $1,100 MTT) And Specific Table Or Event Number',
    irsReference: 'Audit Corroboration Requirement',
  },
  {
    field: 'Gross Session Buy-In Vs. Cash-Out Net',
    requirement: 'Exact Net Winning Or Net Losing Dollar Amount Per Session (Never Netted Across Days)',
    irsReference: 'Shollenberger V. Commissioner',
  },
  {
    field: 'Corroborating Receipts & W-2G Forms',
    requirement: 'Tournament Buy-In Receipts, Cage Wire Slips, Player Card Win/Loss Statements, And Form W-2G Copies',
    irsReference: 'IRS Publication 529',
  },
];

const POKER_TAX_FAQS = [
  {
    question: 'When Does A Casino Issue IRS Form W-2G For A Poker Tournament?',
    answer:
      'Under Internal Revenue Service Rules For Poker Tournaments, A Casino Or Card Room Must Issue Form W-2G Whenever Your Net Tournament Winnings (Gross Payout Minus The Exact Tournament Buy-In And Entry Fee) Exceed $5,000. Cash Games And Table Games Without A 300-To-1 Odds Payout Ratio Generally Do Not Trigger Automatic W-2G Forms, Though All Winnings Remain Taxable.',
  },
  {
    question: 'What Is The Difference Between Filing Taxes As A Recreational Vs Professional Poker Player?',
    answer:
      'Recreational Players Must Report 100% Of Gross Winning Sessions On Schedule 1 (Form 1040) And Can Only Deduct Gross Losing Sessions If They Itemize Deductions On Schedule A (Forfeiting The Standard Deduction). Professional Gamblers Filing On Schedule C May Net Winning And Losing Sessions Directly And Deduct Ordinary Business Expenses (Travel, Coaching, Solvers), But Must Pay 15.3% Self-Employment Tax On Net Profit.',
  },
  {
    question: 'Can Gambling Losses Exceed Gambling Winnings On A US Tax Return?',
    answer:
      'No. Under IRC Section 165(d), Deductible Gambling Losses (Plus Deductible Business Expenses For Schedule C Professional Gamblers Following The Tax Cuts And Jobs Act Amendments) Are Strictly Capped At The Total Amount Of Gross Gambling Winnings Reported For That Tax Year.',
  },
];

function estimateFederalBracketRate(taxableIncome) {
  if (taxableIncome <= 11600) return 0.10;
  if (taxableIncome <= 47150) return 0.12;
  if (taxableIncome <= 100525) return 0.22;
  if (taxableIncome <= 191950) return 0.24;
  if (taxableIncome <= 243725) return 0.32;
  if (taxableIncome <= 609350) return 0.35;
  return 0.37;
}

export default function PokerTaxCalculatorPage({
  initialWinSessions = 48000,
  initialLossSessions = 22000,
  initialFilingStatus = 'recreational',
  initialBusinessExpenses = 3500,
  initialOtherIncome = 85000,
  initialSingleTournamentNet = 6500,
}) {
  const router = useRouter();
  const [winSessions, setWinSessions] = useState(initialWinSessions);
  const [lossSessions, setLossSessions] = useState(initialLossSessions);
  const [filingStatus, setFilingStatus] = useState(initialFilingStatus);
  const [businessExpenses, setBusinessExpenses] = useState(initialBusinessExpenses);
  const [otherIncome, setOtherIncome] = useState(initialOtherIncome);
  const [singleTournamentNet, setSingleTournamentNet] = useState(initialSingleTournamentNet);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;
    if (q.wins !== undefined) setWinSessions(Math.max(0, Number(q.wins) || 0));
    if (q.losses !== undefined) setLossSessions(Math.max(0, Number(q.losses) || 0));
    if (q.status !== undefined) {
      setFilingStatus(String(q.status).toLowerCase() === 'pro' ? 'pro' : 'recreational');
    }
    if (q.expenses !== undefined) setBusinessExpenses(Math.max(0, Number(q.expenses) || 0));
    if (q.income !== undefined) setOtherIncome(Math.max(0, Number(q.income) || 0));
    if (q.tourney !== undefined) setSingleTournamentNet(Math.max(0, Number(q.tourney) || 0));
  }, [router.isReady, router.query]);

  const taxMetrics = useMemo(() => {
    const safeWins = Math.max(0, Number(winSessions) || 0);
    const safeLosses = Math.max(0, Number(lossSessions) || 0);
    const isPro = filingStatus === 'pro';
    const safeExpenses = isPro ? Math.max(0, Number(businessExpenses) || 0) : 0;
    const safeOtherIncome = Math.max(0, Number(otherIncome) || 0);
    const safeTourneyNet = Math.max(0, Number(singleTournamentNet) || 0);

    // IRC Sec 165(d): Losses + Expenses cannot exceed Gross Winnings
    const deductibleLossCap = Math.min(safeWins, safeLosses + safeExpenses);
    const netGamblingProfit = Math.max(0, safeWins - deductibleLossCap);
    const unallowedExcessLoss = Math.max(0, safeLosses + safeExpenses - safeWins);

    const combinedTaxableIncome = safeOtherIncome + netGamblingProfit;
    const marginalRate = estimateFederalBracketRate(combinedTaxableIncome);

    // Pro gamblers pay ~15.3% SE tax (on 92.35% of net profit up to Social Security cap)
    const seTaxEstimate = isPro ? Math.round(netGamblingProfit * 0.9235 * 0.153) : 0;
    const federalIncomeTaxOnPoker = Math.round(netGamblingProfit * marginalRate);
    const totalEstimatedFederalTax = federalIncomeTaxOnPoker + seTaxEstimate;

    // Form W-2G trigger check: net poker tournament profit > $5,000
    const triggersW2G = safeTourneyNet > 5000;
    const backupWithholdingIfNoTin = triggersW2G ? Math.round(safeTourneyNet * 0.24) : 0;

    return {
      safeWins,
      safeLosses,
      isPro,
      safeExpenses,
      safeOtherIncome,
      safeTourneyNet,
      deductibleLossCap,
      netGamblingProfit,
      unallowedExcessLoss,
      marginalRatePct: (marginalRate * 100).toFixed(0),
      federalIncomeTaxOnPoker,
      seTaxEstimate,
      totalEstimatedFederalTax,
      triggersW2G,
      backupWithholdingIfNoTin,
    };
  }, [winSessions, lossSessions, filingStatus, businessExpenses, otherIncome, singleTournamentNet]);

  const handleCopyScenarioLink = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    const shareUrl = `${window.location.origin}/tools/poker-tax-calculator?wins=${taxMetrics.safeWins}&losses=${taxMetrics.safeLosses}&status=${taxMetrics.isPro ? 'pro' : 'recreational'}&expenses=${taxMetrics.safeExpenses}&income=${taxMetrics.safeOtherIncome}&tourney=${taxMetrics.safeTourneyNet}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const canonicalPath = '/tools/poker-tax-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageDesc =
    'Estimate US Federal And State Poker Taxes, IRS Form W-2G Reporting Thresholds, And Recreational Vs Professional Net Session Tax Deductions.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'Smarter.Poker US Poker Tax & Form W-2G Calculator',
      description: pageDesc,
      applicationCategory: 'FinanceApplication',
      applicationSubCategory: 'US Poker Tax & IRS Form W-2G Estimator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['US Poker Tax Calculator', canonicalPath],
      ],
      faqs: POKER_TAX_FAQS,
      howTo: {
        name: 'How To Estimate US Federal Poker Taxes And Form W-2G Triggers',
        description: pageDesc,
        steps: [
          {
            name: 'Enter Gross Winning Sessions And Gross Losing Sessions Separately',
            text: 'Input Your Total Gross Winning Sessions And Total Gross Losing Sessions In Accordance With IRS Session Accounting Rules.',
          },
          {
            name: 'Select Recreational (Schedule A) Or Professional Gambler (Schedule C)',
            text: 'Toggle Your Filing Status And Input Qualifying Business Expenses And Other Taxable Income.',
          },
          {
            name: 'Check Single Tournament Net Score For Form W-2G Reporting',
            text: 'Verify Whether Any Tournament Score Exceeds The $5,000 Net Threshold And Review Your Estimated Marginal Tax.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const isEmbed = router.query?.embed === 'true';

  return (
    <div style={{ minHeight: isEmbed ? 'auto' : '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="US Poker Tax & Form W-2G Calculator"
        description="Estimate US Federal And State Poker Taxes, IRS Form W-2G Reporting Thresholds, And Recreational Vs Professional Net Session Tax Deductions."
        canonical="/tools/poker-tax-calculator"
        jsonLd={schema}
      />

      <main style={{ maxWidth: 1060, margin: '0 auto', padding: isEmbed ? '16px 14px 24px' : '40px 20px 80px' }}>
        {!isEmbed && (
          <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
            <Link href="/" style={{ color: '#25c8ff', textDecoration: 'none' }}>Smarter.Poker</Link>
            {' / '}
            <Link href="/tools" style={{ color: '#25c8ff', textDecoration: 'none' }}>Poker Tools</Link>
            {' / '}
            <span>US Poker Tax &amp; Form W-2G Calculator</span>
          </nav>
        )}

        <h1 style={{ fontSize: isEmbed ? 22 : 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          US Poker Tax &amp; Form W-2G Calculator
        </h1>

        {!isEmbed && (
          <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 18px 0' }}>
            <strong>Direct Answer:</strong> Under US Internal Revenue Code Section 165D, Poker Players Must Report <strong>100% Of Gross Winning Sessions Separately From Gross Losing Sessions</strong>, And Deductible Losses Cannot Exceed Gross Gambling Winnings. Casinos Issue <strong>IRS Form W-2G</strong> Whenever A Single Poker Tournament Payout Exceeds <strong>$5,000 Net Of Buy-In</strong>.
          </p>
        )}

        {/* Educational Tax Disclaimer */}
        <div
          style={{
            background: '#101a20',
            border: '1px solid #f2b84b',
            borderRadius: '2px',
            padding: '12px 16px',
            fontSize: 13,
            color: '#f8fafc',
            marginBottom: 28,
          }}
        >
          <strong>Educational Tax Disclaimer:</strong> This Calculator Provides Mathematical Estimates Based On Public IRS Form W-2G And IRC Section 165D Guidelines For Educational Planning Only. It Does Not Constitute Legal Or Certified Public Accountant (CPA) Tax Advice. Always Consult A Qualified Gaming Tax Professional Before Filing.
        </div>

        {/* Interactive Tax Estimator */}
        <section
          aria-label="Interactive US Poker Tax Calculator"
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
              Interactive Session Netting &amp; Form W-2G Estimator
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 22 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Gross Winning Sessions ($)
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={winSessions}
                  onChange={(e) => setWinSessions(e.target.value)}
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
                Gross Losing Sessions ($)
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={lossSessions}
                  onChange={(e) => setLossSessions(e.target.value)}
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
                Tax Filing Classification
                <select
                  value={filingStatus}
                  onChange={(e) => setFilingStatus(e.target.value)}
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
                >
                  <option value="recreational">Recreational (Schedule A Itemized)</option>
                  <option value="pro">Professional Gambler (Schedule C)</option>
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Pro Business Expenses ($ Travel/Coaching)
                <input
                  type="number"
                  min="0"
                  step="500"
                  value={businessExpenses}
                  onChange={(e) => setBusinessExpenses(e.target.value)}
                  disabled={!taxMetrics.isPro}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: taxMetrics.isPro ? '#25c8ff' : '#64748b',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Other Taxable Income ($)
                <input
                  type="number"
                  min="0"
                  step="5000"
                  value={otherIncome}
                  onChange={(e) => setOtherIncome(e.target.value)}
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
                Single Tournament Net Score ($)
                <input
                  type="number"
                  min="0"
                  step="500"
                  value={singleTournamentNet}
                  onChange={(e) => setSingleTournamentNet(e.target.value)}
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

          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 18 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Net Taxable Gambling Profit
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                ${taxMetrics.netGamblingProfit.toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Deductible Loss Cap: ${taxMetrics.deductibleLossCap.toLocaleString('en-US')}
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Estimated Federal Marginal Tax
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#f2b84b', marginTop: 4 }}>
                ${taxMetrics.totalEstimatedFederalTax.toLocaleString('en-US')} ({taxMetrics.marginalRatePct}% Bracket)
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                {taxMetrics.isPro
                  ? `Includes $${taxMetrics.seTaxEstimate.toLocaleString('en-US')} Schedule C SE Tax`
                  : 'Requires Itemizing Losses On Schedule A'}
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                IRS Form W-2G Trigger Status
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: taxMetrics.triggersW2G ? '#f87171' : '#34d399',
                  marginTop: 4,
                }}
              >
                {taxMetrics.triggersW2G ? 'W-2G Triggered (> $5,000)' : 'Below $5,000 W-2G Threshold'}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                24% Backup Withholding Risk: ${taxMetrics.backupWithholdingIfNoTin.toLocaleString('en-US')}
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Disallowed Excess Losses (Sec. 165d)
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#f8fafc', marginTop: 4 }}>
                ${taxMetrics.unallowedExcessLoss.toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Losses Cannot Reduce Non-Gambling Income
              </div>
            </div>
          </div>
        </section>

        {/* Record-Keeping Session Log Checklist */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            IRS Revenue Procedure 77-29 Poker Session Log Checklist
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Mandatory Contemporaneous Session Diary Elements Required To Substantiate Poker Wins And Losses During An Audit
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Required Session Log Field</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Documentation Standard</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>IRS Authority</th>
                </tr>
              </thead>
              <tbody>
                {SESSION_LOG_CHECKLIST.map((item) => (
                  <tr key={item.field} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{item.field}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{item.requirement}</td>
                    <td style={{ padding: '10px 14px', color: '#f2b84b', fontWeight: 600 }}>{item.irsReference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cross-Links */}
        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Financial, Staking &amp; Bankroll Tools
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/staking-calculator" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Poker Staking &amp; Markup Split Calculator
            </Link>
            <Link href="/tools/chop-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Final Table Deal &amp; ICM Chop Calculator
            </Link>
            <Link href="/tools/bankroll-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Bankroll &amp; Risk Of Ruin Calculator
            </Link>
            <Link href="/tools/poker-winrate-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Live &amp; Online Winrate Calculator
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              All 24 Poker Calculators
            </Link>
          </div>
        </section>

        {!isEmbed && (
          <>
            <FaqSection faqs={POKER_TAX_FAQS} />

            <CitationBacklinkBox
              title="US Poker Tax & Form W-2G Calculator"
              canonicalUrl={canonicalUrl}
              badgeType="award-cpa"
              badgeLabel="IRS Form W-2G & Sec. 165(d) Engine"
              badgeValue="US Poker Tax & Session Ledger"
              summary="Interactive US Poker Tax Estimator Covering IRS Form W-2G $5,000 Tournament Triggers, Schedule A Vs Schedule C Filing, And Session Log Compliance."
              slug="poker-tax-calculator"
            />

            <AiPromptLauncher
              title="US Poker Tax & Form W-2G Calculator"
              canonicalUrl={canonicalUrl}
              markdownUrl={`${canonicalUrl}.md`}
            />
          </>
        )}
      </main>
    </div>
  );
}
