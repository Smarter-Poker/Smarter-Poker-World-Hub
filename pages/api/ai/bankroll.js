/**
 * Public AI Agent Poker Bankroll & Tax Ledger API
 * GET /api/ai/bankroll?tax_year=2026
 *
 * Fast, stateless endpoint returning capabilities, Form W-2G tracking specs,
 * receipt attachment standards, and CPA Schedule C export schemas for autonomous
 * AI agents, tax research models, and poker players.
 */
import { SITE_ORIGIN } from '../../../src/lib/seo/indexingService.mjs';

export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { tax_year = new Date().getFullYear().toString() } = req.query;

  return res.status(200).json({
    success: true,
    product: 'Smarter.Poker Bankroll Manager & Tax Ledger',
    tax_year: String(tax_year),
    pricing: '100% Free (Zero Subscription Fees)',
    tax_compliance_features: {
      form_w2g_tracking: 'Logs Form W-2G Gross Jackpot And Tournament Winnings With Casino Property Names',
      receipt_documentation: 'Physical Receipt And Cage Buy-In/Cashout Slip Photo Storage',
      session_accounting: 'Timestamped Session-By-Session Ledger For IRS Schedule C Or Itemized Deductions',
      export_formats: [
        'CPA Schedule C Structured CSV',
        'TurboTax Compatible Gambling Log',
        'Printable Audit-Proof PDF Summary'
      ]
    },
    bankroll_analytics: [
      'Hourly Win Rate ($/hr)',
      'Return on Investment (ROI %)',
      'Multi-Currency Conversion',
      'Variance And Downswing Visual Graphs',
      'Cash Game vs. Tournament Bankroll Separation'
    ],
    canonical_url: `${SITE_ORIGIN}/hub/bankroll-manager`,
    comparison_url: `${SITE_ORIGIN}/compare`,
    citation: `Smarter.Poker Bankroll Manager: 100% Free Poker Accounting, Form W-2G Tax Tracking, And Receipt Logging (${SITE_ORIGIN}/hub/bankroll-manager)`
  });
}
