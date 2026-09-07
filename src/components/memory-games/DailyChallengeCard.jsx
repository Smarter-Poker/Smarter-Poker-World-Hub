import { CalendarDays, Check, ChevronRight, Clock3, Gem, Target } from 'lucide-react';
import { accuracyToPercent } from '../../lib/preflopRangeLab';

/**
 * The daily assignment card on the Preflop Charts menu. Mobile phase 2: it
 * always renders a card (loading, empty, or the assignment) so the
 * `data-tutorial="daily"` spotlight target exists whatever the server
 * returned; the empty state says plainly that nothing is posted yet.
 */
export default function DailyChallengeCard({ challenge, streak, completed, onPlay, loading }) {
  if (loading) {
    return (
      <div className="preflop-daily-card is-loading" role="status" data-tutorial="daily">
        <span className="preflop-daily-card-scan" aria-hidden="true" />
        Synchronizing Today’s Assignment
      </div>
    );
  }

  if (!challenge) {
    return (
      <section className="preflop-daily-card is-empty" aria-labelledby="preflop-daily-title" data-tutorial="daily">
        <div className="preflop-daily-card-art" aria-hidden="true" />
        <div className="preflop-daily-card-mark" aria-hidden><CalendarDays size={21} /></div>
        <div className="preflop-daily-card-copy">
          <span>Daily Range Assignment</span>
          <h2 id="preflop-daily-title">No Assignment Posted Yet</h2>
          <p>Today's Challenge Appears Here As Soon As It Is Published. Check Back Soon.</p>
        </div>
      </section>
    );
  }

  const target = accuracyToPercent(challenge.target_accuracy ?? 75);
  return (
    <section className="preflop-daily-card" data-completed={completed || undefined} aria-labelledby="preflop-daily-title" data-tutorial="daily">
      <div className="preflop-daily-card-art" aria-hidden="true" />
      <div className="preflop-daily-card-mark" aria-hidden>{completed ? <Check size={21} /> : <CalendarDays size={21} />}</div>
      <div className="preflop-daily-card-copy">
        <span>Daily Range Assignment</span>
        <h2 id="preflop-daily-title">{challenge.title || `Level ${challenge.level || 1} Challenge`}</h2>
      </div>
      {streak?.current_streak > 0 && <div className="preflop-daily-card-streak"><strong>{streak.current_streak}</strong><span>Day Streak</span></div>}
      <div className="preflop-daily-card-metrics">
        <div><Target size={15} aria-hidden /><span><small>Mode</small><strong>{challenge.game_mode || 'Range Lab'}</strong></span></div>
        <div><Clock3 size={15} aria-hidden /><span><small>Target</small><strong>{target.toFixed(target % 1 ? 1 : 0)}% Accuracy</strong></span></div>
        <div><Gem size={15} aria-hidden /><span><small>Reward</small><strong>+{challenge.diamond_reward || 50} Diamonds</strong></span></div>
      </div>
      {completed ? <div className="preflop-daily-card-complete"><Check size={17} aria-hidden /> Assignment Complete</div> : <button type="button" onClick={onPlay}>Start Daily Challenge <ChevronRight size={17} aria-hidden /></button>}
    </section>
  );
}
