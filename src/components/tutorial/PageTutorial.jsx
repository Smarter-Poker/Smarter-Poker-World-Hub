/**
 * PageTutorial: the one walkthrough engine for every World Hub page.
 *
 * Grew out of the Bankroll Manager tour (mobile phase 1b), which itself
 * generalised the Poker Near Me InteractiveTutorial without importing it
 * (that file is bound to Poker Near Me's pods and a JS width branch the
 * mobile standard forbids). Any page gets a tour by adding a row to
 * src/tutorials/index.js and `data-tutorial="<target>"` attributes to the
 * elements each step talks about.
 *
 * How it works:
 * - Steps come from `tutorial.steps`. Each may name a target; if the
 *   element is on the page it is scrolled into view and ringed, if not the
 *   step still shows without a spotlight. Nothing auto-advances.
 * - The spotlight is a fixed ring (z 951) whose oversized box-shadow
 *   darkens everything except the target; the scrim (z 950) goes clear
 *   while a target exists. Layout is CSS (src/styles/tutorial.css):
 *   centered card on desktop, bottom sheet at or below 600px.
 * - Seen state is written on Done, Skip and X (src/tutorials/index.js).
 * - `useModalHistory(open, close)` so the phone back gesture closes the
 *   tour instead of leaving the page. Escape closes too.
 * - Every control is 44px, touch-action: manipulation, no hover.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useModalHistory } from '../../hooks/useModalHistory';
import { useHaptics } from '../../hooks/useHaptics';
import { markTutorialSeen } from '../../tutorials';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const RING_PAD = 8;

function measure(target) {
  if (!target || typeof document === 'undefined') return null;
  const el = document.querySelector(`[data-tutorial="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return null;
  return { el, top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom };
}

function CompassIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}

export default function PageTutorial({ tutorial, open = false, onClose }) {
  const [step, setStep] = useState(0);
  const [ring, setRing] = useState(null);
  const cardRef = useRef(null);
  const haptic = useHaptics();
  const steps = (tutorial && Array.isArray(tutorial.steps) && tutorial.steps.length) ? tutorial.steps : null;

  const close = useCallback(() => {
    markTutorialSeen(tutorial);
    if (typeof onClose === 'function') onClose();
  }, [onClose, tutorial]);

  useModalHistory(open && !!steps, close);

  // Reset to the first step every time the tour opens.
  useEffect(() => {
    if (open) setStep(0);
  }, [open, tutorial]);

  const current = steps ? (steps[step] || steps[0]) : null;
  const target = current ? current.target : null;

  // Scroll the target into view, keep it above the card on phones, and
  // draw the ring. Re-measure on scroll and resize while the step is shown.
  useIsoLayoutEffect(() => {
    if (!open || !steps || typeof window === 'undefined') return undefined;
    let cancelled = false;
    let raf = 0;

    const place = () => {
      const m = measure(target);
      if (cancelled) return;
      if (!m) {
        setRing(null);
        return;
      }
      setRing({ top: m.top - RING_PAD, left: m.left - RING_PAD, width: m.width + RING_PAD * 2, height: m.height + RING_PAD * 2 });
    };

    const m0 = measure(target);
    if (m0 && m0.el && typeof m0.el.scrollIntoView === 'function') {
      try {
        m0.el.scrollIntoView({ block: 'center', inline: 'nearest' });
      } catch (_) {
        m0.el.scrollIntoView();
      }
      // On a phone the card is a bottom sheet; if the target now sits under
      // it, nudge the page so the target stays visible above the sheet.
      raf = window.requestAnimationFrame(() => {
        const again = measure(target);
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
  }, [open, step, target, steps]);

  // Escape closes.
  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open || !steps || !current) return null;

  const total = steps.length;
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

  const titleId = `sp-tutorial-title-${tutorial.id}`;

  return (
    <div
      className={`sp-tutorial sp-tutorial-scrim${ring ? ' has-target' : ''}${placement}`}
      role="presentation"
      data-tutorial-open="true"
    >
      {ring ? (
        <div
          className="sp-tutorial-ring"
          aria-hidden="true"
          style={{ top: ring.top, left: ring.left, width: ring.width, height: ring.height }}
        />
      ) : null}

      <div
        ref={cardRef}
        className="sp-tutorial-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" aria-label="Close" className="sp-tutorial-close" onClick={skip}>
          ×
        </button>

        <div className="sp-tutorial-kicker">
          <span className="sp-tutorial-step-badge">{step + 1}/{total}</span>
          <CompassIcon />
          <span>{tutorial.title} Tour</span>
        </div>
        <h2 id={titleId} className="sp-tutorial-title">{current.title}</h2>
        <p className="sp-tutorial-body">{current.body}</p>

        <div className="sp-tutorial-progress" aria-hidden="true">
          <span style={{ width: `${((step + 1) / total) * 100}%` }} />
        </div>
        <div className="sp-tutorial-dots" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s.id} className={`sp-tutorial-dot${i === step ? ' active' : ''}`} />
          ))}
        </div>

        <div className="sp-tutorial-actions">
          <button type="button" className="sp-tutorial-btn sp-tutorial-btn--ghost" onClick={skip}>
            Skip
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="sp-tutorial-btn sp-tutorial-btn--secondary"
            onClick={goBack}
            disabled={isFirst}
            style={{ opacity: isFirst ? 0.4 : 1 }}
          >
            Back
          </button>
          <button type="button" className="sp-tutorial-btn sp-tutorial-btn--primary" onClick={goNext}>
            {isLast ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
