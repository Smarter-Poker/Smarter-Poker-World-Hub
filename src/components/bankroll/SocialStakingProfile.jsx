/**
 * SocialStakingProfile — Public Performance Card for Backers
 * ═══════════════════════════════════════════════════════════════════════════
 * Public performance card showing verified P/L stats with privacy controls.
 * Share profile link for potential backers with copy-to-clipboard.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function SocialStakingProfile({ entries = [], stats, user }) {
    const [privacy, setPrivacy] = useState({
        showROI: true,
        showWinRate: true,
        showVolume: true,
        showGraph: true,
        showStreak: false,
        showAvgSession: true,
    });
    const [copied, setCopied] = useState(false);

    // Compute profile stats from entries
    const profileStats = useMemo(() => {
        const gaming = entries.filter(e =>
            e.category !== 'expense' && e.category !== 'deposit' &&
            e.category !== 'withdrawal' && e.category !== 'receipt'
        );
        const totalSessions = gaming.length;
        const wins = gaming.filter(e => (e.gross_out - e.gross_in) > 0).length;
        const totalNet = gaming.reduce((s, e) => s + ((e.gross_out || 0) - (e.gross_in || 0)), 0);
        const totalBuyIn = gaming.reduce((s, e) => s + (e.gross_in || 0), 0);
        const roi = totalBuyIn > 0 ? ((totalNet / totalBuyIn) * 100).toFixed(1) : '0.0';
        const winRate = totalSessions > 0 ? Math.round((wins / totalSessions) * 100) : 0;
        const avgSession = totalSessions > 0 ? Math.round(totalNet / totalSessions) : 0;

        // Streak calc
        let currentStreak = 0;
        for (let i = gaming.length - 1; i >= 0; i--) {
            const net = (gaming[i].gross_out || 0) - (gaming[i].gross_in || 0);
            if (net > 0) currentStreak++;
            else break;
        }

        return { totalSessions, wins, totalNet, roi, winRate, avgSession, currentStreak };
    }, [entries]);

    const togglePrivacy = (key) => {
        setPrivacy(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleCopyLink = useCallback(() => {
        const link = `https://smarter.poker/profile/${user?.id || 'demo'}?view=staking`;
        navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [user]);

    const handleCopyStats = useCallback(() => {
        const lines = [
            `📊 ${user?.display_name || 'Player'} — Staking Profile`,
            `════════════════════════`,
        ];
        if (privacy.showROI) lines.push(`ROI: ${profileStats.roi}%`);
        if (privacy.showWinRate) lines.push(`Win Rate: ${profileStats.winRate}%`);
        if (privacy.showVolume) lines.push(`Sessions: ${profileStats.totalSessions}`);
        if (privacy.showAvgSession) lines.push(`Avg Session: $${profileStats.avgSession}`);
        if (privacy.showStreak) lines.push(`Current Streak: ${profileStats.currentStreak}W`);
        lines.push(``, `Verified by Smarter.Poker`);

        navigator.clipboard.writeText(lines.join('\n'));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [privacy, profileStats, user]);

    const profileColor = profileStats.totalNet >= 0 ? '#4ade80' : '#f87171';

    return (
        <div style={{ padding: '0 0 40px' }}>
            {/* Header */}
            <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#e2e8f0', letterSpacing: '-0.3px' }}>Staking Profile</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Share verified performance with potential backers</div>
            </div>

            {/* Profile Preview Card */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(0,0,0,0.3))',
                border: '1px solid rgba(99,102,241,0.2)', borderRadius: 20,
                overflow: 'hidden', marginBottom: 24,
            }}>
                {/* Card Header */}
                <div style={{
                    padding: '24px', display: 'flex', alignItems: 'center', gap: 16,
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 24, fontWeight: 900, color: '#fff',
                        border: '3px solid rgba(255,255,255,0.1)',
                    }}>
                        {(user?.display_name || 'P')[0]}
                    </div>
                    <div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: '#e2e8f0' }}>
                            {user?.display_name || 'Player'}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                            <span style={{
                                background: 'rgba(34,197,94,0.1)', color: '#4ade80',
                                fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 4,
                                textTransform: 'uppercase',
                            }}>Verified</span>
                            <span style={{
                                background: 'rgba(99,102,241,0.1)', color: '#a78bfa',
                                fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 4,
                                textTransform: 'uppercase',
                            }}>Smarter.Poker</span>
                        </div>
                    </div>
                </div>

                {/* Stats Grid */}
                <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                    {privacy.showROI && (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>ROI</div>
                            <div style={{ fontSize: 22, fontWeight: 900, color: parseFloat(profileStats.roi) >= 0 ? '#4ade80' : '#f87171' }}>
                                {profileStats.roi}%
                            </div>
                        </div>
                    )}
                    {privacy.showWinRate && (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Win Rate</div>
                            <div style={{ fontSize: 22, fontWeight: 900, color: '#e2e8f0' }}>
                                {profileStats.winRate}%
                            </div>
                        </div>
                    )}
                    {privacy.showVolume && (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Sessions</div>
                            <div style={{ fontSize: 22, fontWeight: 900, color: '#e2e8f0' }}>
                                {profileStats.totalSessions}
                            </div>
                        </div>
                    )}
                    {privacy.showAvgSession && (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Avg Session</div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: profileStats.avgSession >= 0 ? '#4ade80' : '#f87171' }}>
                                {profileStats.avgSession >= 0 ? '+' : ''}${profileStats.avgSession}
                            </div>
                        </div>
                    )}
                    {privacy.showStreak && (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Streak</div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: '#fbbf24' }}>
                                {profileStats.currentStreak}W
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '12px 24px', background: 'rgba(0,0,0,0.2)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    borderTop: '1px solid rgba(255,255,255,0.04)',
                }}>
                    <div style={{ fontSize: 10, color: '#64748b' }}>
                        Net P/L: <span style={{ color: profileColor, fontWeight: 800 }}>
                            {profileStats.totalNet >= 0 ? '+' : ''}${profileStats.totalNet.toLocaleString()}
                        </span>
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>Powered by Smarter.Poker</div>
                </div>
            </div>

            {/* Privacy Controls */}
            <div style={{
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 16, padding: 20, marginBottom: 24,
            }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0', marginBottom: 16, letterSpacing: 0.3 }}>
                    Privacy Controls
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                    {Object.entries(privacy).map(([key, value]) => (
                        <button
                            key={key}
                            onClick={() => togglePrivacy(key)}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '10px 14px', borderRadius: 10,
                                background: value ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${value ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)'}`,
                                cursor: 'pointer', color: value ? '#4ade80' : '#64748b',
                                fontSize: 12, fontWeight: 700,
                            }}
                        >
                            <span>{key.replace(/([A-Z])/g, ' $1').replace('show ', '').trim()}</span>
                            <span>{value ? '✓' : '○'}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Share Actions */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleCopyLink}
                    style={{
                        flex: 1, minWidth: 160, padding: '14px', borderRadius: 12,
                        background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                        border: 'none', color: '#fff', fontSize: 14, fontWeight: 800,
                        cursor: 'pointer', letterSpacing: 0.5,
                    }}
                >{copied ? '✓ Copied!' : '🔗 Copy Profile Link'}</motion.button>
                <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleCopyStats}
                    style={{
                        flex: 1, minWidth: 160, padding: '14px', borderRadius: 12,
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                        color: '#e2e8f0', fontSize: 14, fontWeight: 800, cursor: 'pointer',
                    }}
                >📋 Copy Stats Card</motion.button>
            </div>
        </div>
    );
}
