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

                    .header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        flex-wrap: wrap;
                        gap: 15px;
                        margin-bottom: 30px;
                    }

                    .current-avatar {
                        display: flex;
                        align-items: center;
                        gap: 15px;
                        padding: 12px 20px;
                        background: linear-gradient(145deg, rgba(10, 14, 39, 0.8), rgba(26, 31, 58, 0.9));
                        border: 2px solid #00f5ff;
                        border-radius: 16px;
                        box-shadow: 0 8px 32px rgba(0, 245, 255, 0.2), inset 0 2px 10px rgba(255, 255, 255, 0.1);
                        backdrop-filter: blur(10px);
                        transform: translateZ(0);
                        transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
                    }
                    
                    .current-avatar:hover {
                        transform: translateY(-5px) scale(1.02);
                        box-shadow: 0 15px 40px rgba(0, 245, 255, 0.4), inset 0 2px 15px rgba(255, 255, 255, 0.2);
                        border-color: #00f5ff;
                    }

                    .current-avatar-img {
                        width: 60px;
                        height: 60px;
                        border-radius: 50%;
                        border: 3px solid #00f5ff;
                        box-shadow: 0 0 15px rgba(0, 245, 255, 0.5);
                        object-fit: cover;
                        background: #000000;
                    }

                    .current-avatar-info {
                        font-family: 'Rajdhani', sans-serif;
                    }

                    .current-avatar-label {
                        font-size: 12px;
                        color: #00f5ff;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                        margin-bottom: 4px;
                        text-shadow: 0 0 5px rgba(0, 245, 255, 0.5);
                    }

                    .current-avatar-name {
                        font-size: 18px;
                        color: #fff;
                        font-weight: 700;
                        text-shadow: 0 2px 4px rgba(0,0,0,0.8);
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
