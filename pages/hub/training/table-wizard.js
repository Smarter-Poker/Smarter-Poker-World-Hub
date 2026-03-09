/**
 * TABLE WIZARD — Smart Table Selection Assistant
 * ═══════════════════════════════════════════════════════════════════════════
 * Analyze table quality indicators to find the most profitable seats.
 * Simulate waitlist decisions and table-change strategies.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType, busEmit } from '../../../src/engine/EventBus';
import { getAuthUser } from '../../../src/lib/authUtils';

// ═══════════════════════════════════════════════════════════════════════════
// TABLE DATABASE (Simulated)
// ═══════════════════════════════════════════════════════════════════════════

const GAME_TYPES = ['NL Hold\'em', 'PLO', 'Mixed'];
const STAKES = ['$1/$2', '$2/$5', '$5/$10', '$10/$20', '$25/$50'];

function generateTables() {
    const tables = [];
    const names = ['Diamond', 'Emerald', 'Ruby', 'Sapphire', 'Gold', 'Platinum', 'Silver', 'Bronze', 'Crystal', 'Onyx', 'Pearl', 'Jade'];

    for (let i = 0; i < 12; i++) {
        const avgVPIP = 18 + Math.floor(Math.random() * 30);
        const avgPFR = Math.max(5, avgVPIP - 8 - Math.floor(Math.random() * 15));
        const players = 5 + Math.floor(Math.random() * 4); // 5-8 seated
        const waitlist = Math.floor(Math.random() * 6);
        const avgPot = 15 + Math.floor(Math.random() * 85);
        const handsPerHour = 22 + Math.floor(Math.random() * 18);

        // Quality score: higher VPIP, lower PFR = softer table
        const softness = ((avgVPIP - 24) * 2) + ((24 - avgPFR) * 1.5) + (avgPot > 40 ? 10 : 0);
        const quality = Math.max(0, Math.min(100, 50 + softness));

        tables.push({
            id: i,
            name: `${names[i]} ${i + 1}`,
            gameType: GAME_TYPES[0],
            stakes: STAKES[Math.floor(Math.random() * 3)],
            players, maxPlayers: 9,
            waitlist,
            avgVPIP, avgPFR,
            avgPot: `$${avgPot}`,
            handsPerHour,
            quality: Math.round(quality),
            qualityLabel: quality >= 75 ? 'EXCELLENT' : quality >= 55 ? 'GOOD' : quality >= 35 ? 'AVERAGE' : 'TOUGH',
            qualityColor: quality >= 75 ? '#4ade80' : quality >= 55 ? '#f59e0b' : quality >= 35 ? '#3b82f6' : '#ef4444',
        });
    }

    return tables.sort((a, b) => b.quality - a.quality);
}

// ═══════════════════════════════════════════════════════════════════════════
// SEAT QUALITY COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function SeatMap({ players, maxPlayers }) {
    const safePlayers = Math.max(0, Math.min(Number(players) || 0, 10));
    const safeMax = Math.max(1, Math.min(Number(maxPlayers) || 9, 10));
    const seats = Array.from({ length: safeMax }, (_, i) => i < safePlayers);
    return (
        <div style={{ display: 'flex', gap: 3 }}>
            {seats.map((occupied, i) => (
                <div key={i} style={{
                    width: 12, height: 12, borderRadius: '50%',
                    background: occupied ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${occupied ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.1)'}`,
                }} />
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function TableWizardPage() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [tables, setTables] = useState([]);
    const [filterStakes, setFilterStakes] = useState('ALL');
    const [sortBy, setSortBy] = useState('quality'); // 'quality' | 'vpip' | 'waitlist' | 'pot'
    const [expandedId, setExpandedId] = useState(null);
    const [joinedTable, setJoinedTable] = useState(null);

    useTrainingBus('table-wizard');

    useEffect(() => {
        try { setUser(getAuthUser()); } catch (_) { }
        setTables(generateTables());
    }, []);

    const filtered = useMemo(() => {
        let result = [...tables];
        if (filterStakes !== 'ALL') result = result.filter(t => t.stakes === filterStakes);
        switch (sortBy) {
            case 'quality': result.sort((a, b) => b.quality - a.quality); break;
            case 'vpip': result.sort((a, b) => b.avgVPIP - a.avgVPIP); break;
            case 'waitlist': result.sort((a, b) => a.waitlist - b.waitlist); break;
            case 'pot': result.sort((a, b) => parseInt(b.avgPot.slice(1)) - parseInt(a.avgPot.slice(1))); break;
        }
        return result;
    }, [tables, filterStakes, sortBy]);

    const handleJoinTable = useCallback((tableId) => {
        setJoinedTable(tableId);
        // HARDENED: safe eventBus access
        try {
            if (typeof eventBus !== 'undefined' && eventBus?.emit) {
                eventBus.emit(EventType?.SESSION_END || 'session:end', {
                    source: 'TableWizard', action: 'table_joined', tableId,
                }, 'TableWizard');
                eventBus.emit('training:session-complete', { game_id: 'table-wizard', accuracy: 100, correct_answers: 1, total_questions: 1, hands_played: 1 });
            }
        } catch (e) { console.warn('[TableWizard] EventBus error:', e); }
    }, []);

    const handleRefresh = useCallback(() => {
        setTables(generateTables());
        setJoinedTable(null);
        setExpandedId(null);
    }, []);

    return (
        <>
            <Head>
                <title>Table Wizard | Smarter.Poker</title>
                <meta name="description" content="Smart table selection — find the most profitable seats" />
            </Head>

            <div style={{ minHeight: '100vh', background: '#18191a', color: '#e4e6eb', fontFamily: "'Inter', -apple-system, sans-serif" }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #3a3b3c' }}>
                    <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#b0b3b8', fontSize: 14, cursor: 'pointer', marginBottom: 4 }}>Back to Training</button>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, fontFamily: "'Rajdhani', sans-serif" }}>Table Wizard</h1>
                            <p style={{ fontSize: 14, color: '#b0b3b8', margin: '2px 0 0' }}>Find the most profitable tables and seats</p>
                        </div>
                        <button onClick={handleRefresh} style={{
                            padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80',
                        }}>
                            Refresh Tables
                        </button>
                    </div>
                </div>

                <div style={{ padding: '16px 20px', maxWidth: 900, margin: '0 auto' }}>
                    {/* Filters */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => setFilterStakes('ALL')} style={{
                                padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                background: filterStakes === 'ALL' ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                                border: `1px solid ${filterStakes === 'ALL' ? '#818cf8' : 'rgba(255,255,255,0.08)'}`,
                                color: filterStakes === 'ALL' ? '#818cf8' : '#b0b3b8',
                            }}>All Stakes</button>
                            {STAKES.slice(0, 3).map(s => (
                                <button key={s} onClick={() => setFilterStakes(s)} style={{
                                    padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                    background: filterStakes === s ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                                    border: `1px solid ${filterStakes === s ? '#818cf8' : 'rgba(255,255,255,0.08)'}`,
                                    color: filterStakes === s ? '#818cf8' : '#b0b3b8',
                                }}>{s}</button>
                            ))}
                        </div>
                        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
                            padding: '5px 10px', borderRadius: 6, fontSize: 11, background: 'rgba(0,0,0,0.3)',
                            border: '1px solid rgba(255,255,255,0.1)', color: '#e4e6eb',
                        }}>
                            <option value="quality">Sort: Quality</option>
                            <option value="vpip">Sort: VPIP (Softest)</option>
                            <option value="waitlist">Sort: Shortest Wait</option>
                            <option value="pot">Sort: Biggest Pots</option>
                        </select>
                    </div>

                    {/* Table Summary */}
                    <div style={{
                        display: 'flex', gap: 8, marginBottom: 16,
                        padding: '8px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8,
                    }}>
                        <span style={{ fontSize: 12, color: '#b0b3b8' }}>{filtered.length} tables</span>
                        <span style={{ fontSize: 12, color: '#4ade80' }}>{filtered.filter(t => t.quality >= 70).length} excellent</span>
                        <span style={{ fontSize: 12, color: '#f59e0b' }}>{filtered.filter(t => t.quality >= 50 && t.quality < 70).length} good</span>
                        <span style={{ fontSize: 12, color: '#ef4444' }}>{filtered.filter(t => t.quality < 50).length} tough</span>
                    </div>

                    {/* Table Cards */}
                    <div style={{ display: 'grid', gap: 8 }}>
                        {filtered.map(table => (
                            <motion.div
                                key={table.id}
                                layout
                                style={{
                                    borderRadius: 10, overflow: 'hidden',
                                    background: joinedTable === table.id ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${joinedTable === table.id ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.06)'}`,
                                }}
                            >
                                <div
                                    onClick={() => setExpandedId(expandedId === table.id ? null : table.id)}
                                    style={{ padding: '12px 16px', cursor: 'pointer' }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={{
                                                padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                                                background: `${table.qualityColor}12`, color: table.qualityColor, letterSpacing: '0.06em',
                                            }}>
                                                {table.qualityLabel}
                                            </div>
                                            <span style={{ fontSize: 14, fontWeight: 600, color: '#e4e6eb' }}>{table.name}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: '#b0b3b8' }}>{table.stakes}</span>
                                            <div style={{
                                                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                background: `${table.qualityColor}12`, border: `1px solid ${table.qualityColor}40`,
                                                fontSize: 11, fontWeight: 700, color: table.qualityColor,
                                            }}>
                                                {table.quality}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', gap: 14 }}>
                                            <span style={{ fontSize: 11, color: '#b0b3b8' }}>VPIP: <span style={{ color: table.avgVPIP > 30 ? '#4ade80' : '#e4e6eb', fontWeight: 600 }}>{table.avgVPIP}%</span></span>
                                            <span style={{ fontSize: 11, color: '#b0b3b8' }}>PFR: <span style={{ color: '#e4e6eb', fontWeight: 600 }}>{table.avgPFR}%</span></span>
                                            <span style={{ fontSize: 11, color: '#b0b3b8' }}>Avg Pot: <span style={{ color: '#e4e6eb', fontWeight: 600 }}>{table.avgPot}</span></span>
                                        </div>
                                        <SeatMap players={table.players} maxPlayers={table.maxPlayers} />
                                    </div>
                                </div>

                                <AnimatePresence>
                                    {expandedId === table.id && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                            style={{ overflow: 'hidden' }}>
                                            <div style={{ padding: '0 16px 14px' }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 10 }}>
                                                    {[
                                                        { label: 'Players', value: `${table.players}/${table.maxPlayers}` },
                                                        { label: 'Waitlist', value: table.waitlist > 0 ? `${table.waitlist} waiting` : 'Open' },
                                                        { label: 'Hands/hr', value: table.handsPerHour },
                                                        { label: 'Quality', value: `${table.quality}/100` },
                                                    ].map(s => (
                                                        <div key={s.label} style={{
                                                            padding: '6px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: 6, textAlign: 'center',
                                                        }}>
                                                            <div style={{ fontSize: 9, color: '#6b7280', fontWeight: 600, letterSpacing: '0.06em' }}>{s.label.toUpperCase()}</div>
                                                            <div style={{ fontSize: 12, fontWeight: 700, color: '#e4e6eb' }}>{s.value}</div>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div style={{
                                                    padding: '8px 12px', background: 'rgba(99,102,241,0.04)', borderRadius: 6,
                                                    borderLeft: `3px solid ${table.qualityColor}`, marginBottom: 10,
                                                }}>
                                                    <div style={{ fontSize: 12, color: '#e4e6eb', lineHeight: 1.4 }}>
                                                        {table.quality >= 70
                                                            ? 'Soft table. High VPIP suggests recreational players. Prioritize value betting.'
                                                            : table.quality >= 50
                                                                ? 'Moderate table. Mix of regs and recreationals. Standard strategy applies.'
                                                                : 'Tough table. Low VPIP and high PFR indicate a reg-heavy lineup. Consider finding a softer game.'}
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => handleJoinTable(table.id)}
                                                    style={{
                                                        width: '100%', padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                                        background: joinedTable === table.id ? 'rgba(34,197,94,0.15)' : table.qualityColor,
                                                        border: joinedTable === table.id ? '1px solid rgba(34,197,94,0.3)' : 'none',
                                                        color: joinedTable === table.id ? '#4ade80' : '#000',
                                                        fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.08em',
                                                    }}
                                                >
                                                    {joinedTable === table.id ? 'JOINED' : table.waitlist > 0 ? `JOIN WAITLIST (${table.waitlist} ahead)` : 'JOIN TABLE'}
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}
