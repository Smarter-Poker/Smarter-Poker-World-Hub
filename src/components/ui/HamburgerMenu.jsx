/**
 * Universal Hamburger Menu Component
 * ═══════════════════════════════════════════════════════════════════════════
 * Reusable slide-out menu for all World Hub pages
 * Supports navigation links, toggle switches, action buttons, and theming
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import InviteFriendsModal from './InviteFriendsModal';

export default function HamburgerMenu({
    isOpen,
    onClose,
    direction = 'left',
    theme = 'light',
    user = null,
    stats = { xp: 0, level: 1 },  // XP stats for progress bar
    menuItems = [],
    showProfile = true,
    profileExtras = null,
    bottomLinks = [],
    width = 320
}) {
    const router = useRouter();
    const [showInviteModal, setShowInviteModal] = useState(false);

    // Close on ESC key
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape' && isOpen) onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    // Swipe-to-close gesture
    const touchStartRef = React.useRef(null);
    const handleTouchStart = (e) => {
        touchStartRef.current = e.touches[0].clientX;
    };
    const handleTouchEnd = (e) => {
        if (touchStartRef.current === null) return;
        const touchEnd = e.changedTouches[0].clientX;
        const diff = touchStartRef.current - touchEnd;
        // Swipe left to close if menu is on left, swipe right if menu is on right
        if (direction === 'left' && diff > 50) onClose();
        if (direction === 'right' && diff < -50) onClose();
        touchStartRef.current = null;
    };

    // Prevent body scroll when menu is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    const colors = theme === 'light' ? {
        bg: '#FFFFFF',
        text: '#050505',
        textSec: '#65676B',
        border: '#DADDE1',
        blue: '#1877F2',
        blueHover: '#166FE5',
        cardBg: '#F0F2F5',
        hoverBg: '#F2F3F5'
    } : {
        bg: 'linear-gradient(180deg, #0a1628 0%, #0d1f3c 100%)',
        text: '#FFFFFF',
        textSec: '#94a3b8',
        border: 'rgba(59, 130, 246, 0.2)',
        blue: '#3b82f6',
        blueHover: '#2563eb',
        cardBg: 'rgba(30, 58, 95, 0.5)',
        hoverBg: 'rgba(59, 130, 246, 0.1)'
    };

    const renderMenuItem = (item, index) => {
        switch (item.type) {
            case 'navigation':
                return (
                    <Link
                        key={index}
                        href={item.href}
                        onClick={() => {
                            if (item.onClick) item.onClick();
                            onClose();
                        }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '12px 16px',
                            textDecoration: 'none',
                            color: colors.text,
                            borderRadius: 8,
                            transition: 'background 0.2s',
                            cursor: 'pointer'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = colors.hoverBg}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                        {item.icon && <div style={{ width: 24, height: 24 }}>{item.icon}</div>}
                        <span style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>{item.label}</span>
                        {item.badge && (
                            <span style={{
                                background: colors.blue,
                                color: 'white',
                                borderRadius: '50%',
                                width: 20,
                                height: 20,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 11,
                                fontWeight: 600
                            }}>
                                {item.badge}
                            </span>
                        )}
                        <span style={{ color: colors.textSec }}>›</span>
                    </Link>
                );

            case 'toggle':
                return (
                    <div key={index} style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <label style={{ fontSize: 15, fontWeight: 500, color: colors.text }}>
                                {item.label}
                            </label>
                            <button
                                onClick={() => item.onChange && item.onChange(!item.checked)}
                                style={{
                                    width: 52,
                                    height: 28,
                                    borderRadius: 14,
                                    border: 'none',
                                    padding: 2,
                                    cursor: 'pointer',
                                    backgroundColor: item.checked ? '#10b981' : '#64748b',
                                    transition: 'background-color 0.2s ease',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}
                                aria-checked={item.checked}
                                role="switch"
                            >
                                <span style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: '50%',
                                    backgroundColor: 'white',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                    transform: item.checked ? 'translateX(24px)' : 'translateX(0)',
                                    transition: 'transform 0.2s ease'
                                }} />
                            </button>
                        </div>
                    </div>
                );

            case 'action':
                return (
                    <button
                        key={index}
                        onClick={() => {
                            if (item.openInviteModal) {
                                setShowInviteModal(true);
                                return;
                            }
                            if (item.onClick) item.onClick();
                            if (item.closeOnClick !== false) onClose();
                        }}
                        style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '12px 16px',
                            background: item.primary ? colors.blue : 'transparent',
                            border: item.primary ? 'none' : `1px solid ${colors.border}`,
                            borderRadius: 8,
                            color: item.primary ? 'white' : colors.text,
                            fontSize: 15,
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            if (item.primary) {
                                e.currentTarget.style.background = colors.blueHover;
                            } else {
                                e.currentTarget.style.background = colors.hoverBg;
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (item.primary) {
                                e.currentTarget.style.background = colors.blue;
                            } else {
                                e.currentTarget.style.background = 'transparent';
                            }
                        }}
                    >
                        {item.icon && <div style={{ width: 24, height: 24 }}>{item.icon}</div>}
                        <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
                    </button>
                );

            case 'divider':
                return (
                    <div
                        key={index}
                        style={{
                            height: 1,
                            background: colors.border,
                            margin: '12px 0'
                        }}
                    />
                );

            case 'section':
                return (
                    <div key={index} style={{ padding: '16px 16px 8px', marginTop: index > 0 ? 12 : 0 }}>
                        <h4 style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: colors.textSec,
                            margin: 0,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                        }}>
                            {item.label}
                        </h4>
                    </div>
                );

            case 'grid':
                return (
                    <div key={index} style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${item.columns || 2}, 1fr)`,
                        gap: 8,
                        padding: '0 16px',
                        marginBottom: 16
                    }}>
                        {item.items.map((gridItem, gridIndex) => (
                            <Link
                                key={gridIndex}
                                href={gridItem.href}
                                onClick={() => {
                                    if (gridItem.onClick) gridItem.onClick();
                                    onClose();
                                }}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'flex-start',
                                    padding: '14px 12px',
                                    background: theme === 'light' ? '#fff' : colors.cardBg,
                                    borderRadius: 8,
                                    textDecoration: 'none',
                                    border: `1px solid ${colors.border}`,
                                    transition: 'transform 0.2s, box-shadow 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = 'none';
                                }}
                            >
                                {gridItem.icon && (
                                    <div style={{ width: 36, height: 36, marginBottom: 8 }}>
                                        {gridItem.icon}
                                    </div>
                                )}
                                <span style={{ fontSize: 15, fontWeight: 500, color: colors.text }}>
                                    {gridItem.label}
                                </span>
                            </Link>
                        ))}
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    onClick={onClose}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0, 0, 0, 0.5)',
                        zIndex: 999,
                        animation: 'fadeIn 0.2s ease'
                    }}
                />
            )}

            {/* Drawer */}
            <div
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                style={{
                    position: 'fixed',
                    top: 0,
                    [direction]: 0,
                    bottom: 0,
                    width: '100%',
                    maxWidth: width,
                    background: theme === 'light' ? colors.bg : colors.bg,
                    boxShadow: direction === 'left' ? '2px 0 10px rgba(0,0,0,0.2)' : '-4px 0 20px rgba(0, 0, 0, 0.5)',
                    zIndex: 1000,
                    transform: isOpen
                        ? 'translateX(0)'
                        : direction === 'left' ? 'translateX(-100%)' : 'translateX(100%)',
                    transition: 'transform 0.3s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    overflowY: 'auto',
                    paddingBottom: 80
                }}>
                {/* Close button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 12 }}>
                    <button
                        onClick={onClose}
                        style={{
                            background: theme === 'light' ? '#f0f0f0' : 'rgba(255, 255, 255, 0.1)',
                            border: 'none',
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            cursor: 'pointer',
                            fontSize: 16,
                            color: colors.text,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = theme === 'light' ? '#e0e0e0' : 'rgba(255, 255, 255, 0.15)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = theme === 'light' ? '#f0f0f0' : 'rgba(255, 255, 255, 0.1)'}
                        aria-label="Close Menu"
                    >
                        ✕
                    </button>
                </div>

                {/* User Profile Card */}
                {showProfile && user && (
                    <Link
                        href="/hub/profile"
                        onClick={onClose}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '12px 16px',
                            margin: '0 12px 16px',
                            background: theme === 'light' ? colors.bg : colors.cardBg,
                            borderRadius: 12,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                            textDecoration: 'none',
                            color: 'inherit',
                            border: `1px solid ${colors.border}`
                        }}
                    >
                        <img
                            src={user.avatar || user.user_metadata?.avatar_url || '/default-avatar.png'}
                            alt={user.name || user.user_metadata?.full_name || 'User'}
                            style={{
                                width: 48,
                                height: 48,
                                borderRadius: '50%',
                                objectFit: 'cover'
                            }}
                        />
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 17, color: colors.text }}>
                                {user.name}
                            </div>
                            <div style={{ fontSize: 13, color: colors.textSec }}>
                                View Your Profile
                            </div>
                        </div>
                    </Link>
                )}

                {/* Profile Extras (e.g., Poker Resume) */}
                {profileExtras}

                {/* Menu Items */}
                <div style={{ flex: 1 }}>
                    {menuItems.map((item, index) => renderMenuItem(item, index))}
                </div>

                {/* Bottom Links */}
                {bottomLinks.length > 0 && (
                    <div style={{ padding: '0 16px', borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
                        {bottomLinks.map((link, index) => {
                            const commonStyle = {
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '12px 0',
                                textDecoration: 'none',
                                color: colors.text,
                                borderTop: index > 0 ? `1px solid ${colors.border}` : 'none',
                                width: '100%',
                                fontSize: 15,
                                fontFamily: 'inherit',
                            };

                            if (link.action || link.openInviteModal) {
                                return (
                                    <button
                                        key={index}
                                        onClick={() => {
                                            if (link.openInviteModal) {
                                                setShowInviteModal(true);
                                                return;
                                            }
                                            if (link.onClick) link.onClick();
                                            onClose();
                                        }}
                                        style={{
                                            ...commonStyle,
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {link.icon && <div style={{ width: 24, height: 24 }}>{link.icon}</div>}
                                        <span style={{ flex: 1, fontSize: 15, textAlign: 'left' }}>{link.label}</span>
                                        <span style={{ color: colors.textSec }}>›</span>
                                    </button>
                                );
                            }

                            return (
                                <Link
                                    key={index}
                                    href={link.href}
                                    onClick={onClose}
                                    style={commonStyle}
                                >
                                    {link.icon && <div style={{ width: 24, height: 24 }}>{link.icon}</div>}
                                    <span style={{ flex: 1, fontSize: 15 }}>{link.label}</span>
                                    <span style={{ color: colors.textSec }}>›</span>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Invite Friends Modal */}
            <InviteFriendsModal
                isOpen={showInviteModal}
                onClose={() => setShowInviteModal(false)}
                user={user}
            />

            {/* CSS for animations */}
            <style jsx global>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
        </>
    );
}

const styles = {
    switchContainer: {
        position: 'relative',
        display: 'inline-block',
        width: 60,
        height: 34,
        cursor: 'pointer'
    },
    switchInput: {
        opacity: 0,
        width: 0,
        height: 0
    },
    switchSlider: {
        position: 'absolute',
        cursor: 'pointer',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: 34,
        transition: 'background-color 0.2s ease',
        '::before': {
            position: 'absolute',
            content: '""',
            height: 26,
            width: 26,
            left: 4,
            bottom: 4,
            backgroundColor: 'white',
            borderRadius: '50%',
            transition: 'transform 0.2s ease'
        }
    }
};
