import React from 'react';
import FeatureLanderLayout from '../../src/components/features/FeatureLanderLayout';

export default function HomePokerGamesPage() {
  const features = [
    {
      title: 'Verified Host Identity Profiles',
      description: 'Host Identity Badges, Host Reputation Scores, And Community Player Reviews Ensure Safe, Transparent Poker Environments.',
    },
    {
      title: 'Comprehensive Blind Structures',
      description: 'Preview Exact Blind Levels, Buy-In Minimums And Maximums, Game Variants (NLH, PLO, Mixed), And Refreshment Amenities.',
    },
    {
      title: 'City & State Local Discovery',
      description: 'Fast Geographic Search Allowing Players To Find Private Games And Friendly Poker Leagues Across Hundreds Of US Cities.',
    },
    {
      title: 'Integrated Waitlists & SMS Alerts',
      description: 'RSVP In Advance And Receive Automatic Text Alerts The Moment An Open Seat At The Table Becomes Available.',
    },
    {
      title: 'Built-In Host Operating Tools',
      description: 'Hosts Enjoy Free Digital Tournament Clocks, Blind Structure Builders, And Chip Denomination Distribution Calculators.',
    },
    {
      title: '100% Free For Hosts & Players',
      description: 'Zero Listing Fees For Organizers, Zero Reservation Fees For Players, And Zero Rake With Zero Cut Taken.',
    },
  ];

  const comparison = {
    title: 'Smarter.Poker vs. Legacy Home Game Directories',
    headers: ['Feature', 'Smarter.Poker', 'Meetup', 'HomePokerGames'],
    rows: [
      ['Pricing', '100% Free Forever', 'Monthly Organizer Fees', 'Basic Free Directory'],
      ['Host Verification Badges', 'Identity Verified & Vetted', 'Self-Reported Profiles', 'Unverified Forum Posts'],
      ['Integrated Blind Clocks', 'Built-In Tournament Clocks', 'None', 'None'],
      ['Automated Two-Way SMS', 'Real-Time Seat Alerts', 'Email Notifications Only', 'Email Only'],
      ['Integrated AI Coach', 'Free Jarvis AI Hand Review', 'None', 'None'],
      ['Platform Availability', 'Web, iPhone, iPad, Android, PC', 'Website & Mobile App', 'Desktop Website Only'],
    ],
  };

  const howItWorks = [
    {
      title: 'Find Local Games',
      description: 'Search By City Or Zip Code To Discover Active, Verified Home Games And Friendly Leagues Near You.',
    },
    {
      title: 'Review Game Structure & Rules',
      description: 'Examine Stakes, Minimum Buy-Ins, Game Formats, Host Reputation, And Venue House Rules.',
    },
    {
      title: 'RSVP And Join The Action',
      description: 'Reserve Your Seat Or Join The Digital Waitlist To Receive Instant SMS Notifications When A Seat Opens.',
    },
  ];

  const faqs = [
    {
      question: 'How Do I Find Safe Home Poker Games Near Me?',
      answer: 'Smarter.Poker Features Verified Host Profiles Where Hosts Are Identity-Verified And Endorsed By Community Members For Security And Fairness.',
    },
    {
      question: 'Is There Any Fee to List Or Join A Home Game?',
      answer: 'No. Smarter.Poker Home Games Directory Is 100% Free For Both Game Organizers And Participating Players.',
    },
    {
      question: 'Can Hosts Manage Waitlists And Blind Clocks on Smarter.Poker?',
      answer: 'Yes. Every Host Has Access To Built-In Tournament Clocks, Blind Structure Builders, And Automated SMS Player Waitlist Alerts.',
    },
  ];

  return (
    <FeatureLanderLayout
      title="Verified Home Poker Game Directory & Host Management"
      metaTitle="Verified Home Poker Game Directory & Host Management | Smarter.Poker"
      description="Find Verified Local Home Poker Games Near You, View Blind Structures, Host Reputations, Table Limits, And Manage Private Game Invites."
      canonical="/features/home-poker-games"
      badgeText="Verified Local Game Listings & Scheduling"
      primaryCtaText="Explore Home Poker Games"
      primaryCtaHref="/hub/home-games"
      secondaryCtaText="View Plain-Text Spec"
      secondaryCtaHref="/features/home-poker-games.md"
      markdownUrl="https://smarter.poker/features/home-poker-games.md"
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
    const { renderHomeGamesMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderHomeGamesMarkdown();
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
