/**
 * 🎨 AVATAR SELECTION PAGE
 * Dedicated page for browsing and selecting avatars
 * Accessible from profile, settings, and onboarding
 */

import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { BrainHomeButton } from '../../src/components/navigation/WorldNavHeader';
import { useAvatar } from '../../src/contexts/AvatarContext';
import AvatarGallery from '../../src/components/avatars/AvatarGallery';
import CustomAvatarBuilder from '../../src/components/avatars/CustomAvatarBuilder';

export default function AvatarsPage() {
    const { avatar, user } = useAvatar();
    const [activeTab, setActiveTab] = useState('library');

    // Check if user is VIP (placeholder - replace with actual VIP check)
    const isVip = user?.user_metadata?.is_vip || false;

    return (
        <>
            <Head>
                <title>Avatar Selection | Smarter Poker</title>
                <meta name="description" content="Choose your poker avatar from 75 preset options or create a custom AI-generated avatar" />
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

                    .main-container {
                        max-width: 1400px;
                        margin: 0 auto;
                        background: rgba(10, 14, 39, 0.8);
                        border: 2px solid rgba(0, 245, 255, 0.3);
                        border-radius: 24px;
                        backdrop-filter: blur(10px);
                        overflow: hidden;
                    }

                    .tabs-header {
                        background: rgba(10, 14, 39, 0.95);
                        backdrop-filter: blur(10px);
                        padding: 20px 30px;
                        border-bottom: 1px solid rgba(0, 245, 255, 0.2);
                    }

                    .tabs {
                        display: flex;
                        gap: 10px;
                        justify-content: center;
                    }

                    .tab-btn {
                        padding: 12px 30px;
                        background: transparent;
                        border: 2px solid rgba(0, 245, 255, 0.3);
                        border-radius: 12px;
                        color: #888;
                        font-family: 'Rajdhani', sans-serif;
                        font-size: 16px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        text-transform: uppercase;
                    }

                    .tab-btn:hover {
                        border-color: rgba(0, 245, 255, 0.6);
                        color: #00f5ff;
                    }

                    .tab-btn.active {
                        background: linear-gradient(135deg, #00f5ff, #0099ff);
                        border-color: #00f5ff;
                        color: #0a0e27;
                        font-weight: 700;
                    }

                    .content {
                        padding: 40px 30px;
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

                {/* Main Container */}
                <div className="main-container">
                    {/* Tabs */}
                    <div className="tabs-header">
                        <div className="tabs">
                            <button
                                className={`tab-btn ${activeTab === 'library' ? 'active' : ''}`}
                                onClick={() => setActiveTab('library')}
                            >
                                📚 Avatar Library
                            </button>
                            <button
                                className={`tab-btn ${activeTab === 'custom' ? 'active' : ''}`}
                                onClick={() => setActiveTab('custom')}
                            >
                                🤖 Custom AI Generator
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="content">
                        {activeTab === 'library' ? (
                            <AvatarGallery />
                        ) : (
                            <CustomAvatarBuilder isVip={isVip} />
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
