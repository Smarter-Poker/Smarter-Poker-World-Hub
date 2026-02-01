/* ═══════════════════════════════════════════════════════════════════════════
   PREFLOP CHARTS — Visual RFI/3bet/4bet charts by position
   Interactive grid showing open/call/raise ranges per position
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';

interface PreflopChartsProps {
    onAskJarvis: (question: string) => void;
    onClose?: () => void;
}

type ChartType = 'rfi' | '3bet' | 'vs3bet' | '4bet';

const POSITIONS = ['UTG', 'UTG+1', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

// Simplified range grids (actual GTO ranges would be more complex)
const RFI_RANGES: Record<string, string[]> = {
    'UTG': ['AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AKo', 'AQs', 'AJs'],
    'MP': ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'KQs'],
    'CO': ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'ATs', 'KQs', 'KJs', 'QJs'],
    'BTN': ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'ATs', 'A9s', 'KQs', 'KJs', 'KTs', 'QJs', 'QTs', 'JTs'],
    'SB': ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'ATs', 'KQs', 'KJs', 'QJs'],
};

const HAND_GRID = [
    ['AA', 'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s'],
    ['AKo', 'KK', 'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s', 'K4s', 'K3s', 'K2s'],
    ['AQo', 'KQo', 'QQ', 'QJs', 'QTs', 'Q9s', 'Q8s', 'Q7s', 'Q6s', 'Q5s', 'Q4s', 'Q3s', 'Q2s'],
    ['AJo', 'KJo', 'QJo', 'JJ', 'JTs', 'J9s', 'J8s', 'J7s', 'J6s', 'J5s', 'J4s', 'J3s', 'J2s'],
    ['ATo', 'KTo', 'QTo', 'JTo', 'TT', 'T9s', 'T8s', 'T7s', 'T6s', 'T5s', 'T4s', 'T3s', 'T2s'],
    ['A9o', 'K9o', 'Q9o', 'J9o', 'T9o', '99', '98s', '97s', '96s', '95s', '94s', '93s', '92s'],
    ['A8o', 'K8o', 'Q8o', 'J8o', 'T8o', '98o', '88', '87s', '86s', '85s', '84s', '83s', '82s'],
    ['A7o', 'K7o', 'Q7o', 'J7o', 'T7o', '97o', '87o', '77', '76s', '75s', '74s', '73s', '72s'],
    ['A6o', 'K6o', 'Q6o', 'J6o', 'T6o', '96o', '86o', '76o', '66', '65s', '64s', '63s', '62s'],
    ['A5o', 'K5o', 'Q5o', 'J5o', 'T5o', '95o', '85o', '75o', '65o', '55', '54s', '53s', '52s'],
    ['A4o', 'K4o', 'Q4o', 'J4o', 'T4o', '94o', '84o', '74o', '64o', '54o', '44', '43s', '42s'],
    ['A3o', 'K3o', 'Q3o', 'J3o', 'T3o', '93o', '83o', '73o', '63o', '53o', '43o', '33', '32s'],
    ['A2o', 'K2o', 'Q2o', 'J2o', 'T2o', '92o', '82o', '72o', '62o', '52o', '42o', '32o', '22']
];

export function PreflopCharts({ onAskJarvis, onClose }: PreflopChartsProps) {
    const [chartType, setChartType] = useState<ChartType>('rfi');
    const [selectedPosition, setSelectedPosition] = useState('BTN');
    const [selectedHand, setSelectedHand] = useState<string | null>(null);

    const currentRange = RFI_RANGES[selectedPosition] || [];

    const isInRange = (hand: string) => currentRange.includes(hand);
    const isSuited = (hand: string) => hand.endsWith('s');
    const isPair = (hand: string) => hand.length === 2;

    const getHandColor = (hand: string) => {
        if (isInRange(hand)) {
            if (isPair(hand)) return '#4CAF50';
            if (isSuited(hand)) return '#2196F3';
            return '#FF9800';
        }
        return 'rgba(255, 255, 255, 0.05)';
    };

    const askAboutHand = (hand: string) => {
        const question = `What is the GTO ${chartType === 'rfi' ? 'RFI' : chartType} frequency for ${hand} from ${selectedPosition}? Include the mixed frequencies if applicable.`;
        onAskJarvis(question);
    };

    return (
        <div style={{
            background: 'rgba(20, 10, 40, 0.98)',
            border: '1px solid rgba(255, 215, 0, 0.3)',
            borderRadius: '12px',
            padding: '12px',
            maxWidth: '400px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '10px'
            }}>
                <h4 style={{ margin: 0, color: '#FFD700', fontSize: '14px', fontWeight: 600 }}>
                    📊 Preflop Charts
                </h4>
                {onClose && (
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none',
                        color: 'rgba(255, 215, 0, 0.6)', fontSize: '18px', cursor: 'pointer'
                    }}>×</button>
                )}
            </div>

            {/* Chart Type Tabs */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
                {[
                    { key: 'rfi', label: 'RFI' },
                    { key: '3bet', label: '3-Bet' },
                    { key: 'vs3bet', label: 'vs 3-Bet' },
                    { key: '4bet', label: '4-Bet' }
                ].map(t => (
                    <button
                        key={t.key}
                        onClick={() => setChartType(t.key as ChartType)}
                        style={{
                            flex: 1,
                            padding: '5px',
                            background: chartType === t.key ? 'rgba(255, 215, 0, 0.2)' : 'transparent',
                            border: chartType === t.key ? '1px solid rgba(255, 215, 0, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '5px',
                            color: chartType === t.key ? '#FFD700' : 'rgba(255, 255, 255, 0.5)',
                            fontSize: '9px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Position Selector */}
            <div style={{ display: 'flex', gap: '3px', marginBottom: '10px', flexWrap: 'wrap' }}>
                {POSITIONS.map(pos => (
                    <button
                        key={pos}
                        onClick={() => setSelectedPosition(pos)}
                        style={{
                            padding: '3px 6px',
                            background: selectedPosition === pos ? '#FFD700' : 'rgba(255, 255, 255, 0.05)',
                            border: 'none',
                            borderRadius: '3px',
                            color: selectedPosition === pos ? '#000' : 'rgba(255, 255, 255, 0.6)',
                            fontSize: '9px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        {pos}
                    </button>
                ))}
            </div>

            {/* Hand Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(13, 1fr)',
                gap: '1px',
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                overflow: 'hidden',
                marginBottom: '10px'
            }}>
                {HAND_GRID.flat().map(hand => (
                    <button
                        key={hand}
                        onClick={() => {
                            setSelectedHand(hand);
                            askAboutHand(hand);
                        }}
                        style={{
                            padding: '4px 1px',
                            background: getHandColor(hand),
                            border: 'none',
                            color: isInRange(hand) ? '#fff' : 'rgba(255, 255, 255, 0.3)',
                            fontSize: '6px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.1s'
                        }}
                    >
                        {hand}
                    </button>
                ))}
            </div>

            {/* Legend */}
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '10px',
                fontSize: '8px',
                color: 'rgba(255, 255, 255, 0.6)'
            }}>
                <span><span style={{ color: '#4CAF50' }}>■</span> Pair</span>
                <span><span style={{ color: '#2196F3' }}>■</span> Suited</span>
                <span><span style={{ color: '#FF9800' }}>■</span> Offsuit</span>
            </div>

            {/* Range Info */}
            <div style={{
                marginTop: '8px',
                padding: '8px',
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '6px',
                textAlign: 'center'
            }}>
                <div style={{ fontSize: '9px', color: 'rgba(255, 215, 0, 0.7)' }}>
                    {selectedPosition} {chartType.toUpperCase()} Range
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFD700' }}>
                    {currentRange.length} combos ({((currentRange.length / 169) * 100).toFixed(1)}%)
                </div>
            </div>
        </div>
    );
}
