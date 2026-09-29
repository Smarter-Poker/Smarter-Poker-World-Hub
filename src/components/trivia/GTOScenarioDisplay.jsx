/**
 * GTOScenarioDisplay - the solver reveal, printed on the console glass.
 *
 * Every solver field keeps its meaning and is printed as a label / value row
 * or a labelled block on the black glass of the Trivia console
 * (#ClubArenaConsole): the solver line, its confidence, the EV in big blinds,
 * the explanation, the GTO approach and each alternate line with its
 * frequency. Sections still collapse. No icon glyphs, gradients, rounded
 * panels, shadows or hover states: the console master is the only frame.
 *
 * - Optional AI-rendered "visual card" via /api/trivia/render-gto-panel
 *
 * VISUAL CARD CONTRACT (fixed in this pass)
 * -----------------------------------------
 * `/api/trivia/render-gto-panel` takes `{ question_id: <uuid> }` — nothing
 * else — and requires `Authorization: Bearer <supabase session token>`, because
 * it calls a paid image API. The previous implementation POSTed a free-form
 * prompt with no auth header (401 for every user) and was never invoked by any
 * UI. It is now wired to an explicit, opt-in "Generate visual card" button with
 * real loading / error / empty states.
 *
 * To enable the button, pass the question's uuid:
 *     <GTOScenarioDisplay questionId={currentQuestion.id} ... />
 * Without it the button is hidden and the panel behaves exactly as before.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { getAccessToken } from '../../lib/authUtils';
import { toTitleCase } from '../../lib/trivia/titleCase';
import styles from './GTOScenarioDisplay.module.css';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Categories the render-gto-panel route will actually render (it 400s on the rest). */
const PANEL_CATEGORIES = new Set([
    'gto_theory', 'gto_scenarios', 'mtt_situations', 'cash_game_situations', 'icm_chip_ev',
]);

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
    explanation,
    gtoApproach,
    evAnalysis,
    alternateLines = [],
    // Kept for API compatibility; the verdict line above the panel says it.
    isCorrectAnswer,
    showDetails = true,
    // Optional: AI-generated image URL (already rendered elsewhere)
    imageUrl,
    // Optional: the question this panel describes. Pass the uuid (or the whole
    // row) to enable the "Generate visual card" button.
    questionId,
    sessionId,
    question,
    category,
    // Accepted for API compatibility (callers may pass the whole row).
    difficulty,
    options,
    correctIndex,
    // Optional: explicit supabase access token. Falls back to the session.
    accessToken,
}) {
    const [aiImageUrl, setAiImageUrl] = useState(imageUrl || null);
    const [isLoadingImage, setIsLoadingImage] = useState(false);
    const [panelError, setPanelError] = useState(null);
    const [isIllustrative, setIsIllustrative] = useState(false);
    const [showCard, setShowCard] = useState(Boolean(imageUrl));
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    // Keep in sync when the parent supplies/clears an image for a new question.
    useEffect(() => {
        setAiImageUrl(imageUrl || null);
        setShowCard(Boolean(imageUrl));
        setPanelError(null);
    }, [imageUrl]);

    const actionInk = getActionInk(action);

    // Accept a uuid directly, or a question row/object carrying one.
    const resolvedQuestionId = useMemo(() => {
        const raw = questionId
            || (question && typeof question === 'object' ? question.id : null);
        return typeof raw === 'string' && UUID_RE.test(raw) ? raw : null;
    }, [questionId, question]);

    const resolvedCategory = category
        || (question && typeof question === 'object' ? question.category : null);

    // Hide the button when we know the route would reject the question anyway.
    const canGenerateCard = Boolean(resolvedQuestionId && sessionId)
        && (!resolvedCategory || PANEL_CATEGORIES.has(resolvedCategory));

    const fetchAiPanel = useCallback(async () => {
        if (!resolvedQuestionId || isLoadingImage) return;

        let token = accessToken || null;
        if (!token) {
            try { token = getAccessToken(); } catch (_e) { token = null; }
        }
        if (!token) {
            setPanelError('Sign In To Generate The Visual Card.');
            return;
        }

        setIsLoadingImage(true);
        setPanelError(null);
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
                    session_id: sessionId,
                }),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok || data?.success === false) {
                throw new Error(describePanelError(response.status, data?.error));
            }
            if (!data?.imageUrl) {
                // Empty state: the call succeeded but produced nothing to show.
                throw new Error('No Visual Card Is Available For This Hand Yet.');
            }

            if (!isMounted.current) return;
            setAiImageUrl(data.imageUrl);
            setIsIllustrative(Boolean(data.illustrative));
        } catch (error) {
            console.warn('[GTOScenarioDisplay] visual card failed:', error?.message || error);
            if (!isMounted.current) return;
            setPanelError(error?.message || 'Could Not Generate The Visual Card.');
            setShowCard(false);
        } finally {
            if (isMounted.current) setIsLoadingImage(false);
        }
    }, [resolvedQuestionId, isLoadingImage, accessToken, sessionId]);

    const handleImageError = useCallback(() => {
        setAiImageUrl(null);
        setShowCard(false);
        setPanelError('The Visual Card Could Not Be Loaded. Showing The Text Analysis.');
    }, []);

    // ── Normalised, defensive view data ──────────────────────────────────
    const confidenceNumber = Number(confidence);
    const hasConfidence = Number.isFinite(confidenceNumber);
    const confidencePct = hasConfidence
        ? Math.max(0, Math.min(100, Math.round(confidenceNumber)))
        : null;

    const evValueNumber = Number(evAnalysis?.value);
    const hasEvValue = Number.isFinite(evValueNumber);
    const hasEvSection = Boolean(evAnalysis) && (hasEvValue || Boolean(evAnalysis?.description));

    const lines = Array.isArray(alternateLines) ? alternateLines.filter(Boolean) : [];

    const hasAnyContent = Boolean(action || explanation || gtoApproach || hasEvSection || lines.length);

    // Empty state: nothing to say and no card — render nothing rather than an
    // empty chrome-only panel.
    if (!hasAnyContent && !aiImageUrl && !isLoadingImage) {
        return null;
    }

    // ── Visual-card view (loading + image share one reserved box) ─────────
    if (showCard && (isLoadingImage || aiImageUrl)) {
        return (
            <div className={styles.panel}>
                <p className={`${styles.kicker} ${isIllustrative ? styles.kickerWarn : ''}`}>
                    {isIllustrative ? 'Illustrative Numbers' : 'Jarvis Panel'}
                </p>
                <div className={styles.aiPanelContainer} aria-busy={isLoadingImage ? 'true' : 'false'}>
                    {isLoadingImage ? (
                        <p className={styles.loadingLabel} role="status" aria-live="polite">
                            Rendering The Jarvis GTO Panel
                        </p>
                    ) : (
                        <img
                            src={aiImageUrl}
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
            </div>
        );
    }

    return (
        <div className={styles.panel}>
            <p className={styles.kicker}>Jarvis Solver Analysis</p>

            {/* Headline figures as label / value rows on the glass. Each row
                is omitted when its value is unknown, so the panel never prints
                "undefined%" or an invented number. */}
            {(action || confidencePct !== null || hasEvValue) && (
                <ul className="tc-rows">
                    {action && (
                        <li className="tc-row">
                            <span className="tc-row__label">Solver Line</span>
                            <span className={`tc-row__value ${styles.actionText} tc-ink--${actionInk}`}>{action}</span>
                        </li>
                    )}
                    {confidencePct !== null && (
                        <li className="tc-row">
                            <span className="tc-row__label">Solver Confidence</span>
                            <span className={`tc-row__value tc-ink--${actionInk}`}>
                                <span aria-hidden="true">{confidencePct}%</span>
                                <span className={styles.srOnly}>{`Solver Confidence ${confidencePct} Percent`}</span>
                            </span>
                        </li>
                    )}
                    {hasEvValue && (
                        <li className="tc-row">
                            <span className="tc-row__label">Expected Value</span>
                            <span className={`tc-row__value tc-ink--${evValueNumber >= 0 ? 'green' : 'red'}`}>
                                {`${evValueNumber >= 0 ? '+' : ''}${evValueNumber} BB`}
                            </span>
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
                                    {`${evValueNumber >= 0 ? '+' : ''}${evValueNumber} BB`}
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
            {(canGenerateCard || panelError) && (
                <div className={styles.panelActions}>
                    {panelError && (
                        <p className={`${styles.panelError} tc-ink--red`} role="alert">{panelError}</p>
                    )}
                    {canGenerateCard && (
                        <>
                            <button
                                type="button"
                                className="tc-word"
                                onClick={fetchAiPanel}
                                disabled={isLoadingImage}
                            >
                                {panelError ? 'Try Visual Card Again' : 'Generate Visual Card'}
                            </button>
                            <p className={styles.panelHint}>
                                Renders This Hand As A Jarvis-Styled Analysis Card.
                            </p>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

// Compact version for trivia questions.
// Kept exported: the local tree is only a subset of the repo, so this may be
// imported by a file outside this worklist.
export function GTOScenarioCompact({ action, confidence, explanation }) {
    const actionInk = getActionInk(action);
    const confidenceNumber = Number(confidence);
    const hasConfidence = Number.isFinite(confidenceNumber);

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
                            <span className="tc-row__label">Solver Confidence</span>
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
