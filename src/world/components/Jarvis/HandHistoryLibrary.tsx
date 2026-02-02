/* ═══════════════════════════════════════════════════════════════════════════
   HAND HISTORY LIBRARY — Save and review important hands
   Organize hands by tags, search, and analyze patterns over time
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

interface SavedHand {
    id: string;
    title: string;
    hand: string;          // Hero's hole cards
    villainHand?: string;
    board: string;
    action: string;        // Description of action taken
    result: 'won' | 'lost' | 'unknown';
    potSize?: number;
    position: string;
    tags: string[];
    notes: string;
    createdAt: Date;
}

interface HandHistoryLibraryProps {
    onAskJarvis: (question: string) => void;
    onClose?: () => void;
}

const TAG_OPTIONS = [
    'Bluff', 'Value Bet', 'Tough Spot', 'Bad Beat', 'Good Fold',
    'Hero Call', 'Mistake', 'Study Later', 'Tournament', 'Cash Game'
];

export function HandHistoryLibrary({ onAskJarvis, onClose }: HandHistoryLibraryProps) {
    const [hands, setHands] = useState<SavedHand[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [selectedHand, setSelectedHand] = useState<SavedHand | null>(null);
    const [filterTag, setFilterTag] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [userId, setUserId] = useState<string | null>(null);

    // New hand form state
    const [form, setForm] = useState({
        title: '',
        hand: '',
        villainHand: '',
        board: '',
        action: '',
        result: 'unknown' as 'won' | 'lost' | 'unknown',
        potSize: '',
        position: 'BTN',
        tags: [] as string[],
        notes: ''
    });

    // Load hands on mount
    useEffect(() => {
        async function loadHands() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    setLoading(false);
                    // Load from localStorage
                    const saved = localStorage.getItem('jarvis_hand_history');
                    if (saved) {
                        try {
                            setHands(JSON.parse(saved).map((h: any) => ({
                                ...h,
                                createdAt: new Date(h.createdAt)
                            })));
                        } catch (e) { }
                    }
                    return;
                }

                setUserId(user.id);

                const { data, error } = await supabase
                    .from('hand_history')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })
                    .limit(100);

                if (error) {
                    console.error('Error loading hand history:', error);
                } else if (data) {
                    setHands(data.map(row => ({
                        id: row.id,
                        title: row.title,
                        hand: row.hand,
                        villainHand: row.villain_hand,
                        board: row.board,
                        action: row.action,
                        result: row.result,
                        potSize: row.pot_size,
                        position: row.position,
                        tags: row.tags || [],
                        notes: row.notes || '',
                        createdAt: new Date(row.created_at)
                    })));
                }
            } catch (err) {
                console.error('Failed to load hands:', err);
            } finally {
                setLoading(false);
            }
        }

        loadHands();
    }, []);

    const saveHand = async (hand: SavedHand) => {
        if (!userId) {
            localStorage.setItem('jarvis_hand_history', JSON.stringify(hands));
            return;
        }

        try {
            await supabase.from('hand_history').upsert({
                id: hand.id,
                user_id: userId,
                title: hand.title,
                hand: hand.hand,
                villain_hand: hand.villainHand,
                board: hand.board,
                action: hand.action,
                result: hand.result,
                pot_size: hand.potSize,
                position: hand.position,
                tags: hand.tags,
                notes: hand.notes,
                updated_at: new Date().toISOString()
            }, { onConflict: 'id' });
        } catch (err) {
            console.error('Failed to save hand:', err);
        }
    };

    const addHand = async () => {
        const newHand: SavedHand = {
            id: Date.now().toString(),
            title: form.title || `${form.hand} on ${form.board.slice(0, 6)}...`,
            hand: form.hand.toUpperCase(),
            villainHand: form.villainHand?.toUpperCase(),
            board: form.board.toUpperCase(),
            action: form.action,
            result: form.result,
            potSize: form.potSize ? parseInt(form.potSize) : undefined,
            position: form.position,
            tags: form.tags,
            notes: form.notes,
            createdAt: new Date()
        };

        setHands([newHand, ...hands]);
        await saveHand(newHand);

        // Reset form
        setForm({
            title: '', hand: '', villainHand: '', board: '', action: '',
            result: 'unknown', potSize: '', position: 'BTN', tags: [], notes: ''
        });
        setShowForm(false);
    };

    const deleteHand = async (id: string) => {
        setHands(hands.filter(h => h.id !== id));
        if (userId) {
            await supabase.from('hand_history').delete().eq('id', id);
        } else {
            localStorage.setItem('jarvis_hand_history', JSON.stringify(hands.filter(h => h.id !== id)));
        }
        setSelectedHand(null);
    };

    const analyzeHand = (hand: SavedHand) => {
        const question = `Analyze this hand for me:

**My Cards:** ${hand.hand}
**Board:** ${hand.board}
**Position:** ${hand.position}
${hand.villainHand ? `**Villain:** ${hand.villainHand}` : ''}
**Action:** ${hand.action}
**Result:** ${hand.result}
${hand.notes ? `**Notes:** ${hand.notes}` : ''}

What did I do right? What could I improve?`;

        onAskJarvis(question);
    };

    // Filter hands
    const filteredHands = hands.filter(h => {
        if (filterTag && !h.tags.includes(filterTag)) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return h.title.toLowerCase().includes(q) ||
                h.hand.toLowerCase().includes(q) ||
                h.board.toLowerCase().includes(q) ||
                h.notes.toLowerCase().includes(q);
        }
        return true;
    });

    return (
        <div style={{
            background: 'rgba(20, 10, 40, 0.98)',
            border: '1px solid rgba(255, 215, 0, 0.3)',
            borderRadius: '12px',
            padding: '16px',
            maxWidth: '420px',
            maxHeight: '520px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px'
            }}>
                <h4 style={{ margin: 0, color: '#FFD700', fontSize: '14px', fontWeight: 600 }}>
                    📚 Hand History Library
                </h4>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => setShowForm(!showForm)}
                        style={{
                            padding: '4px 10px',
                            background: 'rgba(100, 255, 100, 0.2)',
                            border: '1px solid rgba(100, 255, 100, 0.3)',
                            borderRadius: '6px',
                            color: '#4CAF50',
                            fontSize: '10px',
                            cursor: 'pointer'
                        }}
                    >
                        + Add Hand
                    </button>
                    {onClose && (
                        <button onClick={onClose} style={{
                            background: 'none', border: 'none',
                            color: 'rgba(255, 215, 0, 0.6)', fontSize: '18px', cursor: 'pointer'
                        }}>×</button>
                    )}
                </div>
            </div>

            {/* Add Hand Form */}
            {showForm && (
                <div style={{
                    marginBottom: '12px',
                    padding: '12px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '8px'
                }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <input
                            value={form.hand}
                            onChange={e => setForm({ ...form, hand: e.target.value })}
                            placeholder="Your hand (e.g., AhKs)"
                            style={{
                                flex: 1, padding: '6px 10px',
                                background: 'rgba(0, 0, 0, 0.4)',
                                border: '1px solid rgba(255, 215, 0, 0.2)',
                                borderRadius: '6px', color: '#fff', fontSize: '11px'
                            }}
                        />
                        <select
                            value={form.position}
                            onChange={e => setForm({ ...form, position: e.target.value })}
                            style={{
                                padding: '6px', background: 'rgba(0, 0, 0, 0.4)',
                                border: '1px solid rgba(255, 215, 0, 0.2)',
                                borderRadius: '6px', color: '#FFD700', fontSize: '10px'
                            }}
                        >
                            {['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'].map(p => (
                                <option key={p} value={p} style={{ background: '#1a0a2e' }}>{p}</option>
                            ))}
                        </select>
                    </div>

                    <input
                        value={form.board}
                        onChange={e => setForm({ ...form, board: e.target.value })}
                        placeholder="Board (e.g., Ah Ks Qc 2d 7h)"
                        style={{
                            width: '100%', padding: '6px 10px', marginBottom: '8px',
                            background: 'rgba(0, 0, 0, 0.4)',
                            border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '6px', color: '#fff', fontSize: '11px', boxSizing: 'border-box'
                        }}
                    />

                    <textarea
                        value={form.action}
                        onChange={e => setForm({ ...form, action: e.target.value })}
                        placeholder="What happened? (e.g., Raised flop, called river shove)"
                        style={{
                            width: '100%', padding: '6px 10px', marginBottom: '8px', minHeight: '50px',
                            background: 'rgba(0, 0, 0, 0.4)',
                            border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '6px', color: '#fff', fontSize: '11px', boxSizing: 'border-box',
                            resize: 'none'
                        }}
                    />

                    {/* Tags */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                        {TAG_OPTIONS.slice(0, 6).map(tag => (
                            <button
                                key={tag}
                                onClick={() => setForm({
                                    ...form,
                                    tags: form.tags.includes(tag)
                                        ? form.tags.filter(t => t !== tag)
                                        : [...form.tags, tag]
                                })}
                                style={{
                                    padding: '2px 6px',
                                    background: form.tags.includes(tag) ? 'rgba(255, 215, 0, 0.3)' : 'transparent',
                                    border: form.tags.includes(tag) ? '1px solid #FFD700' : '1px solid rgba(255, 255, 255, 0.2)',
                                    borderRadius: '4px',
                                    color: form.tags.includes(tag) ? '#FFD700' : 'rgba(255, 255, 255, 0.5)',
                                    fontSize: '9px', cursor: 'pointer'
                                }}
                            >
                                {tag}
                            </button>
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <select
                            value={form.result}
                            onChange={e => setForm({ ...form, result: e.target.value as any })}
                            style={{
                                padding: '6px', background: 'rgba(0, 0, 0, 0.4)',
                                border: '1px solid rgba(255, 215, 0, 0.2)',
                                borderRadius: '6px', color: '#FFD700', fontSize: '10px'
                            }}
                        >
                            <option value="unknown" style={{ background: '#1a0a2e' }}>Result?</option>
                            <option value="won" style={{ background: '#1a0a2e' }}>Won</option>
                            <option value="lost" style={{ background: '#1a0a2e' }}>Lost</option>
                        </select>
                        <button
                            onClick={addHand}
                            disabled={!form.hand}
                            style={{
                                flex: 1, padding: '8px',
                                background: form.hand ? 'linear-gradient(135deg, #FFD700, #FFA500)' : 'rgba(255, 255, 255, 0.1)',
                                border: 'none', borderRadius: '6px',
                                color: form.hand ? '#000' : 'rgba(255, 255, 255, 0.3)',
                                fontSize: '11px', fontWeight: 600, cursor: form.hand ? 'pointer' : 'not-allowed'
                            }}
                        >
                            Save Hand
                        </button>
                    </div>
                </div>
            )}

            {/* Search & Filter */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search hands..."
                    style={{
                        flex: 1, padding: '6px 10px',
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(255, 215, 0, 0.2)',
                        borderRadius: '6px', color: '#fff', fontSize: '11px'
                    }}
                />
            </div>

            {/* Tag Filters */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '10px', flexWrap: 'wrap' }}>
                <button
                    onClick={() => setFilterTag(null)}
                    style={{
                        padding: '3px 8px',
                        background: !filterTag ? 'rgba(255, 215, 0, 0.2)' : 'transparent',
                        border: '1px solid rgba(255, 215, 0, 0.3)',
                        borderRadius: '4px', color: !filterTag ? '#FFD700' : 'rgba(255, 255, 255, 0.5)',
                        fontSize: '9px', cursor: 'pointer'
                    }}
                >
                    All
                </button>
                {TAG_OPTIONS.slice(0, 5).map(tag => (
                    <button
                        key={tag}
                        onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                        style={{
                            padding: '3px 8px',
                            background: filterTag === tag ? 'rgba(255, 215, 0, 0.2)' : 'transparent',
                            border: '1px solid rgba(255, 215, 0, 0.3)',
                            borderRadius: '4px', color: filterTag === tag ? '#FFD700' : 'rgba(255, 255, 255, 0.5)',
                            fontSize: '9px', cursor: 'pointer'
                        }}
                    >
                        {tag}
                    </button>
                ))}
            </div>

            {/* Hand List */}
            <div style={{
                flex: 1, overflowY: 'auto',
                display: 'flex', flexDirection: 'column', gap: '8px'
            }}>
                {loading ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'rgba(255, 255, 255, 0.5)' }}>
                        Loading...
                    </div>
                ) : filteredHands.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'rgba(255, 255, 255, 0.5)', fontSize: '12px' }}>
                        {hands.length === 0 ? 'No hands saved yet. Add your first hand!' : 'No matching hands found.'}
                    </div>
                ) : filteredHands.map(hand => (
                    <div
                        key={hand.id}
                        onClick={() => setSelectedHand(selectedHand?.id === hand.id ? null : hand)}
                        style={{
                            padding: '10px 12px',
                            background: selectedHand?.id === hand.id ? 'rgba(255, 215, 0, 0.1)' : 'rgba(0, 0, 0, 0.2)',
                            border: selectedHand?.id === hand.id ? '1px solid rgba(255, 215, 0, 0.3)' : '1px solid transparent',
                            borderRadius: '8px',
                            cursor: 'pointer'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <span style={{
                                    fontSize: '12px', fontWeight: 600,
                                    color: hand.result === 'won' ? '#4CAF50' : hand.result === 'lost' ? '#f44336' : '#FFD700'
                                }}>
                                    {hand.hand}
                                </span>
                                <span style={{ color: 'rgba(255, 255, 255, 0.4)', margin: '0 6px', fontSize: '10px' }}>
                                    {hand.position}
                                </span>
                            </div>
                            <span style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.4)' }}>
                                {hand.createdAt.toLocaleDateString()}
                            </span>
                        </div>
                        {hand.board && (
                            <div style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.6)', marginTop: '4px' }}>
                                Board: {hand.board}
                            </div>
                        )}
                        {hand.tags.length > 0 && (
                            <div style={{ display: 'flex', gap: '3px', marginTop: '4px' }}>
                                {hand.tags.slice(0, 3).map(tag => (
                                    <span key={tag} style={{
                                        padding: '1px 4px', background: 'rgba(255, 215, 0, 0.15)',
                                        borderRadius: '3px', fontSize: '8px', color: 'rgba(255, 215, 0, 0.7)'
                                    }}>
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Expanded details */}
                        {selectedHand?.id === hand.id && (
                            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                {hand.action && (
                                    <p style={{ margin: '0 0 6px', fontSize: '10px', color: 'rgba(255, 255, 255, 0.7)' }}>
                                        {hand.action}
                                    </p>
                                )}
                                {hand.notes && (
                                    <p style={{ margin: '0 0 8px', fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)', fontStyle: 'italic' }}>
                                        {hand.notes}
                                    </p>
                                )}
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); analyzeHand(hand); }}
                                        style={{
                                            flex: 1, padding: '6px',
                                            background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                                            border: 'none', borderRadius: '4px',
                                            color: '#000', fontSize: '10px', fontWeight: 600, cursor: 'pointer'
                                        }}
                                    >
                                        🎯 Analyze with Jarvis
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); deleteHand(hand.id); }}
                                        style={{
                                            padding: '6px 10px',
                                            background: 'rgba(244, 67, 54, 0.2)',
                                            border: '1px solid rgba(244, 67, 54, 0.4)',
                                            borderRadius: '4px', color: '#f44336',
                                            fontSize: '10px', cursor: 'pointer'
                                        }}
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Stats Footer */}
            {hands.length > 0 && (
                <div style={{
                    marginTop: '10px', padding: '8px 12px',
                    background: 'rgba(255, 215, 0, 0.1)',
                    borderRadius: '6px', fontSize: '10px', color: 'rgba(255, 255, 255, 0.7)',
                    display: 'flex', justifyContent: 'space-between'
                }}>
                    <span>Total: {hands.length} hands</span>
                    <span style={{ color: '#4CAF50' }}>Won: {hands.filter(h => h.result === 'won').length}</span>
                    <span style={{ color: '#f44336' }}>Lost: {hands.filter(h => h.result === 'lost').length}</span>
                </div>
            )}
        </div>
    );
}

export default HandHistoryLibrary;
