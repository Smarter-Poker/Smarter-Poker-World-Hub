// src/components/ui/DiscoveryLayout.jsx
import React, { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import UniversalHeader from './UniversalHeader';
import HamburgerMenu from './HamburgerMenu';
import { getMenuConfig } from '../../config/hamburgerMenus';

export default function DiscoveryLayout({ children, meta, onBackClick }) {
    const router = useRouter();
    const [isMenuOpen, setMenuOpen] = useState(false);
    const menuConfig = getMenuConfig('events');

    const handleBackClick = () => {
        if (onBackClick) onBackClick();
        else router.push('/hub/poker-near-me');
    };

    return (
        <>
            <Head>
                <title>{meta?.title || 'Poker Discovery Hub | Smarter.Poker'}</title>
                <meta name="description" content={meta?.description || ''} />
                <meta property="og:title" content={meta?.title || ''} />
                <meta property="og:description" content={meta?.description || ''} />
                {meta?.ogImage && <meta property="og:image" content={meta.ogImage} />}
            </Head>

            <div className="pnm-page">
                {/* Space Background */}
                <div className="space-bg" />
                <div className="space-overlay" />

                {/* Header */}
                <UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} onBackClick={handleBackClick} />

                {/* Hamburger Menu */}
                <HamburgerMenu
                    isOpen={isMenuOpen}
                    onClose={() => setMenuOpen(false)}
                    direction="left"
                    theme="dark"
                    user={null}
                    showProfile={false}
                    menuItems={menuConfig.menuItems}
                    bottomLinks={menuConfig.bottomLinks}
                />

                {/* Page Content */}
                {children}
            </div>
        </>
    );
}
