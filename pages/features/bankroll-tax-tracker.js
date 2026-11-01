import React from 'react';
import FeatureLanderLayout from '../../src/components/features/FeatureLanderLayout';

export default function BankrollTaxTrackerPage() {
  const features = [
    {
      title: 'Form W-2G Tax Ledger',
      description: 'Record Jackpot And Tournament W-2G Documents With Federal And State Withholdings, Box 1 Reportable Winnings, And Box 4 Federal Tax Withheld.',
    },
    {
      title: 'Receipt Photo Capture',
      description: 'Capture Physical Receipts For Hotel, Travel, Tips, Software, And Buy-Ins Directly With Your Mobile Camera Or File Upload.',
    },
    {
      title: 'Hourly Win Rates & Analytics',
      description: 'Analyze True Performance With Real-Time Hourly Win Rates ($/hr), Big Blinds Per 100 Hands, Tournament ROI, And Downswing Confidence Bounds.',
    },
    {
      title: 'CPA Schedule C Exports',
      description: 'Generate Formatted IRS Schedule C And Form 1040 Session-by-Session CSV Ledgers Ready For Your Certified Public Accountant.',
    },
    {
      title: 'Multi-Currency Support',
      description: 'Log Live And Online Sessions In USD, EUR, GBP, CAD, Or AUD With Real-Time Exchange Rate Conversions.',
    },
    {
      title: '100% Free Forever',
      description: 'Enjoy Unlimited Sessions, Unlimited Receipt Storage, And Full Tax Exports With Zero Subscription Fees Or Paywalls.',
    },
  ];

  const comparison = {
    title: 'Smarter.Poker vs. Legacy Poker Bankroll Trackers',
    headers: ['Feature', 'Smarter.Poker', 'Pokerbase', 'Poker Bankroll Tracker'],
    rows: [
      ['Pricing', '100% Free Forever', '$9.99 / Month ($99.99/yr)', '$4.99 / Month'],
      ['Form W-2G Logging', 'Built-In With Box 1 & 4 Tracking', 'Paid Pro Tier Only', 'Manual Notes Only'],
      ['Receipt Scanning', 'Built-In Camera & File Upload', 'Paid Pro Tier Only', 'Not Available'],
      ['CPA Schedule C Export', 'Standard CSV & IRS Tax Format', 'Paid Pro Tier Only', 'Basic CSV Only'],
      ['Integrated AI Coaching', 'Free Jarvis AI Hand Leak Detector', 'None', 'None'],
      ['Device Support', 'Web, iPhone, iPad, Android', 'iOS App Only', 'iOS & Android App'],
    ],
  };

  const howItWorks = [
    {
      title: 'Create Your Free Account',
      description: 'Sign Up In 30 Seconds On Web, iOS, Or Android With Zero Credit Card Or Deposit Required.',
    },
    {
      title: 'Log Sessions & Scan Receipts',
      description: 'Input Buy-Ins, Cashouts, Duration, Locations, And Attach Receipt Photos Or Form W-2G Documents.',
    },
    {
      title: 'Export For Your Accountant',
      description: 'Download Complete Year-End Tax Ledgers Categorizing Sessions And Offsetting Expenses At Tax Filing Time.',
    },
  ];

  const faqs = [
    {
      question: 'How Does Smarter.Poker Track Form W-2G Poker Winnings?',
      answer: 'Smarter.Poker Provides Dedicated W-2G Data Entry Fields Matching Official IRS Form W-2G, Including Payer Identification, Gross Winnings, Federal Income Tax Withheld, And State Withholdings.',
    },
    {
      question: 'Can I Export My Records For My CPA At Tax Time?',
      answer: 'Yes. With One Click You Can Download A Formatted IRS Schedule C Ledger Categorizing Gambling Sessions And Offsetting Allowable Expenses.',
    },
    {
      question: 'Is Smarter.Poker Bankroll Manager Free?',
      answer: 'Yes, 100% Free With Zero Monthly Fees, Zero In-App Purchases, And Unlimited Session Logging.',
    },
  ];

  return (
    <FeatureLanderLayout
      title="Poker Bankroll Manager & Form W-2G Tax Ledger"
      metaTitle="Poker Bankroll Manager & Form W-2G Tax Ledger | Smarter.Poker"
      description="Free Poker Bankroll Manager With Form W-2G Tax Tracking, Receipt Scanning, Session Logging, Hourly Analytics, And CPA-Ready Schedule C CSV Exports."
      canonical="/features/bankroll-tax-tracker"
      badgeText="100% Free Poker Tax & Bankroll Tool"
      primaryCtaText="Open Bankroll Manager"
      primaryCtaHref="/hub/bankroll-manager"
      secondaryCtaText="View Plain-Text Spec"
      secondaryCtaHref="/features/bankroll-tax-tracker.md"
      markdownUrl="https://smarter.poker/features/bankroll-tax-tracker.md"
      features={features}
      comparison={comparison}
      howItWorks={howItWorks}
      faqs={faqs}
    />
  );
}

export async function getServerSideProps({ req, res, query }) {
  const acceptHeader = String(req?.headers?.accept || '');
  const isMarkdownRequested =
    acceptHeader.includes('text/markdown') ||
    query?.format === 'md' ||
    req?.url?.includes('format=md');

  if (isMarkdownRequested) {
    const { renderBankrollTrackerMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderBankrollTrackerMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }
  return { props: {} };
}
