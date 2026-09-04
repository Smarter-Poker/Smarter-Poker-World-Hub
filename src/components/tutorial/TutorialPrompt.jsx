/**
 * TutorialPrompt: the small card at the bottom of the page that offers the
 * page tutorial, then leaves on its own after three seconds.
 *
 * Dan, 2026-09-03: "A small pop up on the bottom of the page should come up,
 * 'Would You Like A Tutorial Of This Page', and auto disappear after 3
 * seconds if they don't click the X before that, with an instruction at the
 * bottom that says 'Tutorials For Every Page Live In The Hamburger Menu If
 * You Ever Need It'."
 *
 * - Start opens the tour. X dismisses. Either one, or the timer, marks the
 *   prompt seen for this page so it shows once (src/tutorials/index.js).
 * - The countdown is a thin bar (CSS animation, --sp-tutorial-prompt-ms) so
 *   the player can see it is about to go; a finger resting on the card
 *   pauses the timer (pointerdown/pointerup), because a 3-second card must
 *   not vanish under a thumb that is reaching for Start.
 * - Sits above the bottom nav and the home indicator; every control 44px.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useHaptics } from '../../hooks/useHaptics';
import { TUTORIAL_PROMPT_MS } from '../../tutorials';

function SparkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}

export default function TutorialPrompt({ tutorial, onStart, onDismiss, durationMs = TUTORIAL_PROMPT_MS }) {
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef(null);
  const remainingRef = useRef(durationMs);
  const startedAtRef = useRef(0);
  const haptic = useHaptics();

  const finish = useCallback((why) => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => {
      if (why === 'start' && typeof onStart === 'function') onStart();
      else if (typeof onDismiss === 'function') onDismiss(why);
    }, 200);
  }, [leaving, onStart, onDismiss]);

  // Countdown with pause on touch.
  useEffect(() => {
    if (typeof window === 'undefined' || leaving) return undefined;
    if (paused) {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
        remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAtRef.current));
      }
      return undefined;
    }
    startedAtRef.current = Date.now();
    timerRef.current = window.setTimeout(() => finish('timeout'), remainingRef.current);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [paused, leaving, finish]);

  if (!tutorial) return null;

  return (
    <div
      className={`sp-tutorial-prompt${leaving ? ' leaving' : ''}`}
      role="dialog"
      aria-live="polite"
      aria-label={`Tutorial Offer For ${tutorial.title}`}
      style={{ '--sp-tutorial-prompt-ms': `${durationMs}ms` }}
      onPointerDown={() => setPaused(true)}
      onPointerUp={() => setPaused(false)}
      onPointerCancel={() => setPaused(false)}
      onPointerLeave={() => setPaused(false)}
    >
      <div className="sp-tutorial-prompt-row">
        <div className="sp-tutorial-prompt-icon"><SparkIcon /></div>
        <div className="sp-tutorial-prompt-text">
          <p className="sp-tutorial-prompt-title">Would You Like A Tutorial Of This Page?</p>
          <p className="sp-tutorial-prompt-sub">{tutorial.steps.length} Quick Steps, About One Minute.</p>
        </div>
        <button
          type="button"
          className="sp-tutorial-prompt-start"
          onClick={() => { haptic('light'); finish('start'); }}
        >
          Start
        </button>
        <button
          type="button"
          className="sp-tutorial-prompt-close"
          aria-label="Close"
          onClick={() => { haptic('light'); finish('dismiss'); }}
        >
          ×
        </button>
      </div>
      <p className="sp-tutorial-prompt-note">Tutorials For Every Page Live In The Hamburger Menu If You Ever Need It.</p>
      <div className="sp-tutorial-prompt-timer" aria-hidden="true">
        <span style={{ animationPlayState: paused ? 'paused' : 'running' }} />
      </div>
    </div>
  );
}
