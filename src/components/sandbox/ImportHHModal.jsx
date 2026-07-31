/**
 * IMPORT HAND HISTORY (W8-1)
 * ═══════════════════════════════════════════════════════════════════════════
 * Paste a raw hand history and hydrate the sandbox from it.
 *
 * Changes that matter on a phone:
 *   • bottom sheet with a sticky action row — the old centred dialog put the
 *     textarea and the button under the on-screen keyboard
 *   • 16px textarea (anything smaller triggers the iOS zoom that never undoes)
 *   • the parse result is previewed and applied on an explicit tap, replacing
 *     the uncancelled setTimeout(800) that could fire after unmount
 *   • real diagnostics: detected format, what was found, what was missing
 */
import React, { useState, useCallback, useMemo } from 'react';
import { Download, Clipboard, FileText, AlertTriangle, Check } from 'lucide-react';
import { parseHandHistory } from '../../lib/sandbox/HandHistoryParser';
import { T, F, S, R, btn, pill } from './paTokens';
import { BottomSheet, PAStyles } from './paKit';

const SAMPLE = `PokerStars Hand #241489066746: Hold'em No Limit ($1/$2 USD) - 2024/01/05 20:14:02 ET
Table 'Aludra II' 6-max Seat #3 is the button
Seat 1: Hero ($214.50 in chips)
Seat 2: Villain1 ($200 in chips)
Seat 3: Villain2 ($318.20 in chips)
Villain1: posts small blind $1
Villain2: posts big blind $2
*** HOLE CARDS ***
Dealt to Hero [Ah Kd]
Hero: raises $4 to $6
Villain1: calls $5
Villain2: folds
*** FLOP *** [Kh 7c 2d]
Villain1: checks
Hero: bets $7`;

/** The parser auto-detects internally; mirror its checks so we can report it. */
function detectSite(text) {
    if (/PokerStars/i.test(text)) return 'PokerStars';
    if (/GGPoker|GG Network|Poker Hand #/i.test(text)) return 'GGPoker';
    if (/888poker|Pacific Poker/i.test(text)) return '888poker';
    if (/Ignition|Bovada|Bodog/i.test(text)) return 'Ignition (generic layout)';
    return 'Generic / unknown layout';
}

export default function ImportHHModal({ isVisible, onClose, onImport }) {
    const [hhText, setHHText] = useState('');
    const [parsed, setParsed] = useState(null);
    const [status, setStatus] = useState(null); // { type:'error'|'info', msg }

    const detected = useMemo(() => (hhText.trim() ? detectSite(hhText) : null), [hhText]);

    const reset = useCallback(() => {
        setParsed(null);
        setStatus(null);
    }, []);

    const handleParse = useCallback(() => {
        if (!hhText.trim()) {
            setStatus({ type: 'error', msg: 'Paste a hand history first.' });
            return;
        }
        try {
            const result = parseHandHistory(hhText);
            if (result?.success && result.heroHand) {
                setParsed(result);
                setStatus(null);
                try { navigator.vibrate?.(10); } catch (e) { /* noop */ }
            } else {
                setParsed(null);
                setStatus({
                    type: 'error',
                    msg: result?.error || 'Could not detect a supported hand history format.',
                });
            }
        } catch (e) {
            console.warn('[ImportHHModal] parse error:', e?.message || e);
            setParsed(null);
            setStatus({ type: 'error', msg: 'That hand history could not be parsed.' });
        }
    }, [hhText]);

    const handleApply = useCallback(() => {
        if (!parsed) return;
        onImport?.(parsed);
        setHHText('');
        reset();
        onClose?.();
    }, [parsed, onImport, onClose, reset]);

    const pasteFromClipboard = useCallback(async () => {
        if (typeof navigator?.clipboard?.readText !== 'function') {
            setStatus({ type: 'error', msg: 'This browser will not let a page read the clipboard — paste with a long-press instead.' });
            return;
        }
        try {
            const text = await navigator.clipboard.readText();
            if (!text) {
                setStatus({ type: 'error', msg: 'The clipboard is empty.' });
                return;
            }
            setHHText(text);
            reset();
        } catch (e) {
            console.warn('[ImportHHModal] clipboard read blocked:', e?.message || e);
            setStatus({ type: 'error', msg: 'Clipboard access was denied — paste with a long-press instead.' });
        }
    }, [reset]);

    const boardPreview = useMemo(() => {
        if (!parsed?.board) return null;
        return Array.isArray(parsed.board)
            ? parsed.board.filter(Boolean).join(' ')
            : [...(parsed.board.flop || []), parsed.board.turn, parsed.board.river].filter(Boolean).join(' ');
    }, [parsed]);

    return (
        <BottomSheet
            open={!!isVisible}
            onClose={onClose}
            title="Import hand history"
            titleIcon={<Download size={18} strokeWidth={2} color={T.accent} />}
            subtitle="Paste from PokerStars, GGPoker, 888 or Ignition."
            ariaLabel="Import hand history"
            closeLabel="Close import"
            footer={parsed ? (
                <>
                    <button type="button" className="pa-btn" onClick={reset} style={{ ...btn('secondary'), padding: '0 14px' }}>
                        Back
                    </button>
                    <button type="button" className="pa-btn" onClick={handleApply} style={{ ...btn('primary'), flex: 1 }}>
                        <Check size={18} strokeWidth={2} /> Load into sandbox
                    </button>
                </>
            ) : (
                <button type="button" className="pa-btn" onClick={handleParse} style={{ ...btn('primary', { block: true }) }}>
                    Check hand history
                </button>
            )}
        >
            <PAStyles />

            <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
                {parsed ? (
                    /* ── parsed preview ─────────────────────────────────── */
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: S.sm, flexWrap: 'wrap' }}>
                            <span style={pill('success')}><Check size={12} strokeWidth={3} /> Parsed</span>
                            {detected && <span style={pill('neutral')}>{detected}</span>}
                        </div>
                        <div style={{
                            background: T.surface2, border: `1px solid ${T.border}`, borderRadius: R.sm,
                            padding: S.md, display: 'flex', flexDirection: 'column', gap: S.sm,
                        }}>
                            {[
                                ['Hero hand', parsed.heroHand ? `${parsed.heroHand.card1 || ''} ${parsed.heroHand.card2 || ''}`.trim() : '—'],
                                ['Position', parsed.heroPosition || 'not detected'],
                                ['Stack', parsed.heroStack != null ? `${parsed.heroStack} BB` : 'defaulting to 100 BB'],
                                ['Board', boardPreview || 'preflop'],
                                ['Villains', parsed.villains?.length ? `${parsed.villains.length} seat${parsed.villains.length === 1 ? '' : 's'}` : 'one default seat'],
                                ['Actions', parsed.actionHistory?.length ? `${parsed.actionHistory.length} logged` : 'none detected'],
                            ].map(([label, value]) => (
                                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: S.md, fontSize: F.bodySm }}>
                                    <span style={{ color: T.textMuted }}>{label}</span>
                                    <span style={{ color: T.text, fontWeight: 700, textAlign: 'right', minWidth: 0 }}>{value}</span>
                                </div>
                            ))}
                        </div>
                        <p style={{ fontSize: F.caption, color: T.textDim, margin: 0, lineHeight: 1.45 }}>
                            Loading replaces the current table setup. The sandbox keeps an undo step, so you can back out.
                        </p>
                    </>
                ) : (
                    /* ── paste step ─────────────────────────────────────── */
                    <>
                        <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                className="pa-btn"
                                onClick={pasteFromClipboard}
                                style={{ ...btn('secondary'), fontSize: F.label, padding: '0 14px' }}
                            >
                                <Clipboard size={18} strokeWidth={2} /> Paste
                            </button>
                            <button
                                type="button"
                                className="pa-btn"
                                onClick={() => { setHHText(SAMPLE); reset(); }}
                                style={{ ...btn('ghost'), fontSize: F.label, padding: '0 12px', color: T.accent }}
                            >
                                <FileText size={18} strokeWidth={2} /> Load sample
                            </button>
                        </div>

                        <label htmlFor="hh-text" className="pa-vh">Hand history text</label>
                        <textarea
                            id="hh-text"
                            value={hhText}
                            onChange={(e) => { setHHText(e.target.value); reset(); }}
                            placeholder="PokerStars Hand #241489066746: Hold'em No Limit ($1/$2 USD)…"
                            style={{
                                width: '100%', minHeight: 168, padding: S.md, borderRadius: R.sm,
                                fontSize: F.input, lineHeight: 1.45, boxSizing: 'border-box',
                                background: T.bg, border: `1px solid ${T.borderHi}`, color: T.text,
                                resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                            }}
                        />

                        {detected && (
                            <div style={{ fontSize: F.caption, color: T.textMuted }}>
                                Detected format: <strong style={{ color: T.text }}>{detected}</strong>
                            </div>
                        )}

                        {status?.type === 'error' && (
                            <div
                                role="alert"
                                style={{
                                    display: 'flex', gap: S.sm, alignItems: 'flex-start',
                                    background: T.dangerSoft, border: '1px solid rgba(239,68,68,0.4)',
                                    borderRadius: R.sm, padding: S.md,
                                }}
                            >
                                <AlertTriangle size={18} strokeWidth={2} color={T.danger} style={{ flexShrink: 0 }} />
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: F.bodySm, fontWeight: 700, color: T.danger }}>{status.msg}</div>
                                    <div style={{ fontSize: F.caption, color: T.textMuted, marginTop: S.xs, lineHeight: 1.45 }}>
                                        Include the header line, the “Dealt to” line with your hole cards, and any board
                                        rows. Summary-only exports do not carry enough to rebuild the spot.
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </BottomSheet>
    );
}
