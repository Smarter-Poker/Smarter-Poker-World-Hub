/**
 * 🎨 AVATAR SELECTION PAGE
 * Dedicated page for browsing and selecting avatars
 * Custom avatars integrated at top for VIP users
 */

import Head from 'next/head';
import Link from 'next/link';
import { useEffect } from 'react';
import { BrainHomeButton } from '../../src/components/navigation/WorldNavHeader';
import { useAvatar } from '../../src/contexts/AvatarContext';
import AvatarGallery from '../../src/components/avatars/AvatarGallery';

export default function AvatarsPage() {
    const { avatar, user, refreshUser } = useAvatar();

    // Refresh user session on page load to get latest VIP status
    useEffect(() => {
        if (user && refreshUser) {
            refreshUser();
        }
    }, []);

    return (
        <>
            <Head>
                <title>Avatar Selection | Smarter Poker</title>
                <meta name="description" content="Choose your poker avatar from preset options or create a custom AI-generated avatar" />
            </Head>

            <div className="avatars-page">
                <style jsx>{`
                    .avatars-page {
                        min-height: 100vh;
                        background: linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #0d0d2e 100%);
                        padding: 20px;
                    }

                    .header {
                        max-width: 1400px;
                        margin: 0 auto 30px;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        flex-wrap: wrap;
                        gap: 15px;
                    }

                    .back-btn {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 10px 20px;
                        background: rgba(0, 245, 255, 0.1);
                        border: 1px solid rgba(0, 245, 255, 0.3);
                        border-radius: 12px;
                        color: #00f5ff;
                        font-family: 'Rajdhani', sans-serif;
                        font-size: 16px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        text-decoration: none;
                    }

                    .back-btn:hover {
                        background: rgba(0, 245, 255, 0.2);
                        border-color: #00f5ff;
                        transform: translateX(-3px);
                    }

                    .current-avatar {
                        display: flex;
                        align-items: center;
                        gap: 15px;
                        padding: 12px 20px;
                        background: rgba(0, 0, 0, 0.4);
                        border: 1px solid rgba(0, 245, 255, 0.2);
                        border-radius: 12px;
                    }

                    .current-avatar-img {
                        width: 50px;
                        height: 50px;
                        border-radius: 50%;
                        border: 2px solid #00f5ff;
                        object-fit: cover;
                    }

                    .current-avatar-info {
                        font-family: 'Rajdhani', sans-serif;
                    }

                    .current-avatar-label {
                        font-size: 11px;
                        color: #888;
                        text-transform: uppercase;
                        margin-bottom: 2px;
                    }

                    .current-avatar-name {
                        font-size: 16px;
                        color: #fff;
                        font-weight: 600;
                    }
                `}</style>

                {/* Header */}
                <div className="header">
                    <Link href="/hub/profile" className="back-btn">
                        ← Back to Profile
                    </Link>

                    {avatar && (
                        <div className="current-avatar">
                            <img
                                src={avatar.imageUrl || '/avatars/free/shark.png'}
                                alt="Current Avatar"
                                className="current-avatar-img"
                            />
                            <div className="current-avatar-info">
                                <div className="current-avatar-label">Current Avatar</div>
                                <div className="current-avatar-name">{avatar.name || 'Custom Avatar'}</div>
                            </div>
                        </div>
                    )}

                    <BrainHomeButton />
                </div>

                {/* Avatar Gallery - Custom avatars at top for VIP, then preset avatars */}
                <AvatarGallery />
            </div>
        </>
    );
}
