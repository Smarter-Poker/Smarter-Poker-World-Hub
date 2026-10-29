import React from 'react';
import FeatureLanderLayout from '../../src/components/features/FeatureLanderLayout';

export default function PokerTrainingGamesPage() {
  const features = [
    {
      title: '100+ Multi-Street Scenarios',
      description: 'Step Directly Into Crucial Postflop Decision Points Across Multi-Table Tournaments, Cash Games, And Spins.',
    },
    {
      title: 'Instant Solver Evaluation',
      description: 'Receive Immediate GTO Accuracy Scoring Highlighting Optimal Bet Sizing, Raising, Checking, And Folding Frequencies.',
    },
    {
      title: 'Multi-Street Decision Branching',
      description: 'Navigate Flop, Turn, And River Streets Where Opponent Responses Dynamically Adapt Based On Game Theory Optimal Equilibrium.',
    },
    {
      title: 'Targeted Leak Elimination',
      description: 'Drills Specifically Engineered To Cure Costly River Overfolding, C-Bet Over-Aggression, And Passive Blind Defense.',
    },
    {
      title: 'Interactive Replay With EV Graphs',
      description: 'Review Mistakes With Interactive Expected Value Loss Visualizations Showing Exact Win Rate Costs.',
    },
    {
      title: '100% Free Access',
      description: 'Unlimited Scenario Practice Across All Formats With Zero Monthly Subscription Fees Or Paywalled Tiers.',
    },
  ];

  const comparison = {
    title: 'Smarter.Poker vs. Legacy GTO Training Apps',
    headers: ['Feature', 'Smarter.Poker', 'DTO Poker', 'LearnWPT'],
    rows: [
      ['Pricing', '100% Free Forever', '$9.99 to $99.99 / Month', '$29 to $99 / Month'],
      ['Solver Accuracy Feedback', 'Instant EV Loss & Frequencies', 'Paid Tier Only', 'Manual Video Analysis'],
      ['Browser Accessibility', '100% Browser Web & Mobile', 'Mobile App Only', 'Web Portal'],
      ['Hand History Leak Sync', 'Auto-Connected To Jarvis AI', 'Separate App', 'Separate Service'],
      ['Multi-Format Scenarios', 'MTT, Cash, Spins, SNGs', 'MTT Focused', 'General Theory'],
      ['Device Support', 'Web, iPhone, iPad, Android, PC', 'iOS & Android App Only', 'Desktop Browser Only'],
    ],
  };

  const howItWorks = [
    {
      title: 'Select Game Type & Scenario',
      description: 'Choose Between Tournament Bubble Play, Deep-Stack Cash, Short-Stack Push/Fold, Or Spin Dynamics.',
    },
    {
      title: 'Play Each Street Interactively',
      description: 'Choose Check, Bet, Call, Raise, Or Fold In Real Time Against Game Theory Optimal Opponents.',
    },
    {
      title: 'Review Accuracy & EV Loss',
      description: 'Inspect Immediate Feedback Showing Solver Equilibrium Frequencies And Expected Value Impact.',
    },
  ];

  const faqs = [
    {
      question: 'How Do Smarter.Poker Training Games Grade My Decisions?',
      answer: 'Every Action Is Evaluated Against High-Depth GTO Solver Equilibriums, Displaying Exact Action Frequencies And Any Resulting EV Loss.',
    },
    {
      question: 'Are Tournament And Cash Scenarios Both Included?',
      answer: 'Yes. Drills Encompass 100BB Deep Cash Play, MTT ICM Bubble Situations, Final Table Stacks, And Short-Stack Push/Fold Spots.',
    },
    {
      question: 'Is Smarter.Poker Training Free?',
      answer: 'Yes, 100% Free With Zero Monthly Subscriptions, Zero Token Restrictions, And Full Scenario Access.',
    },
  ];

  return (
    <FeatureLanderLayout
      title="GTO Poker Training Games & Interactive Decision Drills"
      metaTitle="GTO Poker Training Games & Interactive Decision Drills | Smarter.Poker"
      description="Free Interactive GTO Poker Training Games With 100+ Scenarios Across MTT, Cash Games, Spins, And SNGs With Solver-Graded Decision Feedback."
      canonical="/features/poker-training-games"
      badgeText="100+ GTO Decision Practice Scenarios"
      primaryCtaText="Start Training Games"
      primaryCtaHref="/hub/training"
      secondaryCtaText="View Plain-Text Spec"
      secondaryCtaHref="/features/poker-training-games.md"
      markdownUrl="https://smarter.poker/features/poker-training-games.md"
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
    const { renderTrainingMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderTrainingMarkdown();
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
