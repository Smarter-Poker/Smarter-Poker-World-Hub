/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HEADER TEST PAGE — Isolated testing for ThreePillHeader component
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState } from 'react';
import ThreePillHeader from '../../src/components/ui/ThreePillHeader';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import menuConfig from '../../src/config/hamburgerMenus';

export default function HeaderTestPage() {
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <div style={{
            minHeight: '100vh',
            background: '#0a0e1a',
            color: 'white',
        }}>
            {/* The Header */}
            <ThreePillHeader
                pageDepth={1}
                onMenuClick={() => setMenuOpen(true)}
            />

            {/* Hamburger Menu */}
            <HamburgerMenu
                isOpen={menuOpen}
                onClose={() => setMenuOpen(false)}
                direction="left"
                theme="dark"
                user={null}
                showProfile={false}
                menuItems={menuConfig.menuItems}
                bottomLinks={menuConfig.bottomLinks}
            />

            {/* Empty page content - just for spacing */}
            <div style={{
                padding: 40,
                textAlign: 'center',
            }}>
                <h1 style={{
                    fontSize: 24,
                    opacity: 0.3,
                    marginTop: 100,
                }}>
                    Header Test Page
                </h1>
                <p style={{ opacity: 0.2 }}>
                    This page is blank to isolate the header component for testing
                </p>
            </div>
        </div>
    );
}
