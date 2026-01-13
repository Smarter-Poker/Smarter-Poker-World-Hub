/* ═══════════════════════════════════════════════════════════════════════════
   PROFILE DROPDOWN — Settings and profile menu for profile orb
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';

// ─────────────────────────────────────────────────────────────────────────────
// 📋 MENU ITEMS
// ─────────────────────────────────────────────────────────────────────────────
interface MenuItem {
    id: string;
    icon: string;
    label: string;
    route?: string;
    danger?: boolean;
}

const MENU_ITEMS: MenuItem[] = [
    { id: 'profile', icon: '👤', label: 'View Profile', route: '/hub/social-media?tab=profile' },
    { id: 'settings', icon: '⚙️', label: 'Settings', route: '/hub/settings' },
    { id: 'help', icon: '❓', label: 'Help & Tutorial', route: '/hub/help' },
    { id: 'divider', icon: '', label: '' },
    { id: 'logout', icon: '🚪', label: 'Log Out', danger: true },
];

// ─────────────────────────────────────────────────────────────────────────────
// 📦 PROFILE DROPDOWN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
interface ProfileDropdownProps {
    isOpen: boolean;
    onClose: () => void;
    anchorRef: React.RefObject<HTMLDivElement>;
}

export function ProfileDropdown({ isOpen, onClose, anchorRef }: ProfileDropdownProps) {
    const dropdownRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target as Node) &&
                anchorRef.current &&
                !anchorRef.current.contains(e.target as Node)
            ) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose, anchorRef]);

    if (!isOpen) return null;

    return (
        <div
            ref={dropdownRef}
            style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 8,
                minWidth: 180,
                background: 'linear-gradient(180deg, rgba(20, 30, 50, 0.98), rgba(10, 20, 40, 0.98))',
                borderRadius: 12,
                border: '1px solid rgba(0, 212, 255, 0.3)',
                boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
                overflow: 'hidden',
                zIndex: 100,
                animation: 'fadeIn 0.2s ease',
            }}
        >
            {MENU_ITEMS.map(item => {
                if (item.id === 'divider') {
                    return (
                        <div
                            key={item.id}
                            style={{
                                height: 1,
                                background: 'rgba(255, 255, 255, 0.1)',
                                margin: '4px 0',
                            }}
                        />
                    );
                }

                return (
                    <button
                        key={item.id}
                        onClick={() => {
                            if (item.route) {
                                router.push(item.route);
                            } else if (item.id === 'logout') {
                                // Handle logout
                                console.log('Logout clicked');
                            }
                            onClose();
                        }}
                        style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '12px 16px',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            fontFamily: 'Inter, sans-serif',
                            fontSize: 14,
                            color: item.danger ? '#ff4444' : '#ffffff',
                            textAlign: 'left',
                            transition: 'background 0.2s ease',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = item.danger
                                ? 'rgba(255, 68, 68, 0.1)'
                                : 'rgba(0, 212, 255, 0.1)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = 'transparent';
                        }}
                    >
                        <span style={{ fontSize: 16 }}>{item.icon}</span>
                        <span>{item.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

export default ProfileDropdown;
