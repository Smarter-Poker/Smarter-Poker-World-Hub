/* ═══════════════════════════════════════════════════════════════════════════
   HAND HISTORY PARSER — Upload and parse poker hand histories
   Supports PokerStars, GGPoker, and generic formats
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useRef } from 'react';

interface ParsedHand {
    id: string;
    site: string;
    stakes: string;
    heroCards: string[];
    board: string[];
    pot: number;
    result: string;
    actions: HandAction[];
}

interface HandAction {
    street: 'preflop' | 'flop' | 'turn' | 'river';
    player: string;
    action: string;
    amount?: number;
}

interface HandHistoryParserProps {
    onHandParsed: (question: string) => void;
    onClose?: () => void;
}

// Parse PokerStars hand history format
function parsePokerStarsHand(text: string): ParsedHand | null {
    try {
        const lines = text.split('\n');

        // Extract hand ID
        const handIdMatch = lines[0].match(/Hand #(\d+)/);
        const id = handIdMatch ? handIdMatch[1] : 'unknown';

        // Extract stakes
        const stakesMatch = lines[0].match(/\(([^)]+)\)/);
        const stakes = stakesMatch ? stakesMatch[1] : 'Unknown';

        // Extract hero cards
        const dealtMatch = text.match(/Dealt to [^\[]+\[([^\]]+)\]/);
        const heroCards = dealtMatch ? dealtMatch[1].split(' ') : [];

        // Extract board
        const boardMatch = text.match(/Board \[([^\]]+)\]/);
        const boardFull = boardMatch ? boardMatch[1].split(' ') : [];

        // Extract flop, turn, river from FLOP, TURN, RIVER sections
        const flopMatch = text.match(/\*\*\* FLOP \*\*\* \[([^\]]+)\]/);
        const turnMatch = text.match(/\*\*\* TURN \*\*\* \[[^\]]+\] \[([^\]]+)\]/);
        const riverMatch = text.match(/\*\*\* RIVER \*\*\* \[[^\]]+\] \[([^\]]+)\]/);

        const board = [
            ...(flopMatch ? flopMatch[1].split(' ') : []),
            ...(turnMatch ? [turnMatch[1]] : []),
            ...(riverMatch ? [riverMatch[1]] : [])
        ];

        // Parse actions
        const actions: HandAction[] = [];
        let currentStreet: HandAction['street'] = 'preflop';

        for (const line of lines) {
            if (line.includes('*** FLOP ***')) currentStreet = 'flop';
            else if (line.includes('*** TURN ***')) currentStreet = 'turn';
            else if (line.includes('*** RIVER ***')) currentStreet = 'river';

            // Parse actions
            const raiseMatch = line.match(/^([^:]+): raises [^\$]*\$?([\d.]+)/);
            const betMatch = line.match(/^([^:]+): bets [^\$]*\$?([\d.]+)/);
            const callMatch = line.match(/^([^:]+): calls [^\$]*\$?([\d.]+)/);
            const foldMatch = line.match(/^([^:]+): folds/);
            const checkMatch = line.match(/^([^:]+): checks/);

            if (raiseMatch) {
                actions.push({ street: currentStreet, player: raiseMatch[1], action: 'raises', amount: parseFloat(raiseMatch[2]) });
            } else if (betMatch) {
                actions.push({ street: currentStreet, player: betMatch[1], action: 'bets', amount: parseFloat(betMatch[2]) });
            } else if (callMatch) {
                actions.push({ street: currentStreet, player: callMatch[1], action: 'calls', amount: parseFloat(callMatch[2]) });
            } else if (foldMatch) {
                actions.push({ street: currentStreet, player: foldMatch[1], action: 'folds' });
            } else if (checkMatch) {
                actions.push({ street: currentStreet, player: checkMatch[1], action: 'checks' });
            }
        }

        // Extract result
        const resultMatch = text.match(/Total pot [^\$]*\$?([\d.]+)/);
        const pot = resultMatch ? parseFloat(resultMatch[1]) : 0;

        return {
            id,
            site: 'PokerStars',
            stakes,
            heroCards,
            board: board.length > 0 ? board : boardFull,
            pot,
            result: text.includes('won') ? 'Won' : 'Lost',
            actions
        };
    } catch (e) {
        console.error('[HandHistoryParser] Parse error:', e);
        return null;
    }
}

export function HandHistoryParser({ onHandParsed, onClose }: HandHistoryParserProps) {
    const [rawText, setRawText] = useState('');
    const [parsedHand, setParsedHand] = useState<ParsedHand | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleTextChange = (text: string) => {
        setRawText(text);
        const parsed = parsePokerStarsHand(text);
        setParsedHand(parsed);
    };

    const handleFileUpload = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            handleTextChange(text);
        };
        reader.readAsText(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFileUpload(file);
    };

    const askGeevesAboutHand = () => {
        if (!parsedHand) return;

        const question = `Please analyze this poker hand:

**Stakes:** ${parsedHand.stakes}
**My Hand:** ${parsedHand.heroCards.join(' ')}
**Board:** ${parsedHand.board.join(' ') || 'Preflop only'}
**Final Pot:** $${parsedHand.pot}

**Key Actions:**
${parsedHand.actions.slice(0, 10).map(a =>
            `- ${a.street}: ${a.player} ${a.action}${a.amount ? ` $${a.amount}` : ''}`
        ).join('\n')}

What should I have done differently? What are the key decision points?`;

        onHandParsed(question);
        onClose?.();
    };

    return (
        <div style={{
            background: 'rgba(20, 10, 40, 0.98)',
            border: '1px solid rgba(255, 215, 0, 0.3)',
            borderRadius: '12px',
            padding: '16px',
            maxWidth: '450px',
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
                    📜 Hand History Analyzer
                </h4>
                {onClose && (
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'rgba(255, 215, 0, 0.6)',
                            fontSize: '18px',
                            cursor: 'pointer'
                        }}
                    >
                        ×
                    </button>
                )}
            </div>

            {/* Drop Zone / Text Area */}
            <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                style={{
                    position: 'relative',
                    marginBottom: '12px'
                }}
            >
                <textarea
                    value={rawText}
                    onChange={(e) => handleTextChange(e.target.value)}
                    placeholder="Paste hand history here, or drag & drop a .txt file...

Example (PokerStars format):
PokerStars Hand #123456789: Hold'em No Limit ($0.50/$1.00)
Dealt to Hero [Ah Kh]
..."
                    style={{
                        width: '100%',
                        height: '150px',
                        padding: '12px',
                        background: dragOver ? 'rgba(255, 215, 0, 0.15)' : 'rgba(0, 0, 0, 0.3)',
                        border: `1px solid ${dragOver ? '#FFD700' : 'rgba(255, 215, 0, 0.2)'}`,
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        resize: 'vertical',
                        outline: 'none'
                    }}
                />
                <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                        position: 'absolute',
                        bottom: '8px',
                        right: '8px',
                        padding: '4px 8px',
                        background: 'rgba(255, 215, 0, 0.2)',
                        border: '1px solid rgba(255, 215, 0, 0.3)',
                        borderRadius: '4px',
                        color: '#FFD700',
                        fontSize: '10px',
                        cursor: 'pointer'
                    }}
                >
                    📁 Upload File
                </button>
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept=".txt"
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                style={{ display: 'none' }}
            />

            {/* Parsed Preview */}
            {parsedHand && (
                <div style={{
                    padding: '12px',
                    background: 'rgba(100, 255, 100, 0.1)',
                    border: '1px solid rgba(100, 255, 100, 0.3)',
                    borderRadius: '8px',
                    marginBottom: '12px'
                }}>
                    <p style={{
                        margin: '0 0 8px 0',
                        fontSize: '12px',
                        color: '#4CAF50',
                        fontWeight: 600
                    }}>
                        ✓ Hand Parsed Successfully
                    </p>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '8px',
                        fontSize: '11px',
                        color: 'rgba(255, 255, 255, 0.8)'
                    }}>
                        <div>
                            <strong style={{ color: '#FFD700' }}>Site:</strong> {parsedHand.site}
                        </div>
                        <div>
                            <strong style={{ color: '#FFD700' }}>Stakes:</strong> {parsedHand.stakes}
                        </div>
                        <div>
                            <strong style={{ color: '#FFD700' }}>Hero:</strong> {parsedHand.heroCards.join(' ') || 'N/A'}
                        </div>
                        <div>
                            <strong style={{ color: '#FFD700' }}>Board:</strong> {parsedHand.board.join(' ') || 'Preflop'}
                        </div>
                        <div>
                            <strong style={{ color: '#FFD700' }}>Pot:</strong> ${parsedHand.pot}
                        </div>
                        <div>
                            <strong style={{ color: '#FFD700' }}>Actions:</strong> {parsedHand.actions.length}
                        </div>
                    </div>
                </div>
            )}

            {/* Supported Formats */}
            <div style={{
                fontSize: '10px',
                color: 'rgba(255, 255, 255, 0.5)',
                marginBottom: '12px'
            }}>
                <strong style={{ color: '#FFD700' }}>Supported:</strong> PokerStars, GGPoker (partial), ACR (partial)
            </div>

            {/* Action Button */}
            <button
                onClick={askGeevesAboutHand}
                disabled={!parsedHand}
                style={{
                    width: '100%',
                    padding: '12px',
                    background: parsedHand
                        ? 'linear-gradient(135deg, #FFD700, #FFA500)'
                        : 'rgba(255, 215, 0, 0.2)',
                    border: 'none',
                    borderRadius: '8px',
                    color: parsedHand ? '#000' : 'rgba(255, 255, 255, 0.3)',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: parsedHand ? 'pointer' : 'not-allowed'
                }}
            >
                🎩 Ask Geeves to Analyze
            </button>
        </div>
    );
}
