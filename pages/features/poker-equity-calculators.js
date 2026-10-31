import React from 'react';
import FeatureLanderLayout from '../../src/components/features/FeatureLanderLayout';

export default function PokerEquityCalculatorsPage() {
  const features = [
    {
      title: 'Six-Game Equity Engine',
      description: 'Calculate Exact Hand And Range Equities For Texas Holdem, Omaha High, PLO5, PLO6, 7-Card Stud, And Razz.',
    },
    {
      title: 'Tournament ICM Solver',
      description: 'Accurate Malmuth-Harville Independent Chip Model Dollar Equity Modeling For Final Table Deal Making.',
    },
    {
      title: 'Monte Carlo & Enumeration Modes',
      description: 'Run Up To 50,000 Precision Monte Carlo Trials Or Exact Exhaustive Combinatoric Hand Enumerations.',
    },
    {
      title: 'Turn & River Runout Heatmaps',
      description: 'Inspect Future Street Equity Changes, Drawing Out Percentages, And Board Texture Impact In Seconds.',
    },
    {
      title: 'Webmaster Embed Widgets',
      description: 'Easily Embed Responsive, Zero-Branded Equity And Odds Calculators Into Any Poker Blog Or Media Site.',
    },
    {
      title: '100% Free Without Limits',
      description: 'Run Unlimited Multiway Calculations Without Daily Limits, Ad Blockers, Or Subscription Fees.',
    },
  ];

  const comparison = {
    title: 'Smarter.Poker Calculators vs. Legacy Odds Tools',
    headers: ['Feature', 'Smarter.Poker Tools', 'Equilab', 'ICMIZER 3'],
    rows: [
      ['Pricing', '100% Free Forever', 'Free But Windows Only', '$100-$300/Year Subscription'],
      ['Supported Poker Variants', '6 Games (NLH, PLO4/5/6, Stud, Razz)', 'Holdem & Basic PLO', 'MTT Push-Fold Only'],
      ['Operating Systems', 'Web, Mac, iPhone, Android, PC', 'Windows PC Desktop Only', 'Web & Desktop App'],
      ['Tournament ICM Model', 'Built-In Malmuth-Harville', 'None', 'Dedicated ICM Suite'],
      ['Integrated AI Coach', 'Free Jarvis AI Hand Review', 'None', 'None'],
      ['Webmaster Embed Support', 'Free Responsive Iframe', 'None', 'None'],
    ],
  };

  const howItWorks = [
    {
      step: '1',
      title: 'Choose Variant & Board',
      description: 'Pick Your Game Type From Holdem To PLO6 And Enter Flop, Turn, Or River Cards If Applicable.',
    },
    {
      step: '2',
      title: 'Assign Player Hands or Ranges',
      description: 'Assign Hole Cards Or Complete Position Ranges For Up To Six Active Table Participants.',
    },
    {
      step: '3',
      title: 'Calculate Equity & ICM Value',
      description: 'Simulate Immediate Win, Tie, And Chop Probabilities Alongside Tournament Prize Pool Dollar Values.',
    },
  ];

  const faqs = [
    {
      question: 'Which Poker Games Are Supported by The Odds Calculator?',
      answer: 'Smarter.Poker Supports Texas Holdem, Pot-Limit Omaha (PLO4), 5-Card PLO (PLO5), 6-Card PLO (PLO6), Seven Card Stud, And Razz.',
    },
    {
      question: 'Does The ICM Calculator Calculate Final Table Payout Deals?',
      answer: 'Yes. The Tournament ICM Calculator Uses The Malmuth-Harville Formula To Accurately Determine Tournament Equity Across Custom Chip Stacks And Payout Structures.',
    },
    {
      question: 'Can I Embed The Calculator On My Poker Blog or Website?',
      answer: 'Yes. Smarter.Poker Provides Free Responsive Webmaster Embed Widgets At /tools/embeds With Zero Licensing Fees.',
    },
  ];

  return (
    <FeatureLanderLayout
      title="Poker Equity and ICM Calculator Suite"
      metaTitle="Poker Equity and ICM Calculator Suite | Smarter.Poker"
      description="Free Solver-Grade Multiway Poker Odds, Equity Distributions, And Tournament ICM Calculators For Holdem, Omaha, PLO5, PLO6, Stud, And Razz."
      canonical="/features/poker-equity-calculators"
      badgeText="Six-Game Multiway Equity & ICM Solvers"
      primaryCtaText="Launch Odds Calculator"
      primaryCtaHref="/tools/poker-odds-calculator"
      secondaryCtaText="View Plain-Text Spec"
      secondaryCtaHref="/features/poker-equity-calculators.md"
      markdownUrl="https://smarter.poker/features/poker-equity-calculators.md"
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
    const { renderEquityCalculatorsMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderEquityCalculatorsMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }

  return {
    props: {},
  };
}
