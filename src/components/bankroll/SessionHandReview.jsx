/**
 * SESSION HAND REVIEW COMPONENT
 * Link analyzed hands from Training Hub to bankroll sessions
 */

import { useState, useEffect } from 'react';
import { Brain, Link2, ExternalLink, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function SessionHandReview({ sessionId, userId }) {
    const [linkedHands, setLinkedHands] = useState([]);
    const [availableHands, setAvailableHands] = useState([]);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isLinking, setIsLinking] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (userId && sessionId) {
            loadData();
        }
    }, [userId, sessionId]);

    const loadData = async () => {
        setIsLoading(true);

        // Fetch hands linked to this session
        const { data: linked } = await supabase
            .from('session_hands')
            .select('*, training_hand_history(*)')
            .eq('session_id', sessionId);

        setLinkedHands(linked || []);

        // Fetch available hands for linking (from Training Hub)
        const { data: hands } = await supabase
            .from('training_hand_history')
            .select('id, hand_id, created_at, position, action, result, notes')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50);

        setAvailableHands(hands || []);
        setIsLoading(false);
    };

    const linkHand = async (handId) => {
        setIsLinking(true);

        try {
            await supabase
                .from('session_hands')
                .insert({
                    session_id: sessionId,
                    hand_id: handId,
                });

            loadData();
        } catch (err) {
            console.error('Link error:', err);
        } finally {
            setIsLinking(false);
        }
    };

    const unlinkHand = async (linkId) => {
        await supabase
            .from('session_hands')
            .delete()
            .eq('id', linkId);

        loadData();
    };

    const filteredHands = availableHands.filter(h => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            h.hand_id?.toLowerCase().includes(query) ||
            h.position?.toLowerCase().includes(query) ||
            h.notes?.toLowerCase().includes(query)
        );
    });

    // Already linked hand IDs
    const linkedHandIds = new Set(linkedHands.map(l => l.hand_id));

    return (
        <div style={styles.container}>
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                style={styles.header}
            >
                <div style={styles.titleRow}>
                    <Brain size={16} style={{ color: '#a855f7' }} />
                    <span style={styles.title}>Hand Review</span>
                    <span style={styles.count}>({linkedHands.length})</span>
                </div>
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {isExpanded && (
                <div style={styles.content}>
                    {/* Linked Hands */}
                    {linkedHands.length > 0 && (
                        <div style={styles.linkedSection}>
                            <h4 style={styles.sectionTitle}>Linked Hands</h4>
                            {linkedHands.map(link => (
                                <div key={link.id} style={styles.handCard}>
                                    <div style={styles.handInfo}>
                                        <span style={styles.handId}>
                                            {link.training_hand_history?.hand_id || 'Hand'}
                                        </span>
                                        <span style={styles.handMeta}>
                                            {link.training_hand_history?.position} • {link.training_hand_history?.action}
                                        </span>
                                    </div>
                                    <div style={styles.handActions}>
                                        <button
                                            onClick={() => window.open(`/hub/training/hand/${link.hand_id}`, '_blank')}
                                            style={styles.viewBtn}
                                        >
                                            <ExternalLink size={12} />
                                        </button>
                                        <button onClick={() => unlinkHand(link.id)} style={styles.unlinkBtn}>
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Link New Hand */}
                    <div style={styles.linkSection}>
                        <h4 style={styles.sectionTitle}>Link Hand from Training</h4>

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

                        <div style={styles.handList}>
                            {filteredHands.slice(0, 10).map(hand => (
                                <div
                                    key={hand.id}
                                    style={{
                                        ...styles.availableHand,
                                        opacity: linkedHandIds.has(hand.id) ? 0.4 : 1,
                                    }}
                                >
                                    <div style={styles.handInfo}>
                                        <span style={styles.handId}>{hand.hand_id || `Hand ${hand.id.slice(0, 8)}`}</span>
                                        <span style={styles.handMeta}>
                                            {hand.position} • {hand.action} • {new Date(hand.created_at).toLocaleDateString()}
                                        </span>
                                        {hand.notes && (
                                            <span style={styles.handNotes}>{hand.notes.slice(0, 60)}...</span>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => linkHand(hand.id)}
                                        disabled={linkedHandIds.has(hand.id) || isLinking}
                                        style={{
                                            ...styles.linkBtn,
                                            opacity: linkedHandIds.has(hand.id) ? 0.4 : 1,
                                        }}
                                    >
                                        <Link2 size={12} />
                                        {linkedHandIds.has(hand.id) ? 'Linked' : 'Link'}
                                    </button>
                                </div>
                            ))}

                            {filteredHands.length === 0 && (
                                <div style={styles.noHands}>
                                    No hands found. Analyze hands in Training Hub first.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const styles = {
    container: {
        background: 'rgba(168, 85, 247, 0.05)',
        border: '1px solid rgba(168, 85, 247, 0.2)',
        borderRadius: 10,
        overflow: 'hidden',
    },
    header: {
        width: '100%',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
        background: 'transparent',
        border: 'none',
        color: '#fff',
        cursor: 'pointer',
    },
    titleRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    title: {
        fontSize: 13,
        fontWeight: 600,
    },
    count: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 11,
    },
    content: {
        padding: '0 12px 12px',
    },
    linkedSection: {
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 10,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.5)',
        textTransform: 'uppercase',
        marginBottom: 8,
    },
    handCard: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 10,
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 8,
        marginBottom: 6,
    },
    handInfo: {
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
    },
    handId: {
        fontSize: 12,
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
    },
    handActions: {
        display: 'flex',
        gap: 6,
    },
    viewBtn: {
        padding: 6,
        background: 'rgba(168, 85, 247, 0.1)',
        border: '1px solid rgba(168, 85, 247, 0.3)',
        borderRadius: 4,
        color: '#a855f7',
        cursor: 'pointer',
    },
    unlinkBtn: {
        padding: '6px 8px',
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        borderRadius: 4,
        color: '#ef4444',
        fontSize: 10,
        cursor: 'pointer',
    },
    linkSection: {
        paddingTop: 12,
        borderTop: '1px solid rgba(255,255,255,0.06)',
    },
    searchBox: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: 8,
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 6,
        marginBottom: 10,
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
        gap: 6,
        maxHeight: 200,
        overflowY: 'auto',
    },
    availableHand: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 10,
        background: 'rgba(255,255,255,0.02)',
        borderRadius: 8,
    },
    linkBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 10px',
        background: 'rgba(168, 85, 247, 0.1)',
        border: '1px solid rgba(168, 85, 247, 0.3)',
        borderRadius: 6,
        color: '#a855f7',
        fontSize: 10,
        cursor: 'pointer',
    },
    noHands: {
        textAlign: 'center',
        padding: 20,
        color: 'rgba(255,255,255,0.4)',
        fontSize: 11,
    },
};
