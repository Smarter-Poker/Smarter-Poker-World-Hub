/* ═══════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Play Money Home Games
   Migrated from club-arena.vercel.app into main Smarter.Poker repo
   Theme: Sci-fi, Neon, Cyan — deep ocean tech aesthetic
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../../src/lib/supabase';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import { useClubArenaStore } from '../../src/stores/clubArenaStore';

// ═══════════════════════════════════════════════════════════════════════════
// DISCLAIMER CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const SOFTWARE_NEUTRALITY_DISCLAIMER = `SMARTER.POKER IS A SOCIAL TRAINING PLATFORM. WE ARE A NEUTRAL SOFTWARE PROVIDER ONLY. WE DO NOT OFFER, OPERATE, OR ENDORSE REAL-MONEY GAMING.

ANY EXTERNAL SETTLEMENT IS PROHIBITED AND DONE AT YOUR OWN RISK.

BY PROCEEDING, YOU INDEMNIFY SMARTER.POKER FROM ALL LIABILITY.`;

// ═══════════════════════════════════════════════════════════════════════════
// DISCLAIMER POPUP
// ═══════════════════════════════════════════════════════════════════════════

function DisclaimerPopup({ onAccept }) {
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [scrolledToBottom, setScrolledToBottom] = useState(false);

    const handleScroll = (e) => {
        const t = e.target;
        if (t.scrollHeight - t.scrollTop <= t.clientHeight + 10) {
            setScrolledToBottom(true);
        }
    };

    const canProceed = termsAccepted && scrolledToBottom;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0, 0, 0, 0.95)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 9999,
            backdropFilter: 'blur(10px)',
        }}>
            <div style={{
                width: '90%', maxWidth: '600px', maxHeight: '90vh',
                background: 'linear-gradient(180deg, #0a1628 0%, #050f1e 100%)',
                borderRadius: '24px', border: '2px solid rgba(255, 77, 77, 0.5)',
                boxShadow: '0 0 60px rgba(255, 77, 77, 0.3)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>
                {/* Header */}
                <div style={{ padding: '24px', borderBottom: '1px solid rgba(255, 77, 77, 0.3)', textAlign: 'center' }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>&#9888;&#65039;</div>
                    <h2 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '24px', fontWeight: 700, color: '#ff4d4d', margin: 0 }}>
                        Software Neutrality Disclaimer
                    </h2>
                    <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', marginTop: '8px' }}>
                        Club Arena — Play Money Home Games
                    </p>
                </div>

                {/* Content */}
                <div onScroll={handleScroll} style={{ flex: 1, padding: '24px', overflowY: 'auto', maxHeight: '400px' }}>
                    <div style={{
                        padding: '20px', background: 'rgba(255, 77, 77, 0.1)',
                        border: '1px solid rgba(255, 77, 77, 0.3)', borderRadius: '12px', marginBottom: '20px',
                    }}>
                        <p style={{
                            fontFamily: 'Inter, sans-serif', fontSize: '14px', lineHeight: 1.8,
                            color: '#ffffff', fontWeight: 500, whiteSpace: 'pre-line', textAlign: 'center',
                        }}>
                            {SOFTWARE_NEUTRALITY_DISCLAIMER}
                        </p>
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <h3 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '14px', fontWeight: 600, color: '#00D4FF', marginBottom: '12px' }}>
                            Important Legal Notice
                        </h3>
                        <ul style={{ margin: 0, paddingLeft: '20px', listStyle: 'disc', fontSize: '13px', lineHeight: 2, color: 'rgba(255,255,255,0.7)' }}>
                            <li>Smarter.Poker provides <strong>educational software tools only</strong></li>
                            <li>Club Arena operates exclusively with <strong>play money chips</strong></li>
                            <li>We do not facilitate, endorse, or participate in any form of gambling</li>
                            <li>External arrangements between users are <strong>strictly prohibited</strong></li>
                            <li>Violation of these terms will result in immediate account termination</li>
                        </ul>
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <h3 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '14px', fontWeight: 600, color: '#00D4FF', marginBottom: '12px' }}>
                            User Responsibilities
                        </h3>
                        <ul style={{ margin: 0, paddingLeft: '20px', listStyle: 'disc', fontSize: '13px', lineHeight: 2, color: 'rgba(255,255,255,0.7)' }}>
                            <li>You agree to use Club Arena <strong>for entertainment only</strong></li>
                            <li>You will not use the platform to facilitate real-money transactions</li>
                            <li>You understand play money has <strong>no cash value</strong></li>
                            <li>You accept full responsibility for your use of the platform</li>
                        </ul>
                    </div>

                    <div style={{ textAlign: 'center', fontSize: '12px', color: 'rgba(255,255,255,0.5)', padding: '12px' }}>
                        {!scrolledToBottom
                            ? <span>&#8595; Scroll to continue reading &#8595;</span>
                            : <span style={{ color: '#00ff66' }}>&#10003; You have read the disclaimer</span>
                        }
                    </div>
                </div>

                {/* Accept */}
                <div style={{ padding: '24px', borderTop: '1px solid rgba(0, 212, 255, 0.2)', background: 'rgba(0,0,0,0.3)' }}>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '20px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)}
                            style={{ width: '20px', height: '20px', marginTop: '2px', accentColor: '#00D4FF' }} />
                        <span style={{ fontSize: '13px', lineHeight: 1.6, color: 'rgba(255,255,255,0.8)' }}>
                            I have read and agree to the <a href="/terms" target="_blank" style={{ color: '#00D4FF' }}>Terms of Service</a>,{' '}
                            <a href="/terms#privacy" target="_blank" style={{ color: '#00D4FF' }}>Privacy Policy</a>, and{' '}
                            <a href="/legal/official-rules" target="_blank" style={{ color: '#00D4FF' }}>Official Rules</a>.
                            I understand that Club Arena is a <strong>play money platform only</strong>.
                        </span>
                    </label>
                    <button
                        disabled={!canProceed} onClick={onAccept}
                        style={{
                            width: '100%', padding: '16px',
                            background: canProceed ? 'linear-gradient(135deg, #00D4FF, #0066FF)' : 'rgba(100,100,100,0.3)',
                            border: 'none', borderRadius: '12px',
                            fontFamily: 'Orbitron, sans-serif', fontSize: '14px', fontWeight: 700,
                            color: canProceed ? '#000' : 'rgba(255,255,255,0.4)',
                            cursor: canProceed ? 'pointer' : 'not-allowed',
                        }}
                    >
                        {canProceed ? 'I Accept — Enter Club Arena' : 'Read & Accept Terms to Continue'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// CREATE CLUB MODAL
// ═══════════════════════════════════════════════════════════════════════════

function CreateClubModal({ onClose, onCreated, user }) {
    const [clubName, setClubName] = useState('');
    const [description, setDescription] = useState('');
    const [maxMembers, setMaxMembers] = useState(50);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');

    const handleCreate = async () => {
        if (!clubName.trim()) { setError('Club name is required'); return; }
        if (!user) { setError('Please sign in first'); return; }
        setCreating(true);
        setError('');
        try {
            const { data, error: dbError } = await supabase
                .from('commander_home_groups')
                .insert({
                    name: clubName.trim(),
                    description: description.trim() || null,
                    max_members: maxMembers,
                    owner_id: user.id,
                    status: 'active',
                    club_code: Math.random().toString(36).substring(2, 8).toUpperCase(),
                })
                .select()
                .single();
            if (dbError) throw dbError;
            // Auto-add owner as member
            await supabase.from('commander_home_members').insert({
                group_id: data.id,
                user_id: user.id,
                role: 'owner',
                status: 'active',
            });
            onCreated(data);
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to create club');
        } finally {
            setCreating(false);
        }
    };

    return (
        <div style={modalOverlay}>
            <div style={{ ...modalBox, maxWidth: '480px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h2 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '20px', fontWeight: 700, color: '#00d4ff', margin: 0 }}>
                        Create a Club
                    </h2>
                    <button onClick={onClose} style={closeBtn}>&times;</button>
                </div>
                {error && <div style={{ padding: '10px', background: 'rgba(255,77,77,0.15)', border: '1px solid rgba(255,77,77,0.3)', borderRadius: '8px', color: '#ff4d4d', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}
                <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Club Name *</label>
                    <input value={clubName} onChange={(e) => setClubName(e.target.value)} placeholder="e.g. Shark Club"
                        style={inputStyle} maxLength={50} />
                </div>
                <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Description</label>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tell players about your club..."
                        style={{ ...inputStyle, height: '80px', resize: 'vertical' }} maxLength={200} />
                </div>
                <div style={{ marginBottom: '24px' }}>
                    <label style={labelStyle}>Max Members</label>
                    <select value={maxMembers} onChange={(e) => setMaxMembers(Number(e.target.value))} style={inputStyle}>
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                    </select>
                </div>
                <button onClick={handleCreate} disabled={creating} style={{ ...actionBtnPrimary, width: '100%', opacity: creating ? 0.6 : 1 }}>
                    {creating ? 'Creating...' : 'Create Club'}
                </button>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// JOIN CLUB MODAL
// ═══════════════════════════════════════════════════════════════════════════

function JoinClubModal({ onClose, onJoined, user }) {
    const [clubCode, setClubCode] = useState('');
    const [joining, setJoining] = useState(false);
    const [error, setError] = useState('');

    const handleJoin = async () => {
        if (!clubCode.trim()) { setError('Club code is required'); return; }
        if (!user) { setError('Please sign in first'); return; }
        setJoining(true);
        setError('');
        try {
            const { data: club, error: findErr } = await supabase
                .from('commander_home_groups')
                .select('*')
                .eq('club_code', clubCode.trim().toUpperCase())
                .eq('status', 'active')
                .single();
            if (findErr || !club) { setError('Club not found. Check the code and try again.'); setJoining(false); return; }
            // Check if already a member
            const { data: existing } = await supabase
                .from('commander_home_members')
                .select('id')
                .eq('group_id', club.id)
                .eq('user_id', user.id)
                .single();
            if (existing) { setError('You are already a member of this club.'); setJoining(false); return; }
            const { error: joinErr } = await supabase
                .from('commander_home_members')
                .insert({ group_id: club.id, user_id: user.id, role: 'member', status: 'active' });
            if (joinErr) throw joinErr;
            onJoined(club);
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to join club');
        } finally {
            setJoining(false);
        }
    };

    return (
        <div style={modalOverlay}>
            <div style={{ ...modalBox, maxWidth: '420px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h2 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '20px', fontWeight: 700, color: '#00d4ff', margin: 0 }}>
                        Join a Club
                    </h2>
                    <button onClick={onClose} style={closeBtn}>&times;</button>
                </div>
                {error && <div style={{ padding: '10px', background: 'rgba(255,77,77,0.15)', border: '1px solid rgba(255,77,77,0.3)', borderRadius: '8px', color: '#ff4d4d', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}
                <div style={{ marginBottom: '24px' }}>
                    <label style={labelStyle}>Club Code</label>
                    <input value={clubCode} onChange={(e) => setClubCode(e.target.value.toUpperCase())} placeholder="Enter 6-character code"
                        style={{ ...inputStyle, textAlign: 'center', letterSpacing: '4px', fontSize: '20px', fontFamily: 'Orbitron, sans-serif' }}
                        maxLength={8} />
                    <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>
                        Ask the club owner for their invite code
                    </p>
                </div>
                <button onClick={handleJoin} disabled={joining} style={{ ...actionBtnPrimary, width: '100%', opacity: joining ? 0.6 : 1 }}>
                    {joining ? 'Joining...' : 'Join Club'}
                </button>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// FIND PLAYER MODAL
// ═══════════════════════════════════════════════════════════════════════════

function FindPlayerModal({ onClose }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);

    const handleSearch = async () => {
        if (!query.trim()) return;
        setSearching(true);
        try {
            const { data } = await supabase
                .from('profiles')
                .select('id, username, full_name, avatar_url')
                .or(`username.ilike.%${query.trim()}%,full_name.ilike.%${query.trim()}%`)
                .limit(10);
            setResults(data || []);
        } catch (err) {
            console.error('Search error:', err);
        } finally {
            setSearching(false);
        }
    };

    return (
        <div style={modalOverlay}>
            <div style={{ ...modalBox, maxWidth: '480px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h2 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '20px', fontWeight: 700, color: '#00d4ff', margin: 0 }}>
                        Find a Player
                    </h2>
                    <button onClick={onClose} style={closeBtn}>&times;</button>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by username..."
                        style={{ ...inputStyle, flex: 1 }}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
                    <button onClick={handleSearch} disabled={searching} style={{ ...actionBtnPrimary, padding: '10px 20px' }}>
                        {searching ? '...' : 'Search'}
                    </button>
                </div>
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {results.length === 0 && !searching && (
                        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '14px', padding: '30px 0' }}>
                            Search for players by username
                        </p>
                    )}
                    {results.map((p) => (
                        <div key={p.id} style={{
                            display: 'flex', alignItems: 'center', gap: '12px', padding: '12px',
                            borderRadius: '10px', background: 'rgba(0,212,255,0.05)',
                            border: '1px solid rgba(0,212,255,0.15)', marginBottom: '8px',
                        }}>
                            <div style={{
                                width: 40, height: 40, borderRadius: '50%', background: p.avatar_url
                                    ? `url(${p.avatar_url}) center/cover`
                                    : 'linear-gradient(135deg, #0a2840, #0d4a6b)',
                                border: '2px solid rgba(0,212,255,0.3)', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '18px', color: 'rgba(255,255,255,0.5)',
                            }}>
                                {!p.avatar_url && '\u{1F464}'}
                            </div>
                            <div>
                                <div style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>
                                    {p.full_name || p.username}
                                </div>
                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>
                                    @{p.username || 'player'}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function ClubArena() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [clubs, setClubs] = useState([]);
    const [activeClub, setActiveClub] = useState(null);
    const [showCreateClub, setShowCreateClub] = useState(false);
    const [showJoinClub, setShowJoinClub] = useState(false);
    const [showFindPlayer, setShowFindPlayer] = useState(false);

    // Load user and check disclaimer
    useEffect(() => {
        loadUser();
    }, []);

    async function loadUser() {
        try {
            // Read user from localStorage (same pattern as UniversalHeader)
            let authUser = null;
            if (typeof window !== 'undefined') {
                try {
                    const explicitAuth = localStorage.getItem('smarter-poker-auth');
                    if (explicitAuth) {
                        const tokenData = JSON.parse(explicitAuth);
                        authUser = tokenData?.user || null;
                    }
                    if (!authUser) {
                        const sbKeys = Object.keys(localStorage).filter(
                            k => k.startsWith('sb-') && k.endsWith('-auth-token')
                        );
                        if (sbKeys.length > 0) {
                            const tokenData = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}');
                            authUser = tokenData?.user || null;
                        }
                    }
                } catch (e) {
                    console.warn('[ClubArena] Error reading localStorage:', e);
                }
            }

            if (authUser) {
                setUser(authUser);
                // Check if disclaimer accepted
                const accepted = localStorage.getItem(`smarter_poker_club_disclaimer_${authUser.id}`);
                if (accepted === 'true') setDisclaimerAccepted(true);
                // Load clubs
                await loadClubs(authUser.id);
            } else {
                // No user — still show page but with limited features
                setDisclaimerAccepted(false);
            }
        } catch (e) {
            console.error('[ClubArena] Load error:', e);
        } finally {
            setIsLoading(false);
        }
    }

    async function loadClubs(userId) {
        try {
            const { data: memberships } = await supabase
                .from('commander_home_members')
                .select('group_id, role, commander_home_groups(*)')
                .eq('user_id', userId)
                .eq('status', 'active');

            if (memberships && memberships.length > 0) {
                const userClubs = memberships.map(m => ({
                    ...m.commander_home_groups,
                    userRole: m.role,
                })).filter(c => c && c.status === 'active');
                setClubs(userClubs);
                if (userClubs.length > 0) setActiveClub(userClubs[0]);
            }
        } catch (err) {
            console.error('[ClubArena] Failed to load clubs:', err);
        }
    }

    const handleDisclaimerAccept = () => {
        if (user) {
            localStorage.setItem(`smarter_poker_club_disclaimer_${user.id}`, 'true');
            localStorage.setItem(`smarter_poker_club_disclaimer_timestamp_${user.id}`, new Date().toISOString());
        }
        setDisclaimerAccepted(true);
    };

    const handleClubCreated = (club) => {
        const newClub = { ...club, userRole: 'owner' };
        setClubs(prev => [...prev, newClub]);
        setActiveClub(newClub);
    };

    const handleClubJoined = (club) => {
        const joinedClub = { ...club, userRole: 'member' };
        setClubs(prev => [...prev, joinedClub]);
        setActiveClub(joinedClub);
    };

    // Loading state
    if (isLoading) {
        return (
            <div style={{ minHeight: '100vh', background: '#020812', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '16px', color: '#00D4FF' }}>
                    Loading Club Arena...
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FEATURE CARDS — bottom navigation grid
    // ═══════════════════════════════════════════════════════════════════════
    const featureCards = [
        { id: 'player-stats', label: 'PLAYER STATS', icon: '\u{1F4CA}', href: '/hub/club-arena/player-stats', gradient: 'linear-gradient(135deg, #0a2840 0%, #0d4a6b 100%)' },
        { id: 'leaderboards', label: 'LEADERBOARDS', icon: '\u{1F3C6}', href: '/hub/club-arena/leaderboard', gradient: 'linear-gradient(135deg, #2a1a00 0%, #5c3a00 100%)' },
        { id: 'cashier', label: 'CASHIER', icon: '\u{1F4B0}', href: '/hub/club-arena/cashier', gradient: 'linear-gradient(135deg, #0a2a0a 0%, #1a5c1a 100%)' },
        { id: 'marketplace', label: 'MARKETPLACE', icon: '\u{1F6D2}', href: '/hub/club-arena/marketplace', gradient: 'linear-gradient(135deg, #2a0a2a 0%, #5c1a5c 100%)' },
        { id: 'hand-histories', label: 'HAND HISTORIES', icon: '\u{1F0CF}', href: '/hub/club-arena/hand-histories', gradient: 'linear-gradient(135deg, #1a0a0a 0%, #4a1a1a 100%)' },
    ];

    return (
        <>
            <Head>
                <title>Club Arena | Smarter.Poker</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
                <style>{`
                    @keyframes ca-pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
                    @keyframes ca-glow { 0%, 100% { box-shadow: 0 0 20px rgba(0,212,255,0.2); } 50% { box-shadow: 0 0 40px rgba(0,212,255,0.4); } }
                    @keyframes ca-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
                    .ca-container { width: 100%; max-width: 500px; margin: 0 auto; }
                    @media (min-width: 501px) and (max-width: 700px) { .ca-container { zoom: 0.75; } }
                    @media (min-width: 701px) { .ca-container { zoom: 1; max-width: 600px; } }
                `}</style>
            </Head>

            <div style={S.pageWrapper}>
                {/* Background layers */}
                <div style={S.bgBase} />
                <div style={S.bgOverlay} />
                <div style={S.bgVignette} />

                <UniversalHeader pageDepth={1} />

                {/* Disclaimer gate */}
                {!disclaimerAccepted && <DisclaimerPopup onAccept={handleDisclaimerAccept} />}

                {/* Main content — only after disclaimer */}
                {disclaimerAccepted && (
                    <div className="ca-container" style={S.mainContent}>

                        {/* ═══════════════════════════════════════════════════════
                            PLAY MONEY BADGE
                        ═══════════════════════════════════════════════════════ */}
                        <div style={S.playMoneyBadge}>
                            PLAY MONEY ONLY — NO CASH VALUE
                        </div>

                        {/* ═══════════════════════════════════════════════════════
                            TOP ACTION BAR
                        ═══════════════════════════════════════════════════════ */}
                        <div style={S.topActions}>
                            <button onClick={() => user ? setShowCreateClub(true) : alert('Please sign in first')} style={S.topActionBtn}>
                                <span style={S.topActionIcon}>+</span>
                                <span style={S.topActionLabel}>CREATE A CLUB</span>
                            </button>
                            <button onClick={() => setShowFindPlayer(true)} style={S.topActionBtn}>
                                <span style={S.topActionIcon}>{'\u{1F50D}'}</span>
                                <span style={S.topActionLabel}>FIND A PLAYER</span>
                            </button>
                            <button onClick={() => user ? setShowJoinClub(true) : alert('Please sign in first')} style={S.topActionBtn}>
                                <span style={S.topActionIcon}>{'\u{1F517}'}</span>
                                <span style={S.topActionLabel}>JOIN A CLUB</span>
                            </button>
                        </div>

                        {/* ═══════════════════════════════════════════════════════
                            CLUB CARD — Central feature
                        ═══════════════════════════════════════════════════════ */}
                        {activeClub ? (
                            <div style={S.clubCard}>
                                <div style={S.clubCardInner}>
                                    {/* Club header */}
                                    <div style={S.clubHeader}>
                                        <div style={S.clubAvatar}>
                                            {'\u2660'}
                                        </div>
                                        <div>
                                            <h2 style={S.clubName}>{activeClub.name || 'My Club'}</h2>
                                            <div style={S.clubId}>CLUB ID: {activeClub.club_code || '------'}</div>
                                        </div>
                                    </div>

                                    {/* Club stats */}
                                    <div style={S.clubStats}>
                                        <div style={S.clubStat}>
                                            <div style={S.clubStatValue}>{activeClub.member_count || clubs.length || 1}</div>
                                            <div style={S.clubStatLabel}>Members</div>
                                        </div>
                                        <div style={S.clubStatDivider} />
                                        <div style={S.clubStat}>
                                            <div style={S.clubStatValue}>0</div>
                                            <div style={S.clubStatLabel}>Active Tables</div>
                                        </div>
                                        <div style={S.clubStatDivider} />
                                        <div style={S.clubStat}>
                                            <div style={S.clubStatValue}>{activeClub.userRole === 'owner' ? 'Owner' : 'Member'}</div>
                                            <div style={S.clubStatLabel}>Your Role</div>
                                        </div>
                                    </div>

                                    {/* Club switcher */}
                                    {clubs.length > 1 && (
                                        <div style={{ marginTop: '16px', textAlign: 'center' }}>
                                            <select
                                                value={activeClub.id}
                                                onChange={(e) => setActiveClub(clubs.find(c => c.id === e.target.value))}
                                                style={{
                                                    background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)',
                                                    borderRadius: '8px', padding: '8px 16px', color: '#00d4ff',
                                                    fontFamily: 'Inter, sans-serif', fontSize: '13px',
                                                }}
                                            >
                                                {clubs.map(c => (
                                                    <option key={c.id} value={c.id}>{c.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            /* Empty state — no clubs */
                            <div style={S.emptyCard}>
                                <div style={{ fontSize: '64px', marginBottom: '16px', animation: 'ca-float 3s ease-in-out infinite' }}>
                                    {'\u2660'}
                                </div>
                                <h3 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '20px', fontWeight: 600, color: '#fff', marginBottom: '8px' }}>
                                    No Active Clubs
                                </h3>
                                <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', marginBottom: '24px', lineHeight: 1.6 }}>
                                    Create or join a club to start playing home games with friends.
                                </p>
                                <button onClick={() => user ? setShowCreateClub(true) : alert('Please sign in first')} style={actionBtnPrimary}>
                                    + Create Club
                                </button>
                            </div>
                        )}

                        {/* ═══════════════════════════════════════════════════════
                            FEATURE CARDS — Bottom grid
                        ═══════════════════════════════════════════════════════ */}
                        <div style={S.featureGrid}>
                            {featureCards.map(card => (
                                <Link key={card.id} href={card.href} style={{ textDecoration: 'none' }}>
                                    <div style={{ ...S.featureCard, background: card.gradient }}>
                                        <div style={S.featureIcon}>{card.icon}</div>
                                        <div style={S.featureLabel}>{card.label}</div>
                                    </div>
                                </Link>
                            ))}
                        </div>

                        {/* Footer */}
                        <footer style={S.footer}>
                            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', margin: 0 }}>
                                Club Arena is for entertainment only. Play money has no cash value.{' '}
                                <Link href="/terms" style={{ color: '#00D4FF' }}>View Terms</Link>
                            </p>
                        </footer>
                    </div>
                )}

                {/* Modals */}
                {showCreateClub && <CreateClubModal user={user} onClose={() => setShowCreateClub(false)} onCreated={handleClubCreated} />}
                {showJoinClub && <JoinClubModal user={user} onClose={() => setShowJoinClub(false)} onJoined={handleClubJoined} />}
                {showFindPlayer && <FindPlayerModal onClose={() => setShowFindPlayer(false)} />}
            </div>
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED MODAL STYLES
// ═══════════════════════════════════════════════════════════════════════════

const modalOverlay = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.85)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 9998,
    backdropFilter: 'blur(5px)',
};

const modalBox = {
    width: '90%', background: 'linear-gradient(180deg, #0a1a2e 0%, #050f1e 100%)',
    borderRadius: '20px', border: '1px solid rgba(0,212,255,0.3)',
    boxShadow: '0 0 40px rgba(0,212,255,0.15)', padding: '28px',
};

const closeBtn = {
    background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
    fontSize: '28px', cursor: 'pointer', padding: '0 4px',
};

const labelStyle = {
    display: 'block', fontFamily: 'Orbitron, sans-serif', fontSize: '11px',
    fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: '6px',
    letterSpacing: '1px', textTransform: 'uppercase',
};

const inputStyle = {
    width: '100%', padding: '12px 16px', background: 'rgba(0,212,255,0.05)',
    border: '1px solid rgba(0,212,255,0.2)', borderRadius: '10px',
    color: '#fff', fontSize: '14px', fontFamily: 'Inter, sans-serif',
    outline: 'none', boxSizing: 'border-box',
};

const actionBtnPrimary = {
    padding: '14px 28px', background: 'linear-gradient(135deg, #00D4FF, #0066FF)',
    border: 'none', borderRadius: '12px', fontFamily: 'Orbitron, sans-serif',
    fontSize: '13px', fontWeight: 700, color: '#000', cursor: 'pointer',
};

// ═══════════════════════════════════════════════════════════════════════════
// PAGE STYLES
// ═══════════════════════════════════════════════════════════════════════════

const S = {
    pageWrapper: {
        position: 'relative', minHeight: '100vh', overflow: 'hidden',
        fontFamily: 'Inter, -apple-system, sans-serif',
    },
    bgBase: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'radial-gradient(ellipse at center, #0a1a2e 0%, #020812 70%, #010408 100%)',
        zIndex: -3,
    },
    bgOverlay: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'linear-gradient(180deg, rgba(0,212,255,0.03) 0%, transparent 30%, rgba(0,212,255,0.02) 100%)',
        zIndex: -2,
    },
    bgVignette: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.4) 100%)',
        zIndex: -1,
    },
    mainContent: {
        position: 'relative', padding: '16px 20px 40px', zIndex: 1,
    },

    // Play money badge
    playMoneyBadge: {
        textAlign: 'center', padding: '10px 20px', margin: '0 auto 20px',
        display: 'inline-block', width: '100%',
        background: 'rgba(0, 255, 102, 0.08)',
        border: '1px solid rgba(0, 255, 102, 0.25)',
        borderRadius: '20px', fontFamily: 'Orbitron, sans-serif',
        fontSize: '11px', fontWeight: 600, color: '#00ff66',
        letterSpacing: '2px', boxSizing: 'border-box',
    },

    // Top actions
    topActions: {
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '10px', marginBottom: '24px',
    },
    topActionBtn: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
        padding: '16px 8px', background: 'rgba(0, 212, 255, 0.06)',
        border: '1px solid rgba(0, 212, 255, 0.2)', borderRadius: '14px',
        cursor: 'pointer', transition: 'all 0.2s',
    },
    topActionIcon: {
        fontSize: '24px', color: '#00d4ff',
    },
    topActionLabel: {
        fontFamily: 'Orbitron, sans-serif', fontSize: '10px', fontWeight: 700,
        color: '#00d4ff', letterSpacing: '1px', textAlign: 'center',
    },

    // Club card
    clubCard: {
        marginBottom: '24px', borderRadius: '18px',
        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.08) 0%, rgba(0, 100, 200, 0.06) 100%)',
        border: '1px solid rgba(0, 212, 255, 0.25)',
        boxShadow: '0 0 30px rgba(0,212,255,0.1)',
        animation: 'ca-glow 4s ease-in-out infinite',
    },
    clubCardInner: {
        padding: '24px',
    },
    clubHeader: {
        display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px',
    },
    clubAvatar: {
        width: '60px', height: '60px', borderRadius: '14px',
        background: 'linear-gradient(135deg, #0066FF, #00d4ff)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '28px', color: '#fff', fontWeight: 700, flexShrink: 0,
        boxShadow: '0 4px 15px rgba(0,212,255,0.3)',
    },
    clubName: {
        fontFamily: 'Orbitron, sans-serif', fontSize: '22px', fontWeight: 700,
        color: '#ffffff', margin: 0, letterSpacing: '1px',
    },
    clubId: {
        fontFamily: 'Orbitron, sans-serif', fontSize: '11px', fontWeight: 500,
        color: 'rgba(0, 212, 255, 0.7)', marginTop: '4px', letterSpacing: '2px',
    },
    clubStats: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        padding: '16px', background: 'rgba(0, 0, 0, 0.2)',
        borderRadius: '12px', border: '1px solid rgba(0, 212, 255, 0.1)',
    },
    clubStat: {
        textAlign: 'center',
    },
    clubStatValue: {
        fontFamily: 'Orbitron, sans-serif', fontSize: '18px', fontWeight: 700,
        color: '#00d4ff',
    },
    clubStatLabel: {
        fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '4px',
    },
    clubStatDivider: {
        width: '1px', height: '30px', background: 'rgba(0, 212, 255, 0.2)',
    },

    // Empty state
    emptyCard: {
        textAlign: 'center', padding: '50px 30px', marginBottom: '24px',
        background: 'rgba(0, 212, 255, 0.04)',
        border: '1px solid rgba(0, 212, 255, 0.15)',
        borderRadius: '18px',
    },

    // Feature grid
    featureGrid: {
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '10px', marginBottom: '30px',
    },
    featureCard: {
        padding: '20px 12px', borderRadius: '14px',
        border: '1px solid rgba(0, 212, 255, 0.15)',
        textAlign: 'center', cursor: 'pointer',
        transition: 'all 0.2s', minHeight: '100px',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '10px',
    },
    featureIcon: {
        fontSize: '32px',
    },
    featureLabel: {
        fontFamily: 'Orbitron, sans-serif', fontSize: '9px', fontWeight: 700,
        color: '#ffffff', letterSpacing: '1px',
    },

    // Footer
    footer: {
        textAlign: 'center', padding: '20px 0',
        borderTop: '1px solid rgba(0, 212, 255, 0.1)',
    },
};
