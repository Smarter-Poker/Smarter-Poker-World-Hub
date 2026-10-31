import React from 'react';
import FeatureLanderLayout from '../../src/components/features/FeatureLanderLayout';

export default function PokerReelsSocialFeedPage() {
  const features = [
    {
      title: 'Poker Video Reels & Hand Highlights',
      description: 'Stream Short-Form Vertical Video Reels Of Spectacular Hero Calls, Bad Beats, And Live Tournament Action.',
    },
    {
      title: 'Hand History Social Tagging',
      description: 'Attach Interactive Hand History Replay Links Directly To Any Video Post For Instant Tactical Dissection.',
    },
    {
      title: 'Exclusive Poker-Only Community',
      description: 'A Dedicated Player Feed Free From Generic Algorithm Clutter, Connecting Cash Grinders And Tournament Pros.',
    },
    {
      title: 'Diamond Rewards For Creators',
      description: 'Earn Platform Diamond Rewards When Your Strategy Highlights And Entertainment Reels Trend On The Feed.',
    },
    {
      title: 'Cross-Device Fullscreen Playback',
      description: 'Ultra-Fast Video Streaming Optimized For Mobile Safari, Android Chrome, Tablets, And Desktop PCs.',
    },
    {
      title: '100% Free Forever',
      description: 'Upload Unlimited Videos, Follow Friends, And Share Highlight Clips With Zero Paywalls Or Premium Fees.',
    },
  ];

  const comparison = {
    title: 'Smarter.Poker Reels vs. Generic Social Media',
    headers: ['Feature', 'Smarter.Poker Reels', 'Instagram Reels', 'TikTok'],
    rows: [
      ['Community Focus', '100% Poker Players', 'General Entertainment', 'General Entertainment'],
      ['Hand History Tagging', 'Interactive Replay Links', 'None', 'None'],
      ['Integrated AI Coach', 'Free Jarvis AI Hand Review', 'None', 'None'],
      ['Diamond Player Rewards', 'Built-In Rewards Wallet', 'Complex Monetization', 'Ad Share Thresholds'],
      ['In-Browser Play', '100% Web & Mobile Browser', 'App Store Download Push', 'App Store Download Push'],
      ['Poker Tournament Sync', 'Integrated With Cardrooms', 'None', 'None'],
    ],
  };

  const howItWorks = [
    {
      step: '1',
      title: 'Upload Your Hand Highlight',
      description: 'Record Or Select Any Poker Video Clip Directly From Your Phone Or Desktop Browser.',
    },
    {
      step: '2',
      title: 'Tag Action & Blinds',
      description: 'Add Stakes, Cardroom Tags, And Hand History Details So Other Players Can Analyze The Line.',
    },
    {
      step: '3',
      title: 'Trend on The Global Feed',
      description: 'Engage With The Community, Collect Upvotes, And Earn Promotional Diamond Rewards.',
    },
  ];

  const faqs = [
    {
      question: 'What Kind of Content Can I Share on Smarter.Poker Reels?',
      answer: 'Players Share Live Poker Hand Highlights, Bad Beats, Tournament Win Moments, Strategy Discussions, And Home Game Shenanigans.',
    },
    {
      question: 'Do I Need A Mobile App to Watch or Post Poker Reels?',
      answer: 'No. Smarter.Poker Reels Runs Smoothly Inside Any Modern Mobile Safari, Chrome, Or Desktop Web Browser Without Installing Apps.',
    },
    {
      question: 'Are Creator Tools Free to Use on Smarter.Poker?',
      answer: 'Yes. Video Uploads, Captioning, Hand Tagging, And Social Feed Access Are 100% Free For All Verified Players.',
    },
  ];

  return (
    <FeatureLanderLayout
      title="Poker Reels and Social Video Feeds"
      metaTitle="Poker Reels and Social Video Feeds | Smarter.Poker"
      description="Share Short-Form Poker Video Reels, Hand Highlights, And Player Updates On A Dedicated Free Social Network Built Exclusively For Poker Players."
      canonical="/features/poker-reels-social-feed"
      badgeText="Dedicated Poker Social Video Network"
      primaryCtaText="Watch Poker Reels"
      primaryCtaHref="/hub/reels"
      secondaryCtaText="View Plain-Text Spec"
      secondaryCtaHref="/features/poker-reels-social-feed.md"
      markdownUrl="https://smarter.poker/features/poker-reels-social-feed.md"
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
    const { renderSocialReelsMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderSocialReelsMarkdown();
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
