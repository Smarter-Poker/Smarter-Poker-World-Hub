/* ═══════════════════════════════════════════════════════════════════════════
   OPPONENT PROFILER — Track and analyze opponent tendencies
   Build profiles from observations and get exploitative advice
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';

interface OpponentProfile {
    id: string;
    name: string;
    position: string;
    notes: string[];
    style: 'tight-passive' | 'tight-aggressive' | 'loose-passive' | 'loose-aggressive' | 'unknown';
    stats: {
        vpip: string;
        pfr: string;
        aggression: string;
        foldToRaise: string;
    };
    tags: string[];
}

interface OpponentProfilerProps {
    onAskGeeves: (question: string) => void;
    onClose?: () => void;
}

const STYLE_COLORS = {
    'tight-passive': '#2196F3',
    'tight-aggressive': '#f44336',
    'loose-passive': '#4CAF50',
    'loose-aggressive': '#FF9800',
    'unknown': '#9E9E9E'
};

const STYLE_LABELS = {
    'tight-passive': 'Nit/Rock',
    'tight-aggressive': 'TAG',
    'loose-passive': 'Calling Station',
    'loose-aggressive': 'LAG',
    'unknown': 'Unknown'
};

const TAG_OPTIONS = [
    'Bluffs rivers', 'Never folds', 'Tight preflop', 'Overvalues pairs',
    'Scared money', 'Tilts easily', 'Tricky postflop', 'Straightforward',
    '3-bets light', 'Slow plays', 'Punts stacks', 'Competent'
];

export function OpponentProfiler({ onAskGeeves, onClose }: OpponentProfilerProps) {
    const [profiles, setProfiles] = useState<OpponentProfile[]>([]);
    const [activeProfile, setActiveProfile] = useState<string | null>(null);
    const [newNote, setNewNote] = useState('');

    // Get active profile
    const current = profiles.find(p => p.id === activeProfile);

    const addProfile = () => {
        const newProfile: OpponentProfile = {
            id: Date.now().toString(),
            name: `Villain ${profiles.length + 1}`,
            position: 'Unknown',
            notes: [],
            style: 'unknown',
            stats: { vpip: '?', pfr: '?', aggression: '?', foldToRaise: '?' },
            tags: []
        };
        setProfiles([...profiles, newProfile]);
        setActiveProfile(newProfile.id);
    };

    const updateProfile = (id: string, updates: Partial<OpponentProfile>) => {
        setProfiles(profiles.map(p =>
            p.id === id ? { ...p, ...updates } : p
        ));
    };

    const addNote = () => {
        if (!current || !newNote.trim()) return;
        updateProfile(current.id, {
            notes: [...current.notes, newNote.trim()]
        });
        setNewNote('');
    };

    const toggleTag = (tag: string) => {
        if (!current) return;
        const hasTag = current.tags.includes(tag);
        updateProfile(current.id, {
            tags: hasTag
                ? current.tags.filter(t => t !== tag)
                : [...current.tags, tag]
        });
    };

    const askForExploit = () => {
        if (!current) return;

        const question = `How should I exploit this opponent?

**Player Style:** ${STYLE_LABELS[current.style]}
**Tags:** ${current.tags.join(', ') || 'None'}
**Notes:** ${current.notes.join('; ') || 'No notes'}

Give me 3 specific exploits for this player type.`;

        onAskGeeves(question);
    };

    return (
        <div style={{
            background: 'rgba(20, 10, 40, 0.98)',
            border: '1px solid rgba(255, 215, 0, 0.3)',
            borderRadius: '12px',
            padding: '16px',
            maxWidth: '380px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px'
            }}>
                <h4 style={{
                    margin: 0,
                    color: '#FFD700',
                    fontSize: '14px',
                    fontWeight: 600
                }}>
                    🎭 Opponent Profiler
                </h4>
                {onClose && (
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none',
                        color: 'rgba(255, 215, 0, 0.6)', fontSize: '18px', cursor: 'pointer'
                    }}>×</button>
                )}
            </div>

            {/* Profile Tabs */}
            <div style={{
                display: 'flex',
                gap: '6px',
                marginBottom: '12px',
                flexWrap: 'wrap'
            }}>
                {profiles.map(p => (
                    <button
                        key={p.id}
                        onClick={() => setActiveProfile(p.id)}
                        style={{
                            padding: '4px 10px',
                            background: activeProfile === p.id
                                ? STYLE_COLORS[p.style]
                                : 'rgba(255, 215, 0, 0.1)',
                            border: '1px solid rgba(255, 215, 0, 0.3)',
                            borderRadius: '12px',
                            color: '#fff',
                            fontSize: '10px',
                            cursor: 'pointer'
                        }}
                    >
                        {p.name}
                    </button>
                ))}
                <button
                    onClick={addProfile}
                    style={{
                        padding: '4px 10px',
                        background: 'rgba(100, 255, 100, 0.2)',
                        border: '1px solid rgba(100, 255, 100, 0.3)',
                        borderRadius: '12px',
                        color: '#4CAF50',
                        fontSize: '10px',
                        cursor: 'pointer'
                    }}
                >
                    + Add
                </button>
            </div>

            {/* Profile Details */}
            {current ? (
                <>
                    {/* Name & Position */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                        <input
                            value={current.name}
                            onChange={e => updateProfile(current.id, { name: e.target.value })}
                            placeholder="Name"
                            style={{
                                flex: 1,
                                padding: '6px 10px',
                                background: 'rgba(0, 0, 0, 0.3)',
                                border: '1px solid rgba(255, 215, 0, 0.2)',
                                borderRadius: '6px',
                                color: '#fff',
                                fontSize: '12px'
                            }}
                        />
                        <select
                            value={current.position}
                            onChange={e => updateProfile(current.id, { position: e.target.value })}
                            style={{
                                padding: '6px',
                                background: 'rgba(0, 0, 0, 0.3)',
                                border: '1px solid rgba(255, 215, 0, 0.2)',
                                borderRadius: '6px',
                                color: '#FFD700',
                                fontSize: '11px'
                            }}
                        >
                            {['Unknown', 'UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'].map(pos => (
                                <option key={pos} value={pos} style={{ background: '#1a0a2e' }}>{pos}</option>
                            ))}
                        </select>
                    </div>

                    {/* Style Selector */}
                    <div style={{ marginBottom: '10px' }}>
                        <p style={{ margin: '0 0 6px 0', fontSize: '10px', color: 'rgba(255, 215, 0, 0.7)' }}>
                            Player Style:
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {(Object.keys(STYLE_LABELS) as Array<keyof typeof STYLE_LABELS>).map(style => (
                                <button
                                    key={style}
                                    onClick={() => updateProfile(current.id, { style })}
                                    style={{
                                        padding: '4px 8px',
                                        background: current.style === style
                                            ? STYLE_COLORS[style]
                                            : 'rgba(255, 255, 255, 0.05)',
                                        border: `1px solid ${STYLE_COLORS[style]}`,
                                        borderRadius: '4px',
                                        color: '#fff',
                                        fontSize: '9px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {STYLE_LABELS[style]}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tags */}
                    <div style={{ marginBottom: '10px' }}>
                        <p style={{ margin: '0 0 6px 0', fontSize: '10px', color: 'rgba(255, 215, 0, 0.7)' }}>
                            Quick Tags:
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                            {TAG_OPTIONS.map(tag => (
                                <button
                                    key={tag}
                                    onClick={() => toggleTag(tag)}
                                    style={{
                                        padding: '2px 6px',
                                        background: current.tags.includes(tag)
                                            ? 'rgba(255, 215, 0, 0.3)'
                                            : 'transparent',
                                        border: current.tags.includes(tag)
                                            ? '1px solid #FFD700'
                                            : '1px solid rgba(255, 255, 255, 0.2)',
                                        borderRadius: '3px',
                                        color: current.tags.includes(tag) ? '#FFD700' : 'rgba(255, 255, 255, 0.5)',
                                        fontSize: '8px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Notes */}
                    <div style={{ marginBottom: '10px' }}>
                        <p style={{ margin: '0 0 6px 0', fontSize: '10px', color: 'rgba(255, 215, 0, 0.7)' }}>
                            Notes ({current.notes.length}):
                        </p>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <input
                                value={newNote}
                                onChange={e => setNewNote(e.target.value)}
                                onKeyPress={e => e.key === 'Enter' && addNote()}
                                placeholder="Add note..."
                                style={{
                                    flex: 1,
                                    padding: '6px 10px',
                                    background: 'rgba(0, 0, 0, 0.3)',
                                    border: '1px solid rgba(255, 215, 0, 0.2)',
                                    borderRadius: '6px',
                                    color: '#fff',
                                    fontSize: '11px'
                                }}
                            />
                            <button
                                onClick={addNote}
                                style={{
                                    padding: '6px 12px',
                                    background: 'rgba(255, 215, 0, 0.2)',
                                    border: '1px solid rgba(255, 215, 0, 0.3)',
                                    borderRadius: '6px',
                                    color: '#FFD700',
                                    fontSize: '11px',
                                    cursor: 'pointer'
                                }}
                            >
                                +
                            </button>
                        </div>
                        {current.notes.length > 0 && (
                            <div style={{
                                marginTop: '6px',
                                maxHeight: '60px',
                                overflowY: 'auto',
                                fontSize: '10px',
                                color: 'rgba(255, 255, 255, 0.7)'
                            }}>
                                {current.notes.map((note, i) => (
                                    <div key={i} style={{ padding: '2px 0' }}>• {note}</div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Ask for Exploit */}
                    <button
                        onClick={askForExploit}
                        style={{
                            width: '100%',
                            padding: '10px',
                            background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                            border: 'none',
                            borderRadius: '8px',
                            color: '#000',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        🎯 Get Exploitation Strategy
                    </button>
                </>
            ) : (
                <div style={{
                    padding: '24px',
                    textAlign: 'center',
                    color: 'rgba(255, 255, 255, 0.5)',
                    fontSize: '12px'
                }}>
                    Click "+ Add" to create an opponent profile
                </div>
            )}
        </div>
    );
}
