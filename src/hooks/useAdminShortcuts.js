/**
 * useAdminShortcuts — Keyboard shortcuts for Club Arena admin
 * ═══════════════════════════════════════════════════════════════
 * Power-user keyboard shortcuts with a Command Palette (Ctrl+K / Cmd+K)
 *
 * Shortcuts:
 *   Ctrl+K / Cmd+K  → Open command palette
 *   M               → Open members
 *   T               → Open tables
 *   C               → Open chips
 *   R               → Open reports
 *   S               → Open settings
 *   N               → Create new table
 *   Escape          → Close current modal
 */

import { useEffect, useState, useCallback } from 'react';

const SHORTCUTS = [
    { key: 'm', label: 'Manage Members', action: 'members', icon: '👥' },
    { key: 't', label: 'Table Management', action: 'tables', icon: '🎯' },
    { key: 'c', label: 'Chip Management', action: 'chips', icon: '🎰' },
    { key: 'r', label: 'Club Reports', action: 'reports', icon: '📊' },
    { key: 's', label: 'Club Settings', action: 'settings', icon: '⚙️' },
    { key: 'n', label: 'Create New Table', action: 'new_table', icon: '➕' },
    { key: 'a', label: 'Announcements', action: 'announcements', icon: '📢' },
    { key: 'p', label: 'Promo Wallet', action: 'promo', icon: '💜' },
    { key: 'k', label: 'Rakeback', action: 'rakeback', icon: '💸' },
    { key: 'x', label: 'Anti-Cheat', action: 'anticheat', icon: '🛡️' },
    { key: 'i', label: 'Mint Chips', action: 'mint', icon: '💰' },
];

export default function useAdminShortcuts({ onAction, isAdmin, activeModal }) {
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [paletteQuery, setPaletteQuery] = useState('');

    const handleAction = useCallback((actionId) => {
        setPaletteOpen(false);
        setPaletteQuery('');
        if (onAction) onAction(actionId);
    }, [onAction]);

    useEffect(() => {
        if (!isAdmin) return;

        const handler = (e) => {
            // Don't intercept if user is typing in an input
            const tag = e.target?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

            // Command Palette toggle
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setPaletteOpen(prev => !prev);
                setPaletteQuery('');
                return;
            }

            // Escape — close palette or modal
            if (e.key === 'Escape') {
                if (paletteOpen) {
                    setPaletteOpen(false);
                    setPaletteQuery('');
                    return;
                }
                if (activeModal) {
                    handleAction('close_modal');
                    return;
                }
            }

            // Direct shortcuts (only when no modal is open)
            if (!activeModal && !paletteOpen) {
                const shortcut = SHORTCUTS.find(s => s.key === e.key.toLowerCase());
                if (shortcut) {
                    e.preventDefault();
                    handleAction(shortcut.action);
                }
            }
        };

        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isAdmin, activeModal, paletteOpen, handleAction]);

    const filteredShortcuts = paletteQuery.trim()
        ? SHORTCUTS.filter(s =>
            s.label.toLowerCase().includes(paletteQuery.toLowerCase()) ||
            s.action.toLowerCase().includes(paletteQuery.toLowerCase())
        )
        : SHORTCUTS;

    return {
        paletteOpen,
        setPaletteOpen,
        paletteQuery,
        setPaletteQuery,
        filteredShortcuts,
        handleAction,
        SHORTCUTS,
    };
}
