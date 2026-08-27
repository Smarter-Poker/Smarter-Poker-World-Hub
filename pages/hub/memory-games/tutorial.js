import Link from 'next/link';
import { ArrowRight, CheckCircle2, Keyboard, Layers3, MousePointer2, ScanSearch } from 'lucide-react';
import SEOHead from '../../../src/components/seo/SEOHead';
import PreflopSubpageShell from '../../../src/components/memory-games/PreflopSubpageShell';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

const STEPS = [
  { icon: ScanSearch, title: 'Read the situation', description: 'Confirm your position, effective stack, format, and the action you are facing. Those details determine the target range.' },
  { icon: Layers3, title: 'Choose an action', description: 'Select Fold, Call, Raise, Raise Small, Raise Big, or All In. The active action stays available in the mobile command strip.' },
  { icon: MousePointer2, title: 'Build the range', description: 'Tap individual hands or apply the active action to every pair, suited hand, or offsuit hand. Undo and redo are available before submission.' },
  { icon: CheckCircle2, title: 'Submit and compare', description: 'Your score measures exact overlap with the solver range. Missing hands, extra hands, and correct hands with the wrong action all reduce accuracy.' },
];

const FEEDBACK = [
  { state: 'correct', label: 'Correct', detail: 'Right hand and right action' },
  { state: 'missed', label: 'Missed', detail: 'Solver hand left unmarked' },
  { state: 'wrong', label: 'Wrong action', detail: 'Right hand, different action' },
  { state: 'extra', label: 'Extra', detail: 'Hand added outside the range' },
];

export default function MemoryGamesTutorial() {
  useTrainingBus('preflop-charts-tutorial');
  return (
    <>
      <SEOHead title="Preflop Charts Guide — Build Accurate GTO Ranges" description="Learn how to construct, score, and review GTO preflop ranges in Smarter.Poker." canonical="/hub/preflop-charts/tutorial" />
      <PreflopSubpageShell eyebrow="FIELD MANUAL // RANGE LAB" title="Operate the matrix" description="A practical guide to building exact preflop ranges on desktop or mobile." metric="GUIDE">
        <section className="preflop-guide-grid" aria-label="How to use Preflop Charts">
          {STEPS.map(({ icon: Icon, title, description }, index) => (
            <article className="preflop-guide-step" key={title}>
              <div className="preflop-guide-step-index">0{index + 1}</div><Icon size={22} aria-hidden /><h2>{title}</h2><p>{description}</p>
            </article>
          ))}
        </section>
        <section className="preflop-subpage-panel preflop-guide-feedback" aria-labelledby="feedback-legend-title">
          <div className="preflop-panel-heading"><div><span>RESULT LAYER</span><h2 id="feedback-legend-title">Read the review colors</h2></div></div>
          <div className="preflop-feedback-legend">
            {FEEDBACK.map((item) => <div key={item.state} data-feedback={item.state}><i aria-hidden /><span><strong>{item.label}</strong>{item.detail}</span></div>)}
          </div>
        </section>
        <section className="preflop-subpage-panel preflop-guide-shortcuts" aria-labelledby="shortcut-title">
          <Keyboard size={24} aria-hidden /><div><span>DESKTOP CONTROL MAP</span><h2 id="shortcut-title">Keyboard shortcuts</h2><p><kbd>1–6</kbd> select actions · <kbd>Arrow keys</kbd> move through the matrix · <kbd>Space</kbd> marks a focused hand or submits outside the grid · <kbd>Ctrl/⌘ Z</kbd> undo · <kbd>Shift + Ctrl/⌘ Z</kbd> redo.</p></div>
        </section>
        <div className="preflop-subpage-cta-row"><Link href="/hub/preflop-charts" className="preflop-subpage-primary-cta">Start range training <ArrowRight size={17} aria-hidden /></Link></div>
      </PreflopSubpageShell>
    </>
  );
}
