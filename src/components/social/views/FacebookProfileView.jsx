/**
 * 👤 FACEBOOK-STYLE PROFILE PAGE
 * src/app/social/views/FacebookProfileView.jsx
 * 
 * Complete profile page with cover photo, about, friends, photos, poker stats
 * Connected to SocialService
 */

import React, { useState, useEffect } from 'react';
import { FBAvatar, FB_COLORS, FBPostCard } from '../components/FacebookStyleCard';
import { PokerTierBadge, WinRateDisplay } from '../components/PokerReputationBadges';
import { PhotoGrid } from '../components/FacebookPhotos';
import { useSocialOrb } from '../../providers/SocialOrbProvider';
import { useSupabase } from '../../providers/SupabaseProvider';

// ═══════════════════════════════════════════════════════════════════════════
// 📷 COVER PHOTO & PROFILE HEADER
// ═══════════════════════════════════════════════════════════════════════════

const ProfileHeader = ({ user, isOwnProfile, onEditProfile, onAddFriend, onMessage }) => (
    <div className="profile-header">
        {/* Cover Photo */}
        <div className="cover-photo">
            <img src={user.coverPhoto || 'https://picsum.photos/1200/400'} alt="" />
            {isOwnProfile && (
                <button className="edit-cover-btn">
                    📷 Edit cover photo
                </button>
            )}
        </div>

        {/* Profile Info */}
        <div className="profile-info-container">
            <div className="profile-avatar-section">
                <div className="profile-avatar-wrapper">
                    <FBAvatar src={user.avatar} size={168} />
                    {isOwnProfile && (
                        <button className="edit-avatar-btn">📷</button>
                    )}
                </div>
            </div>

            <div className="profile-details">
                <div className="profile-name-row">
                    <h1 className="profile-name">{user.name}</h1>
                    {user.tier && (
                        <PokerTierBadge tier={user.tier} size="md" />
                    )}
                    {user.isVerified && <span className="verified-badge">✓</span>}
                </div>

                <p className="profile-friends-count">
                    {user.friendsCount?.toLocaleString()} friends
                    {user.mutualFriends > 0 && ` · ${user.mutualFriends} mutual`}
                </p>

                {/* Friend Avatars */}
                <div className="friend-avatars">
                    {user.topFriends?.slice(0, 8).map((friend, i) => (
                        <FBAvatar key={i} src={friend.avatar} size={32} />
                    ))}
                </div>
            </div>

            <div className="profile-actions">
                {isOwnProfile ? (
                    <>
                        <button className="btn-primary" onClick={onEditProfile}>
                            ✏️ Edit profile
                        </button>
                        <button className="btn-secondary">
                            📷 Add to story
                        </button>
                    </>
                ) : (
                    <>
                        {user.isFriend ? (
                            <button className="btn-secondary">
                                ✓ Friends
                            </button>
                        ) : (
                            <button className="btn-primary" onClick={() => onAddFriend?.(user)}>
                                👤 Add Friend
                            </button>
                        )}
                        <button className="btn-primary" onClick={() => onMessage?.(user)}>
                            💬 Message
                        </button>
                    </>
                )}
            </div>
        </div>

        {/* Divider */}
        <div className="profile-divider" />

        {/* Navigation Tabs */}
        <nav className="profile-nav">
            <a href="#posts" className="nav-tab active">Posts</a>
            <a href="#about" className="nav-tab">About</a>
            <a href="#friends" className="nav-tab">Friends</a>
            <a href="#photos" className="nav-tab">Photos</a>
            <a href="#videos" className="nav-tab">Videos</a>
            <a href="#poker" className="nav-tab">
                🃏 Poker Stats
            </a>
            <a href="#more" className="nav-tab">More ▾</a>
        </nav>

        <style>{`
            .profile-header {
                background: ${FB_COLORS.bgWhite};
                box-shadow: 0 1px 2px rgba(0,0,0,0.1);
            }

            .cover-photo {
                height: 350px;
                position: relative;
                border-radius: 0 0 8px 8px;
                overflow: hidden;
                background: linear-gradient(135deg, #667eea, #764ba2);
            }

            .cover-photo img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }

            .edit-cover-btn {
                position: absolute;
                bottom: 16px;
                right: 16px;
                padding: 8px 16px;
                background: ${FB_COLORS.bgWhite};
                border: none;
                border-radius: 6px;
                font-size: 15px;
                font-weight: 600;
                cursor: pointer;
            }

            .profile-info-container {
                display: flex;
                align-items: flex-end;
                padding: 0 24px;
                margin-top: -32px;
                position: relative;
            }

            .profile-avatar-section {
                flex-shrink: 0;
                margin-top: -84px;
            }

            .profile-avatar-wrapper {
                position: relative;
            }

            .profile-avatar-wrapper > div {
                border: 6px solid ${FB_COLORS.bgWhite} !important;
            }

            .edit-avatar-btn {
                position: absolute;
                bottom: 8px;
                right: 8px;
                width: 36px;
                height: 36px;
                background: ${FB_COLORS.bgMain};
                border: none;
                border-radius: 50%;
                cursor: pointer;
            }

            .profile-details {
                flex: 1;
                padding: 16px 24px;
            }

            .profile-name-row {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .profile-name {
                font-size: 32px;
                font-weight: 700;
                color: ${FB_COLORS.textPrimary};
                margin: 0;
            }

            .verified-badge {
                width: 24px;
                height: 24px;
                background: ${FB_COLORS.blue};
                color: white;
                border-radius: 50%;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
            }

            .profile-friends-count {
                color: ${FB_COLORS.textSecondary};
                font-size: 17px;
                margin: 4px 0 8px;
            }

            .friend-avatars {
                display: flex;
            }

            .friend-avatars > div {
                margin-left: -8px;
                border: 2px solid ${FB_COLORS.bgWhite};
            }

            .friend-avatars > div:first-child {
                margin-left: 0;
            }

            .profile-actions {
                display: flex;
                gap: 8px;
                padding-bottom: 16px;
            }

            .btn-primary {
                padding: 10px 20px;
                background: ${FB_COLORS.blue};
                border: none;
                border-radius: 6px;
                color: white;
                font-size: 15px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .btn-primary:hover {
                background: ${FB_COLORS.blueHover};
            }

            .btn-secondary {
                padding: 10px 20px;
                background: ${FB_COLORS.bgMain};
                border: none;
                border-radius: 6px;
                color: ${FB_COLORS.textPrimary};
                font-size: 15px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .btn-secondary:hover {
                background: ${FB_COLORS.bgHover};
            }

            .profile-divider {
                height: 1px;
                background: ${FB_COLORS.divider};
                margin: 0 24px;
            }

            .profile-nav {
                display: flex;
                padding: 0 16px;
            }

            .nav-tab {
                padding: 16px 16px;
                color: ${FB_COLORS.textSecondary};
                text-decoration: none;
                font-size: 15px;
                font-weight: 600;
                border-bottom: 3px solid transparent;
                margin-bottom: -1px;
            }

            .nav-tab:hover {
                background: ${FB_COLORS.bgHover};
                border-radius: 6px 6px 0 0;
            }

            .nav-tab.active {
                color: ${FB_COLORS.blue};
                border-bottom-color: ${FB_COLORS.blue};
            }
        `}</style>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// 📊 POKER STATS CARD
// ═══════════════════════════════════════════════════════════════════════════

const PokerStatsCard = ({ stats }) => (
    <div className="poker-stats-card">
        <div className="card-header">
            <h3>🃏 Poker Statistics</h3>
        </div>

        <div className="stats-grid">
            <div className="stat-item">
                <span className="stat-label">Lifetime Profit</span>
                <span className={`stat-value ${stats.lifetimeProfit >= 0 ? 'positive' : 'negative'}`}>
                    {stats.lifetimeProfit >= 0 ? '+' : ''}${stats.lifetimeProfit?.toLocaleString()}
                </span>
            </div>
            <div className="stat-item">
                <span className="stat-label">Hands Played</span>
                <span className="stat-value">{stats.handsPlayed?.toLocaleString()}</span>
            </div>
            <div className="stat-item">
                <span className="stat-label">Win Rate</span>
                <span className={`stat-value ${stats.winRate >= 50 ? 'positive' : 'negative'}`}>
                    {stats.winRate}%
                </span>
            </div>
            <div className="stat-item">
                <span className="stat-label">Best Hand</span>
                <span className="stat-value">{stats.bestHand || 'Royal Flush'}</span>
            </div>
            <div className="stat-item">
                <span className="stat-label">Biggest Pot</span>
                <span className="stat-value positive">+${stats.biggestPot?.toLocaleString()}</span>
            </div>
            <div className="stat-item">
                <span className="stat-label">Current Streak</span>
                <span className="stat-value">{stats.streak} days 🔥</span>
            </div>
        </div>

        <div className="mastery-section">
            <h4>GTO Mastery</h4>
            <div className="mastery-bar">
                <div
                    className="mastery-fill"
                    style={{ width: `${stats.gtoMastery || 0}%` }}
                />
            </div>
            <span className="mastery-percent">{stats.gtoMastery || 0}% / 85% required</span>
        </div>

        <style>{`
            .poker-stats-card {
                background: ${FB_COLORS.bgWhite};
                border-radius: 8px;
                box-shadow: 0 1px 2px rgba(0,0,0,0.1);
            }

            .card-header {
                padding: 16px;
                border-bottom: 1px solid ${FB_COLORS.divider};
            }

            .card-header h3 {
                font-size: 20px;
                font-weight: 700;
                margin: 0;
                color: ${FB_COLORS.textPrimary};
            }

            .stats-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 16px;
                padding: 16px;
            }

            .stat-item {
                text-align: center;
                padding: 12px;
                background: ${FB_COLORS.bgMain};
                border-radius: 8px;
            }

            .stat-label {
                display: block;
                font-size: 13px;
                color: ${FB_COLORS.textSecondary};
                margin-bottom: 4px;
            }

            .stat-value {
                font-size: 20px;
                font-weight: 700;
                color: ${FB_COLORS.textPrimary};
            }

            .stat-value.positive { color: #22C55E; }
            .stat-value.negative { color: #EF4444; }

            .mastery-section {
                padding: 16px;
                border-top: 1px solid ${FB_COLORS.divider};
            }

            .mastery-section h4 {
                font-size: 15px;
                font-weight: 600;
                margin: 0 0 12px;
                color: ${FB_COLORS.textPrimary};
            }

            .mastery-bar {
                height: 12px;
                background: ${FB_COLORS.bgMain};
                border-radius: 6px;
                overflow: hidden;
            }

            .mastery-fill {
                height: 100%;
                background: linear-gradient(90deg, #FF6B35, #FFD700);
                border-radius: 6px;
                transition: width 0.5s ease;
            }

            .mastery-percent {
                display: block;
                margin-top: 8px;
                font-size: 13px;
                color: ${FB_COLORS.textSecondary};
            }
        `}</style>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// ℹ️ ABOUT CARD
// ═══════════════════════════════════════════════════════════════════════════

const AboutCard = ({ user }) => (
    <div className="about-card">
        <div className="card-header">
            <h3>Intro</h3>
        </div>

        <div className="about-content">
            {user.bio && (
                <p className="bio">{user.bio}</p>
            )}

            <div className="about-items">
                {user.location && (
                    <div className="about-item">
                        <span className="item-icon">📍</span>
                        <span>Lives in <strong>{user.location}</strong></span>
                    </div>
                )}
                {user.favoriteGame && (
                    <div className="about-item">
                        <span className="item-icon">🃏</span>
                        <span>Plays <strong>{user.favoriteGame}</strong></span>
                    </div>
                )}
                {user.stakes && (
                    <div className="about-item">
                        <span className="item-icon">💰</span>
                        <span>Grinds <strong>{user.stakes}</strong></span>
                    </div>
                )}
                {user.club && (
                    <div className="about-item">
                        <span className="item-icon">🏠</span>
                        <span>Member of <strong>{user.club}</strong></span>
                    </div>
                )}
                <div className="about-item">
                    <span className="item-icon">📅</span>
                    <span>Joined {user.joinDate || 'January 2026'}</span>
                </div>
            </div>
        </div>

        <style>{`
            .about-card {
                background: ${FB_COLORS.bgWhite};
                border-radius: 8px;
                box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                margin-bottom: 16px;
            }

            .card-header {
                padding: 16px;
                border-bottom: 1px solid ${FB_COLORS.divider};
            }

            .card-header h3 {
                font-size: 20px;
                font-weight: 700;
                margin: 0;
            }

            .about-content {
                padding: 16px;
            }

            .bio {
                font-size: 15px;
                color: ${FB_COLORS.textPrimary};
                text-align: center;
                margin: 0 0 16px;
            }

            .about-items {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .about-item {
                display: flex;
                align-items: center;
                gap: 12px;
                font-size: 15px;
                color: ${FB_COLORS.textPrimary};
            }

            .item-icon {
                font-size: 20px;
            }
        `}</style>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// 👤 PROFILE VIEW
// ═══════════════════════════════════════════════════════════════════════════

export const FacebookProfileView = ({ onNavigate, onOpenChat }) => {
    const { socialService } = useSocialOrb();
    const { user: authUser, profile: authProfile } = useSupabase();

    // Determine profile subject (default to current user)
    // In future, pull userId from URL params
    const isOwnProfile = true;

    // Construct Profile User Object
    const user = {
        name: authProfile?.username || authUser?.email || 'Unknown User',
        avatar: authProfile?.avatar_url || 'https://picsum.photos/200',
        coverPhoto: 'https://picsum.photos/1200/400?poker',
        bio: 'Poker enthusiast | GTO Grinder | Las Vegas',
        location: 'Las Vegas, NV',
        favoriteGame: 'NLHE $5/$10',
        stakes: '$2/$5 - $5/$10',
        club: 'Las Vegas Grinders',
        friendsCount: 1240,
        mutualFriends: 0,
        isVerified: true,
        tier: 'active_reg',
        topFriends: [
            { name: 'Mike', avatar: 'https://picsum.photos/100?1' },
            { name: 'Sarah', avatar: 'https://picsum.photos/100?2' },
        ],
        // Merge real stats if available
        lifetimeProfit: 15400,
        handsPlayed: 24000
    };

    const photos = [
        'https://picsum.photos/300?1',
        'https://picsum.photos/300?2',
        'https://picsum.photos/300?3',
    ];

    const posts = [
        {
            id: 1,
            user: user,
            text: "Just hit Diamond status! 💎 Thanks for the support everyone.",
            createdAt: '1d ago',
            likeCount: 124,
            commentCount: 42
        }
    ];

    const pokerStats = {
        lifetimeProfit: user.lifetimeProfit,
        handsPlayed: user.handsPlayed,
        winRate: 12,
        bestHand: 'Royal Flush ♠️',
        biggestPot: 4500,
        streak: 12,
        gtoMastery: 82
    };

    return (
        <div className="profile-page">
            <ProfileHeader
                user={user}
                isOwnProfile={isOwnProfile}
                onMessage={onOpenChat}
            />

            <div className="profile-content">
                {/* Left Column */}
                <div className="profile-left">
                    <AboutCard user={user} />

                    {/* Photos Preview */}
                    <div className="photos-card">
                        <div className="card-header">
                            <h3>Photos</h3>
                            <a href="#photos">See all photos</a>
                        </div>
                        <div className="photos-grid">
                            {photos.slice(0, 9).map((photo, i) => (
                                <img key={i} src={photo.url || photo} alt="" />
                            ))}
                        </div>
                    </div>

                    {/* Friends Preview */}
                    <div className="friends-card">
                        <div className="card-header">
                            <h3>Friends</h3>
                            <a href="#friends">See all friends</a>
                        </div>
                        <span className="friends-count">{user.friendsCount} friends</span>
                        <div className="friends-grid">
                            {user.topFriends?.slice(0, 9).map((friend, i) => (
                                <div key={i} className="friend-preview">
                                    <img src={friend.avatar} alt={friend.name} />
                                    <span>{friend.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Column (Posts) */}
                <div className="profile-right">
                    <PokerStatsCard stats={pokerStats} />

                    <div className="posts-section">
                        <div className="posts-header">
                            <h3>Posts</h3>
                            <div className="posts-filters">
                                <button className="filter-btn active">List View</button>
                                <button className="filter-btn">Grid View</button>
                            </div>
                        </div>

                        {posts.map((post, i) => (
                            <FBPostCard
                                key={post.id || i}
                                post={post}
                                user={user}
                            />
                        ))}
                    </div>
                </div>
            </div>

            <style>{`
                .profile-page {
                    background: ${FB_COLORS.bgMain};
                    min-height: 100vh;
                }

                .profile-content {
                    max-width: 1100px;
                    margin: 0 auto;
                    padding: 16px;
                    display: grid;
                    grid-template-columns: 360px 1fr;
                    gap: 16px;
                }

                .profile-left {
                    position: sticky;
                    top: 72px;
                    height: fit-content;
                }

                .photos-card,
                .friends-card {
                    background: ${FB_COLORS.bgWhite};
                    border-radius: 8px;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                    margin-bottom: 16px;
                }

                .card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px;
                }

                .card-header h3 {
                    font-size: 20px;
                    font-weight: 700;
                    margin: 0;
                }

                .card-header a {
                    color: ${FB_COLORS.blue};
                    text-decoration: none;
                    font-size: 15px;
                }

                .photos-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 4px;
                    padding: 0 16px 16px;
                }

                .photos-grid img {
                    width: 100%;
                    aspect-ratio: 1;
                    object-fit: cover;
                    border-radius: 8px;
                }

                .friends-count {
                    display: block;
                    padding: 0 16px 8px;
                    color: ${FB_COLORS.textSecondary};
                    font-size: 15px;
                }

                .friends-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 8px;
                    padding: 0 16px 16px;
                }

                .friend-preview {
                    text-align: center;
                }

                .friend-preview img {
                    width: 100%;
                    aspect-ratio: 1;
                    object-fit: cover;
                    border-radius: 8px;
                }

                .friend-preview span {
                    display: block;
                    font-size: 13px;
                    font-weight: 500;
                    margin-top: 4px;
                    color: ${FB_COLORS.textPrimary};
                }

                .posts-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: ${FB_COLORS.bgWhite};
                    padding: 16px;
                    border-radius: 8px;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                    margin-bottom: 16px;
                }

                .posts-header h3 {
                    font-size: 20px;
                    font-weight: 700;
                    margin: 0;
                }

                .posts-filters {
                    display: flex;
                    gap: 8px;
                }

                .filter-btn {
                    padding: 8px 16px;
                    background: ${FB_COLORS.bgMain};
                    border: none;
                    border-radius: 6px;
                    font-size: 15px;
                    font-weight: 500;
                    cursor: pointer;
                }

                .filter-btn.active {
                    background: ${FB_COLORS.blueLight};
                    color: ${FB_COLORS.blue};
                }

                @media (max-width: 900px) {
                    .profile-content {
                        grid-template-columns: 1fr;
                    }

                    .profile-left {
                        position: static;
                    }
                }
            `}</style>
        </div>
    );
};

export default FacebookProfileView;
