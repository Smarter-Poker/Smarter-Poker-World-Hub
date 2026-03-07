/**
 * 👥 smarter-poker-style FRIENDS
 * src/app/social/components/SmarterPokerFriends.jsx
 * 
 * Friends list, friend requests, and friend suggestions
 */

import React, { useState } from 'react';
import { SPAvatar, SP_COLORS } from './SmarterPokerStyleCard';
import { PokerTierBadge } from './PokerReputationBadges';

// ═══════════════════════════════════════════════════════════════════════════
// 👤 FRIEND CARD
// ═══════════════════════════════════════════════════════════════════════════

export const FriendCard = ({
    user,
    isFriend = false,
    isPending = false,
    onAdd,
    onAccept,
    onDecline,
    onRemove,
    onMessage
}) => {
    return (
        <div className="friend-card">
            <div className="friend-cover">
                <img src={user.coverPhoto || 'https://picsum.photos/400/150'} alt="" />
            </div>

            <div className="friend-avatar">
                <SPAvatar src={user.avatar} size={96} online={user.online} />
            </div>

            <div className="friend-info">
                <h3 className="friend-name">{user.name}</h3>

                {user.tier && (
                    <div className="friend-tier">
                        <PokerTierBadge tier={user.tier} size="sm" />
                    </div>
                )}

                <span className="friend-mutual">
                    {user.mutualFriends > 0 && `${user.mutualFriends} mutual friends`}
                </span>
            </div>

            <div className="friend-actions">
                {isFriend ? (
                    <>
                        <button className="btn-primary" onClick={() => onMessage?.(user)}>
                            Message
                        </button>
                        <button className="btn-secondary" onClick={() => onRemove?.(user)}>
                            Friends ✓
                        </button>
                    </>
                ) : isPending ? (
                    <>
                        <button className="btn-primary" onClick={() => onAccept?.(user)}>
                            Confirm
                        </button>
                        <button className="btn-secondary" onClick={() => onDecline?.(user)}>
                            Delete
                        </button>
                    </>
                ) : (
                    <button className="btn-primary" onClick={() => onAdd?.(user)}>
                        Add Friend
                    </button>
                )}
            </div>

            <style>{`
                .friend-card {
                    width: 200px;
                    background: ${SP_COLORS.bgWhite};
                    border-radius: 8px;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                    overflow: hidden;
                }

                .friend-cover {
                    height: 70px;
                    overflow: hidden;
                }

                .friend-cover img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .friend-avatar {
                    margin: -48px auto 0;
                    width: 96px;
                    position: relative;
                    z-index: 1;
                }

                .friend-avatar img {
                    border: 4px solid ${SP_COLORS.bgWhite};
                }

                .friend-info {
                    text-align: center;
                    padding: 8px 12px;
                }

                .friend-name {
                    font-size: 17px;
                    font-weight: 600;
                    color: ${SP_COLORS.textPrimary};
                    margin: 0 0 4px;
                }

                .friend-tier {
                    display: flex;
                    justify-content: center;
                    margin-bottom: 4px;
                }

                .friend-mutual {
                    font-size: 13px;
                    color: ${SP_COLORS.textSecondary};
                }

                .friend-actions {
                    padding: 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .btn-primary {
                    width: 100%;
                    padding: 8px;
                    background: ${SP_COLORS.blue};
                    border: none;
                    border-radius: 6px;
                    color: white;
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                }

                .btn-primary:hover {
                    background: ${SP_COLORS.blueHover};
                }

                .btn-secondary {
                    width: 100%;
                    padding: 8px;
                    background: ${SP_COLORS.bgMain};
                    border: none;
                    border-radius: 6px;
                    color: ${SP_COLORS.textPrimary};
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                }

                .btn-secondary:hover {
                    background: ${SP_COLORS.bgHover};
                }
            `}</style>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// 👥 FRIEND REQUEST ITEM
// ═══════════════════════════════════════════════════════════════════════════

export const FriendRequestItem = ({
    user,
    onAccept,
    onDecline
}) => (
    <div className="friend-request-item">
        <SPAvatar src={user.avatar} size={60} />

        <div className="request-info">
            <span className="request-name">{user.name}</span>
            <span className="request-mutual">
                {user.mutualFriends > 0
                    ? `${user.mutualFriends} mutual friends`
                    : 'No mutual friends'
                }
            </span>
            <span className="request-time">{user.requestTime}</span>
        </div>

        <div className="request-actions">
            <button className="btn-confirm" onClick={() => onAccept?.(user)}>
                Confirm
            </button>
            <button className="btn-delete" onClick={() => onDecline?.(user)}>
                Delete
            </button>
        </div>

        <style>{`
            .friend-request-item {
                display: flex;
                align-items: flex-start;
                gap: 12px;
                padding: 12px 16px;
            }

            .friend-request-item:hover {
                background: ${SP_COLORS.bgHover};
            }

            .request-info {
                flex: 1;
            }

            .request-name {
                display: block;
                font-weight: 600;
                font-size: 15px;
                color: ${SP_COLORS.textPrimary};
                margin-bottom: 2px;
            }

            .request-mutual {
                display: block;
                font-size: 13px;
                color: ${SP_COLORS.textSecondary};
            }

            .request-time {
                font-size: 12px;
                color: ${SP_COLORS.textSecondary};
            }

            .request-actions {
                display: flex;
                gap: 8px;
            }

            .btn-confirm {
                padding: 8px 16px;
                background: ${SP_COLORS.blue};
                border: none;
                border-radius: 6px;
                color: white;
                font-weight: 600;
                cursor: pointer;
            }

            .btn-confirm:hover {
                background: ${SP_COLORS.blueHover};
            }

            .btn-delete {
                padding: 8px 16px;
                background: ${SP_COLORS.bgMain};
                border: none;
                border-radius: 6px;
                color: ${SP_COLORS.textPrimary};
                font-weight: 600;
                cursor: pointer;
            }

            .btn-delete:hover {
                background: ${SP_COLORS.bgHover};
            }
        `}</style>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// 👥 FRIEND REQUESTS SECTION
// ═══════════════════════════════════════════════════════════════════════════

export const FriendRequestsSection = ({
    requests = [],
    onAccept,
    onDecline,
    onSeeAll
}) => (
    <div className="friend-requests-section">
        <div className="section-header">
            <h3>Friend Requests</h3>
            {requests.length > 0 && (
                <span className="request-count">{requests.length}</span>
            )}
            <button className="see-all-btn" onClick={onSeeAll}>See All</button>
        </div>

        <div className="requests-list">
            {requests.slice(0, 5).map((request, i) => (
                <FriendRequestItem
                    key={request.id || i}
                    user={request}
                    onAccept={onAccept}
                    onDecline={onDecline}
                />
            ))}

            {requests.length === 0 && (
                <p className="empty-message">No New Friend Requests</p>
            )}
        </div>

        <style>{`
            .friend-requests-section {
                background: ${SP_COLORS.bgWhite};
                border-radius: 8px;
                box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                margin-bottom: 16px;
            }

            .section-header {
                display: flex;
                align-items: center;
                padding: 16px;
                border-bottom: 1px solid ${SP_COLORS.divider};
            }

            .section-header h3 {
                font-size: 20px;
                font-weight: 700;
                color: ${SP_COLORS.textPrimary};
                margin: 0;
            }

            .request-count {
                background: #E41E3F;
                color: white;
                font-size: 13px;
                font-weight: 600;
                padding: 2px 8px;
                border-radius: 10px;
                margin-left: 8px;
            }

            .see-all-btn {
                margin-left: auto;
                border: none;
                background: none;
                color: ${SP_COLORS.blue};
                font-size: 15px;
                cursor: pointer;
            }

            .see-all-btn:hover {
                text-decoration: underline;
            }

            .empty-message {
                text-align: center;
                padding: 24px;
                color: ${SP_COLORS.textSecondary};
            }
        `}</style>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// 👥 PEOPLE YOU MAY KNOW
// ═══════════════════════════════════════════════════════════════════════════

export const PeopleYouMayKnow = ({
    suggestions = [],
    onAdd,
    onRemove
}) => {
    const [dismissed, setDismissed] = useState([]);

    const handleDismiss = (user) => {
        setDismissed([...dismissed, user.id]);
        onRemove?.(user);
    };

    const visibleSuggestions = suggestions.filter(s => !dismissed.includes(s.id));

    return (
        <div className="people-may-know">
            <div className="section-header">
                <h3>People You May Know</h3>
            </div>

            <div className="suggestions-grid">
                {visibleSuggestions.map((user, i) => (
                    <div key={user.id || i} className="suggestion-card">
                        <button
                            className="dismiss-btn"
                            onClick={() => handleDismiss(user)}
                        >
                            ✕
                        </button>

                        <div className="suggestion-avatar">
                            <SPAvatar src={user.avatar} size={80} />
                        </div>

                        <h4 className="suggestion-name">{user.name}</h4>

                        {user.tier && (
                            <div className="suggestion-tier">
                                <PokerTierBadge tier={user.tier} size="sm" showLabel={false} />
                            </div>
                        )}

                        <span className="suggestion-reason">
                            {user.mutualFriends > 0
                                ? `${user.mutualFriends} mutual friends`
                                : user.reason || 'Suggested for you'
                            }
                        </span>

                        <button
                            className="add-friend-btn"
                            onClick={() => onAdd?.(user)}
                        >
                            Add Friend
                        </button>
                    </div>
                ))}
            </div>

            <style>{`
                .people-may-know {
                    background: ${SP_COLORS.bgWhite};
                    border-radius: 8px;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                }

                .section-header {
                    padding: 16px;
                    border-bottom: 1px solid ${SP_COLORS.divider};
                }

                .section-header h3 {
                    font-size: 20px;
                    font-weight: 700;
                    color: ${SP_COLORS.textPrimary};
                    margin: 0;
                }

                .suggestions-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
                    gap: 12px;
                    padding: 16px;
                }

                .suggestion-card {
                    background: ${SP_COLORS.bgWhite};
                    border: 1px solid ${SP_COLORS.divider};
                    border-radius: 8px;
                    padding: 16px;
                    text-align: center;
                    position: relative;
                }

                .dismiss-btn {
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    width: 24px;
                    height: 24px;
                    border: none;
                    background: ${SP_COLORS.bgMain};
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 12px;
                    color: ${SP_COLORS.textSecondary};
                }

                .dismiss-btn:hover {
                    background: ${SP_COLORS.bgHover};
                }

                .suggestion-avatar {
                    margin-bottom: 12px;
                }

                .suggestion-name {
                    font-size: 15px;
                    font-weight: 600;
                    color: ${SP_COLORS.textPrimary};
                    margin: 0 0 4px;
                }

                .suggestion-tier {
                    display: flex;
                    justify-content: center;
                    margin-bottom: 4px;
                }

                .suggestion-reason {
                    font-size: 13px;
                    color: ${SP_COLORS.textSecondary};
                    display: block;
                    margin-bottom: 12px;
                }

                .add-friend-btn {
                    width: 100%;
                    padding: 8px;
                    background: ${SP_COLORS.blueLight};
                    border: none;
                    border-radius: 6px;
                    color: ${SP_COLORS.blue};
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                }

                .add-friend-btn:hover {
                    background: #D0E4FF;
                }
            `}</style>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// 👥 FRIENDS LIST
// ═══════════════════════════════════════════════════════════════════════════

export const FriendsList = ({
    friends = [],
    onMessage,
    onViewProfile
}) => {
    const [searchQuery, setSearchQuery] = useState('');

    const filteredFriends = friends.filter(f =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const onlineFriends = filteredFriends.filter(f => f.online);
    const offlineFriends = filteredFriends.filter(f => !f.online);

    return (
        <div className="friends-list">
            {/* Search */}
            <div className="friends-search">
                <span className="search-icon">🔍</span>
                <input
                    type="text"
                    placeholder="Search Friends"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            {/* Online Friends */}
            {onlineFriends.length > 0 && (
                <div className="friends-section">
                    <h4 className="section-title">Online — {onlineFriends.length}</h4>
                    {onlineFriends.map((friend, i) => (
                        <div
                            key={friend.id || i}
                            className="friend-row"
                            onClick={() => onViewProfile?.(friend)}
                        >
                            <SPAvatar src={friend.avatar} size={36} online={true} />
                            <div className="friend-details">
                                <span className="friend-name">{friend.name}</span>
                                {friend.tier && (
                                    <PokerTierBadge tier={friend.tier} size="xs" showLabel={false} />
                                )}
                            </div>
                            <button
                                className="message-btn"
                                onClick={(e) => { e.stopPropagation(); onMessage?.(friend); }}
                            >
                                💬
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Offline Friends */}
            {offlineFriends.length > 0 && (
                <div className="friends-section">
                    <h4 className="section-title">All Friends — {offlineFriends.length}</h4>
                    {offlineFriends.map((friend, i) => (
                        <div
                            key={friend.id || i}
                            className="friend-row"
                            onClick={() => onViewProfile?.(friend)}
                        >
                            <SPAvatar src={friend.avatar} size={36} />
                            <div className="friend-details">
                                <span className="friend-name">{friend.name}</span>
                                {friend.tier && (
                                    <PokerTierBadge tier={friend.tier} size="xs" showLabel={false} />
                                )}
                            </div>
                            <button
                                className="message-btn"
                                onClick={(e) => { e.stopPropagation(); onMessage?.(friend); }}
                            >
                                💬
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <style>{`
                .friends-list {
                    background: ${SP_COLORS.bgWhite};
                    border-radius: 8px;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                }

                .friends-search {
                    display: flex;
                    align-items: center;
                    padding: 12px 16px;
                    border-bottom: 1px solid ${SP_COLORS.divider};
                }

                .friends-search input {
                    flex: 1;
                    border: none;
                    background: ${SP_COLORS.bgMain};
                    padding: 8px 12px;
                    border-radius: 20px;
                    margin-left: 8px;
                    font-size: 15px;
                }

                .search-icon {
                    color: ${SP_COLORS.textSecondary};
                }

                .friends-section {
                    padding: 8px 0;
                }

                .section-title {
                    font-size: 13px;
                    font-weight: 600;
                    color: ${SP_COLORS.textSecondary};
                    text-transform: uppercase;
                    padding: 8px 16px;
                    margin: 0;
                }

                .friend-row {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 8px 16px;
                    cursor: pointer;
                }

                .friend-row:hover {
                    background: ${SP_COLORS.bgHover};
                }

                .friend-details {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .friend-name {
                    font-size: 15px;
                    font-weight: 500;
                    color: ${SP_COLORS.textPrimary};
                }

                .message-btn {
                    width: 32px;
                    height: 32px;
                    border: none;
                    background: ${SP_COLORS.bgMain};
                    border-radius: 50%;
                    cursor: pointer;
                    opacity: 0;
                }

                .friend-row:hover .message-btn {
                    opacity: 1;
                }

                .message-btn:hover {
                    background: ${SP_COLORS.bgHover};
                }
            `}</style>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// 📤 EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
    FriendCard,
    FriendRequestItem,
    FriendRequestsSection,
    PeopleYouMayKnow,
    FriendsList
};
