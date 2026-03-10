// /pages/hub/club-arena/xmtt.js
// XMTT Cross-Club Tournament Hub [Improvement #12]
// Shows all XMTT tournaments across the user's union with unified registration
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import dynamic from 'next/dynamic';

const UniversalHeader = dynamic(() => import('../../../src/components/ui/UniversalHeader'), { ssr: false });
const GameCard = dynamic(() => import('../../../src/components/club-arena/GameCard'), { ssr: false });
const ClubArenaBottomNav = dynamic(() => import('../../../src/components/club-arena/ClubArenaBottomNav'), { ssr: false });

const FB = {
    bg: '#18191A', card: '#242526', text: '#E4E6EB', dim: '#B0B3B8',
    border: '#3E4042', primary: '#1877F2', hover: '#3A3B3C', green: '#31A24C', danger: '#dc2626',
};

export default function XMTTHub() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [tournaments, setTournaments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('upcoming'); // upcoming | running | past

    useEffect(() => {
        (async () => {
            const { data: { user: u } } = await supabase.auth.getUser();
            if (!u) { router.push('/login'); return; }
            setUser(u);
            await loadData(u, 'upcoming');
        })();
    }, []);

    const loadData = async (u, selectedTab) => {
        setLoading(true);
        try {
            const statusFilter = selectedTab === 'running' ? 'running'
                : selectedTab === 'past' ? 'complete,cancelled'
                    : 'scheduled,registering';

            // Fetch XMTT tournaments across all clubs in the union
            const { data, error } = await supabase
                .from('club_tournaments')
                .select(`
          *,
          clubs:club_id ( name ),
          tournament_registrations!left ( user_id )
        `)
                .eq('type', 'xmtt')
                .in('status', statusFilter.split(','))
                .order('scheduled_start', { ascending: selectedTab !== 'past' })
                .limit(50);

            if (!error && data) {
                const enriched = data.map(t => ({
                    ...t,
                    club_name: t.clubs?.name || 'Unknown Club',
                    is_registered: (t.tournament_registrations || []).some(r => r.user_id === (u || user)?.id),
                }));
                setTournaments(enriched);
            }
        } catch (err) {
            console.error('[XMTT Hub] Load error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleTabChange = (newTab) => {
        setTab(newTab);
        loadData(user, newTab);
    };

    return (
        <div style={{ background: FB.bg, minHeight: '100vh', color: FB.text }}>
            <UniversalHeader pageDepth={2} />

            {/* Page Header */}
            <div style={{ background: FB.card, padding: '16px 24px', borderBottom: `1px solid ${FB.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={() => router.back()}
                    style={{ background: 'none', border: 'none', color: FB.dim, cursor: 'pointer', fontSize: 20 }}>←</button>
                <div>
                    <h1 style={{ margin: 0, fontSize: 20 }}>🌐 XMTT Hub</h1>
                    <span style={{ color: FB.dim, fontSize: 13 }}>Cross-Club Tournaments</span>
                </div>
            </div>

            {/* Feature Banner */}
            <div style={{
                margin: '12px 16px', padding: '14px 18px', borderRadius: 10,
                background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
                border: '1px solid rgba(24,119,242,0.3)',
            }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#42A5F5', marginBottom: 4 }}>🏆 Cross-Club Multi-Table Tournaments</div>
                <div style={{ fontSize: 11, color: FB.dim, lineHeight: 1.5 }}>
                    Compete against players from multiple clubs in massive guaranteed prize pools. One buy-in, one registration — play from any club in the union.
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${FB.border}`, background: FB.card }}>
                {['upcoming', 'running', 'past'].map(t => (
                    <button key={t} onClick={() => handleTabChange(t)} style={{
                        flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
                        background: tab === t ? FB.primary : 'transparent',
                        color: tab === t ? '#fff' : FB.dim,
                        fontWeight: tab === t ? 700 : 500, fontSize: 14,
                    }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
                ))}
            </div>

            {/* Tournament Grid */}
            <div style={{ padding: 16, maxWidth: 800, margin: '0 auto' }}>
                {loading && <div style={{ textAlign: 'center', padding: 40, color: FB.dim }}>Loading XMTT tournaments...</div>}

                {!loading && tournaments.length === 0 && (
                    <div style={{ color: FB.dim, textAlign: 'center', padding: 40 }}>
                        No {tab} XMTT tournaments
                    </div>
                )}

                {!loading && tournaments.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {tournaments.map(t => (
                            <GameCard
                                key={t.id}
                                game={{ ...t, game_type: 'xmtt', game_variant: t.variant || 'nlh' }}
                                onPress={() => router.push(`/hub/club-arena/tournaments?club=${t.club_id}`)}
                            />
                        ))}
                    </div>
                )}
            </div>

            <ClubArenaBottomNav activePage="xmtt" userRole="player" />
        </div>
    );
}
