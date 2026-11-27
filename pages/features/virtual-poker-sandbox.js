import React from 'react';
import FeatureLanderLayout from '../../src/components/features/FeatureLanderLayout';
import { setPublicSeoHtmlCache } from '../../src/lib/seo/edgeCacheHeaders.mjs';

export default function VirtualPokerSandboxPage() {
  const features = [
    {
      title: 'Post-Session Hand Analysis',
      description: 'Audit Completed Club Arena And Live Cash Or Tournament Hands Street By Street With Deterministic Leak Detection And Evidence-Backed Reviews.',
    },
    {
      title: 'Automated Leak Finder',
      description: 'Surface Recurring Positional, Street, And Bet-Sizing Leaks Across Your Hand History With Clear Severity Priority And Direct Drill Paths.',
    },
    {
      title: 'Audited Spot Study & GTO Drills',
      description: 'Turn Audited Hand Decisions Into Focused Practice Drills Grounded In Verified Pre-Solved Baselines And Spaced-Repetition Mastery Tracking.',
    },
    {
      title: 'Multiway Poker Odds Calculator',
      description: 'Calculate Exact Flop-To-River Win, Tie, And Split-Pot Equities For Texas Hold\'em, PLO-4, PLO-5, PLO-6, Stud, And Razz With Dead-Card Filtering.',
    },
    {
      title: 'Stateless Hand Review & Privacy Controls',
      description: 'Generate Clean Read-Only Hand Review Snapshots With Default Villain Anonymization And Opt-In Hole-Card Visibility.',
    },
    {
      title: 'Zero Download Browser Workspace',
      description: 'Runs Directly In All Modern Desktop, iPhone, iPad, And Android Browsers With Zero Native Installers And 100% Free Access.',
    },
  ];

  const comparison = {
    title: 'Smarter.Poker Study Lab vs. Legacy Desktop Tools',
    headers: ['Capability', 'Smarter.Poker', 'Flopzilla / Equilab', 'Legacy Suites'],
    rows: [
      ['Pricing', '100% Free Forever', '$35 License / Free Tool', '$50 - $100+ / Year'],
      ['Post-Session Leak Audit', 'Automated Leak Finder', 'Manual Range Entry Only', 'Separate Paid Tracker'],
      ['Multiway Odds Engine', 'Exact Multiway Web Calculator', 'Windows Desktop Only', 'Desktop Only'],
      ['Spot Study & Drills', 'Audited Spot Study & GTO Drills', 'No Built-In Drills', 'Separate Subscription'],
      ['Hand Review Workflow', 'Stateless Hand Review & Leak Audit', 'File Export Only', 'Proprietary Files Only'],
      ['Mobile Compatibility', 'iPhone, iPad, Android Web', 'Windows Desktop Only', 'Desktop Only'],
    ],
  };

  const howItWorks = [
    {
      title: 'Audit Completed Hands In Leak Finder',
      description: 'Open Personal Assistant Leak Finder To Review Completed Club Arena Hands, Import External Hand Histories, Or Log A Live Spot In Seconds.',
    },
    {
      title: 'Verify Multiway Equities & Boards',
      description: 'Use The Free Poker Odds Calculator To Select Hole Cards, Flop/Turn/River Boards, And Dead Cards Across Up To 7 Players.',
    },
    {
      title: 'Drill Audited Spots & Track Mastery',
      description: 'Launch Verified Spot Study Drills Directly From Your Top Leaks And Track Your Improvement Across Sessions.',
    },
  ];

  const faqs = [
    {
      question: 'Can I Run Multiway All-In Scenarios In The Sandbox?',
      answer: 'Yes. Open The Free Poker Odds Calculator To Compute Multiway Win, Tie, And Split-Pot Equities For Up To 7 Players In Hold\'em (Or 4 In 5- And 6-Card Omaha) With Exact Flop-To-River Enumeration And Optional Dead Cards.',
    },
    {
      question: 'Is Smarter.Poker Post-Session Analysis And Odds Calculation Free?',
      answer: 'Yes. Personal Assistant Leak Finder, Audited Spot Study, Stateless Hand Review, And The Browser Poker Odds Calculator Are 100% Free With Zero Download Required.',
    },
    {
      question: 'How Do I Review Hands With Personal Assistant?',
      answer: 'Open Personal Assistant Leak Finder To Audit Completed Club Arena Or Live Hands, Practice Your Top Leaks, And Create Stateless Hand Review Links With Default Villain Anonymization And Hole-Card Privacy.',
    },
  ];

  return (
    <div className="virtual-sandbox-lander" data-testid="virtual-sandbox-lander">
      <FeatureLanderLayout
        title="Virtual Poker Study Lab, Leak Finder & Odds Calculator"
        metaTitle="Virtual Poker Study Lab, Leak Finder & Odds Calculator | Smarter.Poker"
        description="Post-Session Hand Analysis, Automated Leak Finder, Audited Spot Study, And A Free Multiway Poker Odds Calculator In Any Web Browser."
        canonical="/features/virtual-poker-sandbox"
        badgeText="100% Free Poker Study Lab"
        primaryCtaText="Open Poker Odds Calculator"
        primaryCtaHref="/tools/poker-odds-calculator"
        secondaryCtaText="Open Leak Finder"
        secondaryCtaHref="/hub/personal-assistant/leaks"
        markdownUrl="https://smarter.poker/features/virtual-poker-sandbox.md"
        features={features}
        comparison={comparison}
        howItWorks={howItWorks}
        faqs={faqs}
      />
      <style jsx global>{`
        .virtual-sandbox-lander,
        .virtual-sandbox-lander main {
          width: 100%;
          max-width: 100vw;
          overflow-x: clip;
          box-sizing: border-box;
        }
        .virtual-sandbox-lander article,
        .virtual-sandbox-lander section,
        .virtual-sandbox-lander header,
        .virtual-sandbox-lander footer,
        .virtual-sandbox-lander div {
          max-width: 100%;
          min-width: 0;
          box-sizing: border-box;
        }
        .virtual-sandbox-lander nav[aria-label="Breadcrumb"],
        .virtual-sandbox-lander section > div,
        .virtual-sandbox-lander footer > div {
          flex-wrap: wrap !important;
        }
        .virtual-sandbox-lander section > div:has(> table) {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          max-width: 100%;
        }
        .virtual-sandbox-lander table {
          width: 100%;
          min-width: 640px;
          table-layout: fixed;
          border-collapse: collapse;
        }
        .virtual-sandbox-lander th,
        .virtual-sandbox-lander td {
          min-width: 140px;
          overflow-wrap: break-word;
          word-break: normal;
          white-space: normal;
        }
        .virtual-sandbox-lander pre {
          max-width: 100%;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .virtual-sandbox-lander header a {
          display: inline-flex !important;
          align-items: center;
          justify-content: center;
          min-height: 44px;
        }
        .virtual-sandbox-lander button,
        .virtual-sandbox-lander [aria-label="Solved Spot Permalink And Instant Share Bar"] a,
        .virtual-sandbox-lander section[aria-label="Cite Or Link To This Research"] button,
        .virtual-sandbox-lander section[aria-label="Cite Or Link To This Research"] a {
          font-size: 12px !important;
        }
        .virtual-sandbox-lander a:focus-visible,
        .virtual-sandbox-lander button:focus-visible {
          outline: 2px solid #83deff;
          outline-offset: 2px;
        }
        @media (max-width: 768px) {
          .virtual-sandbox-lander article {
            padding-left: 14px !important;
            padding-right: 14px !important;
          }
          .virtual-sandbox-lander th,
          .virtual-sandbox-lander td {
            padding: 10px 12px !important;
            font-size: 13px !important;
          }
        }
      `}</style>
    </div>
  );
}

export async function getServerSideProps({ req, res, query }) {
  const acceptHeader = String(req?.headers?.accept || '');
  const isMarkdownRequested =
    acceptHeader.includes('text/markdown') ||
    query?.format === 'md' ||
    req?.url?.includes('format=md');

  if (isMarkdownRequested) {
    const { renderVirtualSandboxMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderVirtualSandboxMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }
  setPublicSeoHtmlCache(res);
  return { props: {} };
}
