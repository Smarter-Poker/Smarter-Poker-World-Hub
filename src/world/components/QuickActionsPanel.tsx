/* ═══════════════════════════════════════════════════════════════════════════
   QUICK ACTIONS PANEL — Floating action buttons for common tasks
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// 🎯 ACTION DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────
interface QuickAction {
    id: string;
    icon: string;
    label: string;
    color: string;
    onClick: () => void;
}

const QUICK_ACTIONS: QuickAction[] = [
    {
        id: 'continue',
        icon: '▶️',
        label: 'Continue Training',
        color: '#00d4ff',
        onClick: () => console.log('Continue Training clicked'),
    },
    {
        id: 'daily',
        icon: '🎯',
        label: 'Daily Challenge',
        color: '#ff6600',
        onClick: () => console.log('Daily Challenge clicked'),
    },
    {
        id: 'leaderboard',
        icon: '🏆',
        label: 'Leaderboard',
        color: '#ffd700',
        onClick: () => console.log('Leaderboard clicked'),
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// 🔘 SINGLE ACTION BUTTON
// ─────────────────────────────────────────────────────────────────────────────
function ActionButton({ action, isExpanded }: { action: QuickAction; isExpanded: boolean }) {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <button
            onClick={action.onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: isExpanded ? '10px 16px' : '10px',
                background: isHovered
                    ? `linear-gradient(135deg, ${action.color}30, ${action.color}50)`
                    : 'rgba(0, 0, 0, 0.5)',
                border: `1px solid ${action.color}40`,
                borderRadius: 25,
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                boxShadow: isHovered ? `0 4px 20px ${action.color}40` : '0 2px 10px rgba(0, 0, 0, 0.3)',
            }}
        >
            <span style={{ fontSize: 18 }}>{action.icon}</span>
            {isExpanded && (
                <span
                    style={{
                        fontFamily: 'Inter, sans-serif',
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#ffffff',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {action.label}
                </span>
            )}
        </button>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 📋 QUICK ACTIONS PANEL
// ─────────────────────────────────────────────────────────────────────────────
export function QuickActionsPanel() {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div
            onMouseEnter={() => setIsExpanded(true)}
            onMouseLeave={() => setIsExpanded(false)}
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: 8,
                background: 'rgba(0, 0, 0, 0.3)',
                backdropFilter: 'blur(10px)',
                borderRadius: 30,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                transition: 'all 0.3s ease',
            }}
        >
            {QUICK_ACTIONS.map(action => (
                <ActionButton key={action.id} action={action} isExpanded={isExpanded} />
            ))}
        </div>
    );
}

export default QuickActionsPanel;
