import React from 'react';
import FeatureLanderLayout from '../../src/components/features/FeatureLanderLayout';

export default function PokerAiCoachPage() {
  const features = [
    {
      title: 'Plain English Hand Reviews',
      description: 'Upload Hand Histories From Any Major Site And Receive Clear, Conversational Strategic Breakdowns Explaining Why Each Street Decision Was Winning Or Losing.',
    },
    {
      title: 'Automated Leak Detection',
      description: 'Identify Costly Strategic Tendencies Across Your Entire Hand History, Including Overfolding To 3-Bets, Passive River Calling, And Missed Value Bets.',
    },
    {
      title: 'GTO Solver Baselines',
      description: 'Compare Your Actions Directly Against Nash Equilibrium Frequencies Across 100BB Cash Games And Tournament Stack Depths.',
    },
    {
      title: 'Jarvis AI Voice & Chat Assistant',
      description: 'Discuss Complex Hand Scenarios, Pot Odds Calculations, And Bluff Frequency Adjustments In Real Time With An Intelligent AI Coach.',
    },
    {
      title: 'Universal Hand History Ingestion',
      description: 'Paste Hand Text Directly From Club Arena, PokerStars, GG Poker, Ignition, Or Voice-Dictated Live Hand Notes.',
    },
    {
      title: '100% Free Forever',
      description: 'Unlimited Daily Hand Reviews, Interactive Solvers, And Leak Detection With Zero Paywalls Or Token Limitations.',
    },
  ];

  const comparison = {
    title: 'PokerBrain AI Coach vs. Legacy Coaching Apps',
    headers: ['Feature', 'Smarter.Poker PokerBrain', 'PokerInk / Sharp', 'DTO Poker'],
    rows: [
      ['Pricing', '100% Free Forever', '$19.99 - $49.99 / Month', '$9.99 - $29.99 / Month'],
      ['Plain English Review', 'Conversational Explanations', 'Basic Score Reports', 'Binary Right/Wrong Only'],
      ['Automated Leak Finder', 'Full Hand History Auditing', 'Limited Session Scope', 'Pre-Set Drills Only'],
      ['GTO Frequency Solver', 'Integrated Nash Frequencies', 'Static Solutions', 'Gated By Subscription'],
      ['Voice & Chat Assistant', 'Jarvis AI Real-Time Chat', 'Not Available', 'Not Available'],
      ['Universal Hand Import', 'Supports All Major Networks', 'Limited Formats', 'Proprietary Scenarios Only'],
    ],
  };

  const howItWorks = [
    {
      title: 'Paste Or Dictate Your Hand',
      description: 'Input Hand History Text From Any Online Site Or Speak Your Live Casino Hand Details Into The Jarvis Voice Recorder.',
    },
    {
      title: 'Receive Instant Strategic Feedback',
      description: 'Get Street-by-Street Decision Grades, Pot Odds Validations, Range Distributions, And Plain English Tactical Advice.',
    },
    {
      title: 'Plug Your Costliest Leaks',
      description: 'Track Long-Term Trends On Your Player Dashboard And Eliminate Repeated Strategic Mistakes Before Your Next Session.',
    },
  ];

  const faqs = [
    {
      question: 'How Does Jarvis AI Analyze Poker Hands?',
      answer: 'Jarvis AI Cross-References Bet Sizes, Board Textures, And Position Against Pre-Computed Game Theory Optimal (GTO) Matrices, Rendering Findings In Plain English Explanations.',
    },
    {
      question: 'Can PokerBrain Find Leaks In My Play Automatically?',
      answer: 'Yes. PokerBrain Audits Historical Decisions Over Time To Categorize Common Behavioral Leaks Including C-Bet Under-Bluffing, Loose River Calling, And Shallow Preflop Ranges.',
    },
    {
      question: 'Is The AI Poker Coach Really Free?',
      answer: 'Yes. Smarter.Poker Believes High-Quality Poker Training Should Be Accessible To Everyone, Providing Unlimited Coaching Reviews Without Subscription Fees.',
    },
  ];

  return (
    <FeatureLanderLayout
      title="PokerBrain & Jarvis AI Tactical Poker Coach"
      metaTitle="PokerBrain & Jarvis AI Tactical Poker Coach | Smarter.Poker"
      description="Free AI-Powered Poker Coach And Leak Detector. Plain English Hand Reviews, Street-by-Street Decision Analysis, And Solver Baselines With Jarvis AI."
      canonical="/features/poker-ai-coach"
      badgeText="100% Free AI Poker Coaching"
      primaryCtaText="Open PokerBrain"
      primaryCtaHref="/hub/poker-brain"
      secondaryCtaText="View Plain-Text Spec"
      secondaryCtaHref="/features/poker-ai-coach.md"
      markdownUrl="https://smarter.poker/features/poker-ai-coach.md"
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
    const { renderPokerAiCoachMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderPokerAiCoachMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }
  return { props: {} };
}
