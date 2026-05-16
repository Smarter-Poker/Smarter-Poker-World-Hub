/**
 * SESSION HAND REVIEW
 * Futuristic Metal UI - Link analyzed hands to bankroll sessions
 */

import { useState, useEffect } from 'react';
import { Link2, ExternalLink, Search, Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { METAL, GRADIENTS, ANIMATIONS } from './metalStyles';

export default function SessionHandReview({ userId }) {
    const [recentHands, setRecentHands] = useState([]);
    const [recentSessions, setRecentSessions] = useState([]);
    const [linkingHand, setLinkingHand] = useState(null);
    const [selectedSession, setSelectedSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (userId) loadData();
    }, [userId]);

    const loadData = async () => {
        setLoading(true);

        // Fetch recent analyzed hands from Training Hub
        const { data: hands } = await supabase
            .from('training_hand_history')
            .select('id, hand_id, created_at, position, action, result, notes, session_id')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20);

        // Fetch recent bankroll sessions
        const { data: sessions } = await supabase
            .from('bankroll_ledger')
            .select('id, result, date, game_type, venue, stakes')
            .eq('user_id', userId)
            .order('date', { ascending: false })
            .limit(10);

        setRecentHands(hands || []);
        setRecentSessions(sessions || []);
        setLoading(false);
    };

    const handleLinkHand = async () => {
        if (!linkingHand || !selectedSession) return;
        setSaving(true);

        const { error: err_training_hand_history_vwcfa } = await supabase

          .from('training_hand_history')

          .update({ session_id: selectedSession })
            .eq('id', linkingHand);

        if (err_training_hand_history_vwcfa) console.warn('[Supabase] Silent mutation failed in training_hand_history:', err_training_hand_history_vwcfa.message);

        // Update local state
        setRecentHands(prev => prev.map(h =>
            h.id === linkingHand ? { ...h, session_id: selectedSession } : h
        ));

        setLinkingHand(null);
        setSelectedSession(null);
        setSaving(false);
    };

    const filteredHands = recentHands.filter(h =>
        !searchQuery ||
        h.hand_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        h.position?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getPositionColor = (position) => {
        const pos = (position || '').toUpperCase();
        if (['BTN', 'CO'].includes(pos)) return METAL.success;
        if (['SB', 'BB'].includes(pos)) return METAL.danger;
        return METAL.cyan;
    };

    if (loading) {
        return (
            <div style={styles.loadingContainer}>
                <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: METAL.cyan }} />
                <span>LOADING HANDS...</span>
                <style>{ANIMATIONS}</style>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            {/* LED Strip */}
            <div style={styles.ledStrip} />

            {/* Header */}
            <div style={styles.header}>
                <div style={styles.headerTitle}>
                    <img src="/images/jarvis-avatar.png" alt="Jarvis" style={{ width: 20, height: 20, borderRadius: '50%' }} />
                    <span>AI HAND REVIEW</span>
                </div>
                <a
                    href="/hub/training"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.trainingLink}
                >
                    <ExternalLink size={12} />
                    TRAINING HUB
                </a>
            </div>

            {/* Search */}
            <div style={styles.searchSection}>
                <Search size={14} style={styles.searchIcon} />
                <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search Hands..."
                    style={styles.searchInput}
                />
            </div>

            {/* Hands List */}
            <div style={styles.handsList}>
                {filteredHands.length === 0 ? (
                    <div style={styles.emptyState}>
                        <div style={styles.emptyIconContainer}>
                            <img src="/images/jarvis-avatar.png" alt="Jarvis" style={{ width: 36, height: 36, borderRadius: '50%' }} />
                        </div>
                        <p style={styles.emptyTitle}>NO ANALYZED HANDS</p>
                        <p style={styles.emptyHintText}>Complete Hand Analysis In Training Hub To See Hands Here</p>
                    </div>
                ) : (
                    filteredHands.map(hand => (
                        <div key={hand.id} style={styles.handCard}>
                            <div style={styles.handHeader}>
                                <div style={styles.handId}>
                                    <span style={styles.handIdLabel}>HAND</span>
                                    <span style={styles.handIdValue}>{hand.hand_id || `#${hand.id.slice(0, 6)}`}</span>
                                </div>
                                <span style={{
                                    ...styles.positionBadge,
                                    color: getPositionColor(hand.position),
                                    borderColor: getPositionColor(hand.position),
                                }}>
                                    {hand.position || 'N/A'}
                                </span>
                            </div>

                            <div style={styles.handInfo}>
                                <span>{hand.action || 'No action logged'}</span>
                                <span style={styles.handDate}>
                                    {new Date(hand.created_at).toLocaleDateString()}
                                </span>
                            </div>

                            {hand.notes && (
                                <div style={styles.handNotes}>{hand.notes}</div>
                            )}

                            <div style={styles.handFooter}>
                                {hand.session_id ? (
                                    <span style={styles.linkedBadge}>
                                        <CheckCircle size={10} /> LINKED
                                    </span>
                                ) : (
                                    <button
                                        onClick={() => setLinkingHand(hand.id)}
                                        style={styles.linkBtn}
                                    >
                                        <Link2 size={12} /> LINK TO SESSION
                                    </button>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Link Modal */}
            {linkingHand && (
                <div style={styles.modalOverlay} onClick={() => setLinkingHand(null)}>
                    <div style={styles.modal} onClick={e => e.stopPropagation()}>
                        <div style={styles.modalLed} />
                        <h3 style={styles.modalTitle}>
                            <Link2 size={16} style={{ color: METAL.purple }} />
                            LINK TO SESSION
                        </h3>

                        <div style={styles.sessionList}>
                            {recentSessions.length === 0 ? (
                                <div style={styles.noSessions}>No Recent Sessions</div>
                            ) : (
                                recentSessions.map(session => (
                                    <div
                                        key={session.id}
                                        onClick={() => setSelectedSession(session.id)}
                                        style={{
                                            ...styles.sessionOption,
                                            ...(selectedSession === session.id ? styles.sessionOptionSelected : {}),
                                        }}
                                    >
                                        <div style={styles.sessionInfo}>
                                            <span style={styles.sessionVenue}>
                                                {session.venue || session.game_type || 'Session'}
                                            </span>
                                            <span style={styles.sessionMeta}>
                                                {session.stakes} • {new Date(session.date).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <span style={{
                                            ...styles.sessionResult,
                                            color: (session.result || 0) >= 0 ? METAL.success : METAL.danger
                                        }}>
                                            {(session.result || 0) >= 0 ? '+' : ''}${session.result}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>

                        <div style={styles.modalActions}>
                            <button onClick={() => setLinkingHand(null)} style={styles.cancelBtn}>
                                CANCEL
                            </button>
                            <button
                                onClick={handleLinkHand}
                                disabled={!selectedSession || saving}
                                style={{
                                    ...styles.confirmBtn,
                                    opacity: (!selectedSession || saving) ? 0.5 : 1
                                }}
                            >
                                {saving ? (
                                    <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> LINKING...</>
                                ) : (
                                    <><Link2 size={14} /> LINK</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{ANIMATIONS}</style>
        </div>
    );
}

const styles = {
    container: {
        position: 'relative',
        background: GRADIENTS.darkPanel,
        border: `2px solid ${METAL.mid}`,
        borderRadius: 12,
        overflow: 'hidden',
    },
    ledStrip: {
        position: 'absolute',
        top: 0,
        left: '10%',
        right: '10%',
        height: 2,
        background: METAL.purple,
        boxShadow: `0 0 10px ${METAL.purpleGlow}`,
    },
    loadingContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        padding: 48,
        background: GRADIENTS.darkPanel,
        border: `2px solid ${METAL.mid}`,
        borderRadius: 12,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: '0.15em',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 16px',
        borderBottom: `1px solid ${METAL.mid}`,
    },
    headerTitle: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: '0.15em',
        color: '#fff',
    },
    trainingLink: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        background: 'rgba(168,85,247,0.15)',
        border: `2px solid ${METAL.purple}`,
        borderRadius: 6,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: '0.1em',
        color: METAL.purple,
        textDecoration: 'none',
    },
    searchSection: {
        position: 'relative',
        padding: '12px 16px',
        borderBottom: `1px solid ${METAL.mid}`,
    },
    searchIcon: {
        position: 'absolute',
        left: 28,
        top: '50%',
        transform: 'translateY(-50%)',
        color: 'rgba(255,255,255,0.3)',
    },
    searchInput: {
        width: '100%',
        padding: '10px 12px 10px 36px',
        background: METAL.darkest,
        border: `2px solid ${METAL.mid}`,
        borderRadius: 8,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        color: '#fff',
        boxSizing: 'border-box',
    },
    handsList: {
        padding: 16,
        maxHeight: 400,
        overflowY: 'auto',
    },
    emptyState: {
        padding: 40,
        textAlign: 'center',
    },
    emptyIconContainer: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 56,
        height: 56,
        margin: '0 auto 16px',
        background: 'rgba(168,85,247,0.15)',
        border: `1px dashed ${METAL.purple}`,
        borderRadius: '50%',
        animation: 'float 3s ease-in-out infinite',
    },
    emptyTitle: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.5)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        margin: '0 0 6px',
    },
    emptyHintText: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        color: 'rgba(255,255,255,0.35)',
        margin: 0,
    },
    handCard: {
        padding: 14,
        background: 'rgba(0,0,0,0.2)',
        border: `2px solid ${METAL.mid}`,
        borderRadius: 10,
        marginBottom: 10,
    },
    handHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    handId: {
        display: 'flex',
        alignItems: 'baseline',
        gap: 6,
    },
    handIdLabel: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: '0.1em',
    },
    handIdValue: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        color: '#fff',
    },
    positionBadge: {
        padding: '4px 10px',
        border: '2px solid',
        borderRadius: 4,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: '0.1em',
    },
    handInfo: {
        display: 'flex',
        justifyContent: 'space-between',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        color: 'rgba(255,255,255,0.7)',
        marginBottom: 8,
    },
    handDate: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 14,
    },
    handNotes: {
        padding: '8px 10px',
        background: 'rgba(255,255,255,0.1)',
        borderRadius: 6,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
        fontStyle: 'italic',
        marginBottom: 10,
    },
    handFooter: {
        display: 'flex',
        justifyContent: 'flex-end',
    },
    linkedBadge: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 10px',
        background: 'rgba(34,197,94,0.15)',
        border: `2px solid ${METAL.success}`,
        borderRadius: 6,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        color: METAL.success,
        letterSpacing: '0.1em',
    },
    linkBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 14px',
        background: 'rgba(168,85,247,0.15)',
        border: `2px solid ${METAL.purple}`,
        borderRadius: 6,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        color: METAL.purple,
        letterSpacing: '0.1em',
        cursor: 'pointer',
    },
    modalOverlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.92)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
    },
    modal: {
        position: 'relative',
        width: '100%',
        maxWidth: 400,
        background: `linear-gradient(180deg, #1a2a3a 0%, ${METAL.base} 100%)`,
        border: `2px solid ${METAL.highlight}`,
        borderRadius: 16,
        padding: 24,
    },
    modalLed: {
        position: 'absolute',
        top: 0,
        left: '20%',
        right: '20%',
        height: 2,
        background: METAL.purple,
        boxShadow: `0 0 10px ${METAL.purpleGlow}`,
    },
    modalTitle: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: '0.15em',
        color: '#fff',
        marginBottom: 20,
    },
    sessionList: {
        maxHeight: 250,
        overflowY: 'auto',
        marginBottom: 20,
    },
    noSessions: {
        padding: 24,
        textAlign: 'center',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        color: 'rgba(255,255,255,0.4)',
    },
    sessionOption: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 14px',
        background: 'rgba(0,0,0,0.2)',
        border: `2px solid ${METAL.mid}`,
        borderRadius: 8,
        marginBottom: 8,
        cursor: 'pointer',
        transition: 'border-color 0.2s',
    },
    sessionOptionSelected: {
        borderColor: METAL.purple,
        background: 'rgba(168,85,247,0.1)',
    },
    sessionInfo: {
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
    },
    sessionVenue: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
    },
    sessionMeta: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        color: 'rgba(255,255,255,0.4)',
    },
    sessionResult: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 14,
        fontWeight: 700,
    },
    modalActions: {
        display: 'flex',
        gap: 12,
    },
    cancelBtn: {
        flex: 1,
        padding: 14,
        background: GRADIENTS.metalButton,
        border: `2px solid ${METAL.mid}`,
        borderRadius: 10,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.6)',
        letterSpacing: '0.1em',
        cursor: 'pointer',
    },
    confirmBtn: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: 14,
        background: GRADIENTS.purplePro,
        border: 'none',
        borderRadius: 10,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        color: '#fff',
        letterSpacing: '0.1em',
        cursor: 'pointer',
    },
};
