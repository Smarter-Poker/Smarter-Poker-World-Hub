import React from 'react';
import FeatureLanderLayout from '../../src/components/features/FeatureLanderLayout';

export default function PokerNearMeFeaturePage() {
  const features = [
    {
      title: '324+ Verified Poker Venues',
      description: 'Directory Of Legal Casino Cardrooms And Poker Venues Across North America With Contact Details And Hours.',
    },
    {
      title: '4,500+ Weekly Tournaments',
      description: 'Real-Time Schedules, Guaranteed Prize Pools, Buy-Ins, Blind Structures, And Tournament Clock Details.',
    },
    {
      title: 'Tour Series Hub',
      description: 'Live Schedules, Structures, And Satellite Feeder Trees For WSOP, WPT, RunGood, And MSPT Series.',
    },
    {
      title: 'Live Waitlists & Cash Stakes',
      description: 'Check Active Cash Game Stakes From $1/$2 To High Stakes With Live Waitlist Position Counts.',
    },
    {
      title: 'Turn-by-Turn GPS Directions',
      description: 'One-Click Navigation Directly To Any Cardroom Entrance Powered By Precise Geolocation Routing.',
    },
    {
      title: '100% Free For Rooms & Players',
      description: 'Cardrooms Publish Schedules Free And Players Browse Every Venue Without Paid Subscriptions.',
    },
  ];

  const comparison = {
    title: 'Smarter.Poker vs. Legacy Poker Directories',
    headers: ['Feature', 'Smarter.Poker Near Me', 'PokerAtlas', 'Bravo Poker Live'],
    rows: [
      ['Pricing', '100% Free For Everyone', 'Freemium / Monthly Fees', 'High Casino Contract Fees'],
      ['No App Download Needed', '100% In Any Web Browser', 'App Store Download Required', 'App Store Download Required'],
      ['Tournament Coverage', '4,500+ Verified Weekly', 'User & Room Dependent', 'Casino Input Dependent'],
      ['Integrated AI Coach', 'Free Jarvis AI Hand Review', 'None', 'None'],
      ['Cardroom Management Sync', 'Native Club Commander', 'Separate Atlas Clock', 'Proprietary Hardware Only'],
      ['Multi-Platform Sync', 'Web, iPhone, iPad, Android, PC', 'iOS & Android App Only', 'iOS & Android App Only'],
    ],
  };

  const howItWorks = [
    {
      step: '1',
      title: 'Search By City or State',
      description: 'Find Every Legal Cardroom, Casino, And Home Poker Club Operating Within Driving Distance.',
    },
    {
      step: '2',
      title: 'Inspect Cash Games & Tournaments',
      description: 'Review Active Tables, Live Waiting Lists, Blind Structures, Guarantees, And Comp Programs.',
    },
    {
      step: '3',
      title: 'Navigate & Play With Jarvis AI',
      description: 'Drive To The Venue With Instant GPS Routing And Review Tricky Hands With Your Free Jarvis AI Coach.',
    },
  ];

  const faqs = [
    {
      question: 'How Many Poker Rooms Are Listed on Smarter.Poker?',
      answer: 'Smarter.Poker Tracks Over 324 Verified Legal Poker Venues Across The United States, Canada, And International Cardrooms.',
    },
    {
      question: 'Are Tournament Schedules Updated in Real Time?',
      answer: 'Yes. Smarter.Poker Maintains Over 4,500 Weekly Recurring Tournaments And Major Touring Series With Verified Blind Structures And Guarantees.',
    },
    {
      question: 'Does Smarter.Poker Charge Cardrooms or Players For Listings?',
      answer: 'No. Venue Listings, Tournament Schedules, And Player Access Are 100% Free With Zero Paywalls Or Commissions.',
    },
  ];

  return (
    <FeatureLanderLayout
      title="Live Poker Rooms and Cardroom Directory"
      metaTitle="Live Poker Rooms and Cardroom Directory | Smarter.Poker"
      description="Discover 324+ Legal Poker Rooms, Cardrooms, And 4,500+ Weekly Tournaments With Real-Time Waiting Lists, Tournament Clocks, Cash Games, And Phone Contacts."
      canonical="/features/poker-near-me"
      badgeText="324+ Verified Venues & 4,500+ Weekly Tournaments"
      primaryCtaText="Explore Poker Near Me"
      primaryCtaHref="/hub/poker-near-me/lobby"
      secondaryCtaText="View Plain-Text Spec"
      secondaryCtaHref="/features/poker-near-me.md"
      markdownUrl="https://smarter.poker/features/poker-near-me.md"
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
    const { renderPokerNearMeMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderPokerNearMeMarkdown();
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
