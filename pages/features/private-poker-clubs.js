import React from 'react';
import FeatureLanderLayout from '../../src/components/features/FeatureLanderLayout';

export default function PrivatePokerClubsFeaturePage() {
  const features = [
    {
      title: 'Custom Ring Games & Tournaments',
      description: 'Host No-Limit Holdem, PLO4, PLO5, PLO6, And Mixed Games With Custom Blind Structures And Straddles.',
    },
    {
      title: 'Multi-Club Union Arena',
      description: 'Connect Independent Poker Clubs Into Shared Liquidity Unions With Unified Player Tables And Multi-Club MTTs.',
    },
    {
      title: 'FaceTime Video Table Rooms',
      description: 'Embedded Multi-Peer WebRTC Video And Audio Calling Directly Surrounding The Live Felt With Spatial Clarity.',
    },
    {
      title: 'Hierarchical Cashier Auditing',
      description: 'Multi-Tiered Sub-Agent Management With Automated Rakeback Splits, Credit Tracking, And Real-Time Ledger Logs.',
    },
    {
      title: 'Zero App Store Downloads',
      description: 'Instant Browser-Native WebRTC Runs Smoothly Inside Safari, Chrome, Edge, And Firefox On Any Device.',
    },
    {
      title: 'Zero Diamond Currency Markups',
      description: '100% Free Cloud Infrastructure Without Predatory Diamond Microtransactions Or Recurring Table Rental Fees.',
    },
  ];

  const comparison = {
    title: 'Smarter.Poker vs. Legacy Private Poker Club Apps',
    headers: ['Feature', 'Smarter.Poker Arena', 'PokerBros', 'PPPoker'],
    rows: [
      ['Platform Cost', '100% Free Cloud Software', 'Costly Diamond Purchases', 'Costly Diamond Purchases'],
      ['No App Download Needed', '100% In Any Web Browser', 'Native App Required', 'Native App Required'],
      ['Table Video Calls', 'Built-In FaceTime WebRTC', 'None', 'None'],
      ['Rakeback Audit Logs', 'Real-Time Hierarchical Ledger', 'Manual Spreadsheets', 'Manual Spreadsheets'],
      ['Integrated AI Coach', 'Free Jarvis AI Hand Review', 'None', 'None'],
      ['Platform Availability', 'Web, iPhone, iPad, Android, PC', 'Mobile App Only', 'Mobile App Only'],
    ],
  };

  const howItWorks = [
    {
      step: '1',
      title: 'Create Your Poker Club In Seconds',
      description: 'Choose Your Club Name, Set Up Ring Games Or Tournaments, And Customize Blind Levels And Antes.',
    },
    {
      step: '2',
      title: 'Invite Members or Join Unions',
      description: 'Share Direct Club Invitation Links Or Connect Your Club To A Regional Union For Maximum Table Liquidity.',
    },
    {
      step: '3',
      title: 'Host Games With Live FaceTime Felt',
      description: 'Deal Custom Games With Built-In Video Chat, Anti-Collusion Protections, And Instant Hand History Links.',
    },
  ];

  const faqs = [
    {
      question: 'How Much Does It Cost to Create A Poker Club on Smarter.Poker?',
      answer: 'Creating A Private Poker Club On Smarter.Poker Is 100% Free. There Are Zero Table Fees, Zero Diamond Currency Costs, And Zero Hosting Charges.',
    },
    {
      question: 'Can Multiple Poker Clubs Form A Union?',
      answer: 'Yes. Smarter.Poker Club Arena Supports Multi-Club Unions Where Independent Clubs Share Table Liquidity While Maintaining Isolated Cashier Balances.',
    },
    {
      question: 'Do Club Members Need to Download An App to Play?',
      answer: 'No. Smarter.Poker Runs Directly In Modern Mobile And Desktop Web Browsers (Safari, Chrome, Firefox, Edge) With Low Latency And Full Video Support.',
    },
  ];

  return (
    <FeatureLanderLayout
      title="Private Poker Clubs and Union Hosting"
      metaTitle="Private Poker Clubs and Union Hosting | Smarter.Poker"
      description="Host Private Poker Clubs, Multi-Club Unions, Ring Games, And Tournaments With Built-In Rakeback, Hierarchical Cashiers, And FaceTime Table Calls."
      canonical="/features/private-poker-clubs"
      badgeText="100% Free Multi-Club Union Hosting"
      primaryCtaText="Launch Club Arena"
      primaryCtaHref="/hub/club-arena"
      secondaryCtaText="View Plain-Text Spec"
      secondaryCtaHref="/features/private-poker-clubs.md"
      markdownUrl="https://smarter.poker/features/private-poker-clubs.md"
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
    const { renderPrivatePokerClubsMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderPrivatePokerClubsMarkdown();
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
