/**
 * GTOScenarioDisplay - the solver reveal, printed on the console glass.
 *
 * Every solver field keeps its meaning and is printed as a label / value row
 * or a labelled block on the black glass of the Trivia console
 * (#ClubArenaConsole): the solver line, its frequency, verified EV in big blinds,
 * the explanation, the GTO approach and each alternate line with its
 * frequency. Sections still collapse. No icon glyphs, gradients, rounded
 * panels, shadows or hover states: the console master is the only frame.
 *
 * - Optional AI-rendered "visual card" via /api/trivia/render-gto-panel
 *
 * VISUAL CARD CONTRACT (fixed in this pass)
 * -----------------------------------------
 * `/api/trivia/render-gto-panel` takes the bound `{ question_id, session_id }`
 * pair and requires `Authorization: Bearer <supabase session token>`, because
 * it calls a paid image API. The previous implementation POSTed a free-form
 * prompt with no auth header (401 for every user) and was never invoked by any
 * UI. It is now wired to an explicit, opt-in "Generate visual card" button with
 * real loading / error / empty states.
 *
 * To enable the button, pass the authenticated account plus the current
 * answered session/question/category contract. Without that complete scope,
 * the button is hidden and the text analysis remains available.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { getAccessToken } from '../../lib/authUtils';
import { toTitleCase } from '../../lib/trivia/titleCase';
import { canRenderStrategyVisualCard } from '../../lib/trivia/strategyVisualCardPolicy.mjs';
import styles from './GTOScenarioDisplay.module.css';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Format poker text: enforce BB/SB spacing and capitalization rules
const formatPokerText = (text) => {
    if (!text) return text;
    return text
        .replace(/(\d+)\s*(BB|bb|Bb|bB)/g, '$1BB')
        .replace(/\b(btn|Btn)\b/gi, 'BTN')
        .replace(/\b(sb|Sb|sB)\b/g, 'SB')
        .replace(/\b(utg|Utg)\b/gi, 'UTG')
        .replace(/\b(hj|Hj)\b/gi, 'HJ')
        .replace(/\b(co|Co)\b/g, 'CO')
        .replace(/\b(mp|Mp)\b/g, 'MP')
        .replace(/\bip\b/gi, 'IP')
        .replace(/\boop\b/gi, 'OOP')
        .replace(/\bbig[- ]blind(s?)\b/gi, 'Big-Blind$1')
        .replace(/\bsmall[- ]blind(s?)\b/gi, 'Small-Blind$1');
};

// Highlight GTO keywords in text
// Phase 58: escape HTML BEFORE keyword wrapping. Without this, any HTML in the
// explanation text (admin entry, AI prompt injection, DB tampering) would be
// rendered as live HTML via dangerouslySetInnerHTML — XSS. Now we escape first,
// then add our trusted <span class="gto-highlight"> wrappers.
const escapeHtml = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const GTO_KEYWORDS = [
    'GTO', 'EV', 'Expected Value', 'fold equity', 'pot equity', 'range',
    'balanced range', 'value', 'bluff', 'polarized', 'linear', 'solver',
    'frequency', 'optimal', 'equity realization', 'ICM', 'chip EV', 'SPR',
    'stack-to-pot ratio', 'Big-Blind', 'Small-Blind', 'BB', 'aggression', 'check-raise',
    'continuation bet', 'c-bet', 'float', 'probe', '3-bet', '4-bet',
];

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * One alternation, longest-first, applied in a SINGLE pass.
 * The old implementation ran one replace() per keyword over the growing HTML,
 * so an injected `class="gto-highlight"` was itself re-matched by later
 * keywords (\bgto\b matches inside gto-highlight) and produced nested spans.
 */
const KEYWORD_RE = new RegExp(
    `\\b(${GTO_KEYWORDS.slice()
        .sort((a, b) => b.length - a.length)
        .map(escapeRegExp)
        .join('|')})\\b`,
    'gi'
);

const highlightKeywords = (text) => {
    // SECURITY: escape user-provided text before wrapping in trusted spans.
    const safe = formatPokerText(escapeHtml(text)) || '';
    return safe.replace(KEYWORD_RE, '<span class="gto-highlight">$1</span>');
};

/**
 * Action ink mapping, schema colours only (#ClubArenaConsole 3.4).
 * Each entry carries the solid ink AND a pre-mixed glow, kept for anything
 * that imported the old { color, glow } shape. The ink name drives the class.
 */
const ACTION_INKS = {
    'RAISE': 'green',
    'BET': 'green',
    '3-BET': 'green',
    '4-BET': 'gold',
    'CALL': 'blue',
    'CHECK': 'silver',
    'FOLD': 'red',
    'ALL-IN': 'gold',
    'SHOVE': 'gold',
};

const INK_COLORS = {
    green: { color: '#c8ffd2', glow: 'rgb(53 217 90 / 30%)' },
    gold: { color: '#ffd700', glow: 'rgb(255 215 0 / 30%)' },
    blue: { color: '#45adff', glow: 'rgb(69 173 255 / 30%)' },
    silver: { color: '#e4e7ec', glow: 'rgb(228 231 236 / 30%)' },
    red: { color: '#ff5b6e', glow: 'rgb(240 40 73 / 30%)' },
};

const getActionInk = (action) => ACTION_INKS[String(action ?? '').toUpperCase()] || 'green';

const getActionColors = (action) => INK_COLORS[getActionInk(action)];

/** Back-compat helper for anything that imported the old single-color idea. */
export const getActionColor = (action) => getActionColors(action).color;

/** Human-readable failure text for the visual-card endpoint. */
const describePanelError = (status, apiError) => {
    if (status === 401) return 'Your Session Expired. Sign In Again To Generate The Visual Card.';
    if (status === 403) return 'This Account Cannot Generate Visual Cards.';
    if (status === 404) return 'This Hand Is Not In The Question Library Yet.';
    if (status === 400) return 'A Visual Card Is Not Available For This Question Type.';
    if (status === 422) return 'No Verified Solver Data Is Available For This Question.';
    if (status === 429) return 'Too Many Requests Right Now. Try Again In A Moment.';
    if (status >= 500) return 'The Panel Renderer Is Unavailable. Try Again Shortly.';
    return apiError ? toTitleCase(String(apiError).replace(/_/g, ' ')) : 'Could Not Generate The Visual Card. Please Try Again.';
};

// Collapsible section: a lit label on the glass that opens and closes the
// block beneath it. No icon, no chevron glyph: the state is printed as a word.
const CollapsibleSection = ({ title, children, defaultOpen = true }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const reactId = useId();
    const contentId = `gto-section-${reactId}`;
    const headerId = `gto-header-${reactId}`;

    return (
        <div className={styles.section}>
            <button
                type="button"
                id={headerId}
                className={styles.sectionHeader}
                onClick={() => setIsOpen((open) => !open)}
                aria-expanded={isOpen}
                aria-controls={contentId}
            >
                <span className={styles.sectionTitle}>{title}</span>
                <span className={styles.sectionState} aria-hidden="true">{isOpen ? 'Hide' : 'Show'}</span>
            </button>
            {/* hidden removes the closed body from the tab order and the
                accessibility tree. */}
            <div
                id={contentId}
                role="region"
                aria-labelledby={headerId}
                className={styles.sectionBody}
                hidden={!isOpen}
            >
                {children}
            </div>
        </div>
    );
};

export default function GTOScenarioDisplay({
    action,
    confidence,
    preferredFrequency,
    explanation,
    gtoApproach,
    evAnalysis,
    alternateLines = [],
    frequencyRows = [],
    rangeSummary,
    // Kept for API compatibility; the verdict line above the panel says it.
    isCorrectAnswer,
    showDetails = true,
    // Optional: AI-generated image URL (already rendered elsewhere)
    imageUrl,
    // Optional: the question this panel describes. Pass the uuid (or the whole
    // row) to enable the "Generate visual card" button.
    questionId,
    sessionId,
    accountId,
    mode,
    question,
    category,
    // Accepted for API compatibility (callers may pass the whole row).
    difficulty,
    options,
    correctIndex,
    // Optional: explicit supabase access token. Falls back to the session.
    accessToken,
}) {
    const panelHeadingId = useId();
    const [aiImageUrl, setAiImageUrl] = useState(imageUrl || null);
    const [isLoadingImage, setIsLoadingImage] = useState(false);
    const [panelError, setPanelError] = useState(null);
    const [isIllustrative, setIsIllustrative] = useState(false);
    const [showCard, setShowCard] = useState(Boolean(imageUrl));
    const [renderRetry, setRenderRetry] = useState(null);
    const requestRef = useRef(null);
    const requestGenerationRef = useRef(0);
    const activeScopeKeyRef = useRef('');

    const actionInk = getActionInk(action);

    // Accept a uuid directly, or a question row/object carrying one.
    const resolvedQuestionId = useMemo(() => {
        const raw = questionId
            || (question && typeof question === 'object' ? question.id : null);
        return typeof raw === 'string' && UUID_RE.test(raw) ? raw : null;
    }, [questionId, question]);

    const resolvedSessionId = typeof sessionId === 'string' && UUID_RE.test(sessionId)
        ? sessionId
        : null;
    const resolvedAccountId = typeof accountId === 'string' && UUID_RE.test(accountId)
        ? accountId
        : null;
    const requestScopeKey = `${resolvedAccountId || ''}\u0000${resolvedSessionId || ''}\u0000${resolvedQuestionId || ''}`;
    const renderedScopeKeyRef = useRef(requestScopeKey);
    // Advance synchronously during render. A response from the previous
    // account/question can resolve before effects run, so an effect-only
    // abort is not a sufficient stale-write fence.
    activeScopeKeyRef.current = requestScopeKey;
    const stateBelongsToCurrentScope = renderedScopeKeyRef.current === requestScopeKey;
    const scopedAiImageUrl = stateBelongsToCurrentScope ? aiImageUrl : null;
    const scopedIsLoadingImage = stateBelongsToCurrentScope ? isLoadingImage : false;
    const scopedPanelError = stateBelongsToCurrentScope ? panelError : null;
    const scopedShowCard = stateBelongsToCurrentScope ? showCard : false;
    const scopedRenderRetry = stateBelongsToCurrentScope ? renderRetry : null;

    const resolvedCategory = category
        || (question && typeof question === 'object' ? question.category : null);

    const hasAuthoritativeSolverEvidence = (Array.isArray(frequencyRows) && frequencyRows.length > 0)
        || (evAnalysis?.value !== null
            && evAnalysis?.value !== undefined
            && Number.isFinite(Number(evAnalysis.value)));

    // Hide the button when the route would reject the question or the reveal
    // has no real server-owned solver evidence to anchor the visual.
    const canGenerateCard = Boolean(resolvedAccountId && resolvedQuestionId && resolvedSessionId)
        && hasAuthoritativeSolverEvidence
        && canRenderStrategyVisualCard(mode, resolvedCategory);

    // A generated card and every pending request belong to one exact
    // account/session/question tuple. Changing any member immediately retires
    // the previous request and clears its UI so another player's or another
    // question's panel can never flash into the current reveal.
    useEffect(() => {
        renderedScopeKeyRef.current = requestScopeKey;
        requestGenerationRef.current += 1;
        requestRef.current?.abort();
        requestRef.current = null;
        setAiImageUrl(imageUrl || null);
        setIsLoadingImage(false);
        setPanelError(null);
        setIsIllustrative(false);
        setShowCard(Boolean(imageUrl));
        setRenderRetry(null);
        return () => {
            requestGenerationRef.current += 1;
            requestRef.current?.abort();
            requestRef.current = null;
        };
    }, [resolvedAccountId, resolvedQuestionId, resolvedSessionId, imageUrl]);

    // A 409 render_in_progress response is shared-work coordination, not a
    // failed answer and not permission to poll. One scoped timer only unlocks
    // the user-invoked retry after the server-provided bound.
    useEffect(() => {
        if (!renderRetry || renderRetry.ready === true) return undefined;
        const waitMs = Math.max(0, renderRetry.availableAt - Date.now());
        const retryScopeKey = requestScopeKey;
        const timeoutId = window.setTimeout(() => {
            if (activeScopeKeyRef.current !== retryScopeKey) return;
            setRenderRetry(current => (
                current?.availableAt === renderRetry.availableAt
                    ? { ...current, ready: true }
                    : current
            ));
        }, waitMs);
        return () => window.clearTimeout(timeoutId);
    }, [renderRetry, requestScopeKey]);

    const fetchAiPanel = useCallback(async () => {
        if (!canGenerateCard || scopedIsLoadingImage || (scopedRenderRetry && scopedRenderRetry.ready !== true)) return;

        let token = accessToken || null;
        if (!token) {
            try { token = getAccessToken(); } catch (_e) { token = null; }
        }
        if (!token) {
            setPanelError('Sign In To Generate The Visual Card.');
            return;
        }

        const controller = new AbortController();
        requestRef.current?.abort();
        requestRef.current = controller;
        const requestGeneration = ++requestGenerationRef.current;
        const requestScope = requestScopeKey;
        const requestIsCurrent = () => (
            !controller.signal.aborted
            && requestRef.current === controller
            && requestGenerationRef.current === requestGeneration
            && activeScopeKeyRef.current === requestScope
        );

        setIsLoadingImage(true);
        setPanelError(null);
        setRenderRetry(null);
        setShowCard(true);

        try {
            const response = await fetch('/api/trivia/render-gto-panel', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    question_id: resolvedQuestionId,
                    session_id: resolvedSessionId,
                }),
                signal: controller.signal,
            });

            const data = await response.json().catch(() => ({}));

            if (!requestIsCurrent()) return;

            if (response.status === 409 && data?.error === 'render_in_progress') {
                const retryHeaderSeconds = Number(response.headers?.get?.('Retry-After'));
                const responseRetryMs = Number(data?.retryAfterMs);
                const suppliedRetryMs = Number.isFinite(responseRetryMs) && responseRetryMs > 0
                    ? responseRetryMs
                    : Number.isFinite(retryHeaderSeconds) && retryHeaderSeconds > 0
                        ? retryHeaderSeconds * 1000
                        : 1000;
                const retryAfterMs = Math.max(1000, Math.min(180_000, Math.ceil(suppliedRetryMs)));
                setRenderRetry({
                    availableAt: Date.now() + retryAfterMs,
                    waitSeconds: Math.ceil(retryAfterMs / 1000),
                    ready: false,
                });
                setShowCard(false);
                return;
            }

            if (!response.ok || data?.success === false) {
                throw new Error(describePanelError(response.status, data?.error));
            }
            if (!data?.imageUrl) {
                // Empty state: the call succeeded but produced nothing to show.
                throw new Error('No Visual Card Is Available For This Hand Yet.');
            }
            if (data?.illustrative === true) {
                throw new Error('The Renderer Returned Illustrative Numbers, So The Card Was Not Shown.');
            }

            if (!requestIsCurrent()) return;
            setAiImageUrl(data.imageUrl);
            setIsIllustrative(false);
        } catch (error) {
            if (controller.signal.aborted || error?.name === 'AbortError' || !requestIsCurrent()) return;
            console.warn('[GTOScenarioDisplay] visual card failed:', error?.message || error);
            setPanelError(error?.message || 'Could Not Generate The Visual Card.');
            setShowCard(false);
        } finally {
            if (requestIsCurrent()) {
                requestRef.current = null;
                setIsLoadingImage(false);
            }
        }
    }, [accessToken, canGenerateCard, requestScopeKey, resolvedQuestionId, resolvedSessionId, scopedIsLoadingImage, scopedRenderRetry]);

    const handleImageError = useCallback(() => {
        setAiImageUrl(null);
        setShowCard(false);
        setPanelError('The Visual Card Could Not Be Loaded. Showing The Text Analysis.');
    }, []);

    // ── Normalised, defensive view data ──────────────────────────────────
    const frequencyNumber = Number(preferredFrequency ?? confidence);
    const hasPreferredFrequency = Number.isFinite(frequencyNumber);
    const preferredFrequencyPct = hasPreferredFrequency
        ? Math.max(0, Math.min(100, Math.round(frequencyNumber * 10) / 10))
        : null;

    const evValueNumber = Number(evAnalysis?.value);
    const hasEvValue = evAnalysis?.value !== null
        && evAnalysis?.value !== undefined
        && Number.isFinite(evValueNumber);
    const hasEvSection = Boolean(evAnalysis) && (hasEvValue || Boolean(evAnalysis?.description));
    const evUnitLabel = typeof evAnalysis?.unitLabel === 'string' && evAnalysis.unitLabel
        ? evAnalysis.unitLabel
        : 'Big Blinds';
    const evDisplay = hasEvValue
        ? `${evValueNumber >= 0 ? '+' : ''}${evValueNumber} ${evUnitLabel}`
        : null;
    const evEvidenceLabel = hasEvValue
        && typeof evAnalysis?.sourceLabel === 'string'
        && typeof evAnalysis?.provenanceLabel === 'string'
        ? `${evAnalysis.sourceLabel}. ${evAnalysis.provenanceLabel}.`
        : null;

    const mixRows = Array.isArray(frequencyRows) ? frequencyRows.filter(Boolean) : [];
    const lines = mixRows.length === 0 && Array.isArray(alternateLines) ? alternateLines.filter(Boolean) : [];

    const hasAnyContent = Boolean(action || explanation || gtoApproach || hasEvSection || mixRows.length || lines.length || rangeSummary);

    // Empty state: nothing to say and no card — render nothing rather than an
    // empty chrome-only panel.
    if (!hasAnyContent && !scopedAiImageUrl && !scopedIsLoadingImage) {
        return null;
    }

    // ── Visual-card view (loading + image share one reserved box) ─────────
    if (scopedShowCard && (scopedIsLoadingImage || scopedAiImageUrl)) {
        return (
            <section className={styles.panel} aria-labelledby={panelHeadingId}>
                <h3 id={panelHeadingId} className={`${styles.kicker} ${isIllustrative ? styles.kickerWarn : ''}`}>
                    {isIllustrative ? 'Illustrative Numbers' : 'Jarvis Panel'}
                </h3>
                <div className={styles.aiPanelContainer} aria-busy={scopedIsLoadingImage ? 'true' : 'false'}>
                    {scopedIsLoadingImage ? (
                        <p className={styles.loadingLabel} role="status" aria-live="polite">
                            Rendering The Jarvis GTO Panel
                        </p>
                    ) : (
                        <img
                            src={scopedAiImageUrl}
                            alt={action
                                ? `GTO Analysis Panel For The ${action} Line`
                                : 'GTO Analysis Panel'}
                            className={styles.aiPanelImage}
                            loading="lazy"
                            decoding="async"
                            onError={handleImageError}
                        />
                    )}
                </div>

                {hasAnyContent && (
                    <div className={styles.panelActions}>
                        <button
                            type="button"
                            className="tc-word"
                            onClick={() => setShowCard(false)}
                        >
                            Show Text Analysis
                        </button>
                    </div>
                )}
            </section>
        );
    }

    return (
        <section className={styles.panel} aria-labelledby={panelHeadingId}>
            <h3 id={panelHeadingId} className={styles.kicker}>Jarvis Solver Analysis</h3>

            {/* Headline figures as label / value rows on the glass. Each row
                is omitted when its value is unknown, so the panel never prints
                "undefined%" or an invented number. */}
            {(action || preferredFrequencyPct !== null || hasEvValue) && (
                <ul className="tc-rows">
                    {action && (
                        <li className="tc-row">
                            <span className="tc-row__label">Solver Line</span>
                            <span className={`tc-row__value ${styles.actionText} tc-ink--${actionInk}`}>{action}</span>
                        </li>
                    )}
                    {preferredFrequencyPct !== null && (
                        <li className="tc-row">
                            <span className="tc-row__label">Preferred Line Frequency</span>
                            <span className={`tc-row__value tc-ink--${actionInk}`}>
                                <span aria-hidden="true">{preferredFrequencyPct}%</span>
                                <span className={styles.srOnly}>{`Preferred Solver Line Frequency ${preferredFrequencyPct} Percent`}</span>
                            </span>
                        </li>
                    )}
                    {hasEvValue && (
                        <li className="tc-row">
                            <span className="tc-row__label">Expected Value</span>
                            <span className={`tc-row__value tc-ink--${evValueNumber >= 0 ? 'green' : 'red'}`}>
                                {evDisplay}
                            </span>
                        </li>
                    )}
                    {evEvidenceLabel && (
                        <li className="tc-row">
                            <span className="tc-row__label">EV Evidence</span>
                            <span className="tc-row__value">{evEvidenceLabel}</span>
                        </li>
                    )}
                </ul>
            )}

            {/* Content Sections */}
            {showDetails && (
                <div className={styles.sectionsContainer}>
                    {/* Explanation */}
                    {explanation && (
                        <CollapsibleSection title="Explanation">
                            <p
                                className={styles.explanationText}
                                dangerouslySetInnerHTML={{
                                    __html: highlightKeywords(explanation)
                                }}
                            />
                        </CollapsibleSection>
                    )}

                    {/* GTO Approach */}
                    {gtoApproach && (
                        <CollapsibleSection title="GTO Approach">
                            <p
                                className={styles.explanationText}
                                dangerouslySetInnerHTML={{
                                    __html: highlightKeywords(gtoApproach)
                                }}
                            />
                        </CollapsibleSection>
                    )}

                    {/* EV Analysis */}
                    {hasEvSection && (
                        <CollapsibleSection title="EV Analysis">
                            {hasEvValue && (
                                <p className={`${styles.evValue} tc-ink--${evValueNumber >= 0 ? 'green' : 'red'}`}>
                                    {evDisplay}
                                </p>
                            )}
                            {evAnalysis?.description && (
                                <p
                                    className={styles.explanationText}
                                    dangerouslySetInnerHTML={{
                                        __html: highlightKeywords(evAnalysis.description)
                                    }}
                                />
                            )}
                        </CollapsibleSection>
                    )}

                    {mixRows.length > 0 && (
                        <CollapsibleSection title="Range And Frequency Mix" defaultOpen={true}>
                            {rangeSummary && <p className={styles.rangeSummary}>{rangeSummary}</p>}
                            <ul className={`tc-rows ${styles.frequencyList}`} aria-label="Solver action frequencies">
                                {mixRows.map((line, index) => {
                                    const frequency = Number(line?.frequency);
                                    return (
                                        <li key={`${line?.action || 'line'}-${index}`} className={`tc-row ${styles.frequencyRow}`}>
                                            <span className={`tc-row__label tc-ink--${getActionInk(line?.action)}`}>
                                                {line?.action || 'Solver Line'}
                                            </span>
                                            <span className="tc-row__value">
                                                {Number.isFinite(frequency) ? `${frequency}% Of Solver Mix` : 'Frequency Not Released'}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </CollapsibleSection>
                    )}

                    {/* Alternate Lines */}
                    {lines.length > 0 && (
                        <CollapsibleSection
                            title={`${lines.length} Alternate ${lines.length === 1 ? 'Line' : 'Lines'}`}
                            defaultOpen={true}
                        >
                            <ul className="tc-rows">
                                {lines.map((line, idx) => {
                                    const freq = Number(line?.frequency);
                                    return (
                                        <li key={`${line?.action || 'line'}-${idx}`} className={`tc-row ${styles.alternateLine}`}>
                                            <span className={styles.lineHead}>
                                                <span className={`${styles.lineActionText} tc-ink--${getActionInk(line?.action)}`}>
                                                    {line?.action || 'ALTERNATE'}
                                                </span>
                                                {Number.isFinite(freq) && (
                                                    <span className={styles.lineFrequency}>
                                                        {`${Math.round(freq)}% Frequency`}
                                                    </span>
                                                )}
                                            </span>
                                            {line?.description && (
                                                <span className={styles.lineDescription}>{toTitleCase(line.description)}</span>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </CollapsibleSection>
                    )}
                </div>
            )}

            {/* Visual-card action + error state */}
            {(canGenerateCard || scopedPanelError || scopedRenderRetry) && (
                <div className={styles.panelActions}>
                    {scopedPanelError && (
                        <p className={`${styles.panelError} tc-ink--red`} role="alert">{scopedPanelError}</p>
                    )}
                    {scopedRenderRetry && (
                        <p className={`${styles.panelError} tc-ink--blue`} role="status" aria-live="polite">
                            {scopedRenderRetry.ready
                                ? 'The Shared Render Window Is Clear. Retry When Ready.'
                                : `Another Request Is Rendering This Panel. Retry Is Available In ${scopedRenderRetry.waitSeconds} Seconds.`}
                        </p>
                    )}
                    {canGenerateCard && (
                        <>
                            <button
                                type="button"
                                className="tc-word"
                                onClick={fetchAiPanel}
                                disabled={scopedIsLoadingImage || (scopedRenderRetry && scopedRenderRetry.ready !== true)}
                            >
                                {scopedRenderRetry?.ready
                                    ? 'Retry Visual Card'
                                    : scopedRenderRetry
                                        ? 'Visual Card Render In Progress'
                                        : scopedPanelError
                                            ? 'Try Visual Card Again'
                                            : 'Generate Visual Card'}
                            </button>
                            <p className={styles.panelHint}>
                                Renders This Hand As A Jarvis-Styled Analysis Card.
                            </p>
                        </>
                    )}
                </div>
            )}
        </section>
    );
}

// Compact version for trivia questions.
// Kept exported: the local tree is only a subset of the repo, so this may be
// imported by a file outside this worklist.
export function GTOScenarioCompact({ action, confidence, explanation }) {
    const actionInk = getActionInk(action);
    const confidenceNumber = Number(confidence);
    const hasConfidence = confidence !== null
        && confidence !== undefined
        && Number.isFinite(confidenceNumber);

    if (!action && !explanation) return null;

    return (
        <div className={styles.panel}>
            {(action || hasConfidence) && (
                <ul className="tc-rows">
                    {action && (
                        <li className="tc-row">
                            <span className="tc-row__label">Solver Line</span>
                            <span className={`tc-row__value ${styles.actionText} tc-ink--${actionInk}`}>{action}</span>
                        </li>
                    )}
                    {hasConfidence && (
                        <li className="tc-row">
                            <span className="tc-row__label">Solver Line Frequency</span>
                            <span className={`tc-row__value tc-ink--${actionInk}`}>
                                {`${Math.max(0, Math.min(100, Math.round(confidenceNumber)))}%`}
                            </span>
                        </li>
                    )}
                </ul>
            )}
            {explanation && (
                <p
                    className={styles.explanationText}
                    dangerouslySetInnerHTML={{
                        __html: highlightKeywords(explanation)
                    }}
                />
            )}
        </div>
    );
}
