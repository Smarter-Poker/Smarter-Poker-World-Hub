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

export default function BankrollFrameDev() {
    const [menuOpen, setMenuOpen] = useState(false);
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
};
