import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Menu } from 'lucide-react';
import HamburgerMenu from './HamburgerMenu';
import { getMenuConfigForPath } from '../../config/hamburgerMenus';
import { sanitizeFallbackMenuConfig } from '../../config/fallbackMenuSafety.mjs';
import { resolveWorldMenu } from '../../config/worldMenuNavigation';

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
  const menuConfig = useMemo(
    () => sanitizeFallbackMenuConfig(getMenuConfigForPath(path, null)),
    [path]
  );
  const [isOpen, setIsOpen] = useState(false);
  const [hasHeaderTrigger, setHasHeaderTrigger] = useState(true);

  useEffect(() => {
    if (!world || typeof document === 'undefined') {
      setHasHeaderTrigger(true);
      return undefined;
    }

    let frame = 0;
    let absenceTimer = 0;
    const inspect = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const approvedTrigger = document.querySelector(
          '[data-world-menu-trigger="approved-header"]'
        );
        if (approvedTrigger) {
          window.clearTimeout(absenceTimer);
          setHasHeaderTrigger(true);
          return;
        }

        // Per-page headers remount during route hydration. Treat a short DOM
        // absence as a transition, not proof that the page needs a fallback;
        // otherwise both controls can coexist for a frame after the header
        // returns. A truly headerless route still receives its dock promptly.
        window.clearTimeout(absenceTimer);
        absenceTimer = window.setTimeout(() => {
          setHasHeaderTrigger(
            Boolean(document.querySelector('[data-world-menu-trigger="approved-header"]'))
          );
        }, 120);
      });
    };
    inspect();
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(absenceTimer);
      observer.disconnect();
    };
  }, [world, router.pathname]);

  useEffect(() => {
    const close = () => setIsOpen(false);
    router.events.on('routeChangeStart', close);
    return () => router.events.off('routeChangeStart', close);
  }, [router.events]);

  // Social owns the approved header in both its loading and loaded shells.
  // Never race that canonical Facebook-styled drawer with a DOM-probed
  // fallback while the feed swaps skeletons during hydration.
  if (!world || world.id === 'social-media') return null;

  return (
    <>
      {!hasHeaderTrigger && (
        <button
          type="button"
          className="sp-world-command-trigger"
          data-world-menu-trigger="route-fallback"
          data-menu-symbol="hamburger"
          aria-label={`Open ${world.label} Command Menu`}
          onClick={() => setIsOpen(true)}
          style={{ '--world-command-accent': world.accent }}
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
          --world-command-accent: #2e9bff;
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
          border: 1px solid rgba(201,215,227,.58);
          border-radius: 4px;
          color: #eef5fb;
          text-align: left;
          background: linear-gradient(145deg, rgba(25,34,43,.98), rgba(3,7,11,.99));
          box-shadow: inset 0 1px rgba(255,255,255,.12), inset 0 -1px #000, 0 9px 26px rgba(0,0,0,.55);
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
          background: linear-gradient(90deg, transparent, var(--world-command-accent), transparent);
          box-shadow: 0 0 8px var(--world-command-accent);
        }
        /* The tile chrome is unchanged - only the symbol inside it. The two
           repeat() tracks and the round dot nodes they laid out went with the
           six-node grid (Dan 2026-09-05). */
        .sp-world-command-trigger__nodes {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(201,215,227,.36);
          border-radius: 3px;
          background: #05090d;
          color: var(--world-command-accent);
        }
        .sp-world-command-trigger__nodes svg {
          display: block;
          filter: drop-shadow(0 0 5px var(--world-command-accent));
        }
        .sp-world-command-trigger__copy small,
        .sp-world-command-trigger__copy strong { display: block; line-height: 1; }
        .sp-world-command-trigger__copy small { margin-bottom: 5px; color: #75879a; font-size: 8px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
        .sp-world-command-trigger__copy strong { overflow: hidden; color: #eef5fb; font: 600 13px/1 var(--font-rajdhani), Rajdhani, sans-serif; letter-spacing: .07em; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
        .sp-world-command-trigger:focus-visible { outline: 2px solid var(--world-command-accent); outline-offset: 3px; }
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
