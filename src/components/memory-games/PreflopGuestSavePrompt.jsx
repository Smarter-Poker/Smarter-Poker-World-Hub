/**
 * GUEST SAVE PROMPT (Preflop Charts, 2026-11-28).
 *
 * A signed-out player who finishes a strong run (80% or better, or a new
 * best of at least 50% on this device for that mode) sees one offer to keep future runs with
 * a free account. It uses the site's quick-signup sheet, says plainly that
 * this run stays on this device, and claims no prizes or rewards.
 *
 * Never shown to a signed-in player or while sign-in is still resolving.
 * Shown at most once per browser session, and "Not Now" ends it for the
 * session too, so it never nags.
 */
import { useEffect, useRef, useState } from 'react';
import { useAvatar } from '../../contexts/AvatarContext';
import { openQuickSignup, buildSignupUrl } from '../seo/SmarterQuickSignupSheet';
import { trackSeoFunnelEvent } from '../../lib/seo/seoFunnelTelemetry';

export const GUEST_SAVE_STRONG_ACCURACY = 80;
// A new best is only worth celebrating once the run itself is respectable.
export const GUEST_SAVE_BEST_FLOOR = 50;
export const GUEST_SAVE_SESSION_KEY = 'preflop-guest-save-prompted';
export const guestBestKey = (mode) => `preflop-guest-best:${mode}`;

/**
 * Pure decision, exported for the law test.
 * previousBest is null when this device has no earlier run for the mode;
 * a first run only qualifies on accuracy, never as a "best".
 */
export function guestSaveDecision({ accuracy, previousBest }) {
  const value = Number(accuracy);
  if (!Number.isFinite(value)) return { show: false, newBest: false };
  const newBest = Number.isFinite(previousBest) && value > previousBest && value >= GUEST_SAVE_BEST_FLOOR;
  return { show: value >= GUEST_SAVE_STRONG_ACCURACY || newBest, newBest };
}

function readNumber(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export default function PreflopGuestSavePrompt({ mode, accuracy }) {
  const { user, initializing } = useAvatar();
  const [prompt, setPrompt] = useState(null);
  const decided = useRef(false);

  useEffect(() => {
    if (decided.current || initializing) return;
    decided.current = true;
    if (user?.id || typeof window === 'undefined') return;
    const value = Math.round(Number(accuracy));
    if (!Number.isFinite(value)) return;

    const previousBest = readNumber(window.localStorage, guestBestKey(mode));
    const decision = guestSaveDecision({ accuracy: value, previousBest });
    try {
      if (previousBest === null || value > previousBest) {
        window.localStorage.setItem(guestBestKey(mode), String(value));
      }
    } catch {}

    let alreadyPrompted = false;
    try {
      alreadyPrompted = window.sessionStorage.getItem(GUEST_SAVE_SESSION_KEY) === '1';
    } catch {}
    if (!decision.show || alreadyPrompted) return;

    try {
      window.sessionStorage.setItem(GUEST_SAVE_SESSION_KEY, '1');
    } catch {}
    setPrompt({ accuracy: value, newBest: decision.newBest });
    trackSeoFunnelEvent('preflop_guest_save_prompt_shown', { mode, accuracy: value, new_best: decision.newBest });
  }, [initializing, user, mode, accuracy]);

  if (!prompt || user?.id) return null;

  const create = () => {
    trackSeoFunnelEvent('preflop_guest_save_prompt_clicked', { mode, accuracy: prompt.accuracy });
    const detail = {
      unlockKey: 'preflop-charts-progress',
      source: `preflop-charts-${mode}-result`,
      redirectPath: '/hub/preflop-charts',
      eyebrow: 'Free Preflop Charts Account',
      title: 'Keep Every Preflop Run',
      subtitle: 'Create Your Free Smarter.Poker Account To Save Your Level Progress, Weak Spots And Session History Across Devices.',
    };
    if (!openQuickSignup(detail)) {
      window.location.assign(buildSignupUrl({ redirectPath: detail.redirectPath, unlockKey: detail.unlockKey, source: detail.source }));
    }
  };

  const dismiss = () => {
    trackSeoFunnelEvent('preflop_guest_save_prompt_dismissed', { mode, accuracy: prompt.accuracy });
    setPrompt(null);
  };

  return (
    <section className="preflop-guest-save" aria-label="Save Your Progress">
      <div className="preflop-guest-save-kicker">Save Your Progress</div>
      <h2>{prompt.newBest ? `New Local Best: ${prompt.accuracy}%` : `Strong Run: ${prompt.accuracy}% Accuracy`}</h2>
      <p>
        This Run Is Saved On This Device Only. A Free Account Keeps Your Next Runs, Level Progress And Weak Spots
        Across Devices.
      </p>
      <div className="preflop-guest-save-actions">
        <button type="button" className="preflop-guest-save-primary" onClick={create}>
          Create Free Account
        </button>
        <button type="button" className="preflop-guest-save-secondary" onClick={dismiss}>
          Not Now
        </button>
      </div>
    </section>
  );
}
