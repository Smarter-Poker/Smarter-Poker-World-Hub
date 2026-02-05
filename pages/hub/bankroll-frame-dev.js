/**
 * BANKROLL FRAME DEV PAGE
 * /hub/bankroll-frame-dev — Development page for frame alignment
 * Just the header and frame image to start building from
 */

import Head from 'next/head';
import { useState } from 'react';
import ThreePillHeader from '../../src/components/ui/ThreePillHeader';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';

const SIDEBAR_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: '+' },
    { id: 'log-session', label: 'Log Session', icon: '' },
    { id: 'trips', label: 'Trips & Expenses', icon: '' },
    { id: 'players', label: 'Player Notes', icon: '' },
    { id: 'leaks', label: 'Leaks', icon: '' },
    { id: 'reports', label: 'Reports', icon: '' },
    { id: 'pro', label: 'Pro Tools', icon: '' },
    { id: 'settings', label: 'Settings', icon: '' },
];

export default function BankrollFrameDev() {
    const [menuOpen, setMenuOpen] = useState(false);
    const [activeSection, setActiveSection] = useState('dashboard');
    const menuConfig = getMenuConfig('bankroll');

    return (
        <>
            <Head>
                <title>Bankroll Frame Dev — Smarter.Poker</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
            </Head>

            <div style={styles.page}>
                {/* HUD Frame Background */}
                <div style={styles.frameBackground} />

                {/* Global Header */}
                <ThreePillHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} />

                {/* Content Layer */}
                <div style={styles.contentLayer}>
                    {/* Left Sidebar */}
                    <nav style={styles.sidebar}>
                        {SIDEBAR_ITEMS.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => setActiveSection(item.id)}
                                style={{
                                    ...styles.sidebarItem,
                                    ...(activeSection === item.id ? styles.sidebarItemActive : {}),
                                }}
                            >
                                {item.icon && <span style={styles.sidebarIcon}>{item.icon}</span>}
                                <span>{item.label}</span>
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Hamburger Menu */}
                <HamburgerMenu
                    isOpen={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    direction="left"
                    theme="dark"
                    menuItems={menuConfig.menuItems}
                    bottomLinks={menuConfig.bottomLinks}
                />
            </div>
        </>
    );
}

const styles = {
    page: {
        minHeight: '100vh',
        background: '#000',
        position: 'relative',
    },
    frameBackground: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: 'url(/images/hud-frames/bankroll-frame.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        zIndex: 0,
    },
    contentLayer: {
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        minHeight: 'calc(100vh - 70px)',
    },
    sidebar: {
        width: 140,
        padding: '85px 12px 20px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    sidebarItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '10px 12px',
        background: 'transparent',
        border: 'none',
        borderRadius: 6,
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: 12,
        fontFamily: 'Inter, -apple-system, sans-serif',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.2s ease',
    },
    sidebarItemActive: {
        background: 'rgba(0, 180, 216, 0.15)',
        border: '1px solid rgba(0, 180, 216, 0.4)',
        color: '#00b4d8',
        fontWeight: 600,
    },
    sidebarIcon: {
        fontSize: 14,
        fontWeight: 700,
    },
};
