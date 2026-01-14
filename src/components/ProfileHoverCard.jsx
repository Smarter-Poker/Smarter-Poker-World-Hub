/**
 * PROFILE HOVER CARD — Quick user preview on hover
 * Shows user info, stats, and quick actions
 */

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', green: '#42B72A',
};

export function ProfileHoverCard({ userId, username, children, position = 'bottom' }) {
    const [show, setShow] = useState(false);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(false);
    const timeoutRef = useRef(null);
    const containerRef = useRef(null);

    const handleMouseEnter = () => {
        timeoutRef.current = setTimeout(() => {
            setShow(true);
            if (!profile && !loading) {
                loadProfile();
            }
        }, 400); // Delay before showing
    };

    const handleMouseLeave = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        setShow(false);
    };

    const loadProfile = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('profiles')
                .select('id, username, avatar_url, bio, city, country, xp_total, skill_tier, is_online')
                .limit(1);

            if (userId) {
                query = query.eq('id', userId);
            } else if (username) {
                query = query.eq('username', username);
            }

            const { data } = await query.single();
            if (data) {
                setProfile(data);
            }
        } catch (e) {
            console.error('Profile hover load error:', e);
        }
        setLoading(false);
    };

    const positions = {
        bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 8 },
        top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 8 },
        left: { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: 8 },
        right: { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: 8 },
    };

    return (
        <div
            ref={containerRef}
            style={{ position: 'relative', display: 'inline-block' }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {children}

            {show && (
                <div
                    style={{
                        position: 'absolute',
                        ...positions[position],
                        width: 320,
                        background: C.card,
                        borderRadius: 12,
                        boxShadow: '0 8px 30px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)',
                        border: `1px solid ${C.border}`,
                        zIndex: 1000,
                        overflow: 'hidden',
                    }}
                    onMouseEnter={() => setShow(true)}
                    onMouseLeave={() => setShow(false)}
                >
                    {loading ? (
                        <div style={{ padding: 24, textAlign: 'center', color: C.textSec }}>
                            Loading...
                        </div>
                    ) : profile ? (
                        <>
                            {/* Header with gradient background */}
                            <div style={{
                                height: 60,
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                position: 'relative',
                            }}>
                                {/* Online indicator */}
                                {profile.is_online && (
                                    <div style={{
                                        position: 'absolute',
                                        top: 8,
                                        right: 8,
                                        background: C.green,
                                        padding: '4px 8px',
                                        borderRadius: 12,
                                        fontSize: 10,
                                        fontWeight: 600,
                                        color: 'white',
                                    }}>
                                        🟢 Online
                                    </div>
                                )}
                            </div>

                            {/* Avatar overlapping header */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'center',
                                marginTop: -40,
                            }}>
                                <img
                                    src={profile.avatar_url || '/default-avatar.png'}
                                    alt={profile.username}
                                    style={{
                                        width: 80,
                                        height: 80,
                                        borderRadius: '50%',
                                        objectFit: 'cover',
                                        border: '4px solid white',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                    }}
                                />
                            </div>

                            {/* Profile info */}
                            <div style={{ padding: '12px 16px 16px', textAlign: 'center' }}>
                                <Link
                                    href={`/hub/user/${profile.username}`}
                                    style={{
                                        fontSize: 18,
                                        fontWeight: 700,
                                        color: C.text,
                                        textDecoration: 'none',
                                    }}
                                >
                                    {profile.username}
                                </Link>

                                {profile.city && (
                                    <div style={{ fontSize: 13, color: C.textSec, marginTop: 4 }}>
                                        📍 {profile.city}{profile.country ? `, ${profile.country}` : ''}
                                    </div>
                                )}

                                {profile.bio && (
                                    <div style={{
                                        fontSize: 13,
                                        color: C.textSec,
                                        marginTop: 8,
                                        lineHeight: 1.4,
                                        maxHeight: 40,
                                        overflow: 'hidden',
                                    }}>
                                        {profile.bio.slice(0, 80)}{profile.bio.length > 80 ? '...' : ''}
                                    </div>
                                )}

                                {/* Stats row */}
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'center',
                                    gap: 24,
                                    marginTop: 12,
                                    padding: '12px 0',
                                    borderTop: `1px solid ${C.border}`,
                                }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 18, fontWeight: 700, color: C.blue }}>
                                            {profile.xp_total?.toLocaleString() || 0}
                                        </div>
                                        <div style={{ fontSize: 11, color: C.textSec }}>XP</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 18, fontWeight: 700, color: '#FFD700' }}>
                                            {profile.skill_tier || 'Newcomer'}
                                        </div>
                                        <div style={{ fontSize: 11, color: C.textSec }}>Tier</div>
                                    </div>
                                </div>

                                {/* Action buttons */}
                                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                    <Link
                                        href={`/hub/user/${profile.username}`}
                                        style={{
                                            flex: 1,
                                            padding: '10px 16px',
                                            background: C.blue,
                                            color: 'white',
                                            borderRadius: 8,
                                            fontSize: 14,
                                            fontWeight: 600,
                                            textDecoration: 'none',
                                            textAlign: 'center',
                                        }}
                                    >
                                        View Profile
                                    </Link>
                                    <Link
                                        href={`/hub/messenger?user=${profile.id}`}
                                        style={{
                                            flex: 1,
                                            padding: '10px 16px',
                                            background: C.bg,
                                            color: C.text,
                                            borderRadius: 8,
                                            fontSize: 14,
                                            fontWeight: 600,
                                            textDecoration: 'none',
                                            textAlign: 'center',
                                        }}
                                    >
                                        💬 Message
                                    </Link>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div style={{ padding: 24, textAlign: 'center', color: C.textSec }}>
                            User not found
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
