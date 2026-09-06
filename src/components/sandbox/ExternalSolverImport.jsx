/**
 * NATIVE SOLVER IMPORT
 * ═══════════════════════════════════════════════════════════════════════════
 * Reads bounded PioSolver labelled node exports, GTO+ tabular CSV exports,
 * and the Sandbox scenario JSON contract. Binary solver trees are rejected
 * with an exact recovery instruction instead of being misread as text.
 */
import React, { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { FileCode, Check, AlertTriangle, Upload } from 'lucide-react';
import { T, F, S, R, btn, pill } from './paTokens';
import { BottomSheet, PAStyles } from './paKit';
import { parseNativeSolverImport } from '../../lib/sandbox/nativeSolverImport.mjs';

const EXAMPLE = `PioSOLVER
Board: Kh Jd 3c
Pot: 75
Effective Stack: 120
Hero Position: CO
Villain Position: BB
Villain Range: AA,KK,QQ,AKs`;

export default function ExternalSolverImport({ onClose, onImport }) {
    const [rawInput, setRawInput] = useState('');
    const [fileName, setFileName] = useState('');
    const [error, setError] = useState(null);
    const [preview, setPreview] = useState(null);

    const handleParse = useCallback(() => {
        setError(null);
        try {
            if (!rawInput.trim()) throw new Error('Paste A Scenario First.');

            setPreview(parseNativeSolverImport(rawInput, { fileName }));
        } catch (err) {
            console.warn('[ScenarioImport] Parsing error:', err);
            setPreview(null);
            setError(err.message || 'That Scenario Could Not Be Read.');
        }
    }, [fileName, rawInput]);

    const handleFile = useCallback(async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setError(null);
        setPreview(null);
        if (file.size > 2 * 1024 * 1024) {
            setError('Solver Export Must Be No Larger Than 2 MB.');
            return;
        }
        try {
            setRawInput(await file.text());
            setFileName(file.name);
        } catch {
            setError('Solver Export Could Not Be Read.');
        }
    }, []);

    const handleConfirm = useCallback(() => {
        if (!preview?.state) return;
        onImport?.(preview.state);
        toast.success('Solver Scenario Loaded · Use Undo At The Table To Revert');
        onClose?.();
    }, [preview, onImport, onClose]);

    const boardText = preview?.state?.board
        ? [...(preview.state.board.flop || []), preview.state.board.turn, preview.state.board.river].filter(Boolean).join(' ') || 'Preflop'
        : '';

    return (
        <BottomSheet
            open
            onClose={onClose}
            title="Import Solver Scenario"
            titleIcon={<FileCode size={18} strokeWidth={2} color={T.purple} />}
            subtitle="Load A PioSolver, GTO+, Or Smarter.Poker Node Export."
            ariaLabel="Import Native Solver Scenario"
            footer={preview ? (
                <>
                    <button type="button" className="pa-btn" onClick={() => setPreview(null)} style={{ ...btn('secondary'), padding: '0 14px' }}>
                        Back
                    </button>
                    <button type="button" className="pa-btn" onClick={handleConfirm} style={{ ...btn('primary'), flex: 1 }}>
                        <Check size={18} strokeWidth={2} /> Load Scenario
                    </button>
                </>
            ) : (
                <button type="button" className="pa-btn" onClick={handleParse} style={{ ...btn('primary', { block: true }) }}>
                    Check Scenario
                </button>
            )}
        >
            <PAStyles />

            {preview ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
                    <span style={pill('success')}><Check size={12} strokeWidth={3} /> Ready To Load</span>
                    <div style={{
                        background: T.surface2, border: `1px solid ${T.border}`, borderRadius: R.sm,
                        padding: S.md, display: 'flex', flexDirection: 'column', gap: S.sm,
                    }}>
                        {[
                            ['Board', boardText],
                            ['Hero Position', preview.state.heroPosition],
                            ['Pot', `${preview.state.potSize}`],
                            ['Effective Stack', `${preview.state.effStack}`],
                            ['Villains', preview.state.villains.map(v => v.position).join(', ')],
                        ].map(([label, value]) => (
                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: S.md, fontSize: F.bodySm }}>
                                <span style={{ color: T.textMuted }}>{label}</span>
                                <span style={{ color: T.text, fontWeight: 700, textAlign: 'right', minWidth: 0 }}>{value}</span>
                            </div>
                        ))}
                    </div>

                    {preview.warnings.length > 0 && (
                        <div style={{
                            background: T.warnSoft, border: '1px solid rgba(255,198,109,0.4)',
                            borderRadius: R.sm, padding: S.md,
                        }}>
                            <div style={{ fontSize: F.bodySm, fontWeight: 700, color: T.warn, marginBottom: S.xs }}>
                                Import Notes
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 18, color: T.textMuted, fontSize: F.caption, lineHeight: 1.5 }}>
                                {preview.warnings.map(d => <li key={d}>{d}</li>)}
                            </ul>
                        </div>
                    )}

                    <p style={{ fontSize: F.caption, color: T.textDim, margin: 0, lineHeight: 1.45 }}>
                        {preview.provider} Import Verified. Loading Replaces The Board, Hero Position, Pot, Stack And Every Villain Seat. The Sandbox
                        Keeps An Undo Step.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
                    {error && (
                        <div
                            role="alert"
                            style={{
                                display: 'flex', gap: S.sm, alignItems: 'flex-start',
                                background: T.dangerSoft, border: '1px solid rgba(255,107,122,0.4)',
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
                            Native Formats
                        </div>
                        <pre data-pa-verbatim="true" style={{
                            margin: 0, fontSize: F.caption, color: T.purple, lineHeight: 1.5,
                            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        }}>
{`PioSolver  Labelled Node Text Or .pio Text Export
GTO+       Header-Based CSV Export
JSON       Smarter.Poker Scenario Contract

Required: Board, Hero Position, Villain Position,
Pot, And Effective Stack. No Missing Value Is Invented.`}
                        </pre>
                    </div>

                    <label htmlFor="esi-file" className="pa-btn" style={{ ...btn('secondary', { block: true }), cursor: 'pointer' }}>
                        <Upload size={18} strokeWidth={2} aria-hidden="true" />Choose Solver Export
                    </label>
                    <input id="esi-file" className="pa-vh" type="file" accept=".json,.csv,.txt,.pio" onChange={handleFile} />
                    {fileName && <span data-pa-verbatim="true" style={{ fontSize: F.caption, color: T.textMuted }}>{fileName}</span>}

                    <label htmlFor="esi-input" className="pa-vh">Solver Export Text</label>
                    <textarea
                        id="esi-input"
                        data-pa-verbatim="true"
                        value={rawInput}
                        onChange={e => { setRawInput(e.target.value); setError(null); }}
                        placeholder="Paste PioSolver Text, GTO+ CSV, Or Scenario JSON"
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
                        onClick={() => { setRawInput(EXAMPLE); setFileName('example.pio'); setError(null); }}
                        style={{ ...btn('secondary'), fontSize: F.label, padding: '0 14px', alignSelf: 'flex-start' }}
                    >
                        Load Example
                    </button>
                </div>
            )}
        </BottomSheet>
    );
}
