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
import { useState } from 'react';
import { Menu } from 'lucide-react';
import HamburgerMenu from '../ui/HamburgerMenu';

export default function CommanderPageShell({ children }) {
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <>
            {/* Fixed hamburger icon — always visible on Commander subpages */}
            <button
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
                <Menu size={20} color="#22D3EE" />
            </button>

            {/* Universal HamburgerMenu — contains ReportBugWidget + Geeves AI */}
            <HamburgerMenu
                isOpen={menuOpen}
                onClose={() => setMenuOpen(false)}
                direction="right"
                theme="dark"
                showProfile={true}
            />

            {/* Page content */}
            {children}
        </>
    );
}
