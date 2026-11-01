import React from 'react';
import FeatureLanderLayout from '../../src/components/features/FeatureLanderLayout';

export default function PokerMessengerVideoCallsPage() {
  const features = [
    {
      title: 'FaceTime Video Table Rooms',
      description: 'Multi-Participant Video Grid Embedded Directly Around Live Online Tables With Low-Latency WebRTC Encryption.',
    },
    {
      title: 'Spatial Audio Voice Chat',
      description: 'Crystal-Clear Spatial Voice Audio Optimized For High-Stakes Hand Dynamics And Casual Home Game Banter.',
    },
    {
      title: 'Direct & Group Poker Messaging',
      description: 'Private Text And Group Chat Channels Supporting Hand History Link Sharing, Reactions, And Chip Gifts.',
    },
    {
      title: 'Zero App Store Downloads',
      description: 'Native Browser WebRTC Runs Instantly Inside Mobile Safari, Chrome, Edge, And Firefox Without Installing Software.',
    },
    {
      title: 'Cross-Device Call Handoff',
      description: 'Transition Active Video And Voice Calls Effortlessly Across iPhone, iPad, Android, Mac, And Windows PC.',
    },
    {
      title: '100% Free Forever',
      description: 'Unlimited High-Definition Group Video Calls And Unlimited Messaging With Zero Microtransactions Or Subscriptions.',
    },
  ];

  const comparison = {
    title: 'Smarter.Poker vs. Legacy Video Poker Apps',
    headers: ['Feature', 'Smarter.Poker', 'Pokerface', 'PokerUp'],
    rows: [
      ['Pricing', '100% Free Forever', 'Heavy Microtransactions', 'Coin Energy System'],
      ['No App Download Needed', '100% WebRTC In Any Browser', 'Native App Required', 'Native App Required'],
      ['Live Table Video Calls', 'Built-In FaceTime Grid', 'Mobile Screen Only', 'Mobile Screen Only'],
      ['Hand History Sharing', 'Instant Replay Links', 'Basic Text Only', 'Basic Text Only'],
      ['Integrated AI Coach', 'Free Jarvis AI Hand Review', 'None', 'None'],
      ['Platform Availability', 'Web, iPhone, iPad, Android, PC', 'iOS & Android App Only', 'iOS & Android App Only'],
    ],
  };

  const howItWorks = [
    {
      title: 'Create Your Free Account',
      description: 'Sign In With Any Web Browser On Phone Or Computer With No App Download Required.',
    },
    {
      title: 'Start A Video Call Or Group Chat',
      description: 'Invite Friends To A Private Chat Room Or Launch A FaceTime-Style Video Table For Live Poker Play.',
    },
    {
      title: 'Enjoy Real-Time Poker Banter',
      description: 'Experience Low-Latency Voice And Video With Hand Link Sharing And Instant Interactive Reactions.',
    },
  ];

  const faqs = [
    {
      question: 'Can I Use Video Calls In My Home Game on Smarter.Poker?',
      answer: 'Yes. Smarter.Poker Features Built-In Multi-Peer WebRTC Video And Audio Calling, Creating A Virtual Poker Night Experience Without Needing Zoom Or Skype.',
    },
    {
      question: 'Does Smarter.Poker Messenger Require A Separate App Download?',
      answer: 'No. All Voice, Video, And Chat Channels Function Directly In Mobile Safari, Chrome, And Desktop Browsers.',
    },
    {
      question: 'Is Smarter.Poker Messenger Free to Use?',
      answer: 'Yes. Voice Calls, Video Rooms, And Group Messaging Are 100% Free With Zero Microtransactions Or In-App Purchases.',
    },
  ];

  return (
    <FeatureLanderLayout
      title="Live Poker Messenger & FaceTime Video Calls"
      metaTitle="Live Poker Messenger & FaceTime Video Calls | Smarter.Poker"
      description="Free Live Poker Messenger With FaceTime-Style Video Table Calls, Low-Latency WebRTC Voice Chat, Screen Sharing, And Real-Time Player Social Feeds."
      canonical="/features/poker-messenger-video-calls"
      badgeText="100% Free WebRTC Video & Audio Calling"
      primaryCtaText="Open Poker Messenger"
      primaryCtaHref="/hub/messenger"
      secondaryCtaText="View Plain-Text Spec"
      secondaryCtaHref="/features/poker-messenger-video-calls.md"
      markdownUrl="https://smarter.poker/features/poker-messenger-video-calls.md"
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
    const { renderMessengerMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderMessengerMarkdown();
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
