/**
 * 🔔 FACEBOOK-STYLE NOTIFICATIONS
 * src/app/social/components/FacebookNotifications.jsx
 * 
 * Notification dropdown and notification items
 */

import React, { useState } from 'react';
import { FBAvatar, FB_COLORS } from './FacebookStyleCard';

// ═══════════════════════════════════════════════════════════════════════════
// 🔔 NOTIFICATION TYPES
// ═══════════════════════════════════════════════════════════════════════════

const NOTIFICATION_TYPES = {
    like: { icon: '👍', color: FB_COLORS.blue, label: 'liked your post' },
    comment: { icon: '💬', color: '#31A24C', label: 'commented on your post' },
    share: { icon: '↗️', color: '#F7B928', label: 'shared your post' },
    friend_request: { icon: '👤', color: FB_COLORS.blue, label: 'sent you a friend request' },
    friend_accepted: { icon: '👥', color: '#31A24C', label: 'accepted your friend request' },
    mention: { icon: '@', color: FB_COLORS.blue, label: 'mentioned you' },
    tag: { icon: '📷', color: '#E41E3F', label: 'tagged you in a photo' },
    hand_reaction: { icon: '🃏', color: '#FF6B35', label: 'reacted to your hand' },
    gto_badge: { icon: '👑', color: '#FFD700', label: 'You earned GTO Master!' },
    streak: { icon: '🔥', color: '#FF6B35', label: 'Your streak is at risk!' },
    tournament: { icon: '🏆', color: '#8B5CF6', label: 'Tournament starting soon' },
    live: { icon: '🔴', color: '#E41E3F', label: 'is live now' }
};

// ═══════════════════════════════════════════════════════════════════════════
// 🔔 NOTIFICATION ITEM
// ═══════════════════════════════════════════════════════════════════════════

const NotificationItem = ({ notification, onClick }) => {
    const type = NOTIFICATION_TYPES[notification.type] || NOTIFICATION_TYPES.like;
    const isUnread = !notification.read;

    return (
        <div
            className={`notification-item ${isUnread ? 'unread' : ''}`}
            onClick={() => onClick?.(notification)}
        >
            <div className="notification-avatar">
                <FBAvatar src={notification.user?.avatar} size={56} />
                <span
                    className="notification-icon"
                    style={{ background: type.color }}
                >
                    {type.icon}
                </span>
            </div>

            <div className="notification-content">
                <p className="notification-text">
                    <strong>{notification.user?.name}</strong>
                    {' '}{type.label}
                    {notification.preview && (
                        <span className="notification-preview">
                            : "{notification.preview}"
                        </span>
                    )}
                </p>
                <span className={`notification-time ${isUnread ? 'unread' : ''}`}>
                    {notification.time}
                </span>
            </div>

            {isUnread && <div className="unread-dot" />}

            <button className="notification-menu" onClick={(e) => e.stopPropagation()}>
                ⋯
            </button>

            <style>{`
                .notification-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 8px 16px;
                    cursor: pointer;
                    position: relative;
                }

                .notification-item:hover {
                    background: ${FB_COLORS.bgHover};
                }

                .notification-item.unread {
                    background: ${FB_COLORS.blueLight};
                }

                .notification-item.unread:hover {
                    background: #DCE9F7;
                }

                .notification-avatar {
                    position: relative;
                    flex-shrink: 0;
                }

                .notification-icon {
                    position: absolute;
                    bottom: -2px;
                    right: -2px;
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    border: 2px solid white;
                }

                .notification-content {
                    flex: 1;
                    min-width: 0;
                }

                .notification-text {
                    font-size: 15px;
                    color: ${FB_COLORS.textPrimary};
                    line-height: 1.34;
                    margin: 0;
                }

                .notification-preview {
                    color: ${FB_COLORS.textSecondary};
                }

                .notification-time {
                    font-size: 13px;
                    color: ${FB_COLORS.textSecondary};
                }

                .notification-time.unread {
                    color: ${FB_COLORS.blue};
                    font-weight: 600;
                }

                .unread-dot {
                    width: 12px;
                    height: 12px;
                    background: ${FB_COLORS.blue};
                    border-radius: 50%;
                    flex-shrink: 0;
                }

                .notification-menu {
                    position: absolute;
                    right: 16px;
                    width: 32px;
                    height: 32px;
                    border: none;
                    background: ${FB_COLORS.bgMain};
                    border-radius: 50%;
                    cursor: pointer;
                    opacity: 0;
                    font-size: 16px;
                }

                .notification-item:hover .notification-menu {
                    opacity: 1;
                }
            `}</style>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// 🔔 NOTIFICATIONS DROPDOWN
// ═══════════════════════════════════════════════════════════════════════════

export const NotificationsDropdown = ({
    notifications = [],
    onNotificationClick,
    onMarkAllRead,
    onSettings
}) => {
    const [filter, setFilter] = useState('all'); // 'all' | 'unread'

    const filteredNotifications = filter === 'unread'
        ? notifications.filter(n => !n.read)
        : notifications;

    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <div className="notifications-dropdown">
            {/* Header */}
            <div className="notif-header">
                <h2 className="notif-title">Notifications</h2>
                <button className="header-btn" onClick={onSettings}>⋯</button>
            </div>

            {/* Filters */}
            <div className="notif-filters">
                <button
                    className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                    onClick={() => setFilter('all')}
                >
                    All
                </button>
                <button
                    className={`filter-btn ${filter === 'unread' ? 'active' : ''}`}
                    onClick={() => setFilter('unread')}
                >
                    Unread
                </button>
            </div>

            {/* Earlier Label */}
            <div className="notif-section-header">
                <span>Earlier</span>
                {unreadCount > 0 && (
                    <button className="mark-read-btn" onClick={onMarkAllRead}>
                        Mark all as read
                    </button>
                )}
            </div>

            {/* Notification List */}
            <div className="notif-list">
                {filteredNotifications.map((notif, i) => (
                    <NotificationItem
                        key={notif.id || i}
                        notification={notif}
                        onClick={onNotificationClick}
                    />
                ))}

                {filteredNotifications.length === 0 && (
                    <div className="empty-state">
                        <span className="empty-icon">🔔</span>
                        <p>No notifications to show</p>
                    </div>
                )}
            </div>

            <style>{`
                .notifications-dropdown {
                    width: 360px;
                    max-height: 500px;
                    background: ${FB_COLORS.bgWhite};
                    border-radius: 8px;
                    box-shadow: 0 2px 12px rgba(0,0,0,0.15);
                    display: flex;
                    flex-direction: column;
                }

                .notif-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 12px 16px;
                }

                .notif-title {
                    font-size: 24px;
                    font-weight: 700;
                    color: ${FB_COLORS.textPrimary};
                    margin: 0;
                }

                .header-btn {
                    width: 36px;
                    height: 36px;
                    border: none;
                    background: ${FB_COLORS.bgMain};
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 16px;
                }

                .header-btn:hover {
                    background: ${FB_COLORS.bgHover};
                }

                .notif-filters {
                    display: flex;
                    gap: 8px;
                    padding: 0 16px 12px;
                }

                .filter-btn {
                    padding: 8px 12px;
                    border: none;
                    background: ${FB_COLORS.bgMain};
                    border-radius: 20px;
                    font-size: 15px;
                    font-weight: 500;
                    color: ${FB_COLORS.textPrimary};
                    cursor: pointer;
                }

                .filter-btn:hover {
                    background: ${FB_COLORS.bgHover};
                }

                .filter-btn.active {
                    background: ${FB_COLORS.blueLight};
                    color: ${FB_COLORS.blue};
                }

                .notif-section-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 16px;
                    font-weight: 600;
                    color: ${FB_COLORS.textPrimary};
                }

                .mark-read-btn {
                    border: none;
                    background: none;
                    color: ${FB_COLORS.blue};
                    font-size: 15px;
                    cursor: pointer;
                }

                .mark-read-btn:hover {
                    text-decoration: underline;
                }

                .notif-list {
                    flex: 1;
                    overflow-y: auto;
                }

                .empty-state {
                    text-align: center;
                    padding: 40px 20px;
                    color: ${FB_COLORS.textSecondary};
                }

                .empty-icon {
                    font-size: 48px;
                    display: block;
                    margin-bottom: 12px;
                    opacity: 0.5;
                }
            `}</style>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// 🔔 NOTIFICATION BELL (Header Icon)
// ═══════════════════════════════════════════════════════════════════════════

export const NotificationBell = ({
    unreadCount = 0,
    onClick,
    isOpen = false
}) => (
    <button
        className={`notification-bell ${isOpen ? 'active' : ''}`}
        onClick={onClick}
    >
        <span className="bell-icon">🔔</span>
        {unreadCount > 0 && (
            <span className="bell-badge">
                {unreadCount > 99 ? '99+' : unreadCount}
            </span>
        )}

        <style>{`
            .notification-bell {
                width: 40px;
                height: 40px;
                border: none;
                background: ${FB_COLORS.bgMain};
                border-radius: 50%;
                cursor: pointer;
                position: relative;
                font-size: 18px;
            }

            .notification-bell:hover,
            .notification-bell.active {
                background: ${FB_COLORS.bgHover};
            }

            .notification-bell.active {
                color: ${FB_COLORS.blue};
            }

            .bell-badge {
                position: absolute;
                top: -2px;
                right: -2px;
                min-width: 18px;
                height: 18px;
                padding: 0 4px;
                background: #E41E3F;
                color: white;
                font-size: 11px;
                font-weight: 700;
                border-radius: 9px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
        `}</style>
    </button>
);

// ═══════════════════════════════════════════════════════════════════════════
// 📤 EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
    NotificationItem,
    NotificationsDropdown,
    NotificationBell,
    NOTIFICATION_TYPES
};
