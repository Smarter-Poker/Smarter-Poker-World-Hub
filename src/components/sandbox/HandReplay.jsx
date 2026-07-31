/**
 * HAND REVIEW REPLAY (W5-6)
 * ═══════════════════════════════════════════════════════════════════════════
 * Steps through the session log one hand at a time.
 *
 * The log mixes two kinds of entry, told apart by an explicit `source` tag
 * (never by the presence of a timestamp — local entries carry one too):
 *   • live hands played this sitting (source 'live'/'local'). With coach mode
 *     off these still have isCorrect null but DO carry a stored GTO action.
 *   • archived hands hydrated from /api/sandbox/sessions (source 'server') —
 *     the mapper cannot supply a verdict, so isCorrect/evDelta/userPick are null
 * Rendering the archived ones with "— NOT COACHED" and three em-dashes made the
 * whole feature look broken. They now get their own compact "replay only" card
 * and their own filter tab.
 *
 * Navigation is a scrollable strip of 44px snap buttons plus swipe gestures —
 * the old 8x8px dot field was neither tappable nor reachable.
 */
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Film, ChevronLeft, ChevronRight, RotateCcw, TrendingDown, Archive } from 'lucide-react';
import { T, F, S, R, btn, pill, numeric } from './paTokens';
import { BottomSheet, PAStyles, EmptyState, Segmented, usePrefersReducedMotion } from './paKit';

const FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'mistakes', label: 'Mistakes' },
    { value: 'archived', label: 'Archived' },
];

function tone(pct) {
    if (pct >= 70) return T.success;
    if (pct >= 50) return T.warn;
    return T.danger;
}

/**
 * Archived rows are the ones hydrated from /api/sandbox/sessions — they are
 * tagged `source: 'server'` by mergeSessions. Locally-created rows also carry a
 * `createdAt`, so that field must NOT be used to infer provenance: doing so
 * mislabelled every uncoached hand from the current sitting as archived and hid
 * its stored GTO action.
 */
function isArchived(entry) {
    if (!entry) return false;
    if (entry.source) return entry.source === 'server';
    // Legacy rows with no provenance: only treat as archived when there is
    // genuinely nothing to show (no verdict AND no stored GTO action).
    return entry.isCorrect == null && !entry.optimalAction && entry.createdAt != null;
}

function hasHoleCards(entry) {
    return typeof entry?.hand === 'string' && entry.hand.length >= 4;
}

function Detail({ label, value, colour = T.text, big = false }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: F.caption, color: T.textDim, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {label}
            </span>
            <span style={{
                fontSize: big ? F.h3 : F.bodySm, fontWeight: 800, color: colour,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...numeric,
            }}>
                {value}
            </span>
        </div>
    );
}

export default function HandReplay({ sessionLog = [], onLoadScenario, onClose }) {
    const reduce = usePrefersReducedMotion();
    const [filter, setFilter] = useState('all');
    const [currentIdx, setCurrentIdx] = useState(0);
    const stripRef = useRef(null);

    const log = Array.isArray(sessionLog) ? sessionLog : [];

    const view = useMemo(() => {
        if (filter === 'mistakes') return log.filter(e => e && e.isCorrect === false);
        if (filter === 'archived') return log.filter(isArchived);
        return log;
    }, [log, filter]);

    const total = view.length;
    const entry = view[Math.min(currentIdx, Math.max(0, total - 1))];

    // Entries logged before a coach verdict exists carry isCorrect == null —
    // they are "unscored" and must not count as mistakes.
    const scored = log.filter(e => e && e.isCorrect != null);
    const scoredCount = scored.length;
    const correctCount = scored.filter(e => e.isCorrect).length;
    const accuracy = scoredCount > 0 ? Math.round(100 * correctCount / scoredCount) : 0;

    const entryScored = !!entry && entry.isCorrect != null;
    const archived = isArchived(entry);
    const playable = hasHoleCards(entry);

    useEffect(() => { setCurrentIdx(0); }, [filter]);

    // Keep the active chip visible in the strip.
    useEffect(() => {
        const node = stripRef.current?.querySelector(`[data-strip="${currentIdx}"]`);
        node?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: reduce ? 'auto' : 'smooth' });
    }, [currentIdx, reduce]);

    const buzz = useCallback((ms) => {
        try { navigator.vibrate?.(ms); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    }, []);

    const goNext = useCallback(() => {
        setCurrentIdx(prev => (prev < total - 1 ? prev + 1 : prev));
        buzz(5);
    }, [total, buzz]);

    const goPrev = useCallback(() => {
        setCurrentIdx(prev => (prev > 0 ? prev - 1 : prev));
        buzz(5);
    }, [buzz]);

    const jumpToBiggestLeak = useCallback(() => {
        let worstIdx = -1;
        let worst = 0;
        view.forEach((e, i) => {
            const ev = typeof e?.evDelta === 'number' ? e.evDelta : 0;
            if (ev < worst) { worst = ev; worstIdx = i; }
        });
        if (worstIdx >= 0) {
            setCurrentIdx(worstIdx);
            buzz(10);
        }
    }, [view, buzz]);

    const hasLeak = useMemo(() => view.some(e => typeof e?.evDelta === 'number' && e.evDelta < 0), [view]);

    const handlePlayAgain = useCallback(() => {
        if (!entry || !playable) return;
        onLoadScenario?.(entry);
        buzz(15);
        onClose?.();
    }, [entry, playable, onLoadScenario, onClose, buzz]);

    const dragProps = reduce ? {} : {
        drag: 'x',
        dragConstraints: { left: 0, right: 0 },
        dragElastic: 0.2,
        onDragEnd: (_e, info) => {
            if (info.offset.x < -60) goNext();
            else if (info.offset.x > 60) goPrev();
        },
    };

    return (
        <BottomSheet
            open
            onClose={onClose}
            title="Hand replay"
            titleIcon={<Film size={18} strokeWidth={2} color={T.accent} />}
            subtitle={`${log.length} hand${log.length === 1 ? '' : 's'} · ${scoredCount > 0 ? `${accuracy}% coached accuracy` : 'no coached hands yet'}`}
            ariaLabel="Hand replay"
            footer={total > 0 ? (
                <>
                    <button
                        type="button"
                        className="pa-btn"
                        onClick={goPrev}
                        disabled={currentIdx === 0}
                        aria-label="Previous hand"
                        style={{ ...btn('secondary', { disabled: currentIdx === 0 }), padding: '0 14px' }}
                    >
                        <ChevronLeft size={18} strokeWidth={2} />
                    </button>
                    <button
                        type="button"
                        className="pa-btn"
                        onClick={handlePlayAgain}
                        disabled={!playable}
                        aria-label={playable ? 'Load this hand into the sandbox' : 'This archived hand has no hole cards to replay'}
                        style={{ ...btn('primary', { disabled: !playable }), flex: 1 }}
                    >
                        <RotateCcw size={18} strokeWidth={2} />
                        {playable ? 'Play again' : 'No hole cards'}
                    </button>
                    <button
                        type="button"
                        className="pa-btn"
                        onClick={goNext}
                        disabled={currentIdx >= total - 1}
                        aria-label="Next hand"
                        style={{ ...btn('secondary', { disabled: currentIdx >= total - 1 }), padding: '0 14px' }}
                    >
                        <ChevronRight size={18} strokeWidth={2} />
                    </button>
                </>
            ) : null}
        >
            <PAStyles />

            {log.length === 0 ? (
                <EmptyState
                    icon={<Film size={22} strokeWidth={2} />}
                    title="No hands yet"
                    body="Analyse a spot in the sandbox and it lands here, ready to replay."
                    action={<button type="button" className="pa-btn" onClick={onClose} style={btn('primary')}>Back to the table</button>}
                />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
                    <Segmented
                        label="Show"
                        idPrefix="hr-filter"
                        value={filter}
                        onChange={setFilter}
                        options={FILTERS.map(f => ({
                            ...f,
                            label: `${f.label} (${f.value === 'all'
                                ? log.length
                                : f.value === 'mistakes'
                                    ? log.filter(e => e?.isCorrect === false).length
                                    : log.filter(isArchived).length})`,
                        }))}
                    />

                    {total === 0 ? (
                        <EmptyState
                            compact
                            icon={<Archive size={22} strokeWidth={2} />}
                            title="Nothing in this filter"
                            body={filter === 'mistakes'
                                ? 'No coached mistakes in this session — that is a good problem to have.'
                                : 'No archived hands loaded for this account yet.'}
                            action={(
                                <button type="button" className="pa-btn" onClick={() => setFilter('all')} style={btn('secondary')}>
                                    Show all hands
                                </button>
                            )}
                        />
                    ) : (
                        <>
                            {hasLeak && (
                                <button
                                    type="button"
                                    className="pa-btn"
                                    onClick={jumpToBiggestLeak}
                                    style={{ ...btn('secondary', { block: true }), fontSize: F.label, color: T.danger, borderColor: 'rgba(239,68,68,0.4)' }}
                                >
                                    <TrendingDown size={18} strokeWidth={2} />
                                    Jump to the biggest leak
                                </button>
                            )}

                            {/* Hand card (swipe left/right to navigate) */}
                            <motion.div
                                key={`hand-${currentIdx}-${filter}`}
                                {...dragProps}
                                initial={reduce ? { opacity: 0 } : { opacity: 0, x: 12 }}
                                animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0 }}
                                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 340, damping: 32 }}
                                style={{
                                    background: T.surface2, border: `1px solid ${T.border}`,
                                    borderRadius: R.md, padding: S.lg, touchAction: 'pan-y',
                                }}
                            >
                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    gap: S.sm, marginBottom: S.md, flexWrap: 'wrap',
                                }}>
                                    {archived ? (
                                        <span style={pill('neutral')}>
                                            <Archive size={12} strokeWidth={2.5} /> Archived — replay only
                                        </span>
                                    ) : !entryScored ? (
                                        <span style={pill('neutral')}>Not coached</span>
                                    ) : entry.isCorrect ? (
                                        <span style={pill('success')}>Correct</span>
                                    ) : (
                                        <span style={pill('danger')}>Incorrect</span>
                                    )}
                                    <span style={{ fontSize: F.caption, color: T.textMuted, ...numeric }}>
                                        Hand {currentIdx + 1} / {total}
                                    </span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S.md, marginBottom: S.md }}>
                                    <Detail label="Hand" value={entry?.hand || '—'} colour={T.warn} big />
                                    <Detail label="Position" value={(entry?.position || '—').toUpperCase()} colour={T.accent} />
                                </div>

                                {!archived && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S.md, marginBottom: S.md }}>
                                        <Detail
                                            label="Your pick"
                                            value={entry?.userPick || '—'}
                                            colour={!entryScored ? T.textMuted : entry.isCorrect ? T.success : T.danger}
                                        />
                                        <Detail label="GTO action" value={entry?.optimalAction || '—'} colour={T.success} />
                                    </div>
                                )}

                                {typeof entry?.evDelta === 'number' && entry.evDelta !== 0 && (
                                    <div style={{ marginBottom: S.sm }}>
                                        <Detail
                                            label="EV delta"
                                            value={`${entry.evDelta >= 0 ? '+' : ''}${Number(entry.evDelta).toFixed(2)} BB`}
                                            colour={entry.evDelta >= 0 ? T.success : T.danger}
                                        />
                                    </div>
                                )}

                                <div style={{ fontSize: F.caption, color: T.textMuted, lineHeight: 1.45 }}>
                                    {entry?.street ? <span style={{ textTransform: 'capitalize' }}>{entry.street}</span> : 'Preflop'}
                                    {entry?.board ? ` · ${entry.board}` : ''}
                                    {archived && entry?.createdAt
                                        ? ` · ${new Date(entry.createdAt).toLocaleDateString()}`
                                        : ''}
                                </div>

                                {archived && (
                                    <p style={{ fontSize: F.caption, color: T.textDim, margin: `${S.md}px 0 0`, lineHeight: 1.45 }}>
                                        Coach verdicts are not stored with archived sessions, so there is nothing to grade here —
                                        load it back into the sandbox to play it again.
                                    </p>
                                )}
                                {!playable && (
                                    <p style={{ fontSize: F.caption, color: T.textDim, margin: `${S.sm}px 0 0`, lineHeight: 1.45 }}>
                                        This entry has no hole cards saved, so only the board can be restored.
                                    </p>
                                )}
                            </motion.div>

                            {/* Scrubber — real buttons, 44px, snap scrolling */}
                            <div
                                ref={stripRef}
                                role="group"
                                aria-label="Jump to hand"
                                style={{
                                    display: 'flex', gap: S.sm, overflowX: 'auto', paddingBottom: S.xs,
                                    scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch',
                                }}
                            >
                                {view.map((e, i) => {
                                    const on = i === currentIdx;
                                    const state = e?.isCorrect == null ? 'neutral' : e.isCorrect ? 'success' : 'danger';
                                    const colour = state === 'success' ? T.success : state === 'danger' ? T.danger : T.textMuted;
                                    return (
                                        <button
                                            key={`strip-${i}`}
                                            type="button"
                                            data-strip={i}
                                            className="pa-btn"
                                            onClick={() => setCurrentIdx(i)}
                                            aria-label={`Hand ${i + 1}${e?.isCorrect == null ? ', not coached' : e.isCorrect ? ', correct' : ', incorrect'}`}
                                            aria-current={on ? 'true' : undefined}
                                            style={{
                                                ...btn('secondary'),
                                                minWidth: 44, width: 44, padding: 0, flexShrink: 0,
                                                scrollSnapAlign: 'center', fontSize: F.caption, ...numeric,
                                                background: on ? T.accentSoft : T.surface2,
                                                color: on ? T.accent : colour,
                                                borderColor: on ? 'rgba(69,153,255,0.45)' : T.border,
                                            }}
                                        >
                                            {i + 1}
                                        </button>
                                    );
                                })}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'center', gap: S.lg, fontSize: F.caption, ...numeric }}>
                                <span style={{ color: T.success }}>{correctCount} correct</span>
                                <span style={{ color: T.danger }}>{scoredCount - correctCount} missed</span>
                                <span style={{ color: tone(accuracy) }}>{scoredCount > 0 ? `${accuracy}%` : '—'}</span>
                                {scoredCount < log.length && (
                                    <span style={{ color: T.textDim }}>{log.length - scoredCount} unscored</span>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}
        </BottomSheet>
    );
}
