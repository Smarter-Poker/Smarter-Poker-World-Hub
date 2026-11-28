/**
 * CommanderPageShell
 * ═══════════════════════════════════════════════════════════════════════════
 * Every Club Commander player page (pages/hub/commander/*) renders inside this
 * shell. It mounts the approved Smarter.Poker global header (UniversalHeader:
 * the approved hamburger, the live profile photo, the same row every other
 * World Hub page shows) and gives the page's own image header its
 * #SMARTERDESIGN scene and its one painted "?".
 *
 * Usage:
 *   import CommanderPageShell from '../../../src/components/commander/CommanderPageShell';
 *   <CommanderPageShell>
 *     <div className="cmd-page">...</div>
 *   </CommanderPageShell>
 *
 * Until 2026-11-28 the shell drew its own floating hamburger instead of the
 * global header, so no /hub/commander subpage showed the Smarter.Poker header
 * or the player's photo, and the floating button sat on top of the painted
 * "?" in the image header's upper-right corner.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import UniversalHeader from '../ui/UniversalHeader';
import { SD_HEADER_HELP_ICON } from '../smarterdesign/headerHelp';

/*
 * #SMARTERDESIGN (Dan, 2026-11-27): every /hub/commander page header is a
 * page image header (styles in src/styles/commander-futuristic.css, the
 * #SMARTERDESIGN layer). The shell supplies the two parts a page cannot get
 * from CSS alone: its scene (longest route prefix below, World Hub header
 * library) and the one painted chrome "?" in the header's upper-right corner,
 * which opens the Commander FAQ with a page-specific accessible name.
 */
const SCENES = [
  ['/hub/commander/check-in', 'players'],
  ['/hub/commander/faq', 'rules'],
  ['/hub/commander/hand-history', 'poker_cash'],
  ['/hub/commander/history', 'reports'],
  ['/hub/commander/home-games', 'toke-home'],
  ['/hub/commander/leaderboard', 'series'],
  ['/hub/commander/leagues', 'series'],
  ['/hub/commander/notifications', 'news'],
  ['/hub/commander/player-card', 'staking-profile'],
  ['/hub/commander/profile', 'staking-profile'],
  ['/hub/commander/rate-table', 'poker-odds'],
  ['/hub/commander/responsible-gaming', 'rules'],
  ['/hub/commander/rewards', 'store-rewards'],
  ['/hub/commander/services', 'toke-venues'],
  ['/hub/commander/squads', 'players'],
  ['/hub/commander/tournament', 'poker_mtt'],
  ['/hub/commander/venue', 'toke-venues'],
  ['/hub/commander/waitlist', 'players'],
  ['/hub/commander', 'casino_table'],
];

export function sceneFor(pathname = '') {
  const hit = SCENES.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + '/') || (prefix !== '/hub/commander' && pathname.startsWith(prefix)));
  return hit ? hit[1] : 'casino_table';
}

function findHeader() {
  return typeof document === 'undefined' ? null : document.querySelector('header.cmd-header-full, header.cmd-header-bar');
}

export default function CommanderPageShell({ children }) {
    const router = useRouter();
    const pathname = (router && router.pathname) || '';
    const scene = sceneFor(pathname);
    const [header, setHeader] = useState(null);
    const [pageTitle, setPageTitle] = useState('This Page');

    // The page renders its own header (sometimes only after data loads);
    // follow it so the painted "?" always sits in the current one.
    useEffect(() => {
        const sync = () => {
            const el = findHeader();
            setHeader((prev) => (prev === el ? prev : el));
            const text = el && el.querySelector('h1') ? el.querySelector('h1').textContent.trim() : '';
            if (text) setPageTitle(text);
        };
        sync();
        const observer = new MutationObserver(sync);
        observer.observe(document.body, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, [pathname]);

    return (
        <>
            {/* The approved Smarter.Poker global header, as on every World Hub page */}
            <UniversalHeader />

            {/* Page content, with this page's #SMARTERDESIGN scene */}
            <div className="smarterdesign" style={{ '--sd-scene': `url(/images/smarterdesign/headers/${scene}-scene.webp)` }} data-sd-scene={scene}>
                {children}
            </div>
            {header && createPortal(
                <a href="/hub/commander/faq" className="sd-header-help" data-focus-custom="" aria-label={`Help For ${pageTitle}`}>
                    <img src={SD_HEADER_HELP_ICON} alt="" width="36" height="37" draggable={false} />
                </a>,
                header
            )}
        </>
    );
}
