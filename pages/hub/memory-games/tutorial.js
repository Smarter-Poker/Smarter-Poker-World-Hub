/**
 * Preflop Charts guide (/hub/preflop-charts/tutorial, also /hub/memory-games/tutorial).
 *
 * Mobile phase 2: the static guide keeps its four working steps, the review
 * colour legend and the keyboard map, and now also renders the eight steps
 * of the interactive tour (src/tutorials/preflop-charts.js) as stacked
 * articles, always displayed, with a 44px "Start The Interactive Tour" CTA
 * that links to /hub/preflop-charts?tutorial=1. The TutorialProvider opens
 * the tour there once the page has mounted. Nothing on this page or on the
 * game page auto-launches a tour; the link, the three-second prompt and the
 * hamburger's Page Tutorial row are the only entry points.
 */
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Compass, Keyboard, Layers3, MousePointer2 as PointerIcon, ScanSearch } from 'lucide-react';
import SEOHead from '../../../src/components/seo/SEOHead';
import PreflopSubpageShell from '../../../src/components/memory-games/PreflopSubpageShell';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { PREFLOP_TUTORIAL } from '../../../src/tutorials/preflop-charts';
import { hubProductSchema } from '../../../src/lib/seo/hubPageSchema';

// AEO phase 3 (2026-09-17): this page had copy and no structured data.
const PREFLOP_GUIDE_SCHEMA = hubProductSchema({
  path: '/hub/preflop-charts/tutorial',
  name: 'Preflop Charts Guide | Smarter.Poker',
  description:
    'How To Construct, Score And Review GTO Preflop Ranges On Smarter.Poker: A Practical Guide To The Range Lab On Desktop Or Mobile. Free To Read.',
  trail: [['Hub', '/hub'], ['Preflop Charts', '/hub/preflop-charts'], ['Guide', '/hub/preflop-charts/tutorial']],
});

const STEPS = [
  { icon: ScanSearch, title: 'Read The Situation', description: 'Confirm Your Position, Effective Stack, Format, And The Action You Are Facing. Those Details Determine The Target Range.' },
  { icon: Layers3, title: 'Choose An Action', description: 'Select Fold, Call, Raise, Raise Small, Raise Big, Or All In. The Active Action Stays Available In The Mobile Command Strip.' },
  { icon: PointerIcon, title: 'Build The Range', description: 'Tap Individual Hands Or Drag Across The Matrix To Paint A Block, Or Apply The Active Action To Every Pair, Suited Hand, Or Offsuit Hand. Undo And Redo Are Available Before Submission.' },
  { icon: CheckCircle2, title: 'Submit And Compare', description: 'Your Score Measures Exact Overlap With The Solver Range. Missing Hands, Extra Hands, And Correct Hands With The Wrong Action All Reduce Accuracy.' },
];

const FEEDBACK = [
  { state: 'correct', label: 'Correct', detail: 'Right Hand And Right Action' },
  { state: 'missed', label: 'Missed', detail: 'Solver Hand Left Unmarked' },
  { state: 'wrong', label: 'Wrong Action', detail: 'Right Hand, Different Action' },
  { state: 'extra', label: 'Extra', detail: 'Hand Added Outside The Range' },
];

export default function MemoryGamesTutorial() {
  useTrainingBus('preflop-charts-tutorial');
  return (
    <>
      <SEOHead
        title="Preflop Charts Guide: Build GTO Ranges"
        description="Learn How To Construct, Score And Review GTO Preflop Ranges On Smarter.Poker. A Practical Guide To The Range Lab On Desktop Or Mobile, Free To Read And Free To Practise."
        canonical="/hub/preflop-charts/tutorial"
        jsonLd={PREFLOP_GUIDE_SCHEMA}
      />
      <PreflopSubpageShell eyebrow="FIELD MANUAL // RANGE LAB" title="Operate The Matrix" description="A Practical Guide To Building Exact Preflop Ranges On Desktop Or Mobile." metric="GUIDE">
        <section className="preflop-guide-grid" aria-label="How to use Preflop Charts">
          {STEPS.map(({ icon: Icon, title, description }, index) => (
            <article className="preflop-guide-step" key={title}>
              <div className="preflop-guide-step-index">0{index + 1}</div><Icon size={22} aria-hidden /><h2>{title}</h2><p>{description}</p>
            </article>
          ))}
        </section>

        <section className="preflop-subpage-panel preflop-guide-tour" aria-labelledby="tour-steps-title">
          <div className="preflop-panel-heading"><div><span>INTERACTIVE TOUR // {PREFLOP_TUTORIAL.steps.length} STEPS</span><h2 id="tour-steps-title">{PREFLOP_TUTORIAL.title} Tour</h2></div><Compass size={22} aria-hidden style={{ color: '#6bd2ff' }} /></div>
          <div className="preflop-guide-tour-list">
            {PREFLOP_TUTORIAL.steps.map((step, index) => (
              <article key={step.id} aria-labelledby={`tour-step-${step.id}`}>
                <span aria-hidden="true">{index + 1}</span>
                <h3 id={`tour-step-${step.id}`}>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
          <div className="preflop-guide-tour-cta">
            <Link href="/hub/preflop-charts?tutorial=1" className="preflop-subpage-primary-cta">Start The Interactive Tour <ArrowRight size={17} aria-hidden /></Link>
          </div>
        </section>

        <section className="preflop-subpage-panel preflop-guide-feedback" aria-labelledby="feedback-legend-title">
          <div className="preflop-panel-heading"><div><span>RESULT LAYER</span><h2 id="feedback-legend-title">Read The Review Colors</h2></div></div>
          <div className="preflop-feedback-legend">
            {FEEDBACK.map((item) => <div key={item.state} data-feedback={item.state}><i aria-hidden /><span><strong>{item.label}</strong>{item.detail}</span></div>)}
          </div>
        </section>
        <section className="preflop-subpage-panel preflop-guide-shortcuts" aria-labelledby="shortcut-title">
          <Keyboard size={24} aria-hidden /><div><span>DESKTOP CONTROL MAP</span><h2 id="shortcut-title">Keyboard Shortcuts</h2><p><kbd>1-6</kbd> Select Actions. <kbd>Arrow Keys</kbd> Move Through The Matrix. <kbd>Enter</kbd> Or <kbd>Space</kbd> Toggles The Focused Hand, Or Submits Outside The Grid. <kbd>Ctrl/Cmd Z</kbd> Undo. <kbd>Shift + Ctrl/Cmd Z</kbd> Redo.</p></div>
        </section>
        <div className="preflop-subpage-cta-row"><Link href="/hub/preflop-charts" className="preflop-subpage-primary-cta">Start Range Training <ArrowRight size={17} aria-hidden /></Link></div>
      </PreflopSubpageShell>
    </>
  );
}
