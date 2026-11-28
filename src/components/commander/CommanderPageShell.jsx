/**
 * CommanderPageShell
 * ═══════════════════════════════════════════════════════════════════════════
 * Provides a persistent hamburger menu icon + drawer to every Commander
 * subpage. Must be wrapped around the outermost <div className="cmd-page">.
 *
 * Usage:
 *   import CommanderPageShell from '../../../src/components/commander/CommanderPageShell';
 *   <CommanderPageShell>
 *     <div className="cmd-page">...</div>
 *   </CommanderPageShell>
 *
 * The universal HamburgerMenu already contains ReportBugWidget and Geeves AI.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import { Menu } from 'lucide-react';
import HamburgerMenu from '../ui/HamburgerMenu';
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
  return typeof document === 'undefined' ? null : document.querySelector('header.cmd-header-full');
}

export default function CommanderPageShell({ children }) {
    const [menuOpen, setMenuOpen] = useState(false);
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
            {/* Fixed hamburger icon - always visible on Commander subpages */}
            <button
                className="commander-page-shell__menu-trigger"
                onClick={() => setMenuOpen(true)}
                aria-label="Open Menu"
                style={{
                    position: 'fixed',
                    top: 16,
                    right: 16,
                    zIndex: 9000,
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: 'rgba(10, 30, 60, 0.85)',
                    border: '1px solid rgba(34, 211, 238, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    backdropFilter: 'blur(4px)',
                    transition: 'border-color 0.2s, background 0.2s',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'rgba(34, 211, 238, 0.7)';
                    e.currentTarget.style.background = 'rgba(10, 30, 60, 0.95)';
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'rgba(34, 211, 238, 0.35)';
                    e.currentTarget.style.background = 'rgba(10, 30, 60, 0.85)';
                }}
            >
                <Menu size={20} color="#22D3EE" aria-hidden="true" />
            </button>

            {/* Universal HamburgerMenu - contains ReportBugWidget + Geeves AI */}
            <HamburgerMenu
                isOpen={menuOpen}
                onClose={() => setMenuOpen(false)}
                direction="right"
                theme="dark"
                showProfile={true}
            />

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
