import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { getFreshAccessToken } from '../../../lib/authUtils';
import useServerGradedRun from '../../../hooks/useServerGradedRun';
import { TRIVIA_INTRO_ART_PVP } from '../../../config/triviaIntroArt.mjs';
import { createCompetitiveJourneyTracker } from '../../../lib/trivia/competitiveJourneyAnalytics.mjs';
import ResponsiveModeArt from '../console/ResponsiveModeArt';
import TriviaConsole, { TriviaGlassAction } from '../console/TriviaConsole';
import PostSettlementReviewDrawer from '../PostSettlementReviewDrawer';
import ShareResultCardModal from '../ShareResultCardModal';
import {
    applyPvpAnswerReceipt,
    buildPvpCategoryBreakdown,
    computeHeadToHeadSeries,
    createPvpClientNonce,
    createPvpDtoAuthority,
    createPvpQuoteAuthority,
    defaultPvpStake,
    derivePvpSessionProgress,
    formatPvpDuration,
    isActivePvpState,
    isAuthoritativePvpQuote,
    isPvpHorseOpponent,
    pvpErrorCopy,
    pvpOutcomeInk,
    pvpOutcomeLabel,
    pvpPollDelay,
    pvpSecondsUntil,
    pvpServerAnchor,
    pvpStakeKeyboardTarget,
    resolvePvpOpponentKey,
} from './pvpModel.mjs';

const DIAMOND_FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const ACTIVE_SESSION_STATES = new Set(['dealing', 'playing']);
const TERMINAL_STATES = new Set(['result', 'search_ended']);
const PVP_ACTION_ENDPOINTS = Object.freeze({
    quote: '/api/trivia/pvp/quote',
    join: '/api/trivia/pvp/join',
    status: '/api/trivia/pvp/status',
    heartbeat: '/api/trivia/pvp/heartbeat',
    resume: '/api/trivia/pvp/resume',
    cancel: '/api/trivia/pvp/cancel',
    history: '/api/trivia/pvp/history',
});

function formatDiamonds(value) {
    return Number.isInteger(value) ? DIAMOND_FORMAT.format(value) : 'Unavailable';
}

function formatNet(value) {
    if (!Number.isInteger(value)) return 'Unavailable';
    return `${value > 0 ? '+' : ''}${DIAMOND_FORMAT.format(value)}`;
}

function formatSeriesRecord(series) {
    if (!series || series.played < 1) return '';
    return series.ties > 0
        ? `${series.wins}-${series.losses}-${series.ties}`
        : `${series.wins}-${series.losses}`;
}

function displayOpponent(match) {
    if (match?.opponent?.isHorse) return 'Smarter Horse';
    return match?.opponent?.displayName || match?.opponent?.label || 'Player';
}

function readableEndReason(reason) {
    switch (reason) {
        case 'cancelled': return 'Search Cancelled';
        case 'search_expired': return 'Search Expired';
        case 'refunded': return 'Stake Refunded';
        case 'void': return 'Match Voided';
        default: return reason ? String(reason).replaceAll('_', ' ') : 'Search Ended';
    }
}

function isStaleRulesQuoteError(error) {
    return error?.status === 409 && error?.payload?.error === 'rules_quote_stale';
}

function staleRulesQuoteRecoveryPlan(restored) {
    if (!restored) {
        return { kind: 'unconfirmed', retireNonce: false, refreshQuote: false };
    }
    const active = isActivePvpState(restored.state);
    return {
        kind: active ? 'active' : 'inactive',
        retireNonce: true,
        refreshQuote: !active,
    };
}

async function requestPvp(action, { method = 'POST', body, params, signal } = {}) {
    const headers = { Accept: 'application/json' };
    if (method !== 'GET') headers['Content-Type'] = 'application/json';
    try {
        // Resolve at request time. A Supabase refresh can rotate the token
        // without changing user.id while a player is queued or mid-match.
        // getFreshAccessToken is the maintained, Web-Lock-coordinated path and
        // performs at most its bounded SDK refresh before returning.
        const token = await getFreshAccessToken();
        if (token) headers.Authorization = `Bearer ${token}`;
    } catch (_error) {
        // The server also accepts the maintained session cookie.
    }
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params || {})) {
        if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
    }
    const endpoint = Object.prototype.hasOwnProperty.call(PVP_ACTION_ENDPOINTS, action)
        ? PVP_ACTION_ENDPOINTS[action]
        : null;
    if (!endpoint) throw new Error('unsupported_pvp_action');
    const requestUrl = search.size ? `${endpoint}?${search}` : endpoint;
    const response = await fetch(requestUrl, {
        method,
        headers,
        credentials: 'include',
        cache: 'no-store',
        signal,
        ...(method === 'GET' ? {} : { body: JSON.stringify(body || {}) }),
    });
    let payload = null;
    try { payload = await response.json(); } catch (_error) { payload = null; }
    if (!response.ok || !payload || payload.success !== true) {
        const error = new Error(payload?.error || `request_failed_${response.status}`);
        error.status = response.status;
        error.payload = payload;
        throw error;
    }
    return payload;
}

function DataRow({ label, value, ink = 'silver', className = '', preserveCase = false }) {
    return (
        <div className={`trivia-pvp-data-row ${className}`.trim()}>
            <dt>{label}</dt>
            <dd className={`tc-ink--${ink}`} data-preserve-case={preserveCase ? 'true' : undefined}>{value}</dd>
        </div>
    );
}

function PvpArt({ priority = false }) {
    return (
        <ResponsiveModeArt
            art={TRIVIA_INTRO_ART_PVP}
            priority={priority}
            sizes="(min-width: 1000px) 330px, (min-width: 900px) 33vw, 100vw"
            className="trivia-pvp-art"
        />
    );
}

function LiveNotices({ connection, connectionMessage, notice, actionError, onRetry }) {
    if (connection === 'online' && !notice && !actionError) return null;
    return (
        <div className="trivia-pvp-notices" aria-live="polite">
            {connection === 'reconnecting' ? (
                <div className="trivia-pvp-notice" data-tone="danger">
                    <p>{connectionMessage || 'Restoring The Latest Server State.'}</p>
                    <TriviaGlassAction label="Retry Connection" ink="red" onClick={onRetry} />
                </div>
            ) : null}
            {notice ? <p className="trivia-pvp-notice" data-tone="info">{notice}</p> : null}
            {actionError ? <p className="trivia-pvp-notice" data-tone="danger">{actionError}</p> : null}
        </div>
    );
}

function EntryQuote({ quote, selectedStake, onSelectStake, disabled }) {
    const selected = quote.stakes.find((entry) => entry.stake === selectedStake) || null;
    const optionRefs = useRef(new Map());
    const affordableStakes = quote.stakes.filter((entry) => entry.stake <= quote.balance);
    const rovingStake = affordableStakes.some((entry) => entry.stake === selectedStake)
        ? selectedStake
        : affordableStakes[0]?.stake;

    const handleStakeKeyDown = (event, currentStake) => {
        if (disabled) return;
        const nextStake = pvpStakeKeyboardTarget(
            quote.stakes,
            quote.balance,
            currentStake,
            event.key,
        );
        if (nextStake == null) return;
        event.preventDefault();
        onSelectStake(nextStake);
        optionRefs.current.get(nextStake)?.focus();
    };

    return (
        <>
            <div className="trivia-pvp-stakes" role="radiogroup" aria-label="Diamond Stake">
                {quote.stakes.map((entry) => {
                    const affordable = entry.stake <= quote.balance;
                    return (
                        <button
                            key={entry.stake}
                            type="button"
                            role="radio"
                            aria-checked={entry.stake === selectedStake}
                            className="trivia-pvp-stake"
                            data-selected={entry.stake === selectedStake ? 'true' : 'false'}
                            data-affordable={affordable ? 'true' : 'false'}
                            disabled={disabled || !affordable}
                            tabIndex={!disabled && affordable && entry.stake === rovingStake ? 0 : -1}
                            ref={(node) => {
                                if (node) optionRefs.current.set(entry.stake, node);
                                else optionRefs.current.delete(entry.stake);
                            }}
                            onClick={() => onSelectStake(entry.stake)}
                            onKeyDown={(event) => handleStakeKeyDown(event, entry.stake)}
                        >
                            <span>{formatDiamonds(entry.stake)} Diamonds</span>
                            <span>{affordable ? `${formatDiamonds(entry.possibleReturn)} Return` : 'Balance Too Low'}</span>
                        </button>
                    );
                })}
            </div>
            {selected ? (
                <dl className="trivia-pvp-data">
                    <DataRow label="Stake" value={`${formatDiamonds(selected.stake)} Diamonds`} ink="blue" />
                    <DataRow label="Match Pot" value={`${formatDiamonds(selected.pot)} Diamonds`} />
                    <DataRow label="Win Rake" value={`${formatDiamonds(selected.rake)} Diamonds`} />
                    <DataRow label="Possible Return" value={`${formatDiamonds(selected.possibleReturn)} Diamonds`} ink="green" />
                    <DataRow label="Net Win" value={`${formatNet(selected.netWin)} Diamonds`} ink="green" />
                </dl>
            ) : null}
        </>
    );
}

function formatReceiptLabel(reference, fallbackLabel = 'Record') {
    if (!reference || typeof reference !== 'string') return 'Unavailable';
    const trimmed = reference.trim();
    if (!trimmed) return 'Unavailable';
    const stakeMatch = /^pvp_stake_([a-z0-9-]{4,})/i.exec(trimmed);
    if (stakeMatch) return `Stake Entry #${stakeMatch[1].slice(0, 8)}`;
    const payoutMatch = /^pvp_(?:payout|win|credit)_([a-z0-9-]{4,})/i.exec(trimmed);
    if (payoutMatch) return `Payout Credit #${payoutMatch[1].slice(0, 8)}`;
    const refundMatch = /^pvp_refund_([a-z0-9-]{4,})/i.exec(trimmed);
    if (refundMatch) return `Stake Refund #${refundMatch[1].slice(0, 8)}`;
    const settleMatch = /^pvp_(?:settle|settlement)_([a-z0-9-]{4,})/i.exec(trimmed);
    if (settleMatch) return `Settlement #${settleMatch[1].slice(0, 8)}`;
    return trimmed.length > 24 ? `${fallbackLabel} #${trimmed.slice(0, 8)}` : trimmed;
}

function ResultReceipts({ result, headingId = 'pvp-receipts-title' }) {
    const receipts = Array.isArray(result?.receipts) ? result.receipts : [];
    const hasRawReferences = Boolean(result?.stakeReference || result?.settlementReference || receipts.some((r) => r?.reference));
    return (
        <section className="trivia-pvp-receipts" aria-labelledby={headingId}>
            <h3 id={headingId} className="tc-label">Transaction Record</h3>
            <dl className="trivia-pvp-data">
                <DataRow label="Stake Entry" value={formatReceiptLabel(result?.stakeReference, 'Stake')} />
                <DataRow label="Settlement" value={formatReceiptLabel(result?.settlementReference, 'Settlement')} />
                <DataRow label="Settled" value={result?.settledAt || 'Unavailable'} />
            </dl>
            {receipts.length > 0 ? (
                <ol className="trivia-pvp-receipt-list">
                    {receipts.map((receipt, index) => (
                        <li key={`${receipt.reference || 'receipt'}-${index}`}>
                            <span>{receipt.kind || 'Receipt'}</span>
                            <strong>{formatDiamonds(receipt.amount)} Diamonds</strong>
                            <span>{formatReceiptLabel(receipt.reference, receipt.kind || 'Receipt')}</span>
                        </li>
                    ))}
                </ol>
            ) : (
                <p className="trivia-pvp-fine-print">
                    {result?.outcome === 'loss'
                        ? 'A Loss Has No Credit Receipt. The Stake And Settlement References Remain The Transaction Record.'
                        : 'No Credit Receipt Was Returned With This Result.'}
                </p>
            )}
            {hasRawReferences ? (
                <details style={{ marginTop: '8px' }}>
                    <summary className="trivia-pvp-fine-print" style={{ cursor: 'pointer', minHeight: '44px', display: 'flex', alignItems: 'center' }}>
                        View Exact Reference IDs
                    </summary>
                    <dl className="trivia-pvp-data" style={{ marginTop: '6px' }}>
                        {result?.stakeReference ? <DataRow label="Stake Reference" value={result.stakeReference} preserveCase /> : null}
                        {result?.settlementReference ? <DataRow label="Settlement Reference" value={result.settlementReference} preserveCase /> : null}
                        {receipts.map((receipt, index) => (
                            receipt?.reference ? (
                                <DataRow key={`raw-${receipt.reference}-${index}`} label={receipt.kind || 'Receipt Reference'} value={receipt.reference} preserveCase />
                            ) : null
                        ))}
                    </dl>
                </details>
            ) : null}
        </section>
    );
}

function PvpCategoryBreakdownCard({ breakdown, loading }) {
    if (loading && breakdown.length === 0) {
        return (
            <section
                data-pvp-category-breakdown="true"
                aria-label="Post-Match Category Breakdown"
                style={{
                    marginTop: '14px',
                    padding: '12px',
                    border: '1px solid #445e77',
                    background: '#0a1829',
                }}
            >
                <p className="trivia-pvp-fine-print" role="status" style={{ margin: 0 }}>
                    Loading Category Breakdown...
                </p>
            </section>
        );
    }
    if (!Array.isArray(breakdown) || breakdown.length === 0) return null;
    const weakest = breakdown[0];

    return (
        <section
            data-pvp-category-breakdown="true"
            aria-labelledby="pvp-category-breakdown-title"
            style={{
                marginTop: '14px',
                padding: '12px',
                border: '1px solid #445e77',
                background: '#0a1829',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                    <p className="tc-label" style={{ margin: 0 }}>Post-Match Study Focus</p>
                    <h3 id="pvp-category-breakdown-title" className="trivia-pvp-section-title" style={{ margin: '2px 0 0' }}>
                        Category Breakdown
                    </h3>
                </div>
                <Link
                    href={weakest.trainingHref}
                    className="tc-word tc-ink--blue"
                    data-pvp-train-spot="true"
                    style={{
                        minHeight: '44px',
                        padding: '6px 12px',
                        border: '1px solid #86daff',
                        background: '#050607',
                        display: 'inline-flex',
                        alignItems: 'center',
                    }}
                >
                    Train This Spot: {weakest.trainingLabel}
                </Link>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {breakdown.map((entry) => {
                    const ink = entry.accuracyPct >= 75 ? 'green' : entry.accuracyPct >= 50 ? 'blue' : 'red';
                    return (
                        <li
                            key={entry.category}
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '10px',
                                flexWrap: 'wrap',
                                padding: '8px 10px',
                                border: '1px solid #445e77',
                                background: '#050607',
                            }}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <strong style={{ color: '#f2f7ff' }}>{entry.label}</strong>
                                <span className={`tc-ink--${ink}`}>
                                    {entry.correct} Of {entry.total} Correct ({entry.accuracyPct}%)
                                </span>
                            </div>
                            <Link
                                href={entry.trainingHref}
                                className="tc-word tc-ink--blue"
                                style={{
                                    minHeight: '44px',
                                    padding: '0 10px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                }}
                            >
                                Train This Spot
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

function PvpHistory({ history, loading, error, onPage, onRetry, onRematch = null, defaultOpen = false }) {
    const items = Array.isArray(history?.items) ? history.items : [];
    const offset = Number(history?.offset || 0);
    const limit = Number(history?.limit || 5);
    const total = Number(history?.total || 0);
    return (
        <section className="trivia-pvp-history" aria-labelledby="pvp-history-title">
            <details open={defaultOpen || undefined}>
                <summary
                    className="trivia-pvp-history-head"
                    style={{ cursor: 'pointer', minHeight: '44px', listStylePosition: 'inside' }}
                >
                    <div>
                        <p className="tc-label">Permanent Record{total > 0 ? ` (${formatDiamonds(total)})` : ''}</p>
                        <h2 id="pvp-history-title" className="trivia-pvp-section-title">Match History</h2>
                    </div>
                </summary>
                <div style={{ marginTop: '10px', marginBottom: '10px' }}>
                    <TriviaGlassAction label="Refresh History" onClick={onRetry} disabled={loading} />
                </div>
                {loading && !history ? <p className="trivia-pvp-fine-print" role="status">Loading Your Settled Matches.</p> : null}
                {error ? <p className="trivia-pvp-notice" data-tone="danger" role="alert">{error}</p> : null}
                {!loading && !error && items.length === 0 ? (
                    <p className="trivia-pvp-fine-print">No Settled Head To Head Match Is Recorded For This Account Yet.</p>
                ) : null}
                {items.length > 0 ? (
                    <ol className="trivia-pvp-history-list">
                        {items.map((item, index) => {
                            const itemNumber = offset + index + 1;
                            const isHorse = isPvpHorseOpponent(item);
                            const opponentLabel = item.opponent?.isHorse ? 'Smarter Horse' : (isHorse ? 'Smarter Horse' : (item.opponent?.displayName || 'Player'));
                            const opponentKey = !isHorse ? resolvePvpOpponentKey(item) : null;
                            const h2h = opponentKey ? computeHeadToHeadSeries(items, opponentKey) : null;
                            return (
                                <li key={`${item.settlementReference || item.stakeReference || 'match'}-${itemNumber}`}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
                                        <details style={{ flex: '1 1 240px' }}>
                                            <summary style={{ minHeight: '44px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                <span>{pvpOutcomeLabel(item)}</span>
                                                <strong data-preserve-case="true">Vs {opponentLabel}</strong>
                                                <span>{formatNet(item.net)} Diamonds</span>
                                                {h2h && h2h.played >= 1 ? (
                                                    <span className="tc-ink--blue" data-pvp-h2h-series="true" data-preserve-case="true">
                                                        Series Vs {h2h.opponentName}: {formatSeriesRecord(h2h)} ({formatNet(h2h.netDiamonds)} Diamonds)
                                                    </span>
                                                ) : null}
                                            </summary>
                                            <div className="trivia-pvp-history-detail">
                                                <dl className="trivia-pvp-data">
                                                    <DataRow label="Settled" value={item.settledAt || 'Unavailable'} />
                                                    <DataRow label="Your Score" value={formatDiamonds(item.myCorrect)} />
                                                    <DataRow label="Opponent Score" value={formatDiamonds(item.opponentCorrect)} />
                                                    <DataRow label="Stake" value={`${formatDiamonds(item.stake)} Diamonds`} ink="blue" />
                                                    <DataRow label="Payout" value={`${formatDiamonds(item.payout)} Diamonds`} ink={item.payout > 0 ? 'green' : 'silver'} />
                                                    {h2h && h2h.played >= 1 ? (
                                                        <DataRow
                                                            label="Head To Head Series"
                                                            value={`${formatSeriesRecord(h2h)} (${formatNet(h2h.netDiamonds)} Diamonds)`}
                                                            ink={h2h.netDiamonds >= 0 ? 'green' : 'red'}
                                                        />
                                                    ) : null}
                                                    <DataRow label="Rules" value={item.rulesVersion || 'Unavailable'} preserveCase />
                                                </dl>
                                                <ResultReceipts result={item} headingId={`pvp-history-receipt-${itemNumber}`} />
                                            </div>
                                        </details>
                                        {typeof onRematch === 'function' ? (
                                            <button
                                                type="button"
                                                className="tc-word tc-ink--blue"
                                                data-pvp-rematch="true"
                                                data-pvp-rematch-kind={isHorse ? 'horse' : 'human'}
                                                style={{
                                                    minHeight: '44px',
                                                    padding: '6px 12px',
                                                    border: '1px solid #86daff',
                                                    background: '#0a1829',
                                                    color: '#f2f7ff',
                                                    cursor: 'pointer',
                                                }}
                                                onClick={() => onRematch({
                                                    stake: item.stake,
                                                    opponent: item.opponent,
                                                    matchType: isHorse ? 'human_horse' : 'human_human',
                                                    isHorse,
                                                })}
                                            >
                                                {isHorse
                                                    ? `Play Another Match (${formatDiamonds(item.stake)} Diamonds)`
                                                    : 'Rematch'}
                                            </button>
                                        ) : null}
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                ) : null}
                {total > limit ? (
                    <div className="trivia-pvp-history-pages" aria-label="Match History Pages">
                        <TriviaGlassAction
                            label="Newer Matches"
                            onClick={() => onPage(Math.max(0, offset - limit))}
                            disabled={loading || offset === 0}
                        />
                        <span>{Math.min(offset + 1, total)} To {Math.min(offset + items.length, total)} Of {total}</span>
                        <TriviaGlassAction
                            label="Older Matches"
                            onClick={() => onPage(offset + limit)}
                            disabled={loading || offset + items.length >= total}
                        />
                    </div>
                ) : null}
            </details>
        </section>
    );
}

export default function PvpCompetitiveExperience({
    user,
    authLoading,
    pvpHorsesEnabled = false,
    onMatchActiveChange = null,
    onMatchSettled = null,
    onSyncContextChange = null,
    onRequestRematch = null,
    realtimeConnected = false,
    realtimePollMs = null,
    realtimeEventCount = 0,
    preferredStake = null,
    activeChallenge = null,
    pairedMatchId = null,
    settledSessionId = '',
    settledMatch = null,
    friendChallengeSlot = null,
}) {
    const router = useRouter();
    const serverRun = useServerGradedRun('pvp', { accessTokenProvider: getFreshAccessToken });

    const [bootState, setBootState] = useState('loading');
    const [bootEpoch, setBootEpoch] = useState(0);
    const [quote, setQuote] = useState(null);
    const [quoteLoading, setQuoteLoading] = useState(false);
    const [quoteError, setQuoteError] = useState(null);
    const [selectedStake, setSelectedStake] = useState(null);
    const [dto, setDto] = useState(null);
    const [serverAnchor, setServerAnchor] = useState(null);
    const [clockNow, setClockNow] = useState(() => Date.now());
    const [connection, setConnection] = useState('online');
    const [connectionMessage, setConnectionMessage] = useState(null);
    const [notice, setNotice] = useState(null);
    const [actionError, setActionError] = useState(null);
    const [busyAction, setBusyAction] = useState(null);
    const [showLobby, setShowLobby] = useState(false);
    const [questions, setQuestions] = useState([]);
    const [questionIndex, setQuestionIndex] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [answerState, setAnswerState] = useState('idle');
    const [answerError, setAnswerError] = useState(null);
    const [sessionError, setSessionError] = useState(null);
    const [finishing, setFinishing] = useState(false);
    const [history, setHistory] = useState(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState(null);
    const [reviewDrawerOpen, setReviewDrawerOpen] = useState(false);
    const [shareModalOpen, setShareModalOpen] = useState(false);
    const [categoryBreakdown, setCategoryBreakdown] = useState([]);
    const [categoryBreakdownLoading, setCategoryBreakdownLoading] = useState(false);

    const latestDtoRef = useRef(null);
    const joinNonceRef = useRef(null);
    const loadedMatchRef = useRef(null);
    const loadingMatchRef = useRef(null);
    const finishingMatchRef = useRef(null);
    const answerTransitionRef = useRef(null);
    const terminalQuoteRef = useRef(null);
    const historySettlementRef = useRef(null);
    const historyRequestSequenceRef = useRef(0);
    const categoryBreakdownRequestRef = useRef(0);
    const staleQuoteRecoveryRef = useRef(false);
    const appliedPreferredStakeRef = useRef(null);
    const lastRealtimeEventRef = useRef(realtimeEventCount);
    const resumedPairedMatchRef = useRef(null);
    const dtoAuthorityRef = useRef(null);
    const quoteAuthorityRef = useRef(null);
    const journeyTrackerRef = useRef(null);
    if (!dtoAuthorityRef.current) {
        dtoAuthorityRef.current = createPvpDtoAuthority();
    }
    if (!quoteAuthorityRef.current) {
        quoteAuthorityRef.current = createPvpQuoteAuthority();
    }
    if (!journeyTrackerRef.current) {
        journeyTrackerRef.current = createCompetitiveJourneyTracker();
    }

    useEffect(() => {
        journeyTrackerRef.current.track('pvp', 'impression', {
            source: 'pvp',
            state: authLoading ? 'auth_loading' : user?.id ? 'ready' : 'signed_out',
        });
    }, [authLoading, user?.id]);

    const adoptDto = useCallback((next) => {
        latestDtoRef.current = next;
        setDto(next);
        const anchor = pvpServerAnchor(next?.serverNow, Date.now());
        if (anchor) setServerAnchor(anchor);
        setClockNow(Date.now());
        setConnection('online');
        setConnectionMessage(null);
    }, []);

    const adoptActionDto = useCallback((next, actionGeneration) => {
        if (!dtoAuthorityRef.current.isActionCurrent(actionGeneration)) return false;
        adoptDto(next);
        return true;
    }, [adoptDto]);

    const readDto = useCallback(async (
        route,
        { method = 'POST', body, params, signal, actionGeneration = null } = {},
    ) => {
        const authority = dtoAuthorityRef.current;
        const lease = authority.beginRead({ actionGeneration, signal });
        if (!lease) return null;
        try {
            const next = await requestPvp(route, {
                method,
                body,
                params,
                signal: lease.signal,
            });
            if (!authority.canAdoptRead(lease)) return null;
            adoptDto(next);
            return next;
        } finally {
            authority.finishRead(lease);
        }
    }, [adoptDto]);

    const loadQuote = useCallback(async ({ signal } = {}) => {
        const requestSequence = quoteAuthorityRef.current.begin();
        setQuoteLoading(true);
        setQuoteError(null);
        try {
            const next = await requestPvp('quote', { method: 'GET', signal });
            if (signal?.aborted || !quoteAuthorityRef.current.isCurrent(requestSequence)) return null;
            if (!isAuthoritativePvpQuote(next)) {
                const error = new Error('invalid_pvp_quote');
                error.payload = { error: 'invalid_pvp_quote' };
                throw error;
            }
            setQuote(next);
            return next;
        } catch (error) {
            if (error?.name === 'AbortError'
                || signal?.aborted
                || !quoteAuthorityRef.current.isCurrent(requestSequence)) return null;
            setQuote(null);
            setQuoteError(pvpErrorCopy(error));
            return null;
        } finally {
            if (!signal?.aborted && quoteAuthorityRef.current.isCurrent(requestSequence)) {
                setQuoteLoading(false);
            }
        }
    }, []);

    const loadHistory = useCallback(async (offset = 0, { signal } = {}) => {
        const requestSequence = ++historyRequestSequenceRef.current;
        setHistoryLoading(true);
        setHistoryError(null);
        try {
            const next = await requestPvp('history', {
                method: 'GET',
                params: { offset, limit: 5 },
                signal,
            });
            if (!signal?.aborted && historyRequestSequenceRef.current === requestSequence) setHistory(next);
            return next;
        } catch (error) {
            if (error?.name !== 'AbortError'
                && !signal?.aborted
                && historyRequestSequenceRef.current === requestSequence) {
                setHistoryError(pvpErrorCopy(error));
            }
            return null;
        } finally {
            if (!signal?.aborted && historyRequestSequenceRef.current === requestSequence) setHistoryLoading(false);
        }
    }, []);

    useEffect(() => {
        const authority = dtoAuthorityRef.current;
        authority.reset();
        quoteAuthorityRef.current.invalidate();
        staleQuoteRecoveryRef.current = false;
        if (authLoading) {
            setBootState('loading');
            return undefined;
        }
        if (!user?.id) {
            setBootState('signed_out');
            setDto(null);
            latestDtoRef.current = null;
            setBusyAction(null);
            setFinishing(false);
            return undefined;
        }

        const actionGeneration = authority.beginAction();
        const controller = new AbortController();
        setBootState('restoring');
        setActionError(null);
        setNotice(null);
        setShowLobby(false);
        setQuestions([]);
        setSessionError(null);
        setHistory(null);
        setHistoryLoading(false);
        setHistoryError(null);
        setReviewDrawerOpen(false);
        setShareModalOpen(false);
        setQuote(null);
        setSelectedStake(null);
        appliedPreferredStakeRef.current = null;
        setBusyAction(null);
        setFinishing(false);
        historyRequestSequenceRef.current += 1;
        historySettlementRef.current = null;
        joinNonceRef.current = null;
        loadedMatchRef.current = null;
        loadingMatchRef.current = null;
        finishingMatchRef.current = null;
        resumedPairedMatchRef.current = null;
        terminalQuoteRef.current = null;
        serverRun.reset();

        (async () => {
            try {
                // Resume is deliberately first. A quote and a new join are
                // never offered until the server confirms there is no match
                // that this browser must restore.
                const restored = await readDto('resume', {
                    method: 'GET',
                    signal: controller.signal,
                    actionGeneration,
                });
                if (!restored || !authority.isActionCurrent(actionGeneration)) return;
                authority.finishAction(actionGeneration);
                setBootState('ready');
                await loadQuote({ signal: controller.signal });
            } catch (error) {
                if (error?.name === 'AbortError' || !authority.isActionCurrent(actionGeneration)) return;
                setBootState('error');
                setConnection('reconnecting');
                setConnectionMessage(pvpErrorCopy(error));
            } finally {
                authority.finishAction(actionGeneration);
            }
        })();

        return () => {
            controller.abort();
            authority.reset();
            quoteAuthorityRef.current.invalidate();
        };
        // serverRun.reset is stable; depending on the full hook object would
        // restart recovery every render.
    }, [authLoading, bootEpoch, loadQuote, readDto, serverRun.reset, user?.id]);

    useEffect(() => {
        if (!user?.id || bootState !== 'ready') return undefined;
        const controller = new AbortController();
        historySettlementRef.current = latestDtoRef.current?.result?.settlementReference || null;
        void loadHistory(0, { signal: controller.signal });
        return () => controller.abort();
    }, [bootState, loadHistory, user?.id]);

    useEffect(() => {
        if (!isAuthoritativePvpQuote(quote)) return;
        const requestedStake = Number(preferredStake);
        if (
            Number.isInteger(requestedStake)
            && appliedPreferredStakeRef.current !== requestedStake
            && quote.stakes.some((entry) => entry.stake === requestedStake && entry.stake <= quote.balance)
        ) {
            appliedPreferredStakeRef.current = requestedStake;
            setSelectedStake(requestedStake);
            return;
        }
        const available = quote.stakes.some((entry) => entry.stake === selectedStake && entry.stake <= quote.balance);
        if (!available) setSelectedStake(defaultPvpStake(quote));
    }, [preferredStake, quote, selectedStake]);

    useEffect(() => {
        const hasDeadline = dto?.ticket?.horseEligibleAt || dto?.ticket?.searchExpiresAt || dto?.match?.deadlineAt;
        if (!hasDeadline) return undefined;
        const timer = window.setInterval(() => setClockNow(Date.now()), 1_000);
        return () => window.clearInterval(timer);
    }, [dto?.match?.deadlineAt, dto?.ticket?.horseEligibleAt, dto?.ticket?.searchExpiresAt]);

    useEffect(() => () => {
        if (answerTransitionRef.current) window.clearTimeout(answerTransitionRef.current);
    }, []);

    const readLatestStatus = useCallback(async ({ action, signal, actionGeneration = null } = {}) => {
        const current = latestDtoRef.current;
        const route = action || (current?.state === 'searching' ? 'heartbeat' : 'status');
        const ticketId = current?.ticket?.id || null;
        if (route === 'heartbeat' && !ticketId) {
            const error = new Error('ticket_not_found');
            error.payload = { error: 'ticket_not_found' };
            throw error;
        }
        return readDto(route, { body: { ticketId }, signal, actionGeneration });
    }, [readDto]);

    const handleRetryConnection = useCallback(async () => {
        if (!user?.id || busyAction) return;
        const authority = dtoAuthorityRef.current;
        const actionGeneration = authority.beginAction();
        setBusyAction('refresh');
        setActionError(null);
        try {
            const current = latestDtoRef.current;
            let recovered = null;
            if (current && isActivePvpState(current.state)) {
                recovered = await readLatestStatus({
                    action: current.state === 'searching' ? 'heartbeat' : 'status',
                    actionGeneration,
                });
            }
            else {
                recovered = await readDto('resume', { method: 'GET', actionGeneration });
            }
            if (!authority.isActionCurrent(actionGeneration)) return;
            if (staleQuoteRecoveryRef.current) {
                const recovery = staleRulesQuoteRecoveryPlan(recovered);
                if (recovery.kind === 'unconfirmed') {
                    setConnection('reconnecting');
                    setConnectionMessage('The Server Still Could Not Confirm Whether This Entry Was Accepted. Restore Again Before Trying To Join.');
                    return;
                }
                staleQuoteRecoveryRef.current = false;
                if (recovery.retireNonce) joinNonceRef.current = null;
                if (recovery.kind === 'active') {
                    setShowLobby(false);
                    setNotice('The Server Had Already Accepted This Entry. Your Match Was Restored Without A Second Charge.');
                } else if (recovery.refreshQuote) {
                    await loadQuote();
                }
                return;
            }
            if (!quote) await loadQuote();
        } catch (error) {
            if (!authority.isActionCurrent(actionGeneration)) return;
            setConnection('reconnecting');
            setConnectionMessage(pvpErrorCopy(error));
        } finally {
            if (authority.finishAction(actionGeneration)) setBusyAction(null);
        }
    }, [busyAction, loadQuote, quote, readDto, readLatestStatus, user?.id]);

    useEffect(() => {
        if (!user?.id || bootState !== 'ready' || showLobby) return undefined;
        const baseDelay = pvpPollDelay(dto);
        if (baseDelay == null) return undefined;
        const delay = realtimeConnected && Number.isFinite(realtimePollMs) && realtimePollMs >= baseDelay
            ? Math.min(10_000, Math.floor(realtimePollMs))
            : baseDelay;
        let disposed = false;
        let timer = null;
        const controller = new AbortController();

        const poll = async () => {
            try {
                const next = await readLatestStatus({
                    action: dto.state === 'searching' ? 'heartbeat' : 'status',
                    signal: controller.signal,
                });
                if (!next && !disposed) timer = window.setTimeout(poll, Math.min(delay, 2_000));
            } catch (error) {
                if (disposed) return;
                if (error?.name === 'AbortError') {
                    timer = window.setTimeout(poll, Math.min(delay, 2_000));
                    return;
                }
                setConnection('reconnecting');
                setConnectionMessage(pvpErrorCopy(error));
                timer = window.setTimeout(poll, 2_000);
            }
        };
        timer = window.setTimeout(poll, delay);
        return () => {
            disposed = true;
            controller.abort();
            if (timer) window.clearTimeout(timer);
        };
    }, [bootState, dto, readLatestStatus, realtimeConnected, realtimePollMs, showLobby, user?.id]);

    useEffect(() => {
        if (typeof onSyncContextChange !== 'function') return;
        const state = showLobby ? 'idle' : (dto?.state || 'idle');
        const basePollMs = !user?.id || bootState !== 'ready' || showLobby ? null : pvpPollDelay(dto);
        onSyncContextChange({
            active: Boolean(user?.id && bootState === 'ready' && !showLobby && isActivePvpState(state)),
            state,
            ticketId: dto?.ticket?.id || null,
            matchId: dto?.match?.id || null,
            basePollMs,
            heartbeatSeconds: Number(dto?.heartbeatSeconds) || null,
        });
    }, [bootState, dto, onSyncContextChange, showLobby, user?.id]);

    const directDuelMatchId = activeChallenge?.matchId || activeChallenge?.pvpHandoff?.matchId || pairedMatchId || null;
    const isDirectDuelPaired = Boolean(activeChallenge?.pvpHandoff?.paired || directDuelMatchId);

    useEffect(() => {
        if (realtimeEventCount <= lastRealtimeEventRef.current) return undefined;
        lastRealtimeEventRef.current = realtimeEventCount;
        if (!user?.id || bootState !== 'ready') return undefined;
        const current = latestDtoRef.current;
        const controller = new AbortController();
        if (!showLobby && current && isActivePvpState(current.state)) {
            void readLatestStatus({
                action: current.state === 'searching' ? 'heartbeat' : 'status',
                signal: controller.signal,
            }).catch((error) => {
                if (error?.name === 'AbortError') return;
                setConnection('reconnecting');
                setConnectionMessage(pvpErrorCopy(error));
            });
            return () => controller.abort();
        }
        // Wake waiting challengers and direct-duel accepters directly from idle/lobby
        // into the server-escrowed match whenever a user-channel or accept signal fires.
        void readDto('resume', {
            method: 'GET',
            signal: controller.signal,
        }).then((restored) => {
            if (restored && isActivePvpState(restored.state)) {
                setShowLobby(false);
            }
        }).catch((error) => {
            if (error?.name === 'AbortError') return;
            setConnection('reconnecting');
            setConnectionMessage(pvpErrorCopy(error));
        });
        return () => controller.abort();
    }, [bootState, readDto, readLatestStatus, realtimeEventCount, showLobby, user?.id]);

    useEffect(() => {
        if (!user?.id || bootState !== 'ready' || !directDuelMatchId) return undefined;
        const current = latestDtoRef.current;
        if (!showLobby && current?.match?.id === directDuelMatchId && isActivePvpState(current.state)) {
            return undefined;
        }
        if (resumedPairedMatchRef.current === directDuelMatchId) return undefined;
        resumedPairedMatchRef.current = directDuelMatchId;
        const controller = new AbortController();
        void readDto('resume', {
            method: 'GET',
            signal: controller.signal,
        }).then((restored) => {
            if (restored && isActivePvpState(restored.state)) {
                setShowLobby(false);
            }
        }).catch((error) => {
            resumedPairedMatchRef.current = null;
            if (error?.name === 'AbortError') return;
            setConnection('reconnecting');
            setConnectionMessage(pvpErrorCopy(error));
        });
        return () => controller.abort();
    }, [bootState, directDuelMatchId, readDto, showLobby, user?.id]);

    const markSessionFinishedLocally = useCallback((matchId) => {
        const current = latestDtoRef.current;
        if (!current?.match || current.match.id !== matchId) return;
        const next = {
            ...current,
            state: 'waiting',
            match: { ...current.match, me: { ...current.match.me, finished: true } },
        };
        latestDtoRef.current = next;
        setDto(next);
    }, []);

    const completeSession = useCallback(async (matchId) => {
        if (!matchId || finishingMatchRef.current === matchId) return;
        const authority = dtoAuthorityRef.current;
        const actionGeneration = authority.beginAction();
        finishingMatchRef.current = matchId;
        setFinishing(true);
        setSessionError(null);
        try {
            await serverRun.submit([]);
            if (!authority.isActionCurrent(actionGeneration)) return;
            markSessionFinishedLocally(matchId);
            try { await readLatestStatus({ action: 'status', actionGeneration }); } catch (statusError) {
                if (!authority.isActionCurrent(actionGeneration)) return;
                setConnection('reconnecting');
                setConnectionMessage(pvpErrorCopy(statusError));
            }
        } catch (error) {
            if (!authority.isActionCurrent(actionGeneration)) return;
            // A lost submit response is an unknown outcome. Read the durable
            // match before allowing a retry of the same idempotent session.
            let current = null;
            try { current = await readLatestStatus({ action: 'status', actionGeneration }); } catch (_statusError) { current = null; }
            if (!authority.isActionCurrent(actionGeneration)) return;
            if (current?.match?.me?.finished) {
                markSessionFinishedLocally(matchId);
            } else {
                setSessionError(pvpErrorCopy(error));
                finishingMatchRef.current = null;
            }
        } finally {
            if (authority.finishAction(actionGeneration)) setFinishing(false);
        }
    }, [markSessionFinishedLocally, readLatestStatus, serverRun.submit]);

    const loadMatchSession = useCallback(async (match) => {
        if (!match?.id || match.me?.finished || loadingMatchRef.current === match.id) return;
        loadingMatchRef.current = match.id;
        setSessionError(null);
        try {
            const started = await serverRun.start({ matchId: match.id });
            if (!started) return;
            const roster = Array.isArray(started.questions) ? started.questions : [];
            if (roster.length === 0) throw new Error('no_questions_available');
            const progress = derivePvpSessionProgress(roster);
            if (!progress.valid || progress.blocked) {
                const error = new Error(progress.error || 'question_not_open');
                error.payload = { error: progress.error || 'question_not_open' };
                throw error;
            }
            loadedMatchRef.current = match.id;
            setQuestions(progress.questions);
            setQuestionIndex(progress.currentIndex >= 0 ? progress.currentIndex : progress.questions.length - 1);
            setSelectedAnswer(null);
            setAnswerState('idle');
            setAnswerError(null);
            journeyTrackerRef.current.track('pvp', 'play', {
                source: 'pvp',
                action: 'open_play',
                state: 'playing',
                opponent_kind: match.opponent?.isHorse ? 'smarter_horse' : 'human',
            });
            if (progress.complete) await completeSession(match.id);
        } catch (error) {
            setSessionError(pvpErrorCopy(error));
        } finally {
            loadingMatchRef.current = null;
        }
    }, [completeSession, serverRun.start]);

    useEffect(() => {
        if (showLobby || !dto?.match || !ACTIVE_SESSION_STATES.has(dto.state) || dto.match.me?.finished) return;
        if (loadedMatchRef.current === dto.match.id) return;
        loadMatchSession(dto.match);
    }, [dto, loadMatchSession, showLobby]);

    useEffect(() => {
        if (!TERMINAL_STATES.has(dto?.state) || terminalQuoteRef.current === `${dto.state}:${dto.match?.id || dto.ticket?.id || ''}`) return;
        terminalQuoteRef.current = `${dto.state}:${dto.match?.id || dto.ticket?.id || ''}`;
        loadQuote();
    }, [dto, loadQuote]);

    useEffect(() => {
        if (!dto?.match || !['dealing', 'playing', 'waiting', 'settling', 'result'].includes(dto.state)) return;
        journeyTrackerRef.current.track('pvp', 'commitment', {
            source: 'pvp',
            state: dto.state === 'dealing' ? 'matched' : dto.state,
            opponent_kind: dto.match.opponent?.isHorse ? 'smarter_horse' : 'human',
        });
    }, [dto?.match, dto?.state]);

    useEffect(() => {
        const result = dto?.result;
        if (dto?.state !== 'result'
            || !result?.stakeReference
            || !result?.settlementReference
            || !result?.settledAt) return;
        const settlementKind = result.outcome === 'refund' || result.outcome === 'tie'
            ? 'refund'
            : result.outcome === 'void'
                ? 'void'
                : Number(result.payout) > 0
                    ? 'payout'
                    : 'zero_payout';
        journeyTrackerRef.current.track('pvp', 'verified_settlement_receipt', {
            source: 'pvp',
            state: 'verified',
            opponent_kind: dto.match?.opponent?.isHorse ? 'smarter_horse' : 'human',
            settlement_kind: settlementKind,
        });
    }, [dto?.match?.opponent?.isHorse, dto?.result, dto?.state]);

    useEffect(() => {
        const settlementReference = dto?.state === 'result' ? dto?.result?.settlementReference : null;
        if (!settlementReference || historySettlementRef.current === settlementReference) return;
        historySettlementRef.current = settlementReference;
        void loadHistory(0);
        if (typeof onMatchSettled === 'function') {
            onMatchSettled({
                match: dto?.match || null,
                result: dto?.result || null,
                sessionId: dto?.match?.mySessionId || serverRun.sessionId || null,
            });
        }
    }, [dto?.match, dto?.result, dto?.state, loadHistory, onMatchSettled, serverRun.sessionId]);

    useEffect(() => {
        if (showLobby || dto?.state !== 'result') {
            setReviewDrawerOpen(false);
            setShareModalOpen(false);
        }
    }, [dto?.state, showLobby]);

    useEffect(() => {
        if (typeof onMatchActiveChange !== 'function') return;
        const isActive = !showLobby && ACTIVE_SESSION_STATES.has(dto?.state || '');
        onMatchActiveChange(isActive);
    }, [dto?.state, onMatchActiveChange, showLobby]);

    const handleJoin = useCallback(async () => {
        if (busyAction || !isAuthoritativePvpQuote(quote)) return;
        if (!quote.joinsEnabled) {
            setActionError('New Head To Head Entries Are Paused. No Entry Was Created.');
            return;
        }
        const selected = quote.stakes.find((entry) => entry.stake === selectedStake);
        if (!selected || selected.stake > quote.balance) {
            setActionError('Your Current Diamond Balance Cannot Cover This Stake.');
            return;
        }
        if (latestDtoRef.current && isActivePvpState(latestDtoRef.current.state)) {
            setActionError('Your Existing Match Must Be Restored Before A New Entry Can Be Created.');
            return;
        }
        journeyTrackerRef.current.track('pvp', 'intent', {
            source: 'pvp',
            action: 'start_pvp',
            state: 'ready',
        });
        if (!joinNonceRef.current) joinNonceRef.current = createPvpClientNonce();
        const authority = dtoAuthorityRef.current;
        const actionGeneration = authority.beginAction();
        setBusyAction('join');
        setActionError(null);
        setNotice(null);
        try {
            const next = await requestPvp('join', {
                body: {
                    stake: selected.stake,
                    clientNonce: joinNonceRef.current,
                    rulesVersion: quote.rulesVersion,
                },
            });
            if (!adoptActionDto(next, actionGeneration)) return;
            joinNonceRef.current = null;
            setShowLobby(false);
            if (next.stakeMismatch) {
                setNotice(`Your Existing ${formatDiamonds(next.ticket?.stake)} Diamond Search Was Restored. No Second Entry Was Created.`);
            } else if (next.match) {
                setNotice('Match Committed By The Server. The Stake Was Recorded Once.');
            }
        } catch (error) {
            // Join has a durable client nonce. Before offering the same safe
            // retry, first ask resume whether the server already accepted it.
            const staleRulesQuote = isStaleRulesQuoteError(error);
            let restored = null;
            try {
                restored = await readDto('resume', { method: 'GET', actionGeneration });
            } catch (_resumeError) {
                restored = null;
            }
            if (!authority.isActionCurrent(actionGeneration)) return;
            const staleRecovery = staleRulesQuote
                ? staleRulesQuoteRecoveryPlan(restored)
                : null;
            if (restored && isActivePvpState(restored.state)) {
                staleQuoteRecoveryRef.current = false;
                joinNonceRef.current = null;
                setShowLobby(false);
                setNotice('The Server Had Already Accepted This Entry. Your Match Was Restored Without A Second Charge.');
            } else if (staleRecovery?.kind === 'unconfirmed') {
                // A stale-rules refusal can refer to an existing ticket or
                // match under different rules. Until resume confirms the
                // durable state, preserve the operation identity and block a
                // new join rather than claiming that no entry exists.
                staleQuoteRecoveryRef.current = true;
                setQuote(null);
                setSelectedStake(null);
                setConnection('reconnecting');
                setConnectionMessage('The Server Could Not Confirm Whether This Entry Was Accepted. Restore Your Server Record Before Trying Again.');
                setActionError('Entry Terms Changed, But The Entry Outcome Is Unconfirmed. No New Entry Can Be Requested Until Recovery Succeeds.');
            } else if (staleRecovery?.kind === 'inactive') {
                // The server refused this exact quote before creating a ticket,
                // match or escrow hold only after resume has authoritatively
                // proved that no active entry remains.
                staleQuoteRecoveryRef.current = false;
                if (staleRecovery.retireNonce) joinNonceRef.current = null;
                setQuote(null);
                setSelectedStake(null);
                const refreshedQuote = staleRecovery.refreshQuote ? await loadQuote() : null;
                if (!authority.isActionCurrent(actionGeneration)) return;
                setActionError(refreshedQuote
                    ? 'Entry Terms Changed. Review The Current Terms Before Joining Again.'
                    : 'Entry Terms Changed, But The Current Terms Could Not Be Reloaded. No Entry Was Created.');
            } else {
                setActionError(pvpErrorCopy(error));
                if (error?.status === 402) await loadQuote();
            }
        } finally {
            if (authority.finishAction(actionGeneration)) setBusyAction(null);
        }
    }, [adoptActionDto, busyAction, loadQuote, quote, readDto, selectedStake]);

    const handleCancel = useCallback(async () => {
        const ticketId = latestDtoRef.current?.ticket?.id;
        if (!ticketId || busyAction) return;
        const authority = dtoAuthorityRef.current;
        const actionGeneration = authority.beginAction();
        setBusyAction('cancel');
        setActionError(null);
        try {
            const next = await requestPvp('cancel', { body: { ticketId } });
            if (!adoptActionDto(next, actionGeneration)) return;
            if (next.cancel === 'too_late_matched' || next.match) {
                setNotice('Cancellation Lost The Race To A Match. The Committed Match Was Restored And Still Counts.');
            } else {
                setNotice('Search Cancelled Before A Match. No Stake Was Taken.');
                await loadQuote();
            }
        } catch (error) {
            // Cancellation may have committed even if the response was lost.
            // Resume reads the durable outcome; never fire a blind second cancel.
            try {
                const restored = await readDto('resume', { method: 'GET', actionGeneration });
                if (!restored || !authority.isActionCurrent(actionGeneration)) return;
                if (restored.match) setNotice('A Match Was Committed Before Cancellation. It Has Been Restored.');
                else if (restored.state === 'search_ended' || restored.state === 'idle') setNotice('The Search Is No Longer Active.');
                else setActionError('Cancellation Was Not Confirmed. Your Current Server Search Is Still Shown.');
            } catch (_resumeError) {
                if (authority.isActionCurrent(actionGeneration)) setActionError(pvpErrorCopy(error));
            }
        } finally {
            if (authority.finishAction(actionGeneration)) setBusyAction(null);
        }
    }, [adoptActionDto, busyAction, loadQuote, readDto]);

    const handleAnswer = useCallback(async (displayIndex) => {
        const question = questions[questionIndex];
        const matchId = latestDtoRef.current?.match?.id;
        if (!question || !matchId || finishing || answerState === 'sending' || answerState === 'recorded') return;
        if (answerState === 'error' && selectedAnswer !== displayIndex) return;
        const authority = dtoAuthorityRef.current;
        const actionGeneration = authority.beginAction();
        setSelectedAnswer(displayIndex);
        setAnswerState('sending');
        setAnswerError(null);
        try {
            const receipt = await serverRun.answer({ questionId: question.id, displayIndex });
            if (!authority.isActionCurrent(actionGeneration)) return;
            const applied = applyPvpAnswerReceipt(questions, question.id, receipt);
            if (!applied.ok || applied.blocked) {
                const error = new Error(applied.error || 'question_not_open');
                error.payload = { error: applied.error || 'question_not_open' };
                throw error;
            }
            setSelectedAnswer(applied.storedDisplayIndex);
            setQuestions(applied.questions);
            setAnswerState('recorded');
            const current = latestDtoRef.current;
            if (current?.match?.id === matchId) {
                const next = {
                    ...current,
                    match: {
                        ...current.match,
                        me: { ...current.match.me, answered: applied.completedCount },
                    },
                };
                latestDtoRef.current = next;
                setDto(next);
            }
            // This short paint delay only exposes the server-recorded state;
            // it never chooses a horse, advances a deadline or settles money.
            answerTransitionRef.current = window.setTimeout(() => {
                answerTransitionRef.current = null;
                if (applied.complete) {
                    completeSession(matchId);
                } else {
                    setQuestionIndex(applied.currentIndex);
                    setSelectedAnswer(null);
                    setAnswerState('idle');
                }
            }, 220);
        } catch (error) {
            if (!authority.isActionCurrent(actionGeneration)) return;
            setAnswerState('error');
            setAnswerError(pvpErrorCopy(error));
            if (error?.status === 409 || error?.status === 410) {
                try { await readLatestStatus({ action: 'status', actionGeneration }); } catch (_statusError) { /* visible reconnect state handles this */ }
            }
        } finally {
            authority.finishAction(actionGeneration);
        }
    }, [answerState, completeSession, finishing, questionIndex, questions, readLatestStatus, selectedAnswer, serverRun.answer]);

    const handleRetrySession = useCallback(() => {
        const match = latestDtoRef.current?.match;
        if (!match) return;
        loadedMatchRef.current = null;
        serverRun.reset();
        loadMatchSession(match);
    }, [loadMatchSession, serverRun.reset]);

    const handlePlayAgain = useCallback(async () => {
        if (!TERMINAL_STATES.has(latestDtoRef.current?.state)) return;
        setShowLobby(true);
        setReviewDrawerOpen(false);
        setShareModalOpen(false);
        setCategoryBreakdown([]);
        setCategoryBreakdownLoading(false);
        setNotice(null);
        setActionError(null);
        setQuestions([]);
        setQuestionIndex(0);
        setSelectedAnswer(null);
        setAnswerState('idle');
        setSessionError(null);
        loadedMatchRef.current = null;
        loadingMatchRef.current = null;
        finishingMatchRef.current = null;
        serverRun.reset();
        await loadQuote();
    }, [loadQuote, serverRun.reset]);

    const handleRematch = useCallback(async (target = null) => {
        if (!target || typeof target !== 'object') return;
        const horse = Boolean(target.isHorse || isPvpHorseOpponent(target));
        const requestedStake = Number(target.stake);
        const validStake = Number.isInteger(requestedStake) && requestedStake > 0 ? requestedStake : null;

        if (TERMINAL_STATES.has(latestDtoRef.current?.state)) {
            await handlePlayAgain();
        } else {
            setShowLobby(true);
        }

        if (validStake && isAuthoritativePvpQuote(quote)) {
            const affordableMatch = quote.stakes.find(
                (entry) => entry.stake === validStake && entry.stake <= quote.balance,
            );
            if (affordableMatch) {
                setSelectedStake(validStake);
            }
        }

        if (horse) {
            // Smarter Horse opponents never trigger a direct Friend Challenge rematch.
            onRequestRematch?.({ isHorse: true, stake: validStake });
            if (validStake) {
                setNotice(`Selected ${formatDiamonds(validStake)} Diamond Stake. Review The Server Quote And Join When Ready.`);
            }
            return;
        }

        const opponentName = typeof target.opponent?.displayName === 'string' && target.opponent.displayName.trim()
            ? target.opponent.displayName.trim()
            : null;
        const opponentId = target.opponent?.id || target.opponent?.userId || null;
        onRequestRematch?.({
            isHorse: false,
            stake: validStake,
            opponentId,
            opponentName,
        });
    }, [handlePlayAgain, onRequestRematch, quote]);

    const serverState = showLobby ? 'idle' : (dto?.state || 'idle');
    const effectiveState = finishing ? 'settling' : serverState;
    const selectedQuote = quote?.stakes?.find((entry) => entry.stake === selectedStake) || null;
    const horseSeconds = pvpSecondsUntil(dto?.ticket?.horseEligibleAt, serverAnchor, clockNow);
    const searchSeconds = pvpSecondsUntil(dto?.ticket?.searchExpiresAt, serverAnchor, clockNow);
    const matchSeconds = pvpSecondsUntil(dto?.match?.deadlineAt, serverAnchor, clockNow);
    const currentQuestion = questions[questionIndex] || null;
    const match = dto?.match || null;
    const result = dto?.result || null;
    const isSettledResult = effectiveState === 'result'
        && Boolean(result?.settlementReference && result?.settledAt);
    const effectiveReviewSessionId = isSettledResult
        ? (match?.mySessionId || serverRun.sessionId || settledSessionId || '')
        : '';

    useEffect(() => {
        if (!isSettledResult || !effectiveReviewSessionId || !user?.id) {
            categoryBreakdownRequestRef.current += 1;
            setCategoryBreakdown([]);
            setCategoryBreakdownLoading(false);
            return undefined;
        }
        const controller = new AbortController();
        const { signal } = controller;
        const requestId = ++categoryBreakdownRequestRef.current;
        setCategoryBreakdownLoading(true);
        (async () => {
            try {
                const headers = { Accept: 'application/json' };
                try {
                    const token = await getFreshAccessToken();
                    if (token) headers.Authorization = `Bearer ${token}`;
                } catch (_tokenError) {
                    // Fallback to session cookie when token helper is unavailable.
                }
                if (signal.aborted || categoryBreakdownRequestRef.current !== requestId) return;
                const response = await fetch(
                    `/api/trivia/session-review?sessionId=${encodeURIComponent(effectiveReviewSessionId)}`,
                    {
                        method: 'GET',
                        headers,
                        credentials: 'include',
                        cache: 'no-store',
                        signal,
                    },
                );
                const payload = await response.json().catch(() => null);
                if (signal.aborted || categoryBreakdownRequestRef.current !== requestId) return;
                if (response.ok && payload?.success === true && Array.isArray(payload.items)) {
                    setCategoryBreakdown(buildPvpCategoryBreakdown(payload.items));
                } else {
                    setCategoryBreakdown([]);
                }
            } catch (error) {
                if (error?.name === 'AbortError' || signal.aborted || categoryBreakdownRequestRef.current !== requestId) return;
                setCategoryBreakdown([]);
            } finally {
                if (!signal.aborted && categoryBreakdownRequestRef.current === requestId) {
                    setCategoryBreakdownLoading(false);
                }
            }
        })();
        return () => controller.abort();
    }, [effectiveReviewSessionId, isSettledResult, user?.id]);
    const effectiveShareMatch = isSettledResult ? (match || settledMatch) : null;
    const playerShareName = user?.user_metadata?.username
        || user?.user_metadata?.display_name
        || user?.email?.split?.('@')?.[0]
        || 'Smarter.Poker Player';
    const reconnectProps = {
        connection,
        connectionMessage,
        notice,
        actionError,
        onRetry: handleRetryConnection,
    };

    if (authLoading || bootState === 'loading' || bootState === 'restoring') {
        return (
            <TriviaConsole
                eyebrow="Head To Head"
                title="Restoring Match"
                titleAs="h1"
                titleId="pvp-title"
                subtitle="Checking Your Server Record First"
                pill="Secure"
                pillInk="blue"
                className="trivia-pvp-console"
            >
                <div className="trivia-pvp-layout trivia-pvp-layout--active" aria-live="polite">
                    <PvpArt priority />
                    <section className="trivia-pvp-main" style={{ minHeight: '340px' }}>
                        <p className="trivia-pvp-state">Looking For An Open Search, Committed Match Or Settled Result.</p>
                    </section>
                    <aside className="trivia-pvp-side">
                        <p className="trivia-pvp-fine-print">A New Entry Will Not Be Offered Until Recovery Finishes.</p>
                    </aside>
                </div>
            </TriviaConsole>
        );
    }

    if (bootState === 'signed_out') {
        return (
            <TriviaConsole
                eyebrow="Head To Head"
                title="Sign In Required"
                titleAs="h1"
                titleId="pvp-title"
                subtitle="Your Match And Diamond Record Stay Account Bound"
                pill="1 V 1"
                pillInk="blue"
                className="trivia-pvp-console"
                secondaryAction={{ label: 'Trivia Lobby', onClick: () => router.push('/hub/trivia') }}
                primaryAction={{
                    label: 'Sign In',
                    onClick: () => {
                        const target = typeof router.asPath === 'string' && router.asPath.startsWith('/hub/trivia/pvp')
                            ? router.asPath
                            : '/hub/trivia/pvp';
                        router.push(`/auth/login?redirect=${encodeURIComponent(target)}`);
                    },
                }}
            >
                <div className="trivia-pvp-layout trivia-pvp-layout--idle">
                    <PvpArt priority />
                    <section className="trivia-pvp-main" style={{ minHeight: '340px' }}>
                        <p className="trivia-pvp-state">Sign In To Restore An Existing Match Or Request A Server-Quoted Diamond Stake.</p>
                    </section>
                </div>
            </TriviaConsole>
        );
    }

    if (bootState === 'error') {
        return (
            <TriviaConsole
                eyebrow="Head To Head"
                title="Restore Interrupted"
                titleAs="h1"
                titleId="pvp-title"
                subtitle="No New Entry Was Created"
                pill="Offline"
                pillInk="red"
                className="trivia-pvp-console"
                secondaryAction={{ label: 'Trivia Lobby', onClick: () => router.push('/hub/trivia') }}
                primaryAction={{ label: 'Restore Again', onClick: () => setBootEpoch((value) => value + 1) }}
            >
                <div className="trivia-pvp-layout trivia-pvp-layout--active">
                    <PvpArt priority />
                    <section className="trivia-pvp-main">
                        <p className="trivia-pvp-state tc-ink--red">{connectionMessage}</p>
                    </section>
                    <aside className="trivia-pvp-side">
                        <p className="trivia-pvp-fine-print">Recovery Must Succeed Before Joining Another Match.</p>
                    </aside>
                </div>
            </TriviaConsole>
        );
    }

    let title = 'Head To Head';
    let subtitle = 'Server-Owned Matchmaking And Settlement';
    let pill = quote ? `${formatDiamonds(quote.balance)} Diamonds` : '1 V 1';
    let pillInk = 'blue';
    let primaryAction = null;
    let secondaryAction = null;
    let body = null;

    if (effectiveState === 'idle') {
        title = 'Choose Your Stake';
        subtitle = 'Human First Matchmaking';
        primaryAction = {
            label: busyAction === 'join' ? 'Joining' : (selectedQuote ? `Join For ${formatDiamonds(selectedQuote.stake)}` : 'Join Unavailable'),
            disabled: busyAction !== null
                || quote?.joinsEnabled !== true
                || !selectedQuote
                || selectedQuote.stake > (quote?.balance ?? -1),
            onClick: handleJoin,
        };
        body = (
            <div className="trivia-pvp-layout trivia-pvp-layout--idle">
                <PvpArt priority />
                <section className="trivia-pvp-main" aria-labelledby="pvp-entry-title" style={{ minHeight: '340px' }}>
                    <h2 id="pvp-entry-title" className="trivia-pvp-section-title">Server-Quoted Entry</h2>
                    <p className="trivia-pvp-copy">
                        Choose A Diamond Stake. The Server Checks Your Balance, Searches For A Human First And Commits The Stake Only When A Match Is Made.
                    </p>
                    {activeChallenge?.challengeCode ? (
                        <p className="trivia-pvp-notice" data-tone="info">
                            {isDirectDuelPaired
                                ? `Direct Duel Active: Loading Live Match... (${activeChallenge.challengeCode}, ${formatDiamonds(activeChallenge.stakeAmount)} Diamonds)`
                                : `Friend Duel ${activeChallenge.challengeCode} (${formatDiamonds(activeChallenge.stakeAmount)} Diamonds). Review The Server Quote Below And Join When Ready.`}
                        </p>
                    ) : null}
                    <LiveNotices {...reconnectProps} />
                    {quoteLoading ? <p className="trivia-pvp-state" aria-live="polite">Loading Current Terms.</p> : null}
                    {quoteError ? (
                        <div className="trivia-pvp-notice" data-tone="danger">
                            <p>{quoteError}</p>
                            <TriviaGlassAction
                                label={quoteLoading ? 'Loading Entry Terms' : 'Reload Entry Terms'}
                                onClick={() => void loadQuote()}
                                disabled={quoteLoading}
                            />
                        </div>
                    ) : null}
                    {quote && !quote.joinsEnabled ? (
                        <p className="trivia-pvp-notice" data-tone="info">
                            New Entries Are Paused. Existing Searches And Matches Can Still Be Restored.
                        </p>
                    ) : null}
                    {quote ? (
                        <>
                            <dl className="trivia-pvp-data trivia-pvp-data--summary">
                                <DataRow label="Current Balance" value={`${formatDiamonds(quote.balance)} Diamonds`} ink="blue" />
                                <DataRow label="Questions" value={formatDiamonds(quote.questionCount)} />
                                <DataRow label="Rules Version" value={quote.rulesVersion} preserveCase />
                                <DataRow
                                    label="Smarter Horse"
                                    value={pvpHorsesEnabled && quote.horseFallbackEnabled
                                        ? `Eligible After ${quote.horseWaitSeconds.min} To ${quote.horseWaitSeconds.max} Seconds`
                                        : 'Not In Rotation'}
                                />
                                <DataRow label="Tie" value="Stake Refunded" />
                                <DataRow label="Cancellation" value="Search Only, Before Match" />
                            </dl>
                            <EntryQuote
                                quote={quote}
                                selectedStake={selectedStake}
                                onSelectStake={setSelectedStake}
                                disabled={busyAction !== null || !quote.joinsEnabled}
                            />
                        </>
                    ) : null}
                </section>
            </div>
        );
    } else if (effectiveState === 'searching') {
        title = 'Finding Your Rival';
        subtitle = 'Human Tables Searched First';
        pill = `${formatDiamonds(dto.ticket?.stake)} Diamond Stake`;
        primaryAction = {
            label: busyAction === 'cancel' ? 'Cancelling' : 'Cancel Search',
            disabled: busyAction !== null,
            onClick: handleCancel,
        };
        body = (
            <div className="trivia-pvp-layout trivia-pvp-layout--active">
                <PvpArt priority />
                <section className="trivia-pvp-main">
                    <h2 className="trivia-pvp-section-title">Search Is Live</h2>
                    <p className="trivia-pvp-copy">No Stake Is Taken Until The Server Commits A Match.</p>
                    <LiveNotices {...reconnectProps} />
                    <dl className="trivia-pvp-data">
                        <DataRow label="Stake" value={`${formatDiamonds(dto.ticket?.stake)} Diamonds`} ink="blue" />
                        <DataRow label="Presence" value={dto.ticket?.presence || 'Awaiting Server'} />
                        <DataRow label="Ticket" value={dto.ticket?.id || 'Unavailable'} />
                    </dl>
                </section>
                <aside className="trivia-pvp-side">
                    <p className="tc-label">Opponent Gate</p>
                    <p className="trivia-pvp-countdown">
                        {dto.ticket?.horseFallbackEnabled
                            ? formatPvpDuration(horseSeconds)
                            : 'Human Only'}
                    </p>
                    <p className="trivia-pvp-fine-print">
                        {dto.ticket?.horseFallbackEnabled
                            ? 'Until Smarter Horse Becomes Eligible. The Server Owns This Deadline.'
                            : 'Smarter Horse Fallback Is Not Enabled For This Search.'}
                    </p>
                    <hr className="tc-rule" />
                    <p className="tc-label">Search Window</p>
                    <p className="trivia-pvp-side-value">{formatPvpDuration(searchSeconds)}</p>
                </aside>
            </div>
        );
    } else if (effectiveState === 'dealing') {
        title = 'Match Committed';
        subtitle = `Versus ${displayOpponent(match)}`;
        pill = 'Dealing';
        body = (
            <div className="trivia-pvp-layout trivia-pvp-layout--active">
                <PvpArt priority />
                <section className="trivia-pvp-main">
                    <h2 className="trivia-pvp-section-title">Loading The Shared Roster</h2>
                    <p className="trivia-pvp-copy">The Server Created Both Seats, One Shared Question Roster And One Idempotent Stake Record.</p>
                    <LiveNotices {...reconnectProps} />
                    {sessionError ? (
                        <div className="trivia-pvp-notice" data-tone="danger">
                            <p>{sessionError}</p>
                            <TriviaGlassAction label="Restore Session" ink="red" onClick={handleRetrySession} />
                        </div>
                    ) : <p className="trivia-pvp-state" aria-live="polite">Restoring Your Bound Session.</p>}
                </section>
                <aside className="trivia-pvp-side">
                    <dl className="trivia-pvp-data">
                        <DataRow label="Opponent" value={displayOpponent(match)} />
                        <DataRow label="Stake" value={`${formatDiamonds(match?.stake)} Diamonds`} ink="blue" />
                        <DataRow label="Questions" value={formatDiamonds(match?.questionCount)} />
                        <DataRow label="Match" value={match?.id || 'Unavailable'} />
                    </dl>
                </aside>
            </div>
        );
    } else if (effectiveState === 'playing') {
        title = currentQuestion ? `Question ${currentQuestion.position || questionIndex + 1} Of ${questions.length}` : 'Restoring Questions';
        subtitle = `Versus ${displayOpponent(match)}`;
        pill = formatPvpDuration(matchSeconds);
        pillInk = matchSeconds === 0 ? 'red' : 'blue';
        const answerLocked = answerState === 'sending' || answerState === 'recorded' || finishing || matchSeconds === 0;
        body = (
            <div className="trivia-pvp-layout trivia-pvp-layout--play">
                <PvpArt priority />
                <section className="trivia-pvp-main trivia-pvp-question-stage">
                    <LiveNotices {...reconnectProps} />
                    {sessionError ? (
                        <div className="trivia-pvp-notice" data-tone="danger">
                            <p>{sessionError}</p>
                            <TriviaGlassAction label="Restore Session" ink="red" onClick={handleRetrySession} />
                        </div>
                    ) : null}
                    {currentQuestion ? (
                        <>
                            <p className="trivia-pvp-question">{currentQuestion.question}</p>
                            <div className="trivia-pvp-options" role="group" aria-label={`Question ${currentQuestion.position || questionIndex + 1} Answers`}>
                                {currentQuestion.options.map((option, index) => (
                                    <button
                                        key={`${currentQuestion.id}-${index}`}
                                        type="button"
                                        className="trivia-pvp-answer"
                                        data-selected={selectedAnswer === index ? 'true' : 'false'}
                                        data-status={selectedAnswer === index ? answerState : 'idle'}
                                        disabled={answerLocked || (answerState === 'error' && selectedAnswer !== index)}
                                        onClick={() => handleAnswer(index)}
                                    >
                                        <span>{String.fromCharCode(65 + index)}</span>
                                        <strong>{option}</strong>
                                    </button>
                                ))}
                            </div>
                            {answerState === 'sending' ? <p className="trivia-pvp-fine-print" aria-live="polite">Recording This Answer On The Server.</p> : null}
                            {answerState === 'recorded' ? <p className="trivia-pvp-fine-print tc-ink--green" aria-live="polite">Answer Locked. Verdict Stays Sealed Until The Match Closes.</p> : null}
                            {answerState === 'error' ? (
                                <div className="trivia-pvp-notice" data-tone="danger">
                                    <p>{answerError}</p>
                                    <TriviaGlassAction
                                        label="Retry Same Answer"
                                        ink="red"
                                        onClick={() => handleAnswer(selectedAnswer)}
                                    />
                                </div>
                            ) : null}
                        </>
                    ) : (
                        <p className="trivia-pvp-state" aria-live="polite">Restoring Your Bound Question Roster.</p>
                    )}
                </section>
                <aside className="trivia-pvp-side">
                    <p className="tc-label">Match Clock</p>
                    <p className="trivia-pvp-countdown">{formatPvpDuration(matchSeconds)}</p>
                    <dl className="trivia-pvp-data">
                        <DataRow label="You Locked" value={`${formatDiamonds(match?.me?.answered)} Of ${formatDiamonds(match?.questionCount)}`} />
                        <DataRow label={`${displayOpponent(match)} Locked`} value={`${formatDiamonds(match?.opponent?.answered)} Of ${formatDiamonds(match?.questionCount)}`} />
                        <DataRow label="Stake" value={`${formatDiamonds(match?.stake)} Diamonds`} ink="blue" />
                    </dl>
                    <p className="trivia-pvp-fine-print">Correct Answers Stay Sealed Until Settlement.</p>
                </aside>
            </div>
        );
    } else if (effectiveState === 'waiting' || effectiveState === 'settling' || finishing) {
        title = effectiveState === 'settling' || finishing ? 'Settling Match' : 'Answers Locked';
        subtitle = effectiveState === 'settling' || finishing ? 'Server Decision In Progress' : `Waiting For ${displayOpponent(match)}`;
        pill = effectiveState === 'settling' || finishing ? 'Ledger' : formatPvpDuration(matchSeconds);
        body = (
            <div className="trivia-pvp-layout trivia-pvp-layout--active">
                <PvpArt priority />
                <section className="trivia-pvp-main">
                    <h2 className="trivia-pvp-section-title">{effectiveState === 'settling' || finishing ? 'Settlement Is Server-Owned' : 'Your Run Is Complete'}</h2>
                    <p className="trivia-pvp-copy">
                        {effectiveState === 'settling' || finishing
                            ? 'The Server Is Grading Both Stored Sessions And Writing The Final Diamond Transaction.'
                            : 'Your Answers Cannot Be Changed. The Match Will Settle When The Other Seat Finishes Or The Server Deadline Closes.'}
                    </p>
                    <LiveNotices {...reconnectProps} />
                    {sessionError ? (
                        <div className="trivia-pvp-notice" data-tone="danger">
                            <p>{sessionError}</p>
                            <TriviaGlassAction label="Restore Session" ink="red" onClick={handleRetrySession} />
                        </div>
                    ) : null}
                </section>
                <aside className="trivia-pvp-side">
                    <dl className="trivia-pvp-data">
                        <DataRow label="You" value={match?.me?.finished ? 'Submitted' : `${formatDiamonds(match?.me?.answered)} Locked`} ink={match?.me?.finished ? 'green' : 'silver'} />
                        <DataRow label={displayOpponent(match)} value={match?.opponent?.finished ? 'Submitted' : `${formatDiamonds(match?.opponent?.answered)} Locked`} />
                        <DataRow label="Match" value={match?.id || 'Unavailable'} />
                    </dl>
                </aside>
            </div>
        );
    } else if (effectiveState === 'result') {
        const settledIsHorse = isPvpHorseOpponent(match);
        const settledOpponentKey = !settledIsHorse ? resolvePvpOpponentKey(match) : null;
        const settledH2h = settledOpponentKey
            ? computeHeadToHeadSeries(history?.items, settledOpponentKey)
            : null;
        title = pvpOutcomeLabel(result);
        subtitle = result?.forfeit ? 'Decided By Forfeit' : 'Server-Graded Final';
        pill = result ? `${formatNet(result.net)} Net` : 'Result';
        pillInk = pvpOutcomeInk(result);
        secondaryAction = { label: 'Trivia Lobby', onClick: () => router.push('/hub/trivia') };
        primaryAction = { label: 'Play Again', onClick: handlePlayAgain };
        body = (
            <div className="trivia-pvp-layout trivia-pvp-layout--result">
                <PvpArt priority />
                <section className="trivia-pvp-main">
                    <LiveNotices {...reconnectProps} />
                    {result ? (
                        <>
                            <h2 className={`trivia-pvp-result-title tc-ink--${pvpOutcomeInk(result)}`}>{pvpOutcomeLabel(result)}</h2>
                            <p className="trivia-pvp-copy">{result.decision || 'The Server Recorded The Final Match Decision.'}</p>
                            {settledH2h && settledH2h.played >= 1 ? (
                                <div
                                    data-pvp-h2h-series="true"
                                    style={{
                                        marginBottom: '12px',
                                        padding: '10px 12px',
                                        border: '1px solid #86daff',
                                        background: '#0a1829',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        gap: '10px',
                                        flexWrap: 'wrap',
                                    }}
                                >
                                    <strong className="tc-ink--blue" data-preserve-case="true">
                                        Series Vs {settledH2h.opponentName}: {formatSeriesRecord(settledH2h)}
                                    </strong>
                                    <span className={settledH2h.netDiamonds >= 0 ? 'tc-ink--green' : 'tc-ink--red'}>
                                        {formatNet(settledH2h.netDiamonds)} Diamonds
                                    </span>
                                </div>
                            ) : null}
                            <dl className="trivia-pvp-data">
                                <DataRow label="Your Score" value={formatDiamonds(result.myCorrect)} />
                                <DataRow label={`${displayOpponent(match)} Score`} value={formatDiamonds(result.opponentCorrect)} />
                                <DataRow label="Stake" value={`${formatDiamonds(result.stake)} Diamonds`} ink="blue" />
                                <DataRow label="Pot" value={`${formatDiamonds(result.pot)} Diamonds`} />
                                <DataRow label="Rake" value={`${formatDiamonds(result.rake)} Diamonds`} />
                                <DataRow label="Payout" value={`${formatDiamonds(result.payout)} Diamonds`} ink={result.payout > 0 ? 'green' : 'silver'} />
                                <DataRow label="Net" value={`${formatNet(result.net)} Diamonds`} ink={pvpOutcomeInk(result)} />
                            </dl>
                            {isSettledResult ? (
                                <div
                                    className="trivia-pvp-result-actions"
                                    style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '14px' }}
                                >
                                    <button
                                        type="button"
                                        className="tc-word tc-ink--blue"
                                        data-pvp-rematch="true"
                                        data-pvp-rematch-kind={settledIsHorse ? 'horse' : 'human'}
                                        style={{
                                            minHeight: '44px',
                                            padding: '8px 14px',
                                            border: '1px solid #86daff',
                                            background: '#0a1829',
                                            color: '#f2f7ff',
                                            cursor: 'pointer',
                                        }}
                                        onClick={() => void handleRematch({
                                            stake: result.stake,
                                            opponent: match?.opponent,
                                            matchType: settledIsHorse ? 'human_horse' : 'human_human',
                                            isHorse: settledIsHorse,
                                        })}
                                    >
                                        {settledIsHorse
                                            ? `Play Another Match (${formatDiamonds(result.stake)} Diamonds)`
                                            : `Rematch (${formatDiamonds(result.stake)} Diamonds)`}
                                    </button>
                                    {effectiveReviewSessionId ? (
                                        <TriviaGlassAction
                                            label="Review Match Questions"
                                            ink="blue"
                                            onClick={() => setReviewDrawerOpen(true)}
                                        />
                                    ) : null}
                                    <TriviaGlassAction
                                        label="Share Result Card"
                                        ink="blue"
                                        onClick={() => setShareModalOpen(true)}
                                    />
                                </div>
                            ) : null}
                            {isSettledResult && effectiveReviewSessionId ? (
                                <PvpCategoryBreakdownCard
                                    breakdown={categoryBreakdown}
                                    loading={categoryBreakdownLoading}
                                />
                            ) : null}
                        </>
                    ) : (
                        <p className="trivia-pvp-notice" data-tone="danger">The Result State Arrived Without Its Settlement Record. Restore The Latest Server State.</p>
                    )}
                </section>
                <aside className="trivia-pvp-side">
                    {result ? <ResultReceipts result={result} /> : (
                        <TriviaGlassAction label="Restore Result" ink="red" onClick={handleRetryConnection} />
                    )}
                </aside>
            </div>
        );
    } else if (effectiveState === 'search_ended') {
        const reason = readableEndReason(dto.ticket?.endReason);
        title = reason;
        subtitle = 'Server Search Record Closed';
        pill = dto.ticket?.stake ? `${formatDiamonds(dto.ticket.stake)} Diamonds` : 'Closed';
        pillInk = /refund|void/i.test(reason) ? 'blue' : 'silver';
        secondaryAction = { label: 'Trivia Lobby', onClick: () => router.push('/hub/trivia') };
        primaryAction = { label: 'New Search', onClick: handlePlayAgain };
        body = (
            <div className="trivia-pvp-layout trivia-pvp-layout--active">
                <PvpArt priority />
                <section className="trivia-pvp-main">
                    <h2 className="trivia-pvp-section-title">{reason}</h2>
                    <p className="trivia-pvp-copy">
                        {dto.ticket?.endReason === 'cancelled'
                            ? 'The Search Ended Before A Match Was Committed. No Stake Was Taken.'
                            : 'The Server Closed This Search And Preserved Its Final Record.'}
                    </p>
                    <LiveNotices {...reconnectProps} />
                </section>
                <aside className="trivia-pvp-side">
                    <dl className="trivia-pvp-data">
                        <DataRow label="Ticket" value={dto.ticket?.id || 'Unavailable'} />
                        <DataRow label="Status" value={dto.ticket?.status || 'Ended'} />
                        <DataRow label="Ended" value={dto.ticket?.endedAt || 'Unavailable'} />
                    </dl>
                </aside>
            </div>
        );
    } else {
        title = 'Restoring Match';
        subtitle = 'Reading The Latest Server State';
        body = (
            <div className="trivia-pvp-layout trivia-pvp-layout--active">
                <PvpArt priority />
                <section className="trivia-pvp-main">
                    <p className="trivia-pvp-state">The Server Returned An Unrecognized Match State.</p>
                    <TriviaGlassAction label="Restore State" ink="red" onClick={handleRetryConnection} />
                </section>
            </div>
        );
    }

    return (
        <TriviaConsole
            eyebrow="Head To Head"
            title={title}
            titleAs="h1"
            titleId="pvp-title"
            subtitle={subtitle}
            pill={pill}
            pillInk={pillInk}
            primaryAction={primaryAction}
            secondaryAction={secondaryAction}
            className="trivia-pvp-console"
            data-pvp-state={effectiveState}
        >
            {body}
            {friendChallengeSlot}
            {user?.id && bootState === 'ready' ? (
                <PvpHistory
                    history={history}
                    loading={historyLoading}
                    error={historyError}
                    onPage={(offset) => loadHistory(offset)}
                    onRetry={() => loadHistory(history?.offset || 0)}
                    onRematch={handleRematch}
                    defaultOpen={effectiveState === 'result'}
                />
            ) : null}
            {isSettledResult ? (
                <>
                    <PostSettlementReviewDrawer
                        open={reviewDrawerOpen && Boolean(effectiveReviewSessionId)}
                        onClose={() => setReviewDrawerOpen(false)}
                        sessionId={effectiveReviewSessionId}
                        title="PvP Match Question Review"
                    />
                    <ShareResultCardModal
                        open={shareModalOpen && Boolean(result)}
                        onClose={() => setShareModalOpen(false)}
                        mode="pvp"
                        score={Number(result?.myCorrect ?? 0)}
                        total={Number(effectiveShareMatch?.questionCount ?? 20)}
                        diamonds={Number(result?.payout ?? 0)}
                        streak={0}
                        player={playerShareName}
                        shareUrl="https://smarter.poker/hub/trivia/pvp"
                        matchId={effectiveShareMatch?.id || effectiveShareMatch?.matchId || result?.matchId || null}
                    />
                </>
            ) : null}
        </TriviaConsole>
    );
}
