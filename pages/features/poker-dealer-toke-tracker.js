import React from 'react';
import FeatureLanderLayout from '../../src/components/features/FeatureLanderLayout';

export default function PokerDealerTokeTrackerPage() {
  const features = [
    {
      title: 'Down-by-Down Tip Logging',
      description: 'Log Individual 30-Minute Downs With Game Stakes, Cash Tokes, Tournament Down Rates, And Table Identifiers.',
    },
    {
      title: 'Real-Time Hourly & Down Metrics',
      description: 'Automatically Compute Your Average Dollars Per Down ($/down), Hourly Toke Rate, And Cash vs Tournament Earning Ratios.',
    },
    {
      title: 'Shift Scheduling & Roster Management',
      description: 'Manage Shift Rosters Across Card Rooms, Poker Tours, And Private Clubs With Interactive Calendar Support.',
    },
    {
      title: 'IRS Form 4070 Tip Compliance',
      description: 'Generate Month-End Tip Summary Statements Satisfying IRS Publication 531 And Form 4070 Employee Tip Reporting.',
    },
    {
      title: 'Card Room Comparisons',
      description: 'Compare Earnings And Toke Averages Across Multiple Casinos, Charity Rooms, And Poker Tour Series.',
    },
    {
      title: '100% Free Forever',
      description: 'Complete Down Logging, Shift Tracking, And Tax Exports With Zero Subscription Fees (Unlike DownCount $4.99/mo).',
    },
  ];

  const comparison = {
    title: 'Smarter.Poker Toke Tracker vs. DownCount',
    headers: ['Feature', 'Smarter.Poker Toke Tracker', 'DownCount'],
    rows: [
      ['Pricing', '100% Free Forever', '$4.99 / Month'],
      ['Down-by-Down Logging', 'Real-Time Cash & Tournament Downs', 'Basic Down Tracking'],
      ['$/Down Analytics', 'Automated Real-Time Calculations', 'Limited Analytics'],
      ['Shift Scheduling', 'Calendar-Based Shift Management', 'In-App Only'],
      ['IRS Form 4070 Export', 'Monthly Tax-Ready Statements', 'Manual Calculations'],
      ['Device Support', 'Web, iOS, Android (Zero Download)', 'iOS & Android App Store'],
    ],
  };

  const howItWorks = [
    {
      title: 'Start Your Shift',
      description: 'Clock In At Your Casino Or Card Room With One Tap On Your Phone Or Tablet.',
    },
    {
      title: 'Record Each Down',
      description: 'After Every 30-Minute Rotation, Log Your Table Number, Game Type, And Tokes Earned.',
    },
    {
      title: 'View Daily & Monthly Totals',
      description: 'Review Your Running Average Dollars Per Down And Export Verified Monthly Ledgers For Tip Reporting.',
    },
  ];

  const faqs = [
    {
      question: 'What Is A Down In Poker Dealing?',
      answer: 'A Down Is A Standard 30-Minute Shift Rotation Period That A Poker Dealer Spends Dealing At A Single Poker Table Before Rotating To The Next Table Or Taking A Break.',
    },
    {
      question: 'How Does The Toke Tracker Help With IRS Taxes?',
      answer: 'It Aggregates Daily Tip Income And Generates Monthly Summary Statements Conforming To IRS Publication 531 And Form 4070 Reporting Rules.',
    },
    {
      question: 'Is Smarter.Poker Toke Tracker Free For Dealers?',
      answer: 'Yes, 100% Free With Zero In-App Purchases, Zero Subscriptions, And Full Access To Every Analytics And Export Feature.',
    },
  ];

  return (
    <FeatureLanderLayout
      title="Poker Dealer Toke Tracker & Shift Scheduler"
      metaTitle="Poker Dealer Toke Tracker & Shift Scheduler | Smarter.Poker"
      description="Free Poker Dealer Toke Tracker For Casino And Club Dealers. Track Downs, Tokes, Shift Schedules, And Hourly Down Rates With Zero Subscription Fees."
      canonical="/features/poker-dealer-toke-tracker"
      badgeText="100% Free Dealer Utility"
      primaryCtaText="Open Toke Tracker"
      primaryCtaHref="/hub/commander"
      secondaryCtaText="View Plain-Text Spec"
      secondaryCtaHref="/features/poker-dealer-toke-tracker.md"
      markdownUrl="https://smarter.poker/features/poker-dealer-toke-tracker.md"
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
    const { renderTokeTrackerMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderTokeTrackerMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }
  return { props: {} };
}
