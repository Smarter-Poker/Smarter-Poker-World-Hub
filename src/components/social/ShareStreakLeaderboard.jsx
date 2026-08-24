/**
 * ShareStreakLeaderboard
 * ─────────────────────
 * Inline feed card displaying the top 10 share-streak leaders.
 * Powered by the share_streaks view joined with share_streak_rewards.
 *
 * Placement: injected into the social feed after the 5th post.
 * Visibility: collapses after first render if no active streaks exist.
 */

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';

const C = {
    bg: '#18191a',
    card: '#242526',
    border: 'rgba(255,255,255,0.08)',
    text: '#e4e6eb',
    textSec: '#b0b3b8',
    blue: '#2D88FF',
    indigo: '#818cf8',
    violet: '#a78bfa',
};

// FIX (2026-08-24): the catch branch here used to createClient() a whole
// second browser client with DEFAULT auth options - its own GoTrue instance on
// the default storageKey, its own refresh timer and websocket, fighting the
// Auth Migration v6 key cleanup in pages/_app.js. There is no legitimate
// reason for the shared-singleton import to fail, and silently continuing on a
// rogue anonymous client is worse than surfacing that failure, so the fallback
// is gone. src/lib/supabase.ts exports a lazy Proxy; the dynamic import is
// kept so nothing is constructed during SSG.
let _supabase = null;
async function getSupabase() {
    if (_supabase) return _supabase;
    const { supabase } = await import('../../lib/supabase');
    _supabase = supabase;
    return _supabase;
}

const TIER_CONFIG = {
    legend: { label: 'Legend', color: '#f59e0b', min: 30, multiplier: '2.0×' },
    master:  { label: 'Master',  color: '#818cf8', min: 14, multiplier: '1.75×' },
    expert:  { label: 'Expert',  color: '#34d399', min: 7,  multiplier: '1.5×'  },
    streak:  { label: 'Streak',  color: '#60a5fa', min: 3,  multiplier: '1.2×'  },
    base:    { label: 'Base',    color: '#9ca3af', min: 1,  multiplier: '1.0×'  },
};

function getTier(days) {
    if (days >= 30) return TIER_CONFIG.legend;
    if (days >= 14) return TIER_CONFIG.master;
    if (days >= 7)  return TIER_CONFIG.expert;
    if (days >= 3)  return TIER_CONFIG.streak;
    return TIER_CONFIG.base;
}

function StreakBar({ days }) {
    const max = 30;
    const pct = Math.min((days / max) * 100, 100);
    const tier = getTier(days);
    return (
        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', flex: 1 }}>
            <div style={{
                height: '100%', width: `${pct}%`, borderRadius: 2,
                background: `linear-gradient(90deg, ${tier.color}99, ${tier.color})`,
                transition: 'width 0.6s ease',
            }} />
        </div>
    );
}

export default function ShareStreakLeaderboard({ currentUserId }) {
    const [leaders, setLeaders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [collapsed, setCollapsed] = useState(false);
    const [currentUserRank, setCurrentUserRank] = useState(null);
    const fetchedRef = useRef(false);

    useEffect(() => {
        if (fetchedRef.current) return;
        fetchedRef.current = true;

        const load = async () => {
            try {
                const sb = await getSupabase();

                // Fetch top 10 active share streaks + profile data
                const { data: streakData, error } = await sb
                    .from('share_streaks')
                    .select('user_id, streak_days, streak_start, streak_end, is_active')
                    .eq('is_active', true)
                    .order('streak_days', { ascending: false })
                    .limit(10);

                if (error || !streakData || streakData.length === 0) {
                    setLoading(false);
                    return;
                }

                // Batch-fetch profiles
                const userIds = streakData.map(s => s.user_id);
                const { data: profiles } = await sb
                    .from('profiles')
                    .select('id, username, full_name, avatar_url')
                    .in('id', userIds);

                const profileMap = {};
                (profiles || []).forEach(p => { profileMap[p.id] = p; });

                // Batch-fetch total diamonds earned from streaks
                const { data: rewardData } = await sb
                    .from('share_streak_rewards')
                    .select('user_id, diamonds_awarded')
                    .in('user_id', userIds);

                const diamondMap = {};
                (rewardData || []).forEach(r => {
                    diamondMap[r.user_id] = (diamondMap[r.user_id] || 0) + r.diamonds_awarded;
                });

                const enriched = streakData.map((s, i) => ({
                    ...s,
                    rank: i + 1,
                    profile: profileMap[s.user_id] || null,
                    totalDiamonds: diamondMap[s.user_id] || 0,
                }));

                setLeaders(enriched);

                // Determine current user's rank if not in top 10
                if (currentUserId) {
                    const myEntry = enriched.find(e => e.user_id === currentUserId);
                    if (!myEntry) {
                        const { data: myStreak } = await sb
                            .from('share_streaks')
                            .select('streak_days, is_active')
                            .eq('user_id', currentUserId)
                            .eq('is_active', true)
                            .order('streak_days', { ascending: false })
                            .limit(1)
                            .maybeSingle();
                        if (myStreak) {
                            // Estimate rank: count users with higher streak
                            const { count } = await sb
                                .from('share_streaks')
                                .select('*', { count: 'exact', head: true })
                                .eq('is_active', true)
                                .gt('streak_days', myStreak.streak_days);
                            setCurrentUserRank({
                                rank: (count || 0) + 1,
                                streak_days: myStreak.streak_days,
                            });
                        }
                    }
                }
            } catch (e) {
                console.warn('[ShareStreakLeaderboard]', e);
            }
            setLoading(false);
        };

        load();
    }, [currentUserId]);

    if (loading || leaders.length === 0) return null;

    return (
        <div style={{
            background: C.card,
            borderRadius: 12,
            border: `1px solid ${C.border}`,
            overflow: 'hidden',
            marginBottom: 6,
        }}>
            {/* Header */}
            <div
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px 10px',
                    borderBottom: collapsed ? 'none' : `1px solid ${C.border}`,
                    cursor: 'pointer',
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.06))',
                }}
                onClick={() => setCollapsed(c => !c)}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.2))',
                        border: '1px solid rgba(99,102,241,0.3)',
                        fontSize: 18,
                    }}>💎</div>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Share Streak Leaders</div>
                        <div style={{ fontSize: 12, color: C.textSec }}>Top daily sharers earning diamonds</div>
                    </div>
                </div>
                <div style={{ fontSize: 16, color: C.textSec, userSelect: 'none', transition: 'transform 0.2s', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                    ▾
                </div>
            </div>

            {!collapsed && (
                <div style={{ padding: '8px 0 12px' }}>
                    {leaders.map((entry, i) => {
                        const profile = entry.profile;
                        const tier = getTier(entry.streak_days);
                        const isMe = entry.user_id === currentUserId;
                        const name = profile?.full_name || profile?.username || 'Anonymous';
                        const avatar = profile?.avatar_url;
                        const username = profile?.username;

                        return (
                            <div
                                key={entry.user_id}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '8px 16px',
                                    background: isMe ? 'rgba(99,102,241,0.08)' : 'transparent',
                                    borderLeft: isMe ? '3px solid #818cf8' : '3px solid transparent',
                                    transition: 'background 0.15s',
                                }}
                            >
                                {/* Rank */}
                                <div style={{
                                    width: 24, textAlign: 'center', fontSize: 13, fontWeight: 700,
                                    color: i === 0 ? '#f59e0b' : i === 1 ? '#9ca3af' : i === 2 ? '#b45309' : C.textSec,
                                    flexShrink: 0,
                                }}>
                                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                                </div>

                                {/* Avatar */}
                                <div style={{ flexShrink: 0 }}>
                                    {avatar ? (
                                        <img src={avatar} alt={name} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${isMe ? '#818cf8' : C.border}` }} />
                                    ) : (
                                        <div style={{
                                            width: 36, height: 36, borderRadius: '50%',
                                            background: `linear-gradient(135deg, ${tier.color}55, ${tier.color}33)`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 15, fontWeight: 700, color: tier.color,
                                            border: `2px solid ${isMe ? '#818cf8' : C.border}`,
                                        }}>
                                            {name[0]?.toUpperCase() || '?'}
                                        </div>
                                    )}
                                </div>

                                {/* Name + streak bar */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                        {username ? (
                                            <Link href={`/hub/user/${username}`} style={{ fontSize: 14, fontWeight: 600, color: isMe ? '#818cf8' : C.text, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {name}
                                            </Link>
                                        ) : (
                                            <span style={{ fontSize: 14, fontWeight: 600, color: isMe ? '#818cf8' : C.text }}>{name}</span>
                                        )}
                                        <span style={{
                                            fontSize: 10, fontWeight: 700, color: tier.color,
                                            background: `${tier.color}18`, border: `1px solid ${tier.color}40`,
                                            borderRadius: 6, padding: '1px 5px', flexShrink: 0,
                                        }}>{tier.label}</span>
                                    </div>
                                    <StreakBar days={entry.streak_days} />
                                </div>

                                {/* Streak + diamonds + multiplier */}
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: tier.color }}>{entry.streak_days}d</div>
                                    {entry.totalDiamonds > 0 && (
                                        <div style={{ fontSize: 11, color: '#818cf8', fontWeight: 600 }}>💎{entry.totalDiamonds}</div>
                                    )}
                                    <div style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>⚡{tier.multiplier}</div>
                                </div>
                            </div>
                        );
                    })}

                    {/* Current user not in top 10 */}
                    {currentUserRank && (
                        <div style={{ margin: '8px 16px 0', padding: '10px 12px', borderRadius: 8, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ fontSize: 13, color: C.textSec }}>Your ranking</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 14, fontWeight: 700, color: '#818cf8' }}>#{currentUserRank.rank}</span>
                                <span style={{ fontSize: 13, color: C.textSec }}>· {currentUserRank.streak_days}-day streak</span>
                            </div>
                        </div>
                    )}

                    {/* CTA + Tier Legend */}
                    <div style={{ margin: '10px 16px 0' }}>
                        <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.5, textAlign: 'center', marginBottom: 10 }}>
                            Share daily to earn 💎 diamonds and boost your multiplier!
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                            {Object.entries(TIER_CONFIG).reverse().map(([key, t]) => key !== 'base' && (
                                <span key={key} style={{
                                    fontSize: 10, fontWeight: 600, color: t.color,
                                    background: `${t.color}14`, border: `1px solid ${t.color}35`,
                                    borderRadius: 6, padding: '2px 7px',
                                }}>
                                    {t.label} {t.min}d ⚡{t.multiplier}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
