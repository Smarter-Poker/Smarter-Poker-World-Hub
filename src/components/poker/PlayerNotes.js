/**
 * PlayerNotes — Keep notes on opponents
 * ═══════════════════════════════════════════════════════════════════════════
 * Renders a note-taking UI overlaid on player profiles or the HUD.
 * Uses /api/poker/player-notes for CRUD operations.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAvatar } from '../../contexts/AvatarContext';
import useVIPGate from '../../hooks/useVIPGate';
import VIPGateModal from '../ui/VIPGateModal';

const T = {
    bg: '#0a0a0a',
    card: '#18191a',
    border: '#3E4042',
    text: '#E4E6EB',
    textSec: '#B0B3B8',
    star: '#FFD700',
    accent: '#4facfe',
    danger: '#E74C3C',
};

function getAccessToken() {
    if (typeof window === 'undefined') return null;
    try {
        return JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}')?.access_token || null;
    } catch { return null; }
}

const COLOR_TAGS = [
    { color: '#B0B3B8', label: 'Neutral' },
    { color: '#E74C3C', label: 'Aggressive' },
    { color: '#2ECC71', label: 'Passive/Calling Station' },
    { color: '#F39C12', label: 'Unpredictable' },
    { color: '#9B59B6', label: 'Shark/Pro' },
    { color: '#3498DB', label: 'Tight/Nit' },
];

export default function PlayerNotes({ targetPlayerId, targetPlayerName }) {
    const { user } = useAvatar();
    // Wrap access with VIP hook (Bankroll Pro feature)
    const { allowed, loading: gateLoading, featureConfig, showUpgradeModal, upgradeModalVisible, hideUpgradeModal } = useVIPGate('bankroll-manager');
    const [note, setNote] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    // Editable state
    const [content, setContent] = useState('');
    const [colorTag, setColorTag] = useState('#B0B3B8');
    const [isEditing, setIsEditing] = useState(false);
    
    const fetchNote = useCallback(async () => {
        if (!targetPlayerId || !user?.id) return;
        try {
            const token = getAccessToken();
            const res = await fetch(`/api/poker/player-notes?targetPlayerId=${targetPlayerId}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (res.ok) {
                const data = await res.json();
                if (data.note) {
                    setNote(data.note);
                    setContent(data.note.note_content || '');
                    setColorTag(data.note.color_tag || '#B0B3B8');
                } else {
                    setNote(null);
                    setContent('');
                    setColorTag('#B0B3B8');
                }
            }
        } catch (e) {
            console.warn('[PlayerNotes] Failed to fetch:', e);
        } finally {
            setLoading(false);
        }
    }, [targetPlayerId, user?.id]);

    useEffect(() => {
        // Only fetch if gate allowed
        if (allowed && user?.id) {
            fetchNote();
        } else if (!gateLoading) {
            setLoading(false);
        }
    }, [fetchNote, allowed, gateLoading, user?.id]);

    const handleSave = async () => {
        if (!content.trim() && !note) {
            setIsEditing(false);
            return;
        }

        setSaving(true);
        try {
            const token = getAccessToken();
            const res = await fetch('/api/poker/player-notes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    targetPlayerId,
                    targetPlayerName, // optional denormalization
                    noteContent: content.trim(),
                    colorTag
                })
            });
            
            if (res.ok) {
                const data = await res.json();
                setNote(data.note);
                setIsEditing(false);
            }
        } catch (e) {
            console.warn('[PlayerNotes] Failed to save:', e);
        } finally {
            setSaving(false);
        }
    };

    if (gateLoading || loading) return <div style={{ color: T.textSec, fontSize: 12 }}>Loading notes...</div>;

    // Gated Experience
    if (!allowed) {
        return (
            <div style={{
                background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: `1px solid ${T.border}`, padding: 16,
                display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center'
            }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}></div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 4 }}>Player Notes</div>
                <div style={{ fontSize: 13, color: T.textSec, marginBottom: 12 }}>
                    Keep private strategic notes on {targetPlayerName || 'this opponent'} to gain an edge.
                </div>
                <button
                    onClick={showUpgradeModal}
                    style={{
                        padding: '8px 16px', borderRadius: 8, background: 'rgba(255,215,0,0.1)',
                        border: `1px solid ${T.gold}44`, color: T.gold, fontSize: 13, fontWeight: 700, cursor: 'pointer'
                    }}
                >
                    Unlock with Bankroll Pro
                </button>
                <VIPGateModal 
                    visible={upgradeModalVisible} 
                    onClose={hideUpgradeModal} 
                    featureName="Player Notes (Bankroll Pro)"
                    featureConfig={featureConfig}
                />
            </div>
        );
    }

    const hasNote = !!note;
    const isEditingMode = isEditing || (!hasNote && isEditing);

    return (
        <div style={{
            background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: `1px solid ${T.border}`, padding: 16
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 16 }}></div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>
                        Notes on {targetPlayerName || 'Opponent'}
                    </div>
                </div>
                {!isEditingMode && (
                    <button
                        onClick={() => setIsEditing(true)}
                        style={{
                            background: 'none', border: 'none', color: T.accent, fontSize: 12, fontWeight: 700, cursor: 'pointer'
                        }}
                    >
                        {hasNote ? 'Edit' : '+ Add Note'}
                    </button>
                )}
            </div>

            {isEditingMode ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Color Tag Picker */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {COLOR_TAGS.map(tag => (
                            <div
                                key={tag.color}
                                onClick={() => setColorTag(tag.color)}
                                title={tag.label}
                                style={{
                                    width: 24, height: 24, borderRadius: '50%', background: tag.color, cursor: 'pointer',
                                    border: colorTag === tag.color ? '2px solid #fff' : '2px solid transparent',
                                    boxShadow: colorTag === tag.color ? `0 0 10px ${tag.color}88` : 'none',
                                    opacity: colorTag === tag.color ? 1 : 0.6,
                                    transition: 'all 0.2s'
                                }}
                            />
                        ))}
                    </div>
                    
                    <textarea
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        placeholder="e.g. Always 3-bets light from the SB..."
                        rows={4}
                        style={{
                            width: '100%', padding: 12, borderRadius: 8, background: 'rgba(0,0,0,0.3)',
                            border: `1px solid ${T.border}`, color: T.text, fontSize: 13, resize: 'vertical',
                            outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit'
                        }}
                    />
                    
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button
                            onClick={() => {
                                setIsEditing(false);
                                setContent(note?.note_content || '');
                                setColorTag(note?.color_tag || '#B0B3B8');
                            }}
                            style={{
                                padding: '8px 16px', borderRadius: 8, background: 'none', border: 'none',
                                color: T.textSec, fontSize: 13, cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            style={{
                                padding: '8px 16px', borderRadius: 8, background: 'rgba(79,172,254,0.1)', border: `1px solid ${T.accent}44`,
                                color: T.accent, fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer'
                            }}
                        >
                            {saving ? 'Saving...' : 'Save Note'}
                        </button>
                    </div>
                </div>
            ) : (
                hasNote ? (
                    <div style={{
                        borderLeft: `4px solid ${note.color_tag}`, paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 8
                    }}>
                        <div style={{ fontSize: 14, color: '#fff', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                            {note.note_content}
                        </div>
                        <div style={{ fontSize: 11, color: T.textSec }}>
                            Last updated {new Date(note.updated_at).toLocaleDateString()}
                        </div>
                    </div>
                ) : (
                    <div style={{ fontSize: 13, color: T.textSec, fontStyle: 'italic' }}>
                        No notes yet. Click "+ Add Note" to record reads on this player.
                    </div>
                )
            )}
        </div>
    );
}
