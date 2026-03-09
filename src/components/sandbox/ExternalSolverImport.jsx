/**
 * EXTERNAL SOLVER IMPORT (W7-1)
 * Allows users to paste raw CSV or JSON data from GTO+ or PioSolver to hydrate the Sandbox state.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';

const M = {
    bg: '#18191A', card: '#242526', border: '#3E4042',
    accent: '#4599FF', green: '#00cc6a', text: '#E4E6EB', sub: '#B0B3B8',
    purple: '#a78bfa', yellow: '#F5A623'
};

export default function ExternalSolverImport({ onClose, onImport }) {
    const [rawInput, setRawInput] = useState('');
    const [error, setError] = useState(null);

    const handleParse = () => {
        try {
            if (!rawInput.trim()) throw new Error("Please paste your solver output");

            // Basic heuristic parsing for Pio/GTO+ JSON or simple CSV strings
            // Expected mocked format: {"board": "AsKd7h", "pot": 100, "effStack": 150, "hero": "BTN", "villains": [{"position": "BB", "range": "..."}]}
            let parsedState = null;

            if (rawInput.trim().startsWith('{')) {
                // Try JSON (GTO Wizard / HandHistory parsers)
                parsedState = JSON.parse(rawInput);
            } else {
                // Mock CSV or shorthand parse (e.g. AsKd7h, BTN, 100, 150)
                const parts = rawInput.split(',').map(s => s.trim());
                if (parts.length >= 3) {
                    parsedState = {
                        board: parts[0] ? [parts[0].slice(0, 2), parts[0].slice(2, 4), parts[0].slice(4, 6)].filter(Boolean) : [],
                        heroPosition: parts[1] || 'BTN',
                        potSize: parseInt(parts[2]) || 100,
                        effStack: parseInt(parts[3]) || 100,
                        villains: [{ id: 1, position: 'BB', rangeType: 'gto-defend', locked: false }]
                    };
                } else {
                    throw new Error("Invalid CSV format. Use: Board, Position, Pot, Stack");
                }
            }

            if (!parsedState) throw new Error("Failed to parse solver data");

            onImport(parsedState);
            onClose();
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100004, padding: 16 }}
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }}
                onClick={e => e.stopPropagation()}
                style={{ background: M.card, borderRadius: 16, width: '100%', maxWidth: 500, border: `1px solid ${M.purple}`, boxShadow: '0 12px 48px rgba(167,139,250,0.3)', overflow: 'hidden' }}
            >
                <div style={{ padding: '20px', borderBottom: `1px solid ${M.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: M.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                        📥 Import Solver Data
                        <span style={{ fontSize: 10, background: M.purple, color: '#fff', padding: '2px 6px', borderRadius: 4 }}>WAVE 7 PRO</span>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: M.sub, fontSize: 18, cursor: 'pointer' }}>✕</button>
                </div>

                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {error && <div style={{ color: '#ff4444', fontSize: 13, background: 'rgba(255,68,68,0.1)', padding: '10px 12px', borderRadius: 8 }}>{error}</div>}

                    <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: M.sub, marginBottom: 8 }}>Paste PioSolver, GTO+, or HandHistory JSON/CSV</div>
                        <textarea
                            value={rawInput}
                            onChange={e => setRawInput(e.target.value)}
                            placeholder='{"board": ["As", "Kd", "7h"], "heroPosition": "BTN", ... }  OR  AsKd7h, BTN, 100, 150'
                            style={{ width: '100%', height: 160, padding: 12, background: 'rgba(0,0,0,0.3)', border: `1px solid ${M.border}`, borderRadius: 8, color: '#a78bfa', fontSize: 13, fontFamily: 'monospace', resize: 'none' }}
                            spellCheck={false}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: 12 }}>
                        <button
                            onClick={() => setRawInput('{"board": ["Kh", "Jd", "3c"], "heroPosition": "CO", "potSize": 75, "effStack": 120, "villains": [{"id": 1, "position": "BB", "rangeType": "gto-defend"}]}')}
                            style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.05)', color: M.sub, fontSize: 13, fontWeight: 700, border: `1px solid ${M.border}`, borderRadius: 8, cursor: 'pointer' }}
                        >
                            Load Example
                        </button>
                        <button
                            onClick={handleParse}
                            style={{ flex: 2, padding: '12px', background: M.purple, color: '#fff', fontSize: 14, fontWeight: 800, border: 'none', borderRadius: 8, cursor: 'pointer' }}
                        >
                            Hydrate Sandbox Node
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}
