/**
 * PullToRefresh: an explicit refresh control for feeds and lists on phones.
 *
 * WHY: src/index.css sets `overscroll-behavior-y: none` on the app so the
 * browser's own pull-to-refresh cannot reload the whole SPA mid-hand. That
 * killed the gesture players expect on every list. This puts it back,
 * scoped to one region, calling the page's own reload instead of a
 * document reload (mobile standard, "Pull-to-refresh").
 *
 * How it works:
 * - Touch only (pointer events with pointerType === 'touch'). Desktop is
 *   untouched; mouse drags never trigger it.
 * - Arms only when the page is at the top (window.scrollY <= 0, or the
 *   nearest scroll container's scrollTop <= 0 when `scrollRef` is given).
 * - Pull distance is damped (0.5 up to the threshold, 0.25 beyond); past
 *   THRESHOLD_PX the indicator turns "Release To Refresh", a light haptic
 *   fires once, and release calls `onRefresh` (awaited; the spinner shows
 *   until it settles, capped at 8s like every other load).
 * - The moving part is a transform on the wrapper (no layout thrash), and
 *   `touch-action: pan-y` stays intact so vertical scrolling is unaffected.
 * - Disabled while `disabled` is true (an open sheet, an in-flight save).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useHaptics } from '../../hooks/useHaptics';

const THRESHOLD_PX = 64;
const MAX_PULL_PX = 110;
const SETTLE_CAP_MS = 8000;

function atTop(scrollRef) {
  if (scrollRef && scrollRef.current) return scrollRef.current.scrollTop <= 0;
  if (typeof window === 'undefined') return false;
  return (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
}

export default function PullToRefresh({ onRefresh, disabled = false, scrollRef = null, children, className = '' }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(null);
  const armedRef = useRef(false);
  const buzzedRef = useRef(false);
  const mountedRef = useRef(true);
  const haptic = useHaptics();

  useEffect(() => () => { mountedRef.current = false; }, []);

  const reset = useCallback(() => {
    startYRef.current = null;
    armedRef.current = false;
    buzzedRef.current = false;
    setPull(0);
  }, []);

  const onPointerDown = useCallback((e) => {
    if (disabled || refreshing || e.pointerType !== 'touch') return;
    if (!atTop(scrollRef)) return;
    startYRef.current = e.clientY;
    armedRef.current = true;
  }, [disabled, refreshing, scrollRef]);

  const onPointerMove = useCallback((e) => {
    if (!armedRef.current || startYRef.current === null || e.pointerType !== 'touch') return;
    const dy = e.clientY - startYRef.current;
    if (dy <= 0 || !atTop(scrollRef)) {
      if (pull !== 0) setPull(0);
      return;
    }
    const damped = dy <= THRESHOLD_PX * 2 ? dy * 0.5 : THRESHOLD_PX + (dy - THRESHOLD_PX * 2) * 0.25;
    const next = Math.min(MAX_PULL_PX, damped);
    setPull(next);
    if (next >= THRESHOLD_PX && !buzzedRef.current) {
      buzzedRef.current = true;
      haptic('light');
    }
  }, [haptic, pull, scrollRef]);

  const onPointerUp = useCallback(async () => {
    if (!armedRef.current) return;
    const shouldRefresh = pull >= THRESHOLD_PX && !refreshing && typeof onRefresh === 'function';
    reset();
    if (!shouldRefresh) return;
    setRefreshing(true);
    setPull(THRESHOLD_PX * 0.7);
    let cap = null;
    try {
      await Promise.race([
        Promise.resolve(onRefresh()),
        new Promise((resolve) => { cap = setTimeout(resolve, SETTLE_CAP_MS); }),
      ]);
    } catch (_) {
      // The page's own loader reports its errors; the gesture just ends.
    } finally {
      if (cap) clearTimeout(cap);
      if (mountedRef.current) {
        setRefreshing(false);
        setPull(0);
      }
    }
  }, [onRefresh, pull, refreshing, reset]);

  const ready = pull >= THRESHOLD_PX;
  const label = refreshing ? 'Refreshing' : ready ? 'Release To Refresh' : 'Pull To Refresh';
  const visible = pull > 0 || refreshing;

  return (
    <div
      className={`sp-ptr${className ? ` ${className}` : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={reset}
      style={{ position: 'relative', touchAction: 'pan-y' }}
    >
      <div
        className="sp-ptr-indicator"
        aria-live="polite"
        aria-hidden={visible ? 'false' : 'true'}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: THRESHOLD_PX,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          fontSize: 13,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.75)',
          opacity: visible ? Math.min(1, pull / THRESHOLD_PX) : 0,
          transform: `translateY(${pull - THRESHOLD_PX}px)`,
          transition: pull === 0 ? 'opacity 0.2s ease, transform 0.2s ease' : 'none',
          pointerEvents: 'none',
        }}
      >
        <span
          className={`sp-ptr-spinner${refreshing ? ' is-spinning' : ''}`}
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.25)',
            borderTopColor: '#6ee7ef',
            transform: refreshing ? undefined : `rotate(${Math.min(360, pull * 4)}deg)`,
            animation: refreshing ? 'spPtrSpin 0.8s linear infinite' : 'none',
          }}
        />
        <span>{label}</span>
      </div>
      <div
        className="sp-ptr-content"
        style={{
          // NO transform at rest (2026-09-04). `translateY(0px)` is still a
          // transform, and a transformed ancestor is the containing block for
          // every `position: fixed` descendant. The Bankroll Manager's world
          // menu (a fixed drawer rendered inside this wrapper) opened 160px
          // from the left edge on desktop - pinned to the centred column, not
          // the viewport - and e2e/020-hamburger.spec.ts was red on main from
          // the day this wrapper shipped. Any fixed sheet or toast rendered
          // inside a pull-to-refresh page had the same problem. The transform
          // exists only while a pull is in progress.
          transform: pull ? `translateY(${pull}px)` : undefined,
          transition: pull === 0 || refreshing ? 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none',
          willChange: pull ? 'transform' : 'auto',
        }}
      >
        {children}
      </div>
    </div>
  );
}
