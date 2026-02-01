/* ═══════════════════════════════════════════════════════════════════════════
   TILT JOURNAL — Log and analyze tilt triggers and patterns
   Track emotional states, identify patterns, get recovery strategies
   Now with Supabase persistence for cross-device sync
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

interface TiltJournalProps {
    onAskJarvis: (question: string) => void;
    onClose?: () => void;
}

interface TiltEntry {
    id: string;
    timestamp: string;
    trigger: string;
    intensity: number; // 1-5
    situation: string;
    response: string;
    outcome: string;
}

const COMMON_TRIGGERS = [
    'Bad beat',
    'Cooler',
    'Mistake realized',
    'Running bad',
    'Opponent chat',
    'Time pressure',
    'Exhaustion',
    'Life stress',
    'Lost big pot',
    'Variance frustration'
];

export function TiltJournal({ onAskJarvis, onClose }: TiltJournalProps) {
    const [entries, setEntries] = useState<TiltEntry[]>([]);
    const [showAddForm, setShowAddForm] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [newEntry, setNewEntry] = useState({
        trigger: '',
        intensity: 3,
        situation: '',
        response: '',
        outcome: ''
    });

    // Load from Supabase or localStorage
    useEffect(() => {
        const loadEntries = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    setUserId(user.id);
                    const { data, error } = await supabase
                        .from('tilt_journal')
                        .select('*')
                        .eq('user_id', user.id)
                        .order('timestamp', { ascending: false });

                    if (!error && data) {
                        setEntries(data.map((e: any) => ({
                            id: e.id,
                            timestamp: e.timestamp,
                            trigger: e.trigger,
                            intensity: e.intensity,
                            situation: e.situation || '',
                            response: e.response || '',
                            outcome: e.outcome || ''
                        })));
                        return;
                    }
                }
            } catch (e) {
                console.error('[TiltJournal] Supabase error:', e);
            }

            // Fallback to localStorage
            const saved = localStorage.getItem('jarvis_tilt_journal');
            if (saved) {
                try {
                    setEntries(JSON.parse(saved));
                } catch (e) { }
            }
        };
        loadEntries();
    }, []);

    // Save to Supabase
    const saveEntry = useCallback(async (entry: TiltEntry) => {
        localStorage.setItem('jarvis_tilt_journal', JSON.stringify([entry, ...entries]));

        if (!userId) return;

        try {
            await supabase.from('tilt_journal').upsert({
                id: entry.id,
                user_id: userId,
                timestamp: entry.timestamp,
                trigger: entry.trigger,
                intensity: entry.intensity,
                situation: entry.situation,
                response: entry.response,
                outcome: entry.outcome
            });
        } catch (e) {
            console.error('[TiltJournal] Save error:', e);
        }
    }, [userId, entries]);

    const deleteFromSupabase = useCallback(async (id: string) => {
        if (!userId) return;
        try {
            await supabase.from('tilt_journal').delete().eq('id', id);
        } catch (e) {
            console.error('[TiltJournal] Delete error:', e);
        }
    }, [userId]);

    const addEntry = () => {
        if (!newEntry.trigger) return;

        const entry: TiltEntry = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            ...newEntry
        };
        setEntries([entry, ...entries]);
        saveEntry(entry); // Save to Supabase
        setNewEntry({ trigger: '', intensity: 3, situation: '', response: '', outcome: '' });
        setShowAddForm(false);
    };

    const deleteEntry = (id: string) => {
        setEntries(entries.filter(e => e.id !== id));
        deleteFromSupabase(id); // Delete from Supabase
        localStorage.setItem('jarvis_tilt_journal', JSON.stringify(entries.filter(e => e.id !== id)));
    };

    const analyzePatterns = () => {
        const triggerCounts: Record<string, number> = {};
        const avgIntensity = entries.reduce((sum, e) => sum + e.intensity, 0) / (entries.length || 1);

        entries.forEach(e => {
            triggerCounts[e.trigger] = (triggerCounts[e.trigger] || 0) + 1;
        });

        const topTriggers = Object.entries(triggerCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        onAskJarvis(`Analyze my tilt patterns and give me personalized advice:

**Total Tilt Episodes:** ${entries.length}
**Average Intensity:** ${avgIntensity.toFixed(1)}/5

**Most Common Triggers:**
${topTriggers.map(([trigger, count]) => `- ${trigger}: ${count} times`).join('\n') || 'Not enough data'}

**Recent Entries:**
${entries.slice(0, 3).map(e => `- ${e.trigger} (${e.intensity}/5): "${e.response}"`).join('\n') || 'None yet'}

What patterns do you see? How can I better manage my emotional state?`);
    };

    const getIntensityColor = (intensity: number) => {
        if (intensity <= 2) return '#4CAF50';
        if (intensity <= 3) return '#FF9800';
        return '#f44336';
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
                <div>
                    <h4 style={{ margin: 0, color: '#FFD700', fontSize: '14px', fontWeight: 600 }}>
                        😤 Tilt Journal
                    </h4>
                    <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '2px' }}>
                        {entries.length} entries logged
                    </div>
                </div>
                {onClose && (
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none',
                        color: 'rgba(255, 215, 0, 0.6)', fontSize: '18px', cursor: 'pointer'
                    }}>×</button>
                )}
            </div>

            {/* Add Form */}
            {showAddForm ? (
                <div style={{
                    padding: '12px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '8px',
                    marginBottom: '12px'
                }}>
                    {/* Trigger Selection */}
                    <div style={{ marginBottom: '10px' }}>
                        <label style={{ fontSize: '10px', color: 'rgba(255, 215, 0, 0.7)', display: 'block', marginBottom: '4px' }}>
                            What triggered the tilt?
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {COMMON_TRIGGERS.map(trigger => (
                                <button
                                    key={trigger}
                                    onClick={() => setNewEntry({ ...newEntry, trigger })}
                                    style={{
                                        padding: '3px 8px',
                                        background: newEntry.trigger === trigger ? 'rgba(255, 215, 0, 0.3)' : 'rgba(255, 255, 255, 0.05)',
                                        border: newEntry.trigger === trigger ? '1px solid #FFD700' : '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '4px',
                                        color: newEntry.trigger === trigger ? '#FFD700' : 'rgba(255, 255, 255, 0.6)',
                                        fontSize: '8px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {trigger}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Intensity */}
                    <div style={{ marginBottom: '10px' }}>
                        <label style={{ fontSize: '10px', color: 'rgba(255, 215, 0, 0.7)', display: 'block', marginBottom: '4px' }}>
                            Intensity: {newEntry.intensity}/5
                        </label>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {[1, 2, 3, 4, 5].map(n => (
                                <button
                                    key={n}
                                    onClick={() => setNewEntry({ ...newEntry, intensity: n })}
                                    style={{
                                        flex: 1,
                                        padding: '6px',
                                        background: newEntry.intensity >= n ? getIntensityColor(n) : 'rgba(255, 255, 255, 0.1)',
                                        border: 'none',
                                        borderRadius: '4px',
                                        color: '#fff',
                                        fontSize: '10px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {n}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Response */}
                    <div style={{ marginBottom: '10px' }}>
                        <label style={{ fontSize: '10px', color: 'rgba(255, 215, 0, 0.7)', display: 'block', marginBottom: '4px' }}>
                            How did you respond?
                        </label>
                        <input
                            value={newEntry.response}
                            onChange={e => setNewEntry({ ...newEntry, response: e.target.value })}
                            placeholder="e.g., Took a break, kept playing tilted..."
                            style={{
                                width: '100%',
                                padding: '6px 10px',
                                background: 'rgba(0, 0, 0, 0.3)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '4px',
                                color: '#fff',
                                fontSize: '10px'
                            }}
                        />
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                            onClick={() => setShowAddForm(false)}
                            style={{
                                flex: 1,
                                padding: '8px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                border: 'none',
                                borderRadius: '6px',
                                color: 'rgba(255, 255, 255, 0.6)',
                                fontSize: '10px',
                                cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={addEntry}
                            style={{
                                flex: 1,
                                padding: '8px',
                                background: '#FFD700',
                                border: 'none',
                                borderRadius: '6px',
                                color: '#000',
                                fontSize: '10px',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            Log Entry
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => setShowAddForm(true)}
                    style={{
                        width: '100%',
                        padding: '10px',
                        background: 'rgba(244, 67, 54, 0.2)',
                        border: '1px solid rgba(244, 67, 54, 0.3)',
                        borderRadius: '8px',
                        color: '#f44336',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        marginBottom: '12px'
                    }}
                >
                    + Log Tilt Episode
                </button>
            )}

            {/* Entries List */}
            <div style={{ maxHeight: '150px', overflowY: 'auto', marginBottom: '12px' }}>
                {entries.length === 0 ? (
                    <div style={{
                        padding: '16px',
                        textAlign: 'center',
                        color: 'rgba(255, 255, 255, 0.5)',
                        fontSize: '10px'
                    }}>
                        No entries yet. Log your first tilt episode to start tracking patterns.
                    </div>
                ) : (
                    entries.slice(0, 5).map(entry => (
                        <div key={entry.id} style={{
                            padding: '8px',
                            background: 'rgba(0, 0, 0, 0.2)',
                            borderRadius: '6px',
                            marginBottom: '6px',
                            borderLeft: `3px solid ${getIntensityColor(entry.intensity)}`
                        }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '4px'
                            }}>
                                <span style={{ fontSize: '10px', fontWeight: 600, color: '#fff' }}>
                                    {entry.trigger}
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{
                                        fontSize: '9px',
                                        color: getIntensityColor(entry.intensity)
                                    }}>
                                        {entry.intensity}/5
                                    </span>
                                    <button
                                        onClick={() => deleteEntry(entry.id)}
                                        style={{
                                            background: 'none', border: 'none',
                                            color: 'rgba(255, 255, 255, 0.3)',
                                            fontSize: '10px', cursor: 'pointer'
                                        }}
                                    >
                                        ×
                                    </button>
                                </div>
                            </div>
                            {entry.response && (
                                <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)' }}>
                                    Response: {entry.response}
                                </div>
                            )}
                            <div style={{ fontSize: '8px', color: 'rgba(255, 255, 255, 0.3)', marginTop: '4px' }}>
                                {new Date(entry.timestamp).toLocaleDateString()}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Analyze Button */}
            <button
                onClick={analyzePatterns}
                style={{
                    width: '100%',
                    padding: '10px',
                    background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#000',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer'
                }}
            >
                🧠 Analyze My Tilt Patterns
            </button>
        </div>
    );
}
