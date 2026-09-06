import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Menu } from 'lucide-react';
import HamburgerMenu from './HamburgerMenu';
import { getMenuConfigForPath } from '../../config/hamburgerMenus';
import { sanitizeFallbackMenuConfig } from '../../config/fallbackMenuSafety.mjs';
import { getWorldMenuStyleVariables, resolveWorldMenu } from '../../config/worldMenuNavigation';

const APPROVED_TRIGGER_SELECTOR = '[data-world-menu-trigger="approved-header"]';

function isTriggerUsable(trigger) {
  if (
    !trigger
    || !trigger.isConnected
    || trigger.disabled
    || trigger.getClientRects().length === 0
    || trigger.closest('[hidden], [inert], [aria-hidden="true"]')
  ) return false;

  let node = trigger;
  while (node && node instanceof Element) {
    const style = window.getComputedStyle(node);
    if (
      style.display === 'none'
      || style.visibility === 'hidden'
      || Number.parseFloat(style.opacity || '1') < 0.01
      || style.pointerEvents === 'none'
    ) {
      return false;
    }
    node = node.parentElement;
  }

  return true;
}

function getApprovedTriggers() {
  return Array.from(document.querySelectorAll(APPROVED_TRIGGER_SELECTOR));
}

function hasUsableApprovedTrigger(triggers = getApprovedTriggers()) {
  return triggers.some(isTriggerUsable);
}

/**
 * Route-aware safety net for legacy world pages that do not own a shared
 * header. Pages with the approved header keep its in-frame trigger. Pages
 * without it receive this single compact command node, so every retained
 * route remains orientable without duplicating controls.
 */
export default function WorldCommandDock() {
  const router = useRouter();
  const path = router.asPath || router.pathname || '/';
  const world = useMemo(() => resolveWorldMenu(path), [path]);
  const worldMenuStyle = useMemo(() => getWorldMenuStyleVariables(world), [world]);
  const menuConfig = useMemo(
    () => sanitizeFallbackMenuConfig(getMenuConfigForPath(path, null)),
    [path]
  );
  const [isOpen, setIsOpen] = useState(false);
  const [hasHeaderTrigger, setHasHeaderTrigger] = useState(true);

  useLayoutEffect(() => {
    if (!world || typeof document === 'undefined') {
      setHasHeaderTrigger(true);
      return undefined;
    }

    let frame = 0;
    let absenceTimer = 0;
    let visibilityObserver;
    let observedTriggers = [];

    const reconcile = (force = false) => {
      const approvedTriggers = getApprovedTriggers();
      const triggerSetChanged = approvedTriggers.length !== observedTriggers.length
        || approvedTriggers.some((trigger, index) => trigger !== observedTriggers[index]);
      if (!force && !triggerSetChanged) return;
      observedTriggers = approvedTriggers;

      visibilityObserver.disconnect();
      const observedAncestors = new Set();
      for (const trigger of approvedTriggers) {
        for (let node = trigger; node && node instanceof Element; node = node.parentElement) {
          if (observedAncestors.has(node)) continue;
          observedAncestors.add(node);
          visibilityObserver.observe(node, {
            attributes: true,
            attributeFilter: ['aria-hidden', 'class', 'hidden', 'inert', 'style'],
          });
        }
      }

      if (hasUsableApprovedTrigger(approvedTriggers)) {
        window.clearTimeout(absenceTimer);
        setIsOpen(false);
        setHasHeaderTrigger(true);
        return;
      }

      // Per-page headers remount during route hydration. Treat a short DOM
      // absence as a transition, not proof that the page needs a fallback;
      // otherwise both controls can coexist after the header returns. A truly
      // headerless route still receives its dock promptly.
      window.clearTimeout(absenceTimer);
      absenceTimer = window.setTimeout(() => {
        const usable = hasUsableApprovedTrigger();
        if (usable) setIsOpen(false);
        setHasHeaderTrigger(usable);
      }, 120);
    };

    const inspect = (force = false) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        reconcile(force);
      });
    };
    visibilityObserver = new MutationObserver(() => inspect(true));
    reconcile(true);
    const observer = new MutationObserver(() => inspect(false));
    observer.observe(document.body, { childList: true, subtree: true });
    const inspectViewport = () => inspect(true);
    window.addEventListener('resize', inspectViewport);
    window.visualViewport?.addEventListener('resize', inspectViewport);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(absenceTimer);
      observer.disconnect();
      visibilityObserver.disconnect();
      window.removeEventListener('resize', inspectViewport);
      window.visualViewport?.removeEventListener('resize', inspectViewport);
    };
  }, [world, router.pathname]);

  useEffect(() => {
    const close = () => setIsOpen(false);
    router.events.on('routeChangeStart', close);
    return () => router.events.off('routeChangeStart', close);
  }, [router.events]);

  if (!world) return null;

  return (
    <>
      {!hasHeaderTrigger && (
        <button
          type="button"
          className="sp-world-command-trigger"
          data-world-menu-trigger="route-fallback"
          data-menu-symbol="hamburger"
          data-world-menu-scheme={world.menuPalette.scheme}
          aria-label={`Open ${world.label} Command Menu`}
          onClick={() => setIsOpen(true)}
          style={worldMenuStyle}
        >
          {/* HAMBURGER, NOT A SIX-NODE GRID (Dan 2026-09-05: "about the dots,
              yes fix and change it back to hamburger menu only"). This is a
              menu trigger, so it wears the symbol every other menu trigger on
              the platform wears - the approved header's baked hamburger and,
              since the same day, the drawer's own mark. */}
          <span className="sp-world-command-trigger__nodes" aria-hidden="true">
            <Menu size={20} strokeWidth={2.25} />
          </span>
          <span className="sp-world-command-trigger__copy">
            <small>World Command</small>
            <strong>{world.label}</strong>
          </span>
        </button>
      )}

      {!hasHeaderTrigger && (
        <HamburgerMenu
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          direction="left"
          theme="dark"
          menuItems={menuConfig.menuItems}
          bottomLinks={menuConfig.bottomLinks}
          menuKey={world.id}
        />
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .sp-world-command-trigger {
          position: fixed;
          top: max(12px, env(safe-area-inset-top, 0px));
          left: max(12px, env(safe-area-inset-left, 0px));
          z-index: 1200;
          min-width: 172px;
          min-height: 48px;
          display: grid;
          grid-template-columns: 36px minmax(0, 1fr);
          align-items: center;
          gap: 10px;
          padding: 6px 11px 6px 7px;
          border: 1px solid color-mix(in srgb, var(--world-border, #607080) 84%, white);
          border-radius: 4px;
          color: var(--world-text, #eef5fb);
          text-align: left;
          background: linear-gradient(145deg, var(--world-panel, #19222b), var(--world-canvas, #03070b));
          box-shadow: inset 0 1px rgba(255,255,255,.12), inset 0 -1px #000, 0 9px 26px rgba(0,0,0,.55), 0 0 18px var(--world-glow, rgba(46,155,255,.18));
          cursor: pointer;
          touch-action: manipulation;
        }
        .sp-world-command-trigger::after {
          content: '';
          position: absolute;
          right: 10px;
          bottom: 0;
          left: 10px;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--world-accent), var(--world-secondary), transparent);
          box-shadow: 0 0 8px var(--world-accent);
        }
        /* The tile chrome is unchanged - only the symbol inside it. The two
           repeat() tracks and the round dot nodes they laid out went with the
           six-node grid (Dan 2026-09-05). */
        .sp-world-command-trigger__nodes {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          border: 1px solid color-mix(in srgb, var(--world-border, #607080) 74%, white);
          border-radius: 3px;
          background: var(--world-canvas, #05090d);
          color: var(--world-accent);
        }
        .sp-world-command-trigger__nodes svg {
          display: block;
          filter: drop-shadow(0 0 5px var(--world-accent));
        }
        .sp-world-command-trigger__copy small,
        .sp-world-command-trigger__copy strong { display: block; line-height: 1; }
        .sp-world-command-trigger__copy small { margin-bottom: 5px; color: var(--world-muted, #75879a); font-size: 8px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
        .sp-world-command-trigger__copy strong { overflow: hidden; color: var(--world-text, #eef5fb); font: 600 13px/1 var(--font-rajdhani), Rajdhani, sans-serif; letter-spacing: .07em; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
        .sp-world-command-trigger:focus-visible { outline: 2px solid var(--world-focus, var(--world-accent)); outline-offset: 3px; }
        .sp-world-command-trigger:active { transform: translateY(1px); filter: brightness(1.08); }
        @media (max-width: 430px) {
          .sp-world-command-trigger { min-width: 48px; width: 48px; padding: 6px; grid-template-columns: 34px; }
          .sp-world-command-trigger__copy { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .sp-world-command-trigger { transition: none; }
        }
      ` }} />
    </>
  );
}
