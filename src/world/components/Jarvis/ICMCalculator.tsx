/* ═══════════════════════════════════════════════════════════════════════════
   ICM CALCULATOR — Tournament ICM and Push/Fold calculations
   Shows Nash equilibrium push/fold ranges based on stack depth and payout
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';

interface ICMCalculatorProps {
    onAskJarvis: (question: string) => void;
    onClose?: () => void;
}

interface PlayerStack {
    position: number;
    stack: number;
    isHero: boolean;
}

export function ICMCalculator({ onAskJarvis, onClose }: ICMCalculatorProps) {
    const [players, setPlayers] = useState<PlayerStack[]>([
        { position: 1, stack: 25, isHero: true },
        { position: 2, stack: 30, isHero: false },
        { position: 3, stack: 20, isHero: false },
        { position: 4, stack: 15, isHero: false },
        { position: 5, stack: 10, isHero: false }
    ]);
    const [payouts, setPayouts] = useState([50, 30, 20]);
    const [ante, setAnte] = useState(0.1);
    const [blinds, setBlinds] = useState({ sb: 0.5, bb: 1 });

    const totalChips = players.reduce((sum, p) => sum + p.stack, 0);
    const heroStack = players.find(p => p.isHero)?.stack || 0;
    const heroM = heroStack / (blinds.sb + blinds.bb + (ante * players.length));

    // Simple ICM approximation (real ICM would use Malmuth-Harville)
    const calculateICM = (stacks: number[]) => {
        const total = stacks.reduce((a, b) => a + b, 0);
        return stacks.map(s => (s / total) * 100);
    };

    const icmEquities = calculateICM(players.map(p => p.stack));
    const heroICM = icmEquities[players.findIndex(p => p.isHero)] || 0;

    const updateStack = (position: number, newStack: number) => {
        setPlayers(players.map(p =>
            p.position === position ? { ...p, stack: Math.max(0, newStack) } : p
        ));
    };

    const setHero = (position: number) => {
        setPlayers(players.map(p => ({ ...p, isHero: p.position === position })));
    };

    const askForPushRange = () => {
        const sortedByStack = [...players].sort((a, b) => b.stack - a.stack);
        const question = `What is my Nash push range in this spot?

**Tournament Info:**
- Players: ${players.length}
- Payouts: ${payouts.join('% / ')}%
- Blinds: ${blinds.sb}/${blinds.bb} (Ante ${ante})

**Stacks:**
${sortedByStack.map((p, i) => `${i + 1}. ${p.isHero ? 'HERO' : `P${p.position}`}: ${p.stack} BB`).join('\n')}

**Hero Stack:** ${heroStack} BB (M = ${heroM.toFixed(1)})
**ICM Equity:** ${heroICM.toFixed(1)}%

What hands should I push all-in with?`;

        onAskJarvis(question);
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
                <h4 style={{ margin: 0, color: '#FFD700', fontSize: '14px', fontWeight: 600 }}>
                    🏆 ICM Calculator
                </h4>
                {onClose && (
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none',
                        color: 'rgba(255, 215, 0, 0.6)', fontSize: '18px', cursor: 'pointer'
                    }}>×</button>
                )}
            </div>

            {/* Blinds & Ante */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '8px',
                marginBottom: '12px'
            }}>
                <div>
                    <label style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)' }}>SB</label>
                    <input
                        type="number"
                        value={blinds.sb}
                        onChange={e => setBlinds({ ...blinds, sb: +e.target.value })}
                        style={{
                            width: '100%',
                            padding: '6px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '4px',
                            color: '#fff',
                            fontSize: '12px'
                        }}
                    />
                </div>
                <div>
                    <label style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)' }}>BB</label>
                    <input
                        type="number"
                        value={blinds.bb}
                        onChange={e => setBlinds({ ...blinds, bb: +e.target.value })}
                        style={{
                            width: '100%',
                            padding: '6px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '4px',
                            color: '#fff',
                            fontSize: '12px'
                        }}
                    />
                </div>
                <div>
                    <label style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)' }}>Ante</label>
                    <input
                        type="number"
                        value={ante}
                        step="0.1"
                        onChange={e => setAnte(+e.target.value)}
                        style={{
                            width: '100%',
                            padding: '6px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '4px',
                            color: '#fff',
                            fontSize: '12px'
                        }}
                    />
                </div>
            </div>

            {/* Player Stacks */}
            <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '10px', color: 'rgba(255, 215, 0, 0.7)', marginBottom: '6px' }}>
                    Player Stacks (BB):
                </div>
                {players.map(p => (
                    <div key={p.position} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '4px'
                    }}>
                        <button
                            onClick={() => setHero(p.position)}
                            style={{
                                padding: '2px 8px',
                                background: p.isHero ? '#FFD700' : 'rgba(255, 255, 255, 0.1)',
                                border: 'none',
                                borderRadius: '3px',
                                color: p.isHero ? '#000' : 'rgba(255, 255, 255, 0.5)',
                                fontSize: '9px',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            {p.isHero ? 'HERO' : `P${p.position}`}
                        </button>
                        <input
                            type="number"
                            value={p.stack}
                            onChange={e => updateStack(p.position, +e.target.value)}
                            style={{
                                flex: 1,
                                padding: '4px 8px',
                                background: 'rgba(0, 0, 0, 0.3)',
                                border: `1px solid ${p.isHero ? 'rgba(255, 215, 0, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
                                borderRadius: '4px',
                                color: '#fff',
                                fontSize: '11px'
                            }}
                        />
                        <span style={{
                            fontSize: '10px',
                            color: 'rgba(255, 255, 255, 0.5)',
                            width: '40px',
                            textAlign: 'right'
                        }}>
                            {icmEquities[players.findIndex(x => x.position === p.position)]?.toFixed(1)}%
                        </span>
                    </div>
                ))}
            </div>

            {/* Hero Stats */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '8px',
                marginBottom: '12px',
                padding: '10px',
                background: 'rgba(255, 215, 0, 0.1)',
                borderRadius: '8px'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#FFD700' }}>
                        {heroStack}
                    </div>
                    <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)' }}>Stack BB</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        fontSize: '18px',
                        fontWeight: 700,
                        color: heroM < 5 ? '#f44336' : heroM < 10 ? '#FF9800' : '#4CAF50'
                    }}>
                        {heroM.toFixed(1)}
                    </div>
                    <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)' }}>M-Ratio</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#2196F3' }}>
                        {heroICM.toFixed(1)}%
                    </div>
                    <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)' }}>ICM Equity</div>
                </div>
            </div>

            {/* Action Button */}
            <button
                onClick={askForPushRange}
                style={{
                    width: '100%',
                    padding: '12px',
                    background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#000',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                }}
            >
                🎲 Calculate Push/Fold Range
            </button>
        </div>
    );
}
