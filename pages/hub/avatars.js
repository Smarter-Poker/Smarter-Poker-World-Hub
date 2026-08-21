/**
 * AVATAR SELECTION PAGE
 * Dedicated page for browsing and selecting avatars
 * Custom avatars integrated at top for VIP users
 */

import SEOHead from '../../src/components/seo/SEOHead';
import { useEffect, useState } from 'react';

import UniversalHeader from '../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { useAvatar } from '../../src/contexts/AvatarContext';
import AvatarGallery from '../../src/components/avatars/AvatarGallery';

// God-Mode Stack
import PageTransition from '../../src/components/transitions/PageTransition';
import BottomNavBar from '../../src/components/ui/BottomNavBar';

export default function AvatarsPage() {
    const { avatar, user, refreshUser } = useAvatar();
    const [menuOpen, setMenuOpen] = useState(false);

    const menuConfig = getMenuConfig('avatars', user, {}, {});

    // Refresh user session on page load to get latest VIP status.
    // BUGFIX: dep was [] — user is null on first render (auth restores async),
    // so refreshUser never actually ran. Key on the user id instead.
    useEffect(() => {
        if (user?.id && refreshUser) {
            refreshUser();
        }
    }, [user?.id]);

    return (
        <PageTransition>
            <SEOHead
                title="Avatar Collection"
                description="Browse And Select From The Smarter.Poker Avatar Collection. Customize Your Player Identity."
                canonical="/hub/avatars"
                noindex={true}
            />

            <div className="avatars-page-wrapper">
                <div className="avatars-page">
                    <style>{`
                    .avatars-page {
                        min-height: 100vh;
                        padding: 0;
                        padding-bottom: 70px;
                        background: url('/images/bg_honeycomb.png') repeat fixed;
                        background-size: 80px 80px;
                        background-color: #0a0a15;
                        width: 100%;
                        max-width: 100vw;
                        overflow-x: hidden;
                        box-sizing: border-box;
                    }

                    .avatars-content {
                        max-width: 1400px;
                        margin: 0 auto;
                        padding: 20px;
                    }

                    

                    
                    
                    

                    

                    

                    

                    
                `}</style>

                    {/* Header */}
                    <UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} />
                    <HamburgerMenu
                        isOpen={menuOpen}
                        onClose={() => setMenuOpen(false)}
                        direction="right"
                        theme="dark"
                        user={user}
                        menuItems={menuConfig.menuItems}
                        bottomLinks={menuConfig.bottomLinks}
                    />
                    <div className="avatars-content">
                        {/* Avatar Gallery - Custom avatars at top for VIP, then preset avatars */}
                        <AvatarGallery />
                    </div>
                </div>
            </div>
              <BottomNavBar />
    </PageTransition>
    );
}
