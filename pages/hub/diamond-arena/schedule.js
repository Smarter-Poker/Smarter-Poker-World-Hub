/**
 * Diamond Arena - Tournament Schedule
 * Displays upcoming tournaments with filtering and registration
 */

import { useState, useEffect } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { usePersistedFilters } from '../../../src/hooks/usePersistedFilters';

export default function DiamondArenaSchedule() {
    const router = useRouter();
    const [tournaments, setTournaments] = useState([]);
    const { filters, setFilter: setFilterState } = usePersistedFilters('diamond-arena-schedule', {
        filter: 'all',
        gameType: 'all'
    });
    const filter = filters.filter;
    const gameType = filters.gameType;
    const setFilter = (val) => setFilterState('filter', val);
    const setGameType = (val) => setFilterState('gameType', val);

    /* ═══════════════════════════════════════════════════════════════════════
     *  2026-08-27: THIS PAGE NO LONGER INVENTS TOURNAMENTS
     * ═══════════════════════════════════════════════════════════════════════
     * It used to `setTournaments([...])` with two hardcoded events behind a
     * `// TODO: Fetch tournaments from API` — a "Daily Diamond Freeroll" and a
     * "Sunday Million" with a 50,000 prize pool, a 100-Diamond buy-in and
     * "234/500 registered". Beside each sat a Register button with no onClick
     * of any kind. So a player could read a real-looking buy-in in a currency
     * they actually own, press Register, and have nothing happen at all.
     *
     * There is no schedule to fetch. `diamond_arena_events` — the table the old
     * realtime subscription watched — is a PER-USER RESULTS LOG (score,
     * correct_count, won, prize_awarded, diamonds_delta), not a list of
     * scheduled events, and it currently holds zero rows. No table on the
     * platform holds a Diamond Arena schedule. The subscription was therefore
     * watching something that could never carry the data it was refreshing for.
     *
     * Until a schedule backend exists, the honest thing is the empty state this
     * page already renders. An invented tournament with a real price on it is
     * worse than no tournament: it is a quote for something nobody can sell.
     *
     * TO FINISH THIS: create the schedule table (name, game_type, buy_in_
     * diamonds, prize_pool, starts_at, max_players), fetch it here, and give
     * the Register button a handler that debits diamonds through the same
     * server-priced path the store uses. Do not re-add client-side constants.
     */
    useEffect(() => {
        setTournaments([]);
    }, []);

    const filteredTournaments = tournaments.filter(t => {
        if (gameType !== 'all' && t.gameType !== gameType) return false;

        const startTime = new Date(t.startTime);
        const now = new Date();

        if (filter === 'today') {
            return startTime.toDateString() === now.toDateString();
        } else if (filter === 'week') {
            const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            return startTime <= weekFromNow;
        } else if (filter === 'month') {
            const monthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            return startTime <= monthFromNow;
        }

        return true;
    });

    return (
        <>
            <SEOHead
                title="Diamond Arena Schedule"
                description="Smarter.Poker - The Future Of The Game."
                canonical="/hub/diamond-arena/schedule"
            />

            <PageTransition>
                <div style={{ minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', background: '#0a0e1a' }}>
                    <UniversalHeader pageDepth={2} />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '1200px', margin: '0 auto' }}>
                        {/* Header */}
                        <div style={{ marginBottom: '40px' }}>

                            <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>
                                Tournament Schedule
                            </h1>
                            <p style={{ color: '#9ca3af' }}>
                                Browse And Register For Upcoming Tournaments
                            </p>
                        </div>

                        {/* Filters */}
                        <div style={{ display: 'flex', gap: '12px', marginBottom: '30px', flexWrap: 'wrap' }}>
                            {['all', 'today', 'week', 'month'].map(f => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    style={{
                                        background: filter === f ? '#3b82f6' : 'rgba(255,255,255,0.05)',
                                        border: `1px solid ${filter === f ? '#3b82f6' : 'rgba(255,255,255,0.1)'}`,
                                        color: filter === f ? '#fff' : '#9ca3af',
                                        padding: '10px 20px',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        textTransform: 'capitalize'
                                    }}
                                >
                                    {f}
                                </button>
                            ))}

                            <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />

                            {['all', 'nlh', 'plo', 'mixed'].map(g => (
                                <button
                                    key={g}
                                    onClick={() => setGameType(g)}
                                    style={{
                                        background: gameType === g ? '#10b981' : 'rgba(255,255,255,0.05)',
                                        border: `1px solid ${gameType === g ? '#10b981' : 'rgba(255,255,255,0.1)'}`,
                                        color: gameType === g ? '#fff' : '#9ca3af',
                                        padding: '10px 20px',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        textTransform: 'uppercase'
                                    }}
                                >
                                    {g}
                                </button>
                            ))}
                        </div>

                        {/* Tournament List */}
                        <div style={{ display: 'grid', gap: '16px' }}>
                            {filteredTournaments.map(t => (
                                <div
                                    key={t.id}
                                    style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '12px',
                                        padding: '20px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}
                                >
                                    <div>
                                        <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>
                                            {t.name}
                                        </h3>
                                        <div style={{ display: 'flex', gap: '20px', color: '#9ca3af', fontSize: '14px' }}>
                                            <span>Diamonds {t.buyIn === 0 ? 'Freeroll' : `${t.buyIn} Diamonds`}</span>
                                            <span>Trophy {t.prize.toLocaleString()} Prize Pool</span>
                                            <span> {t.registered}/{t.maxPlayers}</span>
                                            <span>🕐 {new Date(t.startTime).toLocaleString()}</span>
                                        </div>
                                    </div>

                                    {/* A Register button with no handler reads as a working
                                        purchase flow. Until registration exists server-side it
                                        is disabled and says so, rather than accepting a click
                                        and doing nothing. */}
                                    <button
                                        type="button"
                                        disabled
                                        title="Registration Is Not Open Yet"
                                        style={{
                                            background: 'rgba(255,255,255,0.06)',
                                            border: '1px solid rgba(255,255,255,0.12)',
                                            color: '#9ca3af',
                                            padding: '12px 24px',
                                            borderRadius: '8px',
                                            cursor: 'not-allowed',
                                            fontWeight: 'bold'
                                        }}
                                    >
                                        Registration Not Open
                                    </button>
                                </div>
                            ))}
                        </div>

                        {filteredTournaments.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
                                <p style={{ fontSize: '18px' }}>No Tournaments Found</p>
                                <p style={{ fontSize: '14px', marginTop: '8px' }}>Try Adjusting Your Filters</p>
                            </div>
                        )}
                    </div>
                </div>
    </PageTransition>
        </>
    );
}
