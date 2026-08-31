import { CalendarDays, Check, ChevronRight, Clock3, Gem, Target } from 'lucide-react';
import { accuracyToPercent } from '../../lib/preflopRangeLab';

export default function DailyChallengeCard({ challenge, streak, completed, onPlay, loading }) {
  if (loading) return <div className="preflop-daily-card is-loading" role="status">Synchronizing Today&apos;S Assignment…</div>;
  if (!challenge) return null;

  const target = accuracyToPercent(challenge.target_accuracy ?? 75);
  return (
    <section className="preflop-daily-card" data-completed={completed || undefined} aria-labelledby="preflop-daily-title">
      <div className="preflop-daily-card-mark" aria-hidden>{completed ? <Check size={21} /> : <CalendarDays size={21} />}</div>
      <div className="preflop-daily-card-copy">
        <span>DAILY RANGE ASSIGNMENT</span>
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
