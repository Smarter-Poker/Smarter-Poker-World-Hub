/**
 * SCENARIO IMPORT — JSON / CSV (W7-1)
 * ═══════════════════════════════════════════════════════════════════════════
 * Honest retitle: this parser accepts the sandbox's own scenario JSON or a
 * four-field CSV line. It does NOT read native PioSolver or GTO+ exports, and
 * the old label promising that produced "Unrecognised card code" for anyone who
 * tried. The accepted schema is now shown inline above the input.
 *
 * The parse result is previewed (board, position, pot, stack, seats and any
 * defaults that had to be applied) before anything overwrites the table.
 */
import React, { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { FileCode, Check, AlertTriangle } from 'lucide-react';
import { T, F, S, R, btn, pill } from './paTokens';
import { BottomSheet, PAStyles } from './paKit';

const CARD_RE = /^[2-9TJQKA][cdhs]$/;
const POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
const DEFAULT_ARCHETYPE = { id: 'gto_neutral', name: 'GTO Neutral' };

const EXAMPLE = '{"board": ["Kh", "Jd", "3c"], "heroPosition": "CO", "potSize": 75, "effStack": 120, "villains": [{"position": "BB", "range": "AA,KK,QQ,AKs"}]}';

/** Pulls up to 5 valid card codes out of an array or a concatenated string. */
function parseCards(input) {
    let tokens = [];
    if (Array.isArray(input)) {
        tokens = input.map(c => String(c).trim());
    } else if (typeof input === 'string') {
        tokens = input.trim().replace(/[\s,]+/g, '').match(/.{1,2}/g) || [];
    }
    const cards = [];
    for (const raw of tokens) {
        if (!raw) continue;
        const card = raw[0].toUpperCase() + raw.slice(1).toLowerCase();
        if (!CARD_RE.test(card)) throw new Error(`Unrecognised card code: "${raw}". Use two characters like "Kh".`);
        if (cards.includes(card)) throw new Error(`Duplicate card: "${card}"`);
        cards.push(card);
        if (cards.length === 5) break;
    }
    return cards;
}

/** Normalises anything board-shaped into the sandbox { flop, turn, river }. */
function toBoardObject(board) {
    if (board && !Array.isArray(board) && typeof board === 'object') {
        const flop = parseCards(board.flop || []);
        const rest = parseCards([board.turn, board.river].filter(Boolean));
        return { flop: flop.slice(0, 3), turn: rest[0] || null, river: rest[1] || null };
    }
    const cards = parseCards(board || []);
    if (cards.length && cards.length < 3) throw new Error('A board needs at least 3 cards.');
    return { flop: cards.slice(0, 3), turn: cards[3] || null, river: cards[4] || null };
}

function toVillains(list) {
    const arr = Array.isArray(list) && list.length ? list : [{ position: 'BB' }];
    return arr.slice(0, 5).map((v, i) => ({
        id: v?.id ?? i + 1,
        position: POSITIONS.includes(String(v?.position || '').toUpperCase())
            ? String(v.position).toUpperCase()
            : 'BB',
        range: typeof v?.range === 'string' ? v.range : '',
        archetype: (v?.archetype && v.archetype.id) ? v.archetype : DEFAULT_ARCHETYPE,
        stack: Number(v?.stack) > 0 ? Number(v.stack) : 100,
    }));
}

export default function ExternalSolverImport({ onClose, onImport }) {
    const [rawInput, setRawInput] = useState('');
    const [error, setError] = useState(null);
    const [preview, setPreview] = useState(null); // { state, defaults: string[] }

    const handleParse = useCallback(() => {
        setError(null);
        try {
            if (!rawInput.trim()) throw new Error('Paste a scenario first.');

            const defaults = [];
            let raw = null;

            if (rawInput.trim().startsWith('{')) {
                try {
                    raw = JSON.parse(rawInput);
                } catch (e) {
                    throw new Error('That JSON could not be parsed — check for a trailing comma or a missing quote.');
                }
            } else {
                // CSV: Board, Position, Pot, Stack — stack is optional but the
                // old code read parts[3] after only requiring three fields and
                // silently substituted 100bb.
                const parts = rawInput.split(',').map(s => s.trim()).filter(Boolean);
                if (parts.length < 3) {
                    throw new Error('CSV needs at least: Board, Position, Pot (Stack optional). Example: AsKd7h, BTN, 75, 120');
                }
                if (parts.length < 4) defaults.push('Effective stack defaulted to 100 BB');
                raw = {
                    board: parts[0] || '',
                    heroPosition: parts[1] || 'BTN',
                    potSize: parseInt(parts[2], 10),
                    effStack: parts.length >= 4 ? parseInt(parts[3], 10) : NaN,
                    villains: [{ id: 1, position: 'BB' }],
                };
            }

            if (!raw || typeof raw !== 'object') throw new Error('That input did not contain a scenario object.');

            const heroPositionRaw = String(raw.heroPosition || raw.hero || 'BTN').toUpperCase();
            if (!POSITIONS.includes(heroPositionRaw)) defaults.push('Hero position defaulted to BTN');

            const potSize = Number(raw.potSize ?? raw.pot);
            if (!Number.isFinite(potSize) || potSize <= 0) defaults.push('Pot defaulted to 100');

            const effStack = Number(raw.effStack ?? raw.stack);
            if (!Number.isFinite(effStack) || effStack <= 0) {
                if (!defaults.includes('Effective stack defaulted to 100 BB')) defaults.push('Effective stack defaulted to 100 BB');
            }

            if (!Array.isArray(raw.villains) || raw.villains.length === 0) defaults.push('One BB villain added');

            const state = {
                board: toBoardObject(raw.board),
                heroPosition: POSITIONS.includes(heroPositionRaw) ? heroPositionRaw : 'BTN',
                potSize: Number.isFinite(potSize) && potSize > 0 ? potSize : 100,
                effStack: Number.isFinite(effStack) && effStack > 0 ? effStack : 100,
                villains: toVillains(raw.villains),
            };

            setPreview({ state, defaults });
        } catch (err) {
            console.warn('[ScenarioImport] Parsing error:', err);
            setPreview(null);
            setError(err.message || 'That scenario could not be read.');
        }
    }, [rawInput]);

    const handleConfirm = useCallback(() => {
        if (!preview?.state) return;
        onImport?.(preview.state);
        toast.success('Scenario loaded — use undo at the table to revert');
        onClose?.();
    }, [preview, onImport, onClose]);

    const boardText = preview?.state?.board
        ? [...(preview.state.board.flop || []), preview.state.board.turn, preview.state.board.river].filter(Boolean).join(' ') || 'Preflop'
        : '';

    return (
        <BottomSheet
            open
            onClose={onClose}
            title="Import scenario"
            titleIcon={<FileCode size={18} strokeWidth={2} color={T.purple} />}
            subtitle="Paste sandbox scenario JSON or a CSV line."
            ariaLabel="Import scenario JSON or CSV"
            footer={preview ? (
                <>
                    <button type="button" className="pa-btn" onClick={() => setPreview(null)} style={{ ...btn('secondary'), padding: '0 14px' }}>
                        Back
                    </button>
                    <button type="button" className="pa-btn" onClick={handleConfirm} style={{ ...btn('primary'), flex: 1 }}>
                        <Check size={18} strokeWidth={2} /> Load scenario
                    </button>
                </>
            ) : (
                <button type="button" className="pa-btn" onClick={handleParse} style={{ ...btn('primary', { block: true }) }}>
                    Check scenario
                </button>
            )}
        >
            <PAStyles />

            {preview ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
                    <span style={pill('success')}><Check size={12} strokeWidth={3} /> Ready to load</span>
                    <div style={{
                        background: T.surface2, border: `1px solid ${T.border}`, borderRadius: R.sm,
                        padding: S.md, display: 'flex', flexDirection: 'column', gap: S.sm,
                    }}>
                        {[
                            ['Board', boardText],
                            ['Hero position', preview.state.heroPosition],
                            ['Pot', `${preview.state.potSize}`],
                            ['Effective stack', `${preview.state.effStack}`],
                            ['Villains', preview.state.villains.map(v => v.position).join(', ')],
                        ].map(([label, value]) => (
                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: S.md, fontSize: F.bodySm }}>
                                <span style={{ color: T.textMuted }}>{label}</span>
                                <span style={{ color: T.text, fontWeight: 700, textAlign: 'right', minWidth: 0 }}>{value}</span>
                            </div>
                        ))}
                    </div>

                    {preview.defaults.length > 0 && (
                        <div style={{
                            background: T.warnSoft, border: '1px solid rgba(251,191,36,0.4)',
                            borderRadius: R.sm, padding: S.md,
                        }}>
                            <div style={{ fontSize: F.bodySm, fontWeight: 700, color: T.warn, marginBottom: S.xs }}>
                                Defaults applied
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 18, color: T.textMuted, fontSize: F.caption, lineHeight: 1.5 }}>
                                {preview.defaults.map(d => <li key={d}>{d}</li>)}
                            </ul>
                        </div>
                    )}

                    <p style={{ fontSize: F.caption, color: T.textDim, margin: 0, lineHeight: 1.45 }}>
                        Loading replaces the board, hero position, pot, stack and every villain seat. The sandbox
                        keeps an undo step.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
                    {error && (
                        <div
                            role="alert"
                            style={{
                                display: 'flex', gap: S.sm, alignItems: 'flex-start',
                                background: T.dangerSoft, border: '1px solid rgba(239,68,68,0.4)',
                                borderRadius: R.sm, padding: S.md,
                            }}
                        >
                            <AlertTriangle size={18} strokeWidth={2} color={T.danger} style={{ flexShrink: 0 }} />
                            <span style={{ fontSize: F.bodySm, fontWeight: 700, color: T.danger, minWidth: 0 }}>{error}</span>
                        </div>
                    )}

                    <div style={{
                        background: T.surface2, border: `1px solid ${T.border}`, borderRadius: R.sm, padding: S.md,
                    }}>
                        <div style={{ fontSize: F.label, fontWeight: 700, color: T.textMuted, marginBottom: S.xs }}>
                            Accepted formats
                        </div>
                        <pre style={{
                            margin: 0, fontSize: F.caption, color: T.purple, lineHeight: 1.5,
                            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        }}>
{`JSON  {"board":["Kh","Jd","3c"],"heroPosition":"CO",
       "potSize":75,"effStack":120,
       "villains":[{"position":"BB","range":"AA,KK"}]}

CSV   Board, Position, Pot, Stack
      AsKd7h, BTN, 75, 120`}
                        </pre>
                    </div>

                    <label htmlFor="esi-input" className="pa-vh">Scenario JSON or CSV</label>
                    <textarea
                        id="esi-input"
                        value={rawInput}
                        onChange={e => { setRawInput(e.target.value); setError(null); }}
                        placeholder='{"board": ["As", "Kd", "7h"], "heroPosition": "BTN" … }  or  AsKd7h, BTN, 75, 120'
                        spellCheck={false}
                        style={{
                            width: '100%', minHeight: 148, padding: S.md, boxSizing: 'border-box',
                            background: T.bg, border: `1px solid ${T.borderHi}`, borderRadius: R.sm,
                            color: T.text, fontSize: F.input, lineHeight: 1.45, resize: 'vertical',
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        }}
                    />

                    <button
                        type="button"
                        className="pa-btn"
                        onClick={() => { setRawInput(EXAMPLE); setError(null); }}
                        style={{ ...btn('secondary'), fontSize: F.label, padding: '0 14px', alignSelf: 'flex-start' }}
                    >
                        Load example
                    </button>
                </div>
            )}
        </BottomSheet>
    );
}
