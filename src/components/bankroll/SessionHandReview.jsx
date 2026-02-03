/**
 * SESSION HAND REVIEW COMPONENT (Pro Tools Version)
 * Display recent analyzed hands and allow linking to bankroll sessions
 */

import { useState, useEffect } from 'react';
import { Brain, Link2, ExternalLink, ChevronDown, ChevronUp, Search, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function SessionHandReview({ userId }) {
    const [recentHands, setRecentHands] = useState([]);
    const [recentSessions, setRecentSessions] = useState([]);
    const [selectedSession, setSelectedSession] = useState(null);
    const [isLinking, setIsLinking] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (userId) {
            loadData();
        }
    }, [userId]);

    const loadData = async () => {
        setIsLoading(true);

        // Fetch recent training hands
        const { data: hands } = await supabase
            .from('training_hand_history')
            .select('id, hand_id, created_at, position, action, result, notes')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20);

        setRecentHands(hands || []);

        // Fetch recent bankroll sessions for linking
        const { data: sessions } = await supabase
            .from('bankroll_ledger')
            .select('id, entry_date, venue_name, location, gross_in, gross_out')
            .eq('user_id', userId)
            .order('entry_date', { ascending: false })
            .limit(10);

        setRecentSessions(sessions || []);
        setIsLoading(false);
    };

    const linkHandToSession = async (handId, sessionId) => {
        setIsLinking(true);

        try {
            await supabase
                .from('session_hands')
                .insert({
                    session_id: sessionId,
                    hand_id: handId,
                });

            // Visual feedback
            alert('Hand linked to session!');
            setSelectedSession(null);
        } catch (err) {
            console.error('Link error:', err);
        } finally {
            setIsLinking(false);
        }
    };

    const filteredHands = recentHands.filter(h => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            h.hand_id?.toLowerCase().includes(query) ||
            h.position?.toLowerCase().includes(query) ||
            h.notes?.toLowerCase().includes(query)
        );
    });

    if (isLoading) {
        return (
            <div style={styles.loadingState}>
                <Brain size={24} style={{ color: 'rgba(255,255,255,0.2)' }} />
                <p>Loading hands...</p>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={styles.titleRow}>
                    <Brain size={18} style={{ color: '#a855f7' }} />
                    <h3 style={styles.title}>AI Hand Review</h3>
                </div>
                <span style={styles.count}>{recentHands.length} hands</span>
            </div>

            {/* Search */}
            <div style={styles.searchBox}>
                <Search size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
                <input
                    type="text"
                    placeholder="Search hands..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={styles.searchInput}
                />
            </div>

            {/* Recent Hands List */}
            <div style={styles.handList}>
                {filteredHands.length === 0 ? (
                    <div style={styles.emptyState}>
                        <Brain size={28} style={{ color: 'rgba(255,255,255,0.2)' }} />
                        <p>No analyzed hands yet</p>
                        <span style={styles.emptyHint}>
                            Analyze hands in the Training Hub to see them here
                        </span>
                    </div>
                ) : (
                    filteredHands.map(hand => (
                        <div key={hand.id} style={styles.handCard}>
                            <div style={styles.handInfo}>
                                <span style={styles.handId}>
                                    {hand.hand_id || `Hand ${hand.id.slice(0, 8)}`}
                                </span>
                                <span style={styles.handMeta}>
                                    {hand.position && `${hand.position} • `}
                                    {hand.action && `${hand.action} • `}
                                    {new Date(hand.created_at).toLocaleDateString()}
                                </span>
                                {hand.notes && (
                                    <span style={styles.handNotes}>
                                        {hand.notes.length > 60 ? hand.notes.slice(0, 60) + '...' : hand.notes}
                                    </span>
                                )}
                            </div>
                            <div style={styles.handActions}>
                                <button
                                    onClick={() => window.open(`/hub/training/hand/${hand.id}`, '_blank')}
                                    style={styles.viewBtn}
                                    title="View in Training Hub"
                                >
                                    <ExternalLink size={12} />
                                </button>
                                <button
                                    onClick={() => setSelectedSession(selectedSession === hand.id ? null : hand.id)}
                                    style={styles.linkBtn}
                                    title="Link to Session"
                                >
                                    <Link2 size={12} />
                                    Link
                                </button>
                            </div>

                            {/* Session Selector Dropdown */}
                            {selectedSession === hand.id && (
                                <div style={styles.sessionDropdown}>
                                    <div style={styles.dropdownHeader}>Link to Session:</div>
                                    {recentSessions.length === 0 ? (
                                        <div style={styles.dropdownEmpty}>
                                            No sessions found. Log a session first.
                                        </div>
                                    ) : (
                                        recentSessions.map(session => {
                                            const net = (session.gross_out || 0) - (session.gross_in || 0);
                                            return (
                                                <button
                                                    key={session.id}
                                                    onClick={() => linkHandToSession(hand.id, session.id)}
                                                    disabled={isLinking}
                                                    style={styles.sessionOption}
                                                >
                                                    <div style={styles.sessionInfo}>
                                                        <Calendar size={12} />
                                                        <span>{new Date(session.entry_date).toLocaleDateString()}</span>
                                                        <span style={styles.sessionVenue}>
                                                            {session.venue_name || session.location || 'Unknown'}
                                                        </span>
                                                    </div>
                                                    <span style={{
                                                        color: net >= 0 ? '#22c55e' : '#ef4444',
                                                        fontWeight: 600,
                                                        fontSize: 11
                                                    }}>
                                                        {net >= 0 ? '+' : ''}${net.toLocaleString()}
                                                    </span>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

const styles = {
    container: {
        background: 'rgba(168, 85, 247, 0.05)',
        border: '1px solid rgba(168, 85, 247, 0.2)',
        borderRadius: 12,
        padding: 16,
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    titleRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    title: {
        fontSize: 15,
        fontWeight: 600,
        color: '#fff',
        margin: 0,
    },
    count: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 11,
    },
    loadingState: {
        textAlign: 'center',
        padding: 32,
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
    },
    searchBox: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: 10,
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 8,
        marginBottom: 12,
    },
    searchInput: {
        flex: 1,
        background: 'transparent',
        border: 'none',
        color: '#fff',
        fontSize: 12,
        outline: 'none',
    },
    handList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxHeight: 400,
        overflowY: 'auto',
    },
    emptyState: {
        textAlign: 'center',
        padding: 32,
        color: 'rgba(255,255,255,0.4)',
    },
    emptyHint: {
        display: 'block',
        fontSize: 11,
        marginTop: 4,
        color: 'rgba(255,255,255,0.3)',
    },
    handCard: {
        padding: 12,
        background: 'rgba(255,255,255,0.02)',
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.05)',
    },
    handInfo: {
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        marginBottom: 10,
    },
    handId: {
        fontSize: 13,
        fontWeight: 600,
        color: '#fff',
    },
    handMeta: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.5)',
    },
    handNotes: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.4)',
        fontStyle: 'italic',
        marginTop: 2,
    },
    handActions: {
        display: 'flex',
        gap: 8,
    },
    viewBtn: {
        padding: '6px 10px',
        background: 'rgba(168, 85, 247, 0.1)',
        border: '1px solid rgba(168, 85, 247, 0.3)',
        borderRadius: 6,
        color: '#a855f7',
        fontSize: 10,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
    },
    linkBtn: {
        padding: '6px 10px',
        background: 'rgba(0,212,255,0.1)',
        border: '1px solid rgba(0,212,255,0.3)',
        borderRadius: 6,
        color: '#00D4FF',
        fontSize: 10,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
    },
    sessionDropdown: {
        marginTop: 10,
        padding: 10,
        background: 'rgba(0,0,0,0.3)',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.1)',
    },
    dropdownHeader: {
        fontSize: 10,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 8,
    },
    dropdownEmpty: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.4)',
        textAlign: 'center',
        padding: 12,
    },
    sessionOption: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        padding: 10,
        background: 'rgba(255,255,255,0.03)',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
        marginBottom: 4,
    },
    sessionInfo: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        color: 'rgba(255,255,255,0.7)',
    },
    sessionVenue: {
        color: 'rgba(255,255,255,0.5)',
        marginLeft: 4,
    },
};
