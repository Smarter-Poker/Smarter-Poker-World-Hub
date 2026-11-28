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
import { createContext, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import UniversalHeader from '../ui/UniversalHeader';
import { SD_HEADER_HELP_ICON } from '../smarterdesign/headerHelp';

/*
 * #SMARTERDESIGN (Dan, 2026-11-27): every /hub/commander page header is a
 * page image header (styles in src/styles/commander-futuristic.css, the
 * #SMARTERDESIGN layer). The shell supplies the two parts a page cannot get
 * from CSS alone: its scene (longest route prefix below, World Hub header
 * library, each family on art that depicts it, chosen by looking at it) and the one painted chrome "?" in the header's upper-right corner,
 * which opens the Commander FAQ with a page-specific accessible name.
 */
const SCENES = [
  ['/hub/commander', 'pnm-lobby'],
  ['/hub/commander/check-in', 'toke-venues'],
  ['/hub/commander/faq', 'rules'],
  ['/hub/commander/hand-history', 'training-replay-theater'],
  ['/hub/commander/hand-history/[handId]', 'training-hand-lab'],
  ['/hub/commander/history', 'bankroll'],
  ['/hub/commander/home-games', 'pnm-homegames'],
  ['/hub/commander/home-games/[id]/manage', 'training-session-dashboard'],
  ['/hub/commander/home-games/[id]/roster', 'training-position-mastery'],
  ['/hub/commander/home-games/create', 'training-table-wizard'],
  ['/hub/commander/leaderboard', 'preflop-leaderboard'],
  ['/hub/commander/leagues', 'series'],
  ['/hub/commander/leagues/[id]', 'training-community-leaderboard'],
  ['/hub/commander/notifications', 'pnm-alerts'],
  ['/hub/commander/player-card', 'staking-profile'],
  ['/hub/commander/profile', 'training-player-profiles'],
  ['/hub/commander/profile/achievements', 'training-achievements'],
  ['/hub/commander/profile/settings', 'settings'],
  ['/hub/commander/rate-table', 'training-study-group'],
  ['/hub/commander/responsible-gaming', 'training-tilt-guard'],
  ['/hub/commander/rewards', 'store-rewards'],
  ['/hub/commander/services', 'store-order-detail'],
  ['/hub/commander/squads', 'training-study-group-finder'],
  ['/hub/commander/squads/[id]', 'training-multiway-preflop'],
  ['/hub/commander/tournament', 'training-tournaments'],
  ['/hub/commander/tournament/[id]/clock', 'tournament-calendar'],
  ['/hub/commander/tournament/[id]/register', 'preflop-tutorial'],
  ['/hub/commander/tournaments', 'poker_mtt'],
  ['/hub/commander/venue', 'pnm-venues'],
  ['/hub/commander/venues', 'pnm-map'],
  ['/hub/commander/venues/[id]', 'pnm-venues'],
  ['/hub/commander/waitlist', 'pnm-live'],
];

// The longest prefix that ends on a path segment wins, so /tournaments is not
// /tournament and /venues is not /venue (2026-11-28: the old first-hit,
// any-character match gave both families the other one's scene).
export function sceneFor(pathname = '') {
  let best = null;
  for (const [prefix, art] of SCENES) {
    if ((pathname === prefix || pathname.startsWith(prefix + '/')) && (!best || prefix.length > best[0].length)) best = [prefix, art];
  }
  return best ? best[1] : 'pnm-lobby';
}

function findHeader() {
  return typeof document === 'undefined' ? null : document.querySelector('header.cmd-header-full, header.cmd-header-bar');
}

// One shell per page. commanderPageLayout (below) wraps each whole page in
// this shell; the page's own <CommanderPageShell> inside it renders its
// children only.
const InsideCommanderShell = createContext(false);

export default function CommanderPageShell({ children }) {
    const insideShell = useContext(InsideCommanderShell);
    if (insideShell) return <>{children}</>;
    return <CommanderPageShellFrame>{children}</CommanderPageShellFrame>;
}

/**
 * Page layout for every /hub/commander page: `Page.getLayout = commanderPageLayout`.
 * pages/_app.js applies it, so a page's loading, not-found and error screens
 * (usually returned before its own <CommanderPageShell>) get the global header,
 * scene and painted "?" too.
 */
export function commanderPageLayout(page) {
    return <CommanderPageShell>{page}</CommanderPageShell>;
}

function CommanderPageShellFrame({ children }) {
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
                <InsideCommanderShell.Provider value={true}>
                    {children}
                </InsideCommanderShell.Provider>
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
