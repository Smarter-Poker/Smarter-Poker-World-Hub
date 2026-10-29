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
      title: 'Shareable Scenario URLs',
      description: 'Generate Unique Permalinks Permitting Friends, Study Groups, And Coaching Students To Load And Test Custom Hand Scenarios Instantly.',
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
      ['Shareable Web Links', 'Instant URL Sharing', 'File Export Only', 'Proprietary Files Only'],
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
      answer: 'Yes. Full Simulation, Runout Modeling, And Hand Sharing Features Are 100% Free With No Download Required.',
    },
    {
      question: 'Can I Share A Simulated Board With A Friend?',
      answer: 'Yes. Simply Click Share Scenario To Generate A Permanent URL That Loads The Exact Table State In Any Web Browser.',
    },
  ];

  return (
    <FeatureLanderLayout
      title="Virtual Poker Table Sandbox & Runout Simulator"
      metaTitle="Virtual Poker Table Sandbox & Runout Simulator | Smarter.Poker"
      description="Interactive 3D Poker Table Simulator. Construct Custom Boards, Test Runout Distributions, Model Multiway Pot Equities, And Replay Epic Hands."
      canonical="/features/virtual-poker-sandbox"
      badgeText="100% Free Poker Simulation Lab"
      primaryCtaText="Open Virtual Sandbox"
      primaryCtaHref="/hub/sandbox"
      secondaryCtaText="View Plain-Text Spec"
      secondaryCtaHref="/features/virtual-poker-sandbox.md"
      markdownUrl="https://smarter.poker/features/virtual-poker-sandbox.md"
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
