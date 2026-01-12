/**
 * 🎰 POKER STORIES ROW
 * src/app/social/components/PokerStoriesRow.jsx
 * 
 * Facebook/Instagram-style Stories with poker theme.
 * Features session highlights, big hands, and streak updates.
 */

import React, { useState, useRef } from 'react';
import { PokerTierBadge } from './PokerReputationBadges';

// ═══════════════════════════════════════════════════════════════════════════
// 🎰 STORY TYPES
// ═══════════════════════════════════════════════════════════════════════════

const STORY_TYPES = {
    session: {
        gradient: 'linear-gradient(135deg, #FF6B35, #FF8F65)',
        icon: '📊',
        label: 'Session'
    },
    big_hand: {
        gradient: 'linear-gradient(135deg, #22C55E, #4ADE80)',
        icon: '💰',
        label: 'Big Hand'
    },
    bad_beat: {
        gradient: 'linear-gradient(135deg, #EF4444, #F87171)',
        icon: '💔',
        label: 'Bad Beat'
    },
    streak: {
        gradient: 'linear-gradient(135deg, #8B5CF6, #A78BFA)',
        icon: '🔥',
        label: 'Streak'
    },
    achievement: {
        gradient: 'linear-gradient(135deg, #FFD700, #FEF08A)',
        icon: '🏆',
        label: 'Achievement'
    },
    live: {
        gradient: 'linear-gradient(135deg, #EF4444, #DC2626)',
        icon: '🔴',
        label: 'LIVE'
    },
    training: {
        gradient: 'linear-gradient(135deg, #3B82F6, #60A5FA)',
        icon: '🧠',
        label: 'Training'
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 🎰 STORY CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const StoryCard = ({
    story,
    isOwn = false,
    hasUnviewed = false,
    onClick = () => { }
}) => {
    const storyType = STORY_TYPES[story.type] || STORY_TYPES.session;

    return (
        <div
            className={`story-card ${hasUnviewed ? 'unviewed' : ''} ${story.isLive ? 'is-live' : ''}`}
            onClick={onClick}
        >
            {/* Ring Indicator */}
            <div
                className="story-ring"
                style={{
                    background: hasUnviewed ? storyType.gradient : 'rgba(255,255,255,0.2)'
                }}
            />

            {/* Thumbnail */}
            <div className="story-thumbnail">
                {story.thumbnail ? (
                    <img src={story.thumbnail} alt="" />
                ) : (
                    <div className="thumbnail-placeholder" style={{ background: storyType.gradient }}>
                        <span className="type-icon">{storyType.icon}</span>
                    </div>
                )}

                {/* Live Badge */}
                {story.isLive && (
                    <div className="live-badge">
                        <span className="live-dot" />
                        LIVE
                    </div>
                )}

                {/* Story Type Badge */}
                {!story.isLive && story.type !== 'session' && (
                    <div className="type-badge">
                        {storyType.icon}
                    </div>
                )}
            </div>

            {/* User Info */}
            <div className="story-user">
                <img
                    src={story.user?.avatar || '/default-avatar.png'}
                    alt={story.user?.name}
                    className="user-avatar"
                />
                {story.user?.tier && (
                    <div className="tier-mini">
                        <PokerTierBadge tier={story.user.tier} size="sm" showLabel={false} />
                    </div>
                )}
            </div>

            {/* Username */}
            <span className="story-username">
                {isOwn ? 'Your Story' : story.user?.name}
            </span>

            {/* Story Count */}
            {story.storyCount > 1 && (
                <div className="story-count">{story.storyCount}</div>
            )}

            <style>{`
                .story-card {
                    position: relative;
                    width: 120px;
                    height: 200px;
                    border-radius: 16px;
                    overflow: hidden;
                    cursor: pointer;
                    flex-shrink: 0;
                    transition: transform 0.2s ease;
                }

                .story-card:hover {
                    transform: scale(1.03);
                }

                .story-ring {
                    position: absolute;
                    inset: 0;
                    border-radius: 16px;
                    padding: 3px;
                    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
                    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
                    -webkit-mask-composite: xor;
                    mask-composite: exclude;
                }

                .story-card.unviewed .story-ring {
                    animation: ring-pulse 2s ease-in-out infinite;
                }

                @keyframes ring-pulse {
                    0%, 100% { opacity: 1; filter: brightness(1); }
                    50% { opacity: 0.8; filter: brightness(1.2); }
                }

                .story-thumbnail {
                    position: absolute;
                    inset: 3px;
                    border-radius: 14px;
                    overflow: hidden;
                }

                .story-thumbnail img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .thumbnail-placeholder {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .type-icon {
                    font-size: 2.5rem;
                    filter: drop-shadow(0 0 10px rgba(0, 0, 0, 0.3));
                }

                .live-badge {
                    position: absolute;
                    top: 10px;
                    left: 10px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 8px;
                    background: #EF4444;
                    border-radius: 6px;
                    font-size: 0.65rem;
                    font-weight: 700;
                    color: white;
                    letter-spacing: 0.5px;
                    animation: live-pulse 1.5s ease-in-out infinite;
                }

                @keyframes live-pulse {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
                    50% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
                }

                .live-dot {
                    width: 6px;
                    height: 6px;
                    background: white;
                    border-radius: 50%;
                    animation: dot-blink 1s ease-in-out infinite;
                }

                @keyframes dot-blink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.3; }
                }

                .type-badge {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    width: 28px;
                    height: 28px;
                    background: rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(4px);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.9rem;
                }

                .story-user {
                    position: absolute;
                    bottom: 36px;
                    left: 10px;
                }

                .user-avatar {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    border: 2px solid white;
                    object-fit: cover;
                }

                .tier-mini {
                    position: absolute;
                    bottom: -4px;
                    right: -4px;
                    transform: scale(0.8);
                }

                .story-username {
                    position: absolute;
                    bottom: 10px;
                    left: 10px;
                    right: 10px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: white;
                    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .story-count {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    min-width: 20px;
                    height: 20px;
                    background: rgba(0, 0, 0, 0.6);
                    backdrop-filter: blur(4px);
                    border-radius: 10px;
                    font-size: 0.7rem;
                    font-weight: 600;
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0 6px;
                }
            `}</style>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// 🎰 ADD STORY CARD
// ═══════════════════════════════════════════════════════════════════════════

const AddStoryCard = ({ userAvatar, onAdd }) => (
    <div className="add-story-card" onClick={onAdd}>
        <div className="add-story-inner">
            <div className="avatar-section">
                <img src={userAvatar || '/default-avatar.png'} alt="You" />
            </div>
            <div className="add-button">
                <span className="plus-icon">+</span>
            </div>
            <span className="add-label">Share Update</span>
        </div>

        <style>{`
            .add-story-card {
                width: 120px;
                height: 200px;
                border-radius: 16px;
                overflow: hidden;
                cursor: pointer;
                flex-shrink: 0;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                transition: all 0.2s ease;
            }

            .add-story-card:hover {
                transform: scale(1.03);
                background: rgba(255, 255, 255, 0.08);
            }

            .add-story-inner {
                height: 100%;
                display: flex;
                flex-direction: column;
            }

            .avatar-section {
                flex: 1;
                overflow: hidden;
            }

            .avatar-section img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }

            .add-button {
                width: 36px;
                height: 36px;
                background: #FF6B35;
                border: 3px solid #121826;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                position: absolute;
                bottom: 50px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 2;
            }

            .plus-icon {
                font-size: 1.5rem;
                font-weight: 300;
                color: white;
                line-height: 1;
            }

            .add-label {
                display: block;
                padding: 16px 8px 12px;
                text-align: center;
                font-size: 0.75rem;
                font-weight: 600;
                color: rgba(255, 255, 255, 0.9);
                background: rgba(18, 24, 38, 0.95);
            }
        `}</style>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// 🎰 STORIES ROW CONTAINER
// ═══════════════════════════════════════════════════════════════════════════

export const PokerStoriesRow = ({
    stories = [],
    currentUser = {},
    onStoryClick = () => { },
    onAddStory = () => { }
}) => {
    const scrollRef = useRef(null);
    const [showLeftArrow, setShowLeftArrow] = useState(false);
    const [showRightArrow, setShowRightArrow] = useState(true);

    const handleScroll = () => {
        if (!scrollRef.current) return;
        const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
        setShowLeftArrow(scrollLeft > 20);
        setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 20);
    };

    const scroll = (direction) => {
        if (!scrollRef.current) return;
        const amount = direction === 'left' ? -300 : 300;
        scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    };

    // Group stories by user
    const userStories = stories.reduce((acc, story) => {
        const userId = story.user?.id;
        if (!acc[userId]) {
            acc[userId] = {
                ...story,
                storyCount: 1,
                hasUnviewed: !story.viewed
            };
        } else {
            acc[userId].storyCount++;
            if (!story.viewed) acc[userId].hasUnviewed = true;
        }
        return acc;
    }, {});

    const storyList = Object.values(userStories);

    return (
        <div className="stories-container">
            {/* Section Header */}
            <div className="stories-header">
                <h3 className="stories-title">
                    <span className="title-icon">📖</span>
                    Stories
                </h3>
                <div className="stories-filters">
                    <button className="filter-btn active">All</button>
                    <button className="filter-btn">Sessions</button>
                    <button className="filter-btn">Big Hands</button>
                    <button className="filter-btn live">🔴 Live</button>
                </div>
            </div>

            {/* Stories Scroll Area */}
            <div className="stories-scroll-container">
                {showLeftArrow && (
                    <button className="scroll-arrow left" onClick={() => scroll('left')}>
                        ‹
                    </button>
                )}

                <div
                    className="stories-row"
                    ref={scrollRef}
                    onScroll={handleScroll}
                >
                    {/* Add Story Card */}
                    <AddStoryCard
                        userAvatar={currentUser.avatar}
                        onAdd={onAddStory}
                    />

                    {/* User Stories */}
                    {storyList.map((story, index) => (
                        <StoryCard
                            key={story.id || index}
                            story={story}
                            hasUnviewed={story.hasUnviewed}
                            onClick={() => onStoryClick(story)}
                        />
                    ))}
                </div>

                {showRightArrow && (
                    <button className="scroll-arrow right" onClick={() => scroll('right')}>
                        ›
                    </button>
                )}
            </div>

            <style>{`
                .stories-container {
                    padding: 16px 0;
                    margin-bottom: 24px;
                }

                .stories-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 0 16px;
                    margin-bottom: 16px;
                }

                .stories-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 1.1rem;
                    font-weight: 600;
                    color: white;
                    margin: 0;
                }

                .title-icon {
                    font-size: 1.2rem;
                }

                .stories-filters {
                    display: flex;
                    gap: 8px;
                }

                .filter-btn {
                    padding: 6px 12px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 20px;
                    color: rgba(255, 255, 255, 0.6);
                    font-size: 0.8rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .filter-btn:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                }

                .filter-btn.active {
                    background: #FF6B35;
                    border-color: #FF6B35;
                    color: white;
                }

                .filter-btn.live {
                    color: #EF4444;
                    border-color: rgba(239, 68, 68, 0.3);
                }

                .filter-btn.live:hover {
                    background: rgba(239, 68, 68, 0.2);
                }

                .stories-scroll-container {
                    position: relative;
                }

                .stories-row {
                    display: flex;
                    gap: 12px;
                    padding: 8px 16px;
                    overflow-x: auto;
                    scroll-behavior: smooth;
                    scrollbar-width: none;
                    -ms-overflow-style: none;
                }

                .stories-row::-webkit-scrollbar {
                    display: none;
                }

                .scroll-arrow {
                    position: absolute;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 40px;
                    height: 40px;
                    background: rgba(0, 0, 0, 0.7);
                    backdrop-filter: blur(8px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 50%;
                    color: white;
                    font-size: 1.5rem;
                    cursor: pointer;
                    z-index: 10;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }

                .scroll-arrow:hover {
                    background: rgba(0, 0, 0, 0.9);
                    transform: translateY(-50%) scale(1.1);
                }

                .scroll-arrow.left {
                    left: 8px;
                }

                .scroll-arrow.right {
                    right: 8px;
                }
            `}</style>
        </div>
    );
};

export default PokerStoriesRow;
