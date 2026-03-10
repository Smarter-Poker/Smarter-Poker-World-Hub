/**
 * ═══════════════════════════════════════════════════════════
 * LOBBY STATS BAR — Club Arena Quick Metrics
 * ═══════════════════════════════════════════════════════════
 * Shows at-a-glance club vitals: Active Tables, Online Players, Total Pots.
 * Creates social proof and FOMO.
 */

import React from 'react';

const FB = {
    primary: '#2374E1',
    cardBg: '#242526',
    textPrimary: '#E4E6EB',
    textSecondary: '#B0B3B8',
    border: '#3E4042',
    accent: '#F5A623',
};

function StatPill({ icon, value, label }) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            background: 'rgba(255,255,255,0.06)',
            borderRadius: 20,
            border: `1px solid ${FB.border}`,
        }}>
            <span style={{ fontSize: 14 }}>{icon}</span>
            <span style={{
                fontSize: 14,
                fontWeight: 800,
                color: FB.accent,
                fontVariantNumeric: 'tabular-nums',
            }}>{value}</span>
            <span style={{
                fontSize: 11,
                color: FB.textSecondary,
                fontWeight: 500,
            }}>{label}</span>
        </div>
    );
}

/**
 * LobbyStatsBar
 * @param {Array} games - Array of game/table objects from the lobby
 */
export default function LobbyStatsBar({ games = [] }) {
    const activeTables = games.filter(g =>
        g.status === 'active' || g.status === 'running'
    ).length;

    const totalPlayers = games.reduce((sum, g) =>
        sum + (g.current_players ?? g.registered_count ?? g.player_count ?? 0), 0
    );

    const totalPots = games.reduce((sum, g) => {
        const pot = g.pot_total ?? g.prize_pool ?? 0;
        return sum + pot;
    }, 0);

    if (games.length === 0) return null;

    return (
        <div style={{
            display: 'flex',
            gap: 8,
            padding: '8px 12px',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
        }}>
            <StatPill icon="🎲" value={activeTables} label="Active" />
            <StatPill icon="👥" value={totalPlayers} label="Online" />
            {totalPots > 0 && (
                <StatPill
                    icon="💰"
                    value={totalPots >= 1000 ? `${(totalPots / 1000).toFixed(1)}K` : totalPots}
                    label="In Pots"
                />
            )}
            <StatPill icon="🎯" value={games.length} label="Games" />
        </div>
    );
}
