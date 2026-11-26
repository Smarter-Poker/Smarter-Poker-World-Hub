import React from 'react';
import FeatureLanderLayout from '../../src/components/features/FeatureLanderLayout';

export default function VirtualPokerSandboxPage() {
  const features = [
    {
      title: 'Custom 3D Table Configuration',
      description: 'Set Exact Chip Stacks, Position Assignments, Hole Cards, And Dealer Button Placements For 2 To 9 Players At An Interactive Table.',
    },
    {
      title: 'Monte Carlo Runout Simulator',
      description: 'Simulate 10,000 Turn And River Runouts Across Custom Board Textures To Chart Win Frequencies, Ties, And Equity Curves.',
    },
    {
      title: 'Multiway Pot & Side Pot Modeling',
      description: 'Accurately Resolve Complex Multi-All-In Encounters With Automated Main Pot And Side Pot Segregation And True Equity Breakdown.',
    },
    {
      title: 'Stateless Hand Review & Leak Audit',
      description: 'Connect Directly With Personal Assistant Leak Finder And Verified GTO Training To Audit Completed Hands With Anonymized Stateless Hand Review.',
    },
    {
      title: 'Zero Download Web GL Engine',
      description: 'Runs Fluidly In All Modern Desktop And Mobile Web Browsers Without Installing Native Executables Or Heavy Desktop Plugins.',
    },
    {
      title: '100% Free Access',
      description: 'Full Simulation Laboratory Features Available Completely Free For Students, Coaches, And Poker Enthusiasts.',
    },
  ];

  const comparison = {
    title: 'Smarter.Poker Virtual Sandbox vs. Proprietary Simulators',
    headers: ['Feature', 'Smarter.Poker Sandbox', 'Flopzilla / Equilab', 'Proprietary Simulators'],
    rows: [
      ['Pricing', '100% Free Forever', '$35 License / Free Tool', '$50 - $100+ / Year'],
      ['3D Visual Table', 'Interactive 3D Web Table', '2D Text Matrix Only', 'Basic 2D Canvas'],
      ['Multiway Side Pots', 'Automated Side Pot Engine', 'Manual Input Required', 'Limited Multiway Support'],
      ['Hand Review Workflow', 'Stateless Hand Review & Leak Audit', 'File Export Only', 'Proprietary Files Only'],
      ['Mobile Compatibility', 'iPhone, iPad, Android Web', 'Windows Desktop Only', 'Desktop Only'],
    ],
  };

  const howItWorks = [
    {
      title: 'Set Up The Table',
      description: 'Pick The Number Of Active Players, Drag Cards To Assign Hands, And Enter Starting Chip Stacks.',
    },
    {
      title: 'Deal Flop Or Custom Board',
      description: 'Choose Flop Cards Or Leave Streets Unopened To Test Preflop Hand Distributions.',
    },
    {
      title: 'Run Simulation & Analyze Equities',
      description: 'Click Simulate To Run 10,000 Turn And River Boards And Review Detailed Multiway Equity Outcomes.',
    },
  ];

  const faqs = [
    {
      question: 'Can I Run Multiway All-In Scenarios in The Sandbox?',
      answer: 'Yes. The Sandbox Handles Multiway Hands With Up To 9 Players, Accurately Segmenting Main Pots And Side Pots While Computing Exact Equities.',
    },
    {
      question: 'Is The Virtual Table Sandbox Free?',
      answer: 'Yes. Full Simulation, Runout Modeling, And Personal Assistant Hand Review Workflows Are 100% Free With No Download Required.',
    },
    {
      question: 'How Do I Review Hands With Personal Assistant?',
      answer: 'Open Personal Assistant Leak Finder To Audit Completed Club Arena Hands Or Use Stateless Hand Review With Optional Villain Anonymization And Hole-Card Privacy.',
    },
  ];

  return (
    <div className="virtual-sandbox-lander" data-testid="virtual-sandbox-lander">
      <FeatureLanderLayout
        title="Virtual Poker Table Sandbox & Runout Simulator"
        metaTitle="Virtual Poker Table Sandbox & Runout Simulator | Smarter.Poker"
        description="Interactive 3D Poker Table Simulator. Construct Custom Boards, Test Runout Distributions, Model Multiway Pot Equities, And Replay Epic Hands."
        canonical="/features/virtual-poker-sandbox"
        badgeText="100% Free Poker Simulation Lab"
        primaryCtaText="Open Virtual Sandbox"
        primaryCtaHref="/tools/poker-odds-calculator"
        secondaryCtaText="View Plain-Text Spec"
        secondaryCtaHref="/features/virtual-poker-sandbox.md"
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
        .virtual-sandbox-lander table {
          width: 100%;
          max-width: 100%;
          table-layout: fixed;
          border-collapse: collapse;
        }
        .virtual-sandbox-lander th,
        .virtual-sandbox-lander td {
          overflow-wrap: break-word;
          word-break: break-word;
        }
        .virtual-sandbox-lander pre {
          max-width: 100%;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        @media (max-width: 768px) {
          .virtual-sandbox-lander article {
            padding-left: 14px !important;
            padding-right: 14px !important;
          }
          .virtual-sandbox-lander th,
          .virtual-sandbox-lander td {
            padding: 10px 8px !important;
            font-size: 12px !important;
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
  return { props: {} };
}
