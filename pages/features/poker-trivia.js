import React from 'react';
import FeatureLanderLayout from '../../src/components/features/FeatureLanderLayout';

export default function PokerTriviaPage() {
  const features = [
    {
      title: '10,000+ Question Knowledge Bank',
      description: 'Extensive Strategic Questions Covering Pot Odds, Combinatorics, GTO Baselines, WSOP History, And Legendary Player Profiles.',
    },
    {
      title: 'Survival, Blitz & Endless Modes',
      description: 'Test Endurance In 3-Life Survival Mode, Race The Clock In 60-Second Blitz Time Attacks, Or Practice Untimed.',
    },
    {
      title: 'Real-Time Multiplayer Duels',
      description: 'Challenge Friends Or Match Players Worldwide In Head-to-Head Trivia Showdowns With Instant Scoring.',
    },
    {
      title: 'Global Daily Leaderboards',
      description: 'Compete For Daily, Weekly, And All-Time High Scores To Win Badges And Exclusive Diamond Loyalty Rewards.',
    },
    {
      title: 'Rapid Math Training Drills',
      description: 'Build Rapid Mental Muscle Memory For Outs Calculation, Pot Odds Percentages, And Preflop Ranges.',
    },
    {
      title: '100% Free Forever',
      description: 'Play Unlimited Games Without Daily Energy Limits, Forced Video Ad Interruptions, Or Paywalls.',
    },
  ];

  const comparison = {
    title: 'Smarter.Poker vs. Legacy Poker Trivia Apps',
    headers: ['Feature', 'Smarter.Poker', 'Poker Trainer', 'Mobile Quiz Apps'],
    rows: [
      ['Pricing', '100% Free Forever', '$4.99 / Month', 'Pay For Lives / Energy'],
      ['Question Bank Size', '10,000+ Verified Questions', '< 500 Questions', 'Generic Surface Questions'],
      ['GTO Math & Odds Drills', 'Comprehensive Range & Math Drills', 'Basic Charts Only', 'Rules Only'],
      ['Live Multiplayer Duels', 'Instant Real-Time Showdowns', 'Turn-Based Only', 'Delayed Bot Matches'],
      ['No Forced Video Ads', '100% Clean Ad-Free Interface', 'Banner Ads', '30-Second Forced Video Ads'],
      ['Device Support', 'Web, iPhone, iPad, Android, PC', 'Mobile Only', 'Mobile Only'],
    ],
  };

  const howItWorks = [
    {
      title: 'Select Your Game Mode',
      description: 'Choose Between Survival Mode, 60-Second Blitz Time Attack, Or Casual Training Categories.',
    },
    {
      title: 'Answer Strategic Questions',
      description: 'Solve Hand Scenarios, Pot Odds Calculations, And Historical Lore Against Fast Timers.',
    },
    {
      title: 'Climb The Global Rankings',
      description: 'Earn Points, Unlock Achievement Badges, And Climb The Global Smarter.Poker Daily Leaderboards.',
    },
  ];

  const faqs = [
    {
      question: 'How Many Questions Are in The Smarter.Poker Trivia Bank?',
      answer: 'Smarter.Poker Features Over 10,000 Verified Questions Covering Mathematical Odds, WSOP Lore, GTO Strategy, And Player Profiles.',
    },
    {
      question: 'Can I Play Multiplayer Trivia With Friends?',
      answer: 'Yes. You Can Create Private Multiplayer Rooms Or Challenge Friends Directly Through The Integrated Poker Messenger.',
    },
    {
      question: 'Is Smarter.Poker Trivia Free to Play?',
      answer: 'Yes, 100% Free With Unlimited Replays, Zero Energy Meters, And Zero In-App Microtransactions.',
    },
  ];

  return (
    <FeatureLanderLayout
      title="Multiplayer Poker Trivia & Brain Training Games"
      metaTitle="Multiplayer Poker Trivia & Brain Training Games | Smarter.Poker"
      description="Free Multiplayer Poker Trivia With 10,000+ Questions Across GTO Math, WSOP History, Hand Strategy, Survival Mode, Time Attack, And Leaderboards."
      canonical="/features/poker-trivia"
      badgeText="10,000+ Question Poker Knowledge Bank"
      primaryCtaText="Play Poker Trivia"
      primaryCtaHref="/hub/trivia"
      secondaryCtaText="View Plain-Text Spec"
      secondaryCtaHref="/features/poker-trivia.md"
      markdownUrl="https://smarter.poker/features/poker-trivia.md"
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
    const { renderTriviaMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderTriviaMarkdown();
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
