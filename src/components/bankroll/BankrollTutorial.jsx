/**
 * BankrollTutorial: the first-visit walkthrough for /hub/bankroll-manager.
 *
 * WHY: the Bankroll Manager has thirteen sections, four chart filters and a
 * ledger that treats deposits, withdrawals and expenses differently from
 * sessions. A new player sees all of it at once on a 375px phone and has no
 * idea where to start. The Poker Near Me tutorial
 * (src/components/poker-near-me/InteractiveTutorial.jsx) is the only in-app
 * walkthrough that works; this generalises its ideas (spotlight on a real
 * element, step card, progress, Skip / Back / Next) without importing it,
 * because that file is bound to Poker Near Me's pods and its own 600px
 * JS branch (the mobile standard forbids width branching in JS).
 *
 * How it works:
 * - Seven fixed steps (TUTORIAL_STEPS). Each names an optional
 *   `data-tutorial="<target>"` element on the page. If the element is on
 *   the page it is scrolled into view and ringed; if it is absent (a
 *   section is not mounted, a feature is gated) the step still shows,
 *   without a spotlight. Nothing auto-advances.
 * - The spotlight is a fixed ring (z 951) whose oversized box-shadow
 *   darkens everything except the target; the scrim (z 950) goes clear
 *   while a target exists. Layout is CSS (src/styles/worlds/bankroll.css):
 *   centered card on desktop, bottom sheet at or below 600px.
 * - Seen state is `localStorage['bankroll_tutorial_seen_v1']`, read and
 *   written inside try/catch (private mode throws), SSR-safe.
 * - `useModalHistory(open, onClose)` so the phone back gesture closes the
 *   walkthrough instead of leaving the page.
 * - Every control is 44px, touch-action: manipulation, no hover.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useModalHistory } from '../../hooks/useModalHistory';
import { useHaptics } from '../../hooks/useHaptics';

// The tutorial renders null on the server; a layout effect is still declared
// there, so pick the SSR-silent variant (same pattern as the rest of the hub).
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export const BANKROLL_TUTORIAL_KEY = 'bankroll_tutorial_seen_v1';

export const TUTORIAL_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome To Your Bankroll Manager',
    body: 'This Is Where Every Session, Deposit, Withdrawal And Expense Lives. It Tracks Your Balance, Your Net Results, Your Best And Worst Venues, And Warns You When A Rule Is Broken.',
    target: null,
  },
  {
    id: 'balance',
    title: 'Your Balance And Net',
    body: 'Bankroll Balance Is Everything You Have Set Aside To Play. Net Results Is What Playing Has Earned Or Cost You. Tap The Balance Card To Deposit Or Withdraw.',
    target: 'stats',
  },
  {
    id: 'log',
    title: 'Log A Session',
    body: 'The Add Button Logs Anything. A Cash Game, Tournament Or Bet Is A Session And Counts Toward Your Stats. A Deposit, Withdrawal Or Expense Is An Accounting Entry And Never Counts As A Session.',
    target: 'add-button',
  },
  {
    id: 'chart',
    title: 'The Trend Chart And Filters',
    body: 'The Chart Follows Your Balance Over Time. Filter It By Location, Time Window And Game Type, And Switch Between Line, Bar, Donut, Stacked, Histogram And Heatmap Views.',
    target: 'chart',
  },
  {
    id: 'analytics',
    title: 'Analytics',
    body: 'Three Cards Read Your Sessions Back To You: Where You Win Most, How Swingy Your Results Are, And How This Period Compares With The Last One.',
    target: 'analytics',
  },
  {
    id: 'sections',
    title: 'The Section Grid',
    body: 'Every Tool Is One Tap Away: Trips, Series, Player Notes, Staking, Tokes, Tax Reports, The Tournament Calendar And Reports. Nothing Is Hidden Behind A Swipe.',
    target: 'nav',
  },
  {
    id: 'help',
    title: 'Where To Get Help',
    body: 'Jarvis Insights Reads Your Ledger For Leaks And Explains Them In Plain Language. Reports Exports Everything To CSV, JSON Or PDF. Replay This Tour Any Time From The Tutorial Button.',
    target: 'insights',
  },
];

export function hasSeenBankrollTutorial() {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(BANKROLL_TUTORIAL_KEY) === '1';
  } catch (_) {
    return true;
  }
}

export function markBankrollTutorialSeen() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BANKROLL_TUTORIAL_KEY, '1');
  } catch (_) {
    // Private mode or quota: the tour simply shows again next visit.
  }
}

const RING_PAD = 8;

function measure(target) {
  if (!target || typeof document === 'undefined') return null;
  const el = document.querySelector(`[data-tutorial="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return null;
  return { el, top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom };
}

const btnBase = {
  minHeight: 44,
  minWidth: 44,
  padding: '0 16px',
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  touchAction: 'manipulation',
  WebkitTapHighlightColor: 'transparent',
  fontFamily: 'Inter, -apple-system, sans-serif',
};

export default function BankrollTutorial({ open = false, onClose }) {
  const [step, setStep] = useState(0);
  const [ring, setRing] = useState(null);
  const cardRef = useRef(null);
  const haptic = useHaptics();

  const close = useCallback(() => {
    markBankrollTutorialSeen();
    if (typeof onClose === 'function') onClose();
  }, [onClose]);

  useModalHistory(open, close);

  // Reset to the first step every time the tour opens.
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const current = TUTORIAL_STEPS[step] || TUTORIAL_STEPS[0];

  // Scroll the target into view, keep it above the card on phones, and
  // draw the ring. Re-measure on scroll and resize while the step is shown.
  useIsoLayoutEffect(() => {
    if (!open || typeof window === 'undefined') return undefined;
    let cancelled = false;
    let raf = 0;

    const place = () => {
      const m = measure(current.target);
      if (cancelled) return;
      if (!m) {
        setRing(null);
        return;
      }
      setRing({ top: m.top - RING_PAD, left: m.left - RING_PAD, width: m.width + RING_PAD * 2, height: m.height + RING_PAD * 2 });
    };

    const m0 = measure(current.target);
    if (m0 && m0.el && typeof m0.el.scrollIntoView === 'function') {
      try {
        m0.el.scrollIntoView({ block: 'center', inline: 'nearest' });
      } catch (_) {
        m0.el.scrollIntoView();
      }
      // On a phone the card is a bottom sheet; if the target now sits under
      // it, nudge the page so the target stays visible above the sheet.
      raf = window.requestAnimationFrame(() => {
        const again = measure(current.target);
        const cardH = cardRef.current ? cardRef.current.getBoundingClientRect().height : 0;
        if (again && cardH && again.bottom > window.innerHeight - cardH - 12) {
          window.scrollBy(0, again.bottom - (window.innerHeight - cardH - 12));
        }
        place();
      });
    } else {
      setRing(null);
    }

    const onMove = () => place();
    window.addEventListener('scroll', onMove, { passive: true });
    window.addEventListener('resize', onMove);
    const settle = window.setTimeout(place, 320);
    return () => {
      cancelled = true;
      if (raf) window.cancelAnimationFrame(raf);
      window.clearTimeout(settle);
      window.removeEventListener('scroll', onMove);
      window.removeEventListener('resize', onMove);
    };
  }, [open, step, current.target]);

  // Escape closes.
  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  const total = TUTORIAL_STEPS.length;
  const isFirst = step === 0;
  const isLast = step === total - 1;

  const goNext = () => {
    haptic('light');
    if (isLast) {
      close();
      return;
    }
    setStep((s) => Math.min(total - 1, s + 1));
  };
  const goBack = () => {
    haptic('light');
    setStep((s) => Math.max(0, s - 1));
  };
  const skip = () => {
    haptic('light');
    close();
  };

  // Desktop: keep the card off the spotlighted element (below a target in
  // the upper half, above one in the lower half). Phones ignore this: the
  // 600px CSS rule pins the card to the bottom as a sheet.
  const placement = ring
    ? (ring.top + ring.height / 2 < (typeof window !== 'undefined' ? window.innerHeight : 800) / 2 ? ' place-bottom' : ' place-top')
    : '';

  return (
    <div
      className={`bankroll-tutorial bankroll-tutorial-scrim${ring ? ' has-target' : ''}${placement}`}
      role="presentation"
      data-tutorial-open="true"
    >
      {ring ? (
        <div
          className="bankroll-tutorial-ring"
          aria-hidden="true"
          style={{ top: ring.top, left: ring.left, width: ring.width, height: ring.height }}
        />
      ) : null}

      <div
        ref={cardRef}
        className="bankroll-tutorial-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bankroll-tutorial-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close"
          className="sp-icon-btn"
          onClick={skip}
          style={{
            ...btnBase,
            position: 'absolute',
            top: 12,
            right: 12,
            width: 44,
            height: 44,
            padding: 0,
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.06)',
            color: '#fff',
            fontSize: 20,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ×
        </button>

        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6ee7ef', marginBottom: 8, paddingRight: 52 }}>
          Step {step + 1} Of {total}
        </div>
        <h2 id="bankroll-tutorial-title" style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: '0 0 8px', paddingRight: 52, lineHeight: 1.25 }}>
          {current.title}
        </h2>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: 'rgba(255,255,255,0.78)', margin: 0 }}>
          {current.body}
        </p>

        <div className="bankroll-tutorial-dots" aria-hidden="true">
          {TUTORIAL_STEPS.map((s, i) => (
            <span key={s.id} className={`bankroll-tutorial-dot${i === step ? ' active' : ''}`} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <button
            type="button"
            onClick={skip}
            style={{ ...btnBase, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)' }}
          >
            Skip
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={goBack}
            disabled={isFirst}
            style={{ ...btnBase, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', opacity: isFirst ? 0.4 : 1 }}
          >
            Back
          </button>
          <button
            type="button"
            onClick={goNext}
            style={{ ...btnBase, background: 'linear-gradient(135deg, #2374e1, #1a5fc9)', border: 'none', color: '#fff', minWidth: 96 }}
          >
            {isLast ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
