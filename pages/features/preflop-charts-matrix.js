import React from 'react';
import FeatureLanderLayout from '../../src/components/features/FeatureLanderLayout';

export default function PreflopChartsMatrixPage() {
  const features = [
    {
      title: 'Solver-Grade GTO Equilibrium Ranges',
      description: 'Comprehensive 169-Hand Matrices Solved Across 15BB To 100BB Stack Depths For Cash Games And MTTs.',
    },
    {
      title: 'Position-by-Position Solutions',
      description: 'Open Raising, 3-Bet, 4-Bet, Cold Calling, And Blind Defense Ranges For UTG, MP, CO, BTN, SB, And BB.',
    },
    {
      title: 'Color-Coded Action Frequencies',
      description: 'Clear Visual Grids Highlighting Pure Raises, Mixed Frequency Calls, Folds, And Shoves At A Glance.',
    },
    {
      title: 'Push-Fold Tournament Charts',
      description: 'Short-Stack Push-Fold Solutions Designed For Final Tables, Bubble Dynamics, And Satellite Play.',
    },
    {
      title: 'Multi-Device Browser Access',
      description: 'Review Hand Charts Seamlessly On Your Smartphone At Live Tables Or On Your Desktop Multi-Screen Setup.',
    },
    {
      title: '100% Free Without Paywalls',
      description: 'Full Access To The Entire Preflop Strategy Library Without $50-$100/Month Coaching Subscriptions.',
    },
  ];

  const comparison = {
    title: 'Smarter.Poker Preflop Charts vs. Paid Training Sites',
    headers: ['Feature', 'Smarter.Poker Charts', 'Upswing Poker', 'Jonathan Little PokerCoaching'],
    rows: [
      ['Pricing', '100% Free Forever', '$99/Month Subscription', '$49-$99/Month Subscription'],
      ['No App Download Needed', '100% In Any Browser', 'Website Login Wall', 'Website Login Wall'],
      ['Interactive 169 Matrix', 'Full Color-Coded Grids', 'PDF & Viewer Only', 'App & Web Viewer'],
      ['Integrated AI Leak Coach', 'Free Jarvis AI Hand Review', 'None', 'None'],
      ['Short-Stack Push-Fold', '15BB-25BB Included Free', 'VIP Tier Only', 'VIP Tier Only'],
      ['Cross-Platform WebRTC', 'Web, iOS, Android, PC', 'Desktop Web Only', 'Mobile App & Web'],
    ],
  };

  const howItWorks = [
    {
      step: '1',
      title: 'Select Position & Stack Depth',
      description: 'Pick Your Table Position From Early Position To The Big Blind And Specify Stack Size From 15BB To 100BB.',
    },
    {
      step: '2',
      title: 'Inspect Mixed Action Frequencies',
      description: 'Review Color-Coded Frequencies To Determine Whether To Raise, Call, 3-Bet, Or Fold Your Specific Hand.',
    },
    {
      step: '3',
      title: 'Practice In Training Drills',
      description: 'Test Your Range Retention In Live Solver-Graded Decision Scenarios With Instant EV Loss Feedback.',
    },
  ];

  const faqs = [
    {
      question: 'Are Smarter.Poker Preflop Charts Based on Real GTO Solvers?',
      answer: 'Yes. All Ranges Are Computed Using Advanced Game Theory Optimal Equilibrium Solutions Across Standard Rake And MTT Structures.',
    },
    {
      question: 'Can I Use Preflop Charts On My Phone While Playing?',
      answer: 'Yes. The Preflop Matrix Is Mobile-Optimized For Fast Loading And Instant One-Tap Lookups In Safari And Chrome.',
    },
    {
      question: 'Do I Need to Pay A Subscription For Deep-Stack Ranges?',
      answer: 'No. All Stack Depths From 15BB Short-Stack Up To 100BB Deep-Stack Cash Are 100% Free With Zero Paywalls.',
    },
  ];

  return (
    <FeatureLanderLayout
      title="GTO Preflop Charts and Solution Matrix"
      metaTitle="GTO Preflop Charts and Solution Matrix | Smarter.Poker"
      description="Explore 100% Free GTO Preflop Range Charts Across 15BB To 100BB Stacks For Cash Games And MTTs With Push-Fold, 3-Bet, And Defense Frequencies."
      canonical="/features/preflop-charts-matrix"
      badgeText="100% Free GTO Preflop Solution Grids"
      primaryCtaText="Explore Preflop Charts"
      primaryCtaHref="/hub/preflop-charts"
      secondaryCtaText="View Plain-Text Spec"
      secondaryCtaHref="/features/preflop-charts-matrix.md"
      markdownUrl="https://smarter.poker/features/preflop-charts-matrix.md"
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
    const { renderPreflopChartsMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderPreflopChartsMarkdown();
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
