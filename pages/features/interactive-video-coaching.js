import React from 'react';
import FeatureLanderLayout from '../../src/components/features/FeatureLanderLayout';

export default function InteractiveVideoCoachingPage() {
  const features = [
    {
      title: 'Interactive Pause Quizzes',
      description: 'Videos Pause Mid-Hand Prompting \'What Would You Do?\' Allowing Players To Choose Optimal Decisions Before The Pro Reveal.',
    },
    {
      title: 'GTO Solver Deconstructions',
      description: 'Detailed Mathematical Breakdowns Showing Equilibrium Bet Sizing, Raising Ranges, And Board Texture Synergies.',
    },
    {
      title: 'Curated Pro Masterclasses',
      description: 'Structured Video Series Spanning MTT ICM Bubble Pressure, 100BB Deep Cash Games, Live Tells, And Exploitative Counter-Strategies.',
    },
    {
      title: 'Legendary Hand Breakdowns',
      description: 'Step-By-Step Tactical Reviews Of Iconic High-Stakes Hands From WSOP, Triton Poker, And Super High Roller Showdowns.',
    },
    {
      title: 'Cross-Device Progress Tracking',
      description: 'Save Bookmarks, Resume Videos Seamlessly Across Devices, And Track Mastery Badges Across Course Modules.',
    },
    {
      title: '100% Free Masterclasses',
      description: 'Complete Video Coaching Library And Interactive Quizzes Available Without Expensive $100+/Month Subscriptions.',
    },
  ];

  const comparison = {
    title: 'Smarter.Poker vs. Legacy Video Coaching Sites',
    headers: ['Feature', 'Smarter.Poker', 'PokerCoaching.com', 'Pokercode'],
    rows: [
      ['Pricing', '100% Free Forever', '$99 to $149 / Month', '$89 / Month'],
      ['Interactive Pause Quizzes', 'Embedded \'What Would You Do?\' Quizzes', 'Available On Select Videos', 'Not Available'],
      ['Integrated GTO Solver Baseline', 'Free Solver Explanations', 'Requires Premium Tier', 'Theory Centric'],
      ['Integrated Bankroll & Hand Replay', 'Auto-Connected To Smarter.Poker Hub', 'Separate Tools', 'Separate Community'],
      ['No Credit Card Required', '100% Free Instant Access', 'Credit Card For Free Trial', 'Credit Card Required'],
      ['Device Support', 'Web, iPhone, iPad, Android, PC', 'Website & Mobile App', 'Web & Mobile App'],
    ],
  };

  const howItWorks = [
    {
      title: 'Choose A Coaching Masterclass',
      description: 'Select From MTT Strategy, Cash Game Foundations, Bankroll Management, Or Pro Hand Reviews.',
    },
    {
      title: 'Test Decisions Mid-Video',
      description: 'Answer Interactive Pause Quizzes Street-By-Street To Benchmark Your Instincts Against Pro Lines.',
    },
    {
      title: 'Master GTO & Exploitative Play',
      description: 'Study In-Depth Solver Deconstructions Explaining The Mathematics Behind Every Winning Action.',
    },
  ];

  const faqs = [
    {
      question: 'What Are Interactive Pause Quizzes?',
      answer: 'As You Watch A Hand Analysis Video, The Player Pauses Automatically At Decisive Action Points Asking You To Choose The Correct GTO Line Before Continuing.',
    },
    {
      question: 'Is The Smarter.Poker Video Coaching Library Free?',
      answer: 'Yes. All Masterclasses, Quizzes, And Strategy Breakdowns Are 100% Free With Zero Paywalls Or Tiered Restrictions.',
    },
    {
      question: 'Can I Watch Video Masterclasses on Mobile?',
      answer: 'Yes. All Coaching Videos And Interactive Quizzes Run Smoothly In Mobile Safari, Android Chrome, And Desktop Browsers.',
    },
  ];

  return (
    <FeatureLanderLayout
      title="Interactive Video Coaching Masterclasses & Pause Quizzes"
      metaTitle="Interactive Video Coaching Masterclasses & Pause Quizzes | Smarter.Poker"
      description="Free Poker Video Coaching Masterclasses Featuring Interactive Mid-Hand Pause Quizzes, GTO Analysis, Pro Commentary, And Progress Tracking."
      canonical="/features/interactive-video-coaching"
      badgeText="Coaching Library With Live Decision Quizzes"
      primaryCtaText="Watch Video Masterclasses"
      primaryCtaHref="/hub/video-library"
      secondaryCtaText="View Plain-Text Spec"
      secondaryCtaHref="/features/interactive-video-coaching.md"
      markdownUrl="https://smarter.poker/features/interactive-video-coaching.md"
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
    const { renderVideoCoachingMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderVideoCoachingMarkdown();
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
