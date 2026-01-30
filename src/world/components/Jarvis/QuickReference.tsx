/* ═══════════════════════════════════════════════════════════════════════════
   QUICK REFERENCE CARDS — Cheat sheets for common poker concepts
   Pot odds, hand rankings, position advantages, bet sizing
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';

interface QuickReferenceProps {
    onAskJarvis: (question: string) => void;
    onClose?: () => void;
}

type RefCard = 'hands' | 'odds' | 'positions' | 'sizing';

const HAND_RANKINGS = [
    { name: 'Royal Flush', example: 'A♠ K♠ Q♠ J♠ T♠', odds: '1 in 649,740' },
    { name: 'Straight Flush', example: '9♥ 8♥ 7♥ 6♥ 5♥', odds: '1 in 72,193' },
    { name: 'Four of a Kind', example: 'Q♣ Q♦ Q♥ Q♠ 7♠', odds: '1 in 4,165' },
    { name: 'Full House', example: 'K♠ K♥ K♦ 4♣ 4♠', odds: '1 in 694' },
    { name: 'Flush', example: 'A♦ J♦ 8♦ 5♦ 2♦', odds: '1 in 509' },
    { name: 'Straight', example: 'T♠ 9♣ 8♦ 7♥ 6♠', odds: '1 in 255' },
    { name: 'Three of a Kind', example: '8♣ 8♦ 8♥ K♠ 3♦', odds: '1 in 47' },
    { name: 'Two Pair', example: 'A♠ A♥ J♣ J♦ 9♠', odds: '1 in 21' },
    { name: 'One Pair', example: 'K♦ K♣ 9♥ 7♠ 3♦', odds: '1 in 2.4' },
    { name: 'High Card', example: 'A♠ Q♦ 9♣ 6♥ 3♠', odds: '1 in 2' }
];

const POT_ODDS_TABLE = [
    { bet: '1/4 pot', odds: '5:1', equity: '17%' },
    { bet: '1/3 pot', odds: '4:1', equity: '20%' },
    { bet: '1/2 pot', odds: '3:1', equity: '25%' },
    { bet: '2/3 pot', odds: '2.5:1', equity: '29%' },
    { bet: '3/4 pot', odds: '2.3:1', equity: '30%' },
    { bet: 'Pot', odds: '2:1', equity: '33%' },
    { bet: '1.5x pot', odds: '1.7:1', equity: '37%' },
    { bet: '2x pot', odds: '1.5:1', equity: '40%' }
];

const POSITION_ADVANTAGES = [
    { pos: 'BTN', advantage: 'Best', notes: 'Last to act, most info, widest range' },
    { pos: 'CO', advantage: 'Very Good', notes: 'Often steals BTN, wide opening' },
    { pos: 'HJ', advantage: 'Good', notes: 'Can open reasonably wide' },
    { pos: 'MP', advantage: 'Fair', notes: 'Moderate opening range' },
    { pos: 'UTG', advantage: 'Poor', notes: 'Tightest range, most players behind' },
    { pos: 'BB', advantage: 'Special', notes: 'Good price to defend, bad position postflop' },
    { pos: 'SB', advantage: 'Worst', notes: 'Must act first postflop' }
];

export function QuickReference({ onAskJarvis, onClose }: QuickReferenceProps) {
    const [activeCard, setActiveCard] = useState<RefCard>('hands');

    const askAboutTopic = (topic: string) => {
        onAskJarvis(`Explain ${topic} in poker and give me practical tips.`);
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
                    📚 Quick Reference
                </h4>
                {onClose && (
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none',
                        color: 'rgba(255, 215, 0, 0.6)', fontSize: '18px', cursor: 'pointer'
                    }}>×</button>
                )}
            </div>

            {/* Card Tabs */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
                {[
                    { key: 'hands', label: 'Hands' },
                    { key: 'odds', label: 'Pot Odds' },
                    { key: 'positions', label: 'Position' },
                    { key: 'sizing', label: 'Bet Sizing' }
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveCard(tab.key as RefCard)}
                        style={{
                            flex: 1,
                            padding: '6px',
                            background: activeCard === tab.key ? 'rgba(255, 215, 0, 0.2)' : 'transparent',
                            border: activeCard === tab.key ? '1px solid rgba(255, 215, 0, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '6px',
                            color: activeCard === tab.key ? '#FFD700' : 'rgba(255, 255, 255, 0.5)',
                            fontSize: '9px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                {activeCard === 'hands' && (
                    <div>
                        {HAND_RANKINGS.map((hand, i) => (
                            <div key={hand.name} style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '6px 8px',
                                background: i % 2 === 0 ? 'rgba(0, 0, 0, 0.2)' : 'transparent',
                                borderRadius: '4px'
                            }}>
                                <div>
                                    <div style={{ fontSize: '10px', fontWeight: 600, color: '#fff' }}>
                                        {i + 1}. {hand.name}
                                    </div>
                                    <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)' }}>
                                        {hand.example}
                                    </div>
                                </div>
                                <div style={{ fontSize: '8px', color: 'rgba(255, 215, 0, 0.7)' }}>
                                    {hand.odds}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeCard === 'odds' && (
                    <div>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr 1fr',
                            padding: '6px',
                            background: 'rgba(255, 215, 0, 0.1)',
                            borderRadius: '4px',
                            marginBottom: '6px',
                            fontSize: '9px',
                            fontWeight: 600,
                            color: '#FFD700'
                        }}>
                            <span>Bet Size</span>
                            <span>Odds</span>
                            <span>Need Equity</span>
                        </div>
                        {POT_ODDS_TABLE.map((row, i) => (
                            <div key={row.bet} style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr 1fr',
                                padding: '5px 6px',
                                background: i % 2 === 0 ? 'rgba(0, 0, 0, 0.2)' : 'transparent',
                                fontSize: '10px',
                                color: 'rgba(255, 255, 255, 0.8)'
                            }}>
                                <span>{row.bet}</span>
                                <span>{row.odds}</span>
                                <span style={{ color: '#4CAF50' }}>{row.equity}</span>
                            </div>
                        ))}
                    </div>
                )}

                {activeCard === 'positions' && (
                    <div>
                        {POSITION_ADVANTAGES.map((pos, i) => (
                            <div key={pos.pos} style={{
                                padding: '8px',
                                background: i % 2 === 0 ? 'rgba(0, 0, 0, 0.2)' : 'transparent',
                                borderRadius: '4px',
                                marginBottom: '4px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#FFD700' }}>
                                        {pos.pos}
                                    </span>
                                    <span style={{
                                        fontSize: '9px',
                                        color: pos.advantage === 'Best' ? '#4CAF50' :
                                            pos.advantage === 'Worst' ? '#f44336' : '#FF9800'
                                    }}>
                                        {pos.advantage}
                                    </span>
                                </div>
                                <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.6)' }}>
                                    {pos.notes}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeCard === 'sizing' && (
                    <div style={{ padding: '8px' }}>
                        <div style={{ marginBottom: '12px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: '#FFD700', marginBottom: '4px' }}>
                                C-Bet Sizing
                            </div>
                            <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.7)', lineHeight: 1.5 }}>
                                • Dry boards: 25-33% pot<br />
                                • Wet boards: 50-75% pot<br />
                                • Multiway: Larger sizes
                            </div>
                        </div>
                        <div style={{ marginBottom: '12px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: '#FFD700', marginBottom: '4px' }}>
                                Value Bet Sizing
                            </div>
                            <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.7)', lineHeight: 1.5 }}>
                                • Thin value: 33-50% pot<br />
                                • Strong value: 66-100% pot<br />
                                • Nutted: Overbet 125%+
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: '#FFD700', marginBottom: '4px' }}>
                                3-Bet Sizing
                            </div>
                            <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.7)', lineHeight: 1.5 }}>
                                • IP: 3x original raise<br />
                                • OOP: 3.5-4x original raise<br />
                                • vs limp: 4-5 BB
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Ask Jarvis */}
            <button
                onClick={() => askAboutTopic(activeCard === 'hands' ? 'hand rankings' :
                    activeCard === 'odds' ? 'pot odds' :
                        activeCard === 'positions' ? 'position' : 'bet sizing')}
                style={{
                    width: '100%',
                    marginTop: '12px',
                    padding: '10px',
                    background: 'rgba(255, 215, 0, 0.2)',
                    border: '1px solid rgba(255, 215, 0, 0.4)',
                    borderRadius: '8px',
                    color: '#FFD700',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer'
                }}
            >
                Ask Jarvis More About This
            </button>
        </div>
    );
}
