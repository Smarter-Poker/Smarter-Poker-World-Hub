/**
 * GTOScenarioDisplay - Premium Futuristic GTO Analysis Panel
 *
 * Features:
 * - Jarvis AI avatar with glowing effect
 * - Primary action with confidence percentage
 * - Collapsible sections (Explanation, GTO Approach, EV Analysis, Alternate Lines)
 * - Highlighted GTO terminology
 * - Futuristic metal/glassmorphism design
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
import { ChevronDown, Info, Target, DollarSign, GitBranch, Sparkles, RotateCcw } from 'lucide-react';
import { getAccessToken } from '../../lib/authUtils';
import styles from './GTOScenarioDisplay.module.css';

// Jarvis avatar - using the official persona
const JARVIS_AVATAR = '/images/jarvis-avatar.png';

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
 * Action color mapping.
 * Each entry carries a solid color AND a pre-mixed glow rgba, because the CSS
 * used color-mix(in srgb, ...) which Safari < 16.2 drops entirely (taking the
 * whole box-shadow declaration with it, so the buttons lost their glow).
 * FOLD and ALL-IN were lightened: #ef4444 (4.4:1) and #a855f7 (4.3:1) both
 * failed WCAG AA against the panel surface at these text sizes.
 */
const ACTION_COLORS = {
    'RAISE': { color: '#00ff88', glow: 'rgba(0, 255, 136, 0.30)' },
    'BET': { color: '#00ff88', glow: 'rgba(0, 255, 136, 0.30)' },
    '3-BET': { color: '#00ff88', glow: 'rgba(0, 255, 136, 0.30)' },
    '4-BET': { color: '#c084fc', glow: 'rgba(192, 132, 252, 0.30)' },
    'CALL': { color: '#ffc107', glow: 'rgba(255, 193, 7, 0.30)' },
    'CHECK': { color: '#00d4ff', glow: 'rgba(0, 212, 255, 0.30)' },
    'FOLD': { color: '#f87171', glow: 'rgba(248, 113, 113, 0.30)' },
    'ALL-IN': { color: '#c084fc', glow: 'rgba(192, 132, 252, 0.30)' },
    'SHOVE': { color: '#c084fc', glow: 'rgba(192, 132, 252, 0.30)' },
};

const DEFAULT_ACTION_COLOR = { color: '#00ff88', glow: 'rgba(0, 255, 136, 0.30)' };

const getActionColors = (action) =>
    ACTION_COLORS[String(action ?? '').toUpperCase()] || DEFAULT_ACTION_COLOR;

/** Back-compat helper for anything that imported the old single-color idea. */
export const getActionColor = (action) => getActionColors(action).color;

/** Human-readable failure text for the visual-card endpoint. */
const describePanelError = (status, apiError) => {
    if (status === 401) return 'Your session expired. Sign in again to generate the visual card.';
    if (status === 403) return 'This account cannot generate visual cards.';
    if (status === 404) return 'This hand is not in the question library yet.';
    if (status === 400) return 'A visual card is not available for this question type.';
    if (status === 429) return 'Too many requests right now. Try again in a moment.';
    if (status >= 500) return 'The panel renderer is unavailable. Try again shortly.';
    return apiError || 'Could not generate the visual card. Please try again.';
};

// Collapsible Section Component
const CollapsibleSection = ({ icon: Icon, title, children, defaultOpen = true, accentColor = '#06b6d4' }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const reactId = useId();
    const contentId = `gto-section-${reactId}`;
    const headerId = `gto-header-${reactId}`;

    return (
        <div className={styles.section} style={{ '--accent-color': accentColor }}>
            <button
                type="button"
                id={headerId}
                className={styles.sectionHeader}
                onClick={() => setIsOpen((open) => !open)}
                aria-expanded={isOpen}
                aria-controls={contentId}
            >
                <span className={styles.sectionTitle}>
                    <Icon size={18} className={styles.sectionIcon} aria-hidden="true" />
                    <span>{title}</span>
                </span>
                <ChevronDown
                    size={18}
                    aria-hidden="true"
                    className={`${styles.sectionChevron} ${isOpen ? styles.sectionChevronOpen : ''}`}
                />
            </button>
            {/*
              Content stays mounted so the collapse animates in BOTH directions
              (grid-template-rows 0fr <-> 1fr). The closed state sets
              visibility:hidden in CSS, which also removes it from the tab order
              and the accessibility tree.
            */}
            <div
                id={contentId}
                role="region"
                aria-labelledby={headerId}
                className={`${styles.sectionBody} ${isOpen ? styles.sectionBodyOpen : ''}`}
            >
                <div className={styles.sectionBodyInner}>
                    <div className={styles.sectionContent}>
                        {children}
                    </div>
                </div>
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
    isCorrectAnswer,
    showDetails = true,
    // Optional: AI-generated image URL (already rendered elsewhere)
    imageUrl,
    // Optional: the question this panel describes. Pass the uuid (or the whole
    // row) to enable the "Generate visual card" button.
    questionId,
    question,
    category,
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

    const { color: actionColor, glow: actionGlow } = getActionColors(action);

    // Accept a uuid directly, or a question row/object carrying one.
    const resolvedQuestionId = useMemo(() => {
        const raw = questionId
            || (question && typeof question === 'object' ? question.id : null);
        return typeof raw === 'string' && UUID_RE.test(raw) ? raw : null;
    }, [questionId, question]);

    const resolvedCategory = category
        || (question && typeof question === 'object' ? question.category : null);

    // Hide the button when we know the route would reject the question anyway.
    const canGenerateCard = Boolean(resolvedQuestionId)
        && (!resolvedCategory || PANEL_CATEGORIES.has(resolvedCategory));

    const fetchAiPanel = useCallback(async () => {
        if (!resolvedQuestionId || isLoadingImage) return;

        let token = accessToken || null;
        if (!token) {
            try { token = getAccessToken(); } catch (_e) { token = null; }
        }
        if (!token) {
            setPanelError('Sign in to generate the visual card.');
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
                // The route accepts a question id and nothing else.
                body: JSON.stringify({ question_id: resolvedQuestionId }),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok || data?.success === false) {
                throw new Error(describePanelError(response.status, data?.error));
            }
            if (!data?.imageUrl) {
                // Empty state: the call succeeded but produced nothing to show.
                throw new Error('No visual card is available for this hand yet.');
            }

            if (!isMounted.current) return;
            setAiImageUrl(data.imageUrl);
            setIsIllustrative(Boolean(data.illustrative));
        } catch (error) {
            console.warn('[GTOScenarioDisplay] visual card failed:', error?.message || error);
            if (!isMounted.current) return;
            setPanelError(error?.message || 'Could not generate the visual card.');
            setShowCard(false);
        } finally {
            if (isMounted.current) setIsLoadingImage(false);
        }
    }, [resolvedQuestionId, isLoadingImage, accessToken]);

    const handleImageError = useCallback(() => {
        setAiImageUrl(null);
        setShowCard(false);
        setPanelError('The visual card could not be loaded. Showing the text analysis.');
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
            <div className={styles.aiPanelBlock}>
                <div className={styles.aiPanelContainer} aria-busy={isLoadingImage ? 'true' : 'false'}>
                    <span
                        className={`${styles.cornerBadge} ${isIllustrative ? styles.cornerBadgeWarn : ''}`}
                    >
                        {isIllustrative ? 'Illustrative numbers' : 'Jarvis panel'}
                    </span>

                    {isLoadingImage ? (
                        <div className={styles.loadingPanel} role="status" aria-live="polite">
                            <span className={styles.loadingSpinner} aria-hidden="true" />
                            <p className={styles.loadingLabel}>Rendering the Jarvis GTO panel...</p>
                        </div>
                    ) : (
                        <img
                            src={aiImageUrl}
                            alt={action
                                ? `GTO analysis panel for the ${action} line`
                                : 'GTO analysis panel'}
                            className={styles.aiPanelImage}
                            loading="lazy"
                            decoding="async"
                            onError={handleImageError}
                        />
                    )}
                </div>

                {hasAnyContent && (
                    <div className={styles.aiPanelFooter}>
                        <button
                            type="button"
                            className={`${styles.panelButton} ${styles.panelButtonGhost}`}
                            onClick={() => setShowCard(false)}
                        >
                            <RotateCcw size={14} aria-hidden="true" />
                            <span>Show text analysis</span>
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className={styles.container}>

            {/* Header Section */}
            <div className={styles.header}>
                {/* Jarvis Avatar */}
                <div className={styles.avatarContainer}>
                    <div className={styles.avatarGlow} aria-hidden="true"></div>
                    <img
                        src={JARVIS_AVATAR}
                        alt=""
                        aria-hidden="true"
                        width={56}
                        height={56}
                        className={styles.avatar}
                        onError={(e) => {
                            // Guard against an infinite onError loop if the
                            // fallback is missing too.
                            if (e.currentTarget.dataset.fallback === '1') return;
                            e.currentTarget.dataset.fallback = '1';
                            e.currentTarget.src = '/images/default-avatar.png';
                        }}
                    />
                    <span className={styles.avatarLabel}>JARVIS</span>
                </div>

                {/* Primary Action */}
                {action && (
                    <div className={styles.actionContainer}>
                        <div
                            className={styles.actionBox}
                            style={{ '--action-color': actionColor, '--action-glow': actionGlow }}
                        >
                            <span className={styles.actionText}>{action}</span>
                        </div>
                    </div>
                )}

                {/* Confidence Percentage — omitted entirely when unknown, so the
                    panel never renders "undefined%" or an invented number. */}
                {confidencePct !== null && (
                    <div
                        className={styles.confidenceContainer}
                        style={{ '--confidence-color': actionColor, '--confidence-glow': actionGlow }}
                    >
                        <div className={styles.confidenceCircle}>
                            <span className={styles.confidenceValue} aria-hidden="true">{confidencePct}%</span>
                            <span className={styles.srOnly}>{`Solver confidence ${confidencePct} percent`}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Content Sections */}
            {showDetails && (
                <div className={styles.sectionsContainer}>
                    {/* Explanation */}
                    {explanation && (
                        <CollapsibleSection
                            icon={Info}
                            title="Explanation"
                            accentColor="#06b6d4"
                        >
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
                        <CollapsibleSection
                            icon={Target}
                            title="GTO Approach"
                            accentColor="#00ff88"
                        >
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
                        <CollapsibleSection
                            icon={DollarSign}
                            title="EV Analysis"
                            accentColor="#ffc107"
                        >
                            <div className={styles.evContainer}>
                                {hasEvValue && (
                                    <div className={styles.evValue}>
                                        {`${evValueNumber >= 0 ? '+' : ''}${evValueNumber} BB`}
                                    </div>
                                )}
                                {evAnalysis?.description && (
                                    <p
                                        className={styles.evDescription}
                                        dangerouslySetInnerHTML={{
                                            __html: highlightKeywords(evAnalysis.description)
                                        }}
                                    />
                                )}
                            </div>
                        </CollapsibleSection>
                    )}

                    {/* Alternate Lines */}
                    {lines.length > 0 && (
                        <CollapsibleSection
                            icon={GitBranch}
                            title={`${lines.length} Alternate ${lines.length === 1 ? 'Line' : 'Lines'}`}
                            accentColor="#a855f7"
                            defaultOpen={true}
                        >
                            <div className={styles.alternateLines}>
                                {lines.map((line, idx) => {
                                    const freq = Number(line?.frequency);
                                    return (
                                        <div key={`${line?.action || 'line'}-${idx}`} className={styles.alternateLine}>
                                            <div className={styles.lineAction}>
                                                {/* Decorative: the action is always spelled out beside it. */}
                                                <span
                                                    className={styles.lineIndicator}
                                                    aria-hidden="true"
                                                    style={{ backgroundColor: getActionColors(line?.action).color }}
                                                />
                                                <span className={styles.lineActionText}>
                                                    {line?.action || 'ALTERNATE'}
                                                </span>
                                                {Number.isFinite(freq) && (
                                                    <span className={styles.lineFrequency}>
                                                        {`${Math.round(freq)}% frequency`}
                                                    </span>
                                                )}
                                            </div>
                                            {line?.description && (
                                                <p className={styles.lineDescription}>{line.description}</p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </CollapsibleSection>
                    )}
                </div>
            )}

            {/* Visual-card action + error state */}
            {(canGenerateCard || panelError) && (
                <div className={styles.panelActions}>
                    {panelError && (
                        <p className={styles.panelError} role="alert">{panelError}</p>
                    )}
                    {canGenerateCard && (
                        <>
                            <button
                                type="button"
                                className={styles.panelButton}
                                onClick={fetchAiPanel}
                                disabled={isLoadingImage}
                            >
                                <Sparkles size={14} aria-hidden="true" />
                                <span>
                                    {panelError ? 'Try visual card again' : 'Generate visual card'}
                                </span>
                            </button>
                            <p className={styles.panelHint}>
                                Renders this hand as a Jarvis-styled analysis card.
                            </p>
                        </>
                    )}
                </div>
            )}

            {/* Bottom Accent Line */}
            <div className={styles.bottomAccent} aria-hidden="true" />
        </div>
    );
}

// Compact version for trivia questions.
// Kept exported: the local tree is only a subset of the repo, so this may be
// imported by a file outside this worklist.
export function GTOScenarioCompact({ action, confidence, explanation }) {
    const { color: actionColor, glow: actionGlow } = getActionColors(action);
    const confidenceNumber = Number(confidence);
    const hasConfidence = Number.isFinite(confidenceNumber);

    if (!action && !explanation) return null;

    return (
        <div className={styles.compactContainer}>
            <div className={styles.compactHeader}>
                <img
                    src={JARVIS_AVATAR}
                    alt=""
                    aria-hidden="true"
                    width={36}
                    height={36}
                    className={styles.compactAvatar}
                    onError={(e) => {
                        if (e.currentTarget.dataset.fallback === '1') return;
                        e.currentTarget.dataset.fallback = '1';
                        e.currentTarget.src = '/images/default-avatar.png';
                    }}
                />
                <div
                    className={styles.compactAction}
                    style={{ '--action-color': actionColor, '--action-glow': actionGlow }}
                >
                    {action}
                </div>
                {hasConfidence && (
                    <div
                        className={styles.compactConfidence}
                        style={{ '--action-color': actionColor }}
                    >
                        {`${Math.max(0, Math.min(100, Math.round(confidenceNumber)))}%`}
                    </div>
                )}
            </div>
            {explanation && (
                <p
                    className={styles.compactExplanation}
                    dangerouslySetInnerHTML={{
                        __html: highlightKeywords(explanation)
                    }}
                />
            )}
        </div>
    );
}
