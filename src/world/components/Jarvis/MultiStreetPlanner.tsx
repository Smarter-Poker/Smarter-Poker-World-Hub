/* ═══════════════════════════════════════════════════════════════════════════
   MULTI-STREET PLANNER — Plan actions for flop, turn, and river ahead of time
   Build branching decision trees for different runouts
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';

interface StreetPlan {
    action: 'bet' | 'check' | 'call' | 'raise' | 'fold' | '';
    size: string;
    reasoning: string;
}

interface MultiStreetPlannerProps {
    onAskJarvis: (question: string) => void;
    onClose?: () => void;
}

const ACTION_COLORS = {
    bet: '#FF9800',
    check: '#9E9E9E',
    call: '#2196F3',
    raise: '#f44336',
    fold: '#607D8B'
};

export function MultiStreetPlanner({ onAskJarvis, onClose }: MultiStreetPlannerProps) {
    const [hero, setHero] = useState({ hand: '', position: 'BTN' });
    const [flop, setFlop] = useState('');
    const [potSize, setPotSize] = useState('100');
    const [streetPlans, setStreetPlans] = useState<{
        flop: StreetPlan;
        turnGood: StreetPlan;
        turnBad: StreetPlan;
        riverGood: StreetPlan;
        riverBad: StreetPlan;
    }>({
        flop: { action: '', size: '', reasoning: '' },
        turnGood: { action: '', size: '', reasoning: '' },
        turnBad: { action: '', size: '', reasoning: '' },
        riverGood: { action: '', size: '', reasoning: '' },
        riverBad: { action: '', size: '', reasoning: '' }
    });

    const updatePlan = (street: keyof typeof streetPlans, updates: Partial<StreetPlan>) => {
        setStreetPlans(prev => ({
            ...prev,
            [street]: { ...prev[street], ...updates }
        }));
    };

    const askForPlan = () => {
        const question = `Help me plan multi-street with this hand:

**Hero:** ${hero.hand} from ${hero.position}
**Flop:** ${flop}
**Pot:** ${potSize}

For each street (flop, turn, river), what should my default plan be? Include:
1. Action + sizing
2. What good cards am I hoping for?
3. What bad cards should I be careful of?
4. Adjustments for different runouts`;

        onAskJarvis(question);
    };

    const positions = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
    const actions = ['bet', 'check', 'call', 'raise', 'fold'];

    const StreetBlock = ({
        label,
        streetKey,
        emoji
    }: {
        label: string;
        streetKey: keyof typeof streetPlans;
        emoji: string;
    }) => (
        <div style={{
            padding: '8px',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '8px',
            marginBottom: '8px'
        }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '6px'
            }}>
                <span>{emoji}</span>
                <span style={{ fontSize: '11px', color: '#FFD700', fontWeight: 600 }}>
                    {label}
                </span>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {actions.map(action => (
                    <button
                        key={action}
                        onClick={() => updatePlan(streetKey, { action: action as any })}
                        style={{
                            padding: '3px 8px',
                            background: streetPlans[streetKey].action === action
                                ? ACTION_COLORS[action as keyof typeof ACTION_COLORS]
                                : 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '4px',
                            color: '#fff',
                            fontSize: '9px',
                            cursor: 'pointer',
                            textTransform: 'capitalize'
                        }}
                    >
                        {action}
                    </button>
                ))}
                {(streetPlans[streetKey].action === 'bet' || streetPlans[streetKey].action === 'raise') && (
                    <input
                        value={streetPlans[streetKey].size}
                        onChange={e => updatePlan(streetKey, { size: e.target.value })}
                        placeholder="Size"
                        style={{
                            width: '50px',
                            padding: '3px 6px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '4px',
                            color: '#FFD700',
                            fontSize: '10px'
                        }}
                    />
                )}
            </div>
            <input
                value={streetPlans[streetKey].reasoning}
                onChange={e => updatePlan(streetKey, { reasoning: e.target.value })}
                placeholder="Note: why this action?"
                style={{
                    width: '100%',
                    marginTop: '6px',
                    padding: '4px 8px',
                    background: 'rgba(0, 0, 0, 0.2)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '4px',
                    color: 'rgba(255, 255, 255, 0.7)',
                    fontSize: '10px'
                }}
            />
        </div>
    );

    return (
        <div style={{
            background: 'rgba(20, 10, 40, 0.98)',
            border: '1px solid rgba(255, 215, 0, 0.3)',
            borderRadius: '12px',
            padding: '16px',
            maxWidth: '360px',
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
                    📊 Multi-Street Planner
                </h4>
                {onClose && (
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none',
                        color: 'rgba(255, 215, 0, 0.6)', fontSize: '18px', cursor: 'pointer'
                    }}>×</button>
                )}
            </div>

            {/* Hand Setup */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '8px',
                marginBottom: '12px'
            }}>
                <div>
                    <label style={{ fontSize: '9px', color: 'rgba(255, 215, 0, 0.7)' }}>Your Hand</label>
                    <input
                        value={hero.hand}
                        onChange={e => setHero(h => ({ ...h, hand: e.target.value }))}
                        placeholder="AhKd"
                        style={{
                            width: '100%',
                            padding: '6px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '4px',
                            color: '#fff',
                            fontSize: '12px',
                            fontFamily: 'monospace'
                        }}
                    />
                </div>
                <div>
                    <label style={{ fontSize: '9px', color: 'rgba(255, 215, 0, 0.7)' }}>Flop</label>
                    <input
                        value={flop}
                        onChange={e => setFlop(e.target.value)}
                        placeholder="Ks Th 4c"
                        style={{
                            width: '100%',
                            padding: '6px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '4px',
                            color: '#fff',
                            fontSize: '12px',
                            fontFamily: 'monospace'
                        }}
                    />
                </div>
                <div>
                    <label style={{ fontSize: '9px', color: 'rgba(255, 215, 0, 0.7)' }}>Position</label>
                    <select
                        value={hero.position}
                        onChange={e => setHero(h => ({ ...h, position: e.target.value }))}
                        style={{
                            width: '100%',
                            padding: '6px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '4px',
                            color: '#FFD700',
                            fontSize: '11px'
                        }}
                    >
                        {positions.map(p => (
                            <option key={p} value={p} style={{ background: '#1a0a2e' }}>{p}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Street Plans */}
            <StreetBlock label="Flop Action" streetKey="flop" emoji="🎯" />

            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '6px',
                marginBottom: '8px'
            }}>
                <div style={{
                    padding: '8px',
                    background: 'rgba(100, 255, 100, 0.1)',
                    borderRadius: '8px'
                }}>
                    <div style={{ fontSize: '10px', color: '#4CAF50', marginBottom: '4px' }}>
                        ✓ Turn (Good Card)
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                        {actions.slice(0, 3).map(action => (
                            <button
                                key={action}
                                onClick={() => updatePlan('turnGood', { action: action as any })}
                                style={{
                                    padding: '2px 6px',
                                    background: streetPlans.turnGood.action === action
                                        ? ACTION_COLORS[action as keyof typeof ACTION_COLORS]
                                        : 'rgba(255, 255, 255, 0.05)',
                                    border: 'none',
                                    borderRadius: '3px',
                                    color: '#fff',
                                    fontSize: '8px',
                                    cursor: 'pointer'
                                }}
                            >
                                {action}
                            </button>
                        ))}
                    </div>
                </div>
                <div style={{
                    padding: '8px',
                    background: 'rgba(255, 100, 100, 0.1)',
                    borderRadius: '8px'
                }}>
                    <div style={{ fontSize: '10px', color: '#f44336', marginBottom: '4px' }}>
                        ✗ Turn (Bad Card)
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                        {actions.slice(0, 3).map(action => (
                            <button
                                key={action}
                                onClick={() => updatePlan('turnBad', { action: action as any })}
                                style={{
                                    padding: '2px 6px',
                                    background: streetPlans.turnBad.action === action
                                        ? ACTION_COLORS[action as keyof typeof ACTION_COLORS]
                                        : 'rgba(255, 255, 255, 0.05)',
                                    border: 'none',
                                    borderRadius: '3px',
                                    color: '#fff',
                                    fontSize: '8px',
                                    cursor: 'pointer'
                                }}
                            >
                                {action}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Ask Jarvis */}
            <button
                onClick={askForPlan}
                disabled={!hero.hand || !flop}
                style={{
                    width: '100%',
                    padding: '10px',
                    background: hero.hand && flop
                        ? 'linear-gradient(135deg, #FFD700, #FFA500)'
                        : 'rgba(255, 215, 0, 0.2)',
                    border: 'none',
                    borderRadius: '8px',
                    color: hero.hand && flop ? '#000' : 'rgba(255, 255, 255, 0.4)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: hero.hand && flop ? 'pointer' : 'not-allowed'
                }}
            >
                🧠 Get Full Street Plan from Jarvis
            </button>
        </div>
    );
}
