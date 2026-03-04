/* ═══════════════════════════════════════════════════════════════════════════
   PROFILE DROPDOWN — Settings and profile menu for profile orb
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import { clearAuth } from '../../lib/authUtils';

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
    { id: 'customize-cards', icon: '🎴', label: 'Customize Hub Cards' },
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
    onCustomizeCards?: () => void;
}

export function ProfileDropdown({ isOpen, onClose, anchorRef, onCustomizeCards }: ProfileDropdownProps) {
    const dropdownRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const [anchorPos, setAnchorPos] = useState({ top: 60, right: 16 });

    // Calculate anchor position from the profile orb element
    useEffect(() => {
        if (isOpen && anchorRef.current) {
            const rect = anchorRef.current.getBoundingClientRect();
            setAnchorPos({
                top: rect.bottom + 8,
                right: Math.max(8, window.innerWidth - rect.right),
            });
        }
    }, [isOpen, anchorRef]);

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

    // Close on Escape
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleItemClick = async (item: MenuItem) => {
        if (item.id === 'customize-cards') {
            onClose();
            onCustomizeCards?.();
            return;
        }
        if (item.id === 'logout') {
            onClose();
            try {
                // Sovereign Logout: clear auth + Supabase session
                clearAuth();
                const { supabase } = await import('../../lib/supabase');
                await supabase.auth.signOut();
            } catch { }
            router.push('/');
            return;
        }
        if (item.route) {
            router.push(item.route);
        }
        onClose();
    };

    return (
        // Rendered as fixed-position so it positions correctly regardless of parent stacking context
        <div
            ref={dropdownRef}
            style={{
                position: 'fixed',
                top: anchorPos.top,
                right: anchorPos.right,
                minWidth: 200,
                background: 'linear-gradient(180deg, rgba(12, 20, 38, 0.98) 0%, rgba(8, 14, 28, 0.99) 100%)',
                borderRadius: 14,
                border: '1px solid rgba(0, 212, 255, 0.25)',
                boxShadow: '0 16px 48px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(0,212,255,0.05)',
                backdropFilter: 'blur(16px)',
                overflow: 'hidden',
                zIndex: 9999,
                animation: 'profileDropFadeIn 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
        >
            {MENU_ITEMS.map(item => {
                if (item.id === 'divider') {
                    return (
                        <div
                            key={item.id}
                            style={{
                                height: 1,
                                background: 'rgba(255, 255, 255, 0.08)',
                                margin: '4px 0',
                            }}
                        />
                    );
                }

                return (
                    <button
                        key={item.id}
                        onClick={() => handleItemClick(item)}
                        style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '12px 18px',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            fontFamily: 'Inter, sans-serif',
                            fontSize: 14,
                            fontWeight: 500,
                            color: item.danger ? '#f87171' : '#e2e8f0',
                            textAlign: 'left',
                            transition: 'background 0.15s ease',
                            letterSpacing: 0.1,
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = item.danger
                                ? 'rgba(248, 113, 113, 0.1)'
                                : 'rgba(0, 212, 255, 0.08)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = 'transparent';
                        }}
                    >
                        <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{item.icon}</span>
                        <span>{item.label}</span>
                    </button>
                );
            })}
            <style>{`
                @keyframes profileDropFadeIn {
                    from { opacity: 0; transform: translateY(-8px) scale(0.97); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </div>
    );
}

export default ProfileDropdown;
