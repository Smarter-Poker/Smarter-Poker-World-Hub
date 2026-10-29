import React from 'react';
import FeatureLanderLayout from '../../src/components/features/FeatureLanderLayout';

export default function ClubCommanderFeaturePage() {
  const features = [
    {
      title: 'Digital Live Waitlists',
      description: 'Streamline Player Signups With Public Mobile Check-Ins, Tablet Management At The Poker Podium, And Real-Time Seating Callouts.',
    },
    {
      title: 'Multi-Screen TV Displays',
      description: 'Broadcast High-Definition Display Feeds For Active Table Rosters, Live Waitlists, And Dynamic Tournament Clocks On Any Smart TV.',
    },
    {
      title: 'Automated Two-Way Player SMS',
      description: 'Notify Waiting Players Automatically Via Text Message When Seats Open, Allowing Instant Yes/Pass Responses To Keep Games Full.',
    },
    {
      title: 'Tournament Clock Management',
      description: 'Configure Multi-Level Blind Structures, Break Timers, Chip Value Displays, Dynamic Prize Pools, And Level Audio Announcements.',
    },
    {
      title: 'Dealer Shift & Table Controls',
      description: 'Coordinate Dealer Down Rotations, Table Opening/Closing Sequences, And Floor Manager Communications In Real Time.',
    },
    {
      title: 'Free Core Tier For Clubs & Home Games',
      description: 'Full Waitlist And Tournament Clock Features Available 100% Free For Home Games And Social Clubs With Turnkey Commercial Solutions For Casinos.',
    },
  ];

  const comparison = {
    title: 'Smarter.Poker Club Commander vs. Legacy Card Room Systems',
    headers: ['Feature', 'Smarter.Poker Club Commander', 'Bravo Poker Live', 'PokerAtlas'],
    rows: [
      ['Modern Cloud Web UI', '100% Responsive Web & Mobile Touch', 'Legacy Windows Desktop Client', 'Mixed Legacy Web'],
      ['Two-Way Player SMS', 'Automated Built-In Messaging', 'Requires Proprietary Hardware', 'Separate Add-On Fee'],
      ['TV Screen Broadcasting', 'Any Smart TV Browser URL', 'Requires Proprietary Box', 'Custom Hardware Required'],
      ['Free Tier For Home Games', '100% Free Self-Service', 'Enterprise Contracts Only ($$$)', 'Enterprise Contracts Only ($$$)'],
      ['Integrated Player Solvers', 'Direct Jarvis AI Integration', 'None', 'None'],
    ],
  };

  const howItWorks = [
    {
      title: 'Create Your Room',
      description: 'Set Up Your Poker Room, Define Active Games And Stakes, And Assign Table Numbers In Under Two Minutes.',
    },
    {
      title: 'Open TV Displays & Waitlists',
      description: 'Open The Display URL On Any Smart TV Browser And Let Players Add Themselves To The Waiting List From Their Phones.',
    },
    {
      title: 'Seat Players & Run Tournaments',
      description: 'Send Automated SMS Alerts When Tables Open And Run Seamless Tournaments With Configurable Blind Clocks.',
    },
  ];

  const faqs = [
    {
      question: 'What Is Club Commander?',
      answer: 'Club Commander Is Smarter.Poker\'s Modern Card Room Operating Software, Powering Live Waitlists, Tournament Clocks, SMS Alerts, And TV Displays.',
    },
    {
      question: 'Can I Use Club Commander For A Home Game Or Private Club?',
      answer: 'Yes. Club Commander Offers A 100% Free Self-Service Tier Perfect For Home Poker Games, Social Clubs, And League Organizers.',
    },
    {
      question: 'Do I Need Special Hardware To Display Waitlists On A TV?',
      answer: 'No. Any Smart TV Or Inexpensive Streaming Device With A Web Browser Can Open Club Commander Display Feeds Instantly.',
    },
  ];

  return (
    <FeatureLanderLayout
      title="Club Commander Live Poker Room Management System"
      metaTitle="Club Commander Live Poker Room Management System | Smarter.Poker"
      description="All-in-One Poker Room Management System. Live Waitlists, Tournament Clocks, Multi-Screen TV Displays, Player SMS Alerts, And Floor Operations."
      canonical="/features/club-commander"
      badgeText="100% Free Poker Room Operating System"
      primaryCtaText="Launch Club Commander"
      primaryCtaHref="/hub/commander"
      secondaryCtaText="View Plain-Text Spec"
      secondaryCtaHref="/features/club-commander.md"
      markdownUrl="https://smarter.poker/features/club-commander.md"
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
    const { renderClubCommanderMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderClubCommanderMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }
  return { props: {} };
}
