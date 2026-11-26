/**
 * TrainingLobbyHeader — Compact Poker Arena-Style Command Masthead
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces the tall 30%-viewport hero poster with a tight, high-signal command
 * header mirroring Club Arena's welcome + 2 telemetry plaques:
 *   - Left plaque: Quick Play / Play Again action for the player's top drill
 *   - Right plaque: Live 30-day GTO Grade + weekly hands/streak (honest states)
 *   - Slim conditional 5-Minute Leak Fix bar when a real leak/warmup applies
 */

import { Play, Flame, Zap, AlertTriangle } from 'lucide-react';

export default function TrainingLobbyHeader({
  heroGame,
  continueTarget,
  stats,
  statsLoading,
  statsError,
  onRetryStats,
  signedIn,
  onPlayGame,
  fiveMinuteLeakFix,
  totalGames,
}) {
  const primaryGame = continueTarget?.game || heroGame;
  const hasLastDrill = Boolean(continueTarget?.game);
  const hasGradeData = Number(stats?.rolling_total) > 0;
  const grade = hasGradeData ? (stats?.current_grade || '-') : '-';
  const accuracy = hasGradeData ? `${stats.rolling_accuracy_pct}%` : null;
  const streakDays = Number(stats?.current_streak_days) || 0;

  return (
    <section
      aria-labelledby="hero-h"
      className="sp-arena-masthead sd-masthead"
      data-tutorial="hero"
    >
      <div className="sp-arena-masthead__title-bar">
        <span className="sp-arena-masthead__eyebrow">Smarter.Poker Training Console</span>
        <h1 id="hero-h" className="sp-arena-masthead__title">Training Games</h1>
      </div>

      <div className="sp-arena-masthead__plaques">
        {/* Left Plaque: Quick Play / Play Again */}
        <div className="sp-arena-plaque sp-arena-plaque--action">
          <div className="sp-arena-plaque__copy">
            <span className="sp-arena-plaque__label">
              {hasLastDrill ? 'Last Played' : 'Quick Play Drill'}
            </span>
            <strong className="sp-arena-plaque__name">
              {primaryGame?.name || 'Push/Fold Mastery'}
            </strong>
            <span className="sp-arena-plaque__sub">
              {primaryGame?.focus || `${totalGames} Solver-Backed Drills`}
            </span>
          </div>
          <button
            type="button"
            className="sp-arena-plaque__play sd-button sd-primary"
            data-start-training-cta="true"
            data-continue-training-cta={hasLastDrill ? 'true' : undefined}
            disabled={!primaryGame}
            onClick={() => onPlayGame(primaryGame, hasLastDrill ? continueTarget.preset : undefined)}
          >
            <Play size={15} aria-hidden="true" />
            <span>{hasLastDrill ? 'Play Again' : 'Play'}</span>
          </button>
        </div>

        {/* Right Plaque: Live GTO Grade & Streak Telemetry */}
        <div className="sp-arena-plaque sp-arena-plaque--telemetry" aria-label="GTO Training Telemetry">
          {!signedIn ? (
            <div className="sp-arena-plaque__telemetry-body">
              <span className="sp-arena-plaque__label">GTO Training Grade</span>
              <strong className="sp-arena-plaque__value">{totalGames} Games Ready</strong>
              <span className="sp-arena-plaque__sub">Sign In To Track Grade &amp; Streak</span>
            </div>
          ) : statsLoading ? (
            <div className="sp-arena-plaque__telemetry-body" aria-busy="true">
              <span className="sp-arena-plaque__label">GTO Training Grade</span>
              <strong className="sp-arena-plaque__value">Loading Stats…</strong>
              <span className="sp-arena-plaque__sub">Syncing Verified Sessions</span>
            </div>
          ) : statsError || !stats ? (
            <div className="sp-arena-plaque__telemetry-error">
              <div className="sp-arena-plaque__telemetry-body">
                <span className="sp-arena-plaque__label">
                  <AlertTriangle size={12} aria-hidden="true" /> Stats Unavailable
                </span>
                <span className="sp-arena-plaque__sub">No Placeholder Values Shown</span>
              </div>
              <button
                type="button"
                className="sp-arena-plaque__retry sd-button"
                onClick={onRetryStats}
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="sp-arena-plaque__grade-grid">
              <div className="sp-arena-plaque__grade-badge sp-num" aria-label={`Grade ${grade}`}>
                {grade}
              </div>
              <div className="sp-arena-plaque__telemetry-body">
                <span className="sp-arena-plaque__label">30-Day GTO Grade</span>
                <strong className="sp-arena-plaque__value sp-num">
                  {hasGradeData ? `${accuracy} Accuracy` : 'No Graded Hands'}
                </strong>
                <span className="sp-arena-plaque__sub">
                  <Flame size={12} aria-hidden="true" />
                  <span>{streakDays}d Streak · {Number(stats.hands_this_week) || 0} Hands/Wk</span>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Slim One-Line 5-Minute Leak Fix / Warmup Strip */}
      {fiveMinuteLeakFix && (
        <div
          className="sp-arena-quickbar"
          data-five-minute-leak-fix="true"
          data-leak-fix-basis={fiveMinuteLeakFix.basis}
        >
          <div className="sp-arena-quickbar__copy">
            <span className="sp-arena-quickbar__tag">
              <Zap size={12} aria-hidden="true" />
              {fiveMinuteLeakFix.basis === 'active-leak' ? '5-Min Leak Fix' : '5-Min Warmup'}
            </span>
            <span className="sp-arena-quickbar__text">{fiveMinuteLeakFix.title}</span>
          </div>
          <button
            type="button"
            className="sp-arena-quickbar__cta sd-button sd-primary"
            data-start-five-minute-fix-cta="true"
            data-speculative-prefetch="ready"
            onMouseEnter={() => {
              if (typeof window !== 'undefined') {
                window.__spSpeculativePrefetchGameId = fiveMinuteLeakFix.game?.id || 'cash-002';
              }
            }}
            onClick={() => onPlayGame(fiveMinuteLeakFix.game, fiveMinuteLeakFix.overrides)}
          >
            10-Hand Fix
          </button>
        </div>
      )}
    </section>
  );
}
