import styles from './TriviaConsole.module.css';
import useTriviaPreferenceRuntime from '../../../hooks/useTriviaPreferenceRuntime';

const ZONES = Object.freeze({
    eyebrow: { x: 100, y: 128, width: 540, height: 34 },
    title: { x: 100, y: 166, width: 540, height: 86 },
    titleBesidePill: { x: 100, y: 166, width: 470, height: 86 },
    subtitle: { x: 102, y: 262, width: 540, height: 42 },
    pill: { x: 673, y: 190, width: 197, height: 54 },
    secondary: { x: 100, y: 46, width: 381, height: 129 },
    primary: { x: 520, y: 46, width: 381, height: 129 },
});

// #SMARTERDESIGN canonical inks only (never yellow, gold, amber, purple, violet, lavender, pink, or magenta).
const INKS = Object.freeze(['silver', 'white', 'blue', 'green', 'red', 'muted']);
const TONE_INK = Object.freeze({ danger: 'red', positive: 'green', accent: 'blue' });

function normalizeInk(ink, fallback) {
    if (ink && INKS.includes(ink)) return ink;
    // Map any legacy warm/gold ink requests safely onto #SMARTERDESIGN ice blue.
    if (ink === 'gold' || ink === 'amber' || ink === 'yellow' || ink === 'warning') return 'blue';
    return fallback;
}

function resolveInk(action, fallback) {
    if (action?.ink) return normalizeInk(action.ink, fallback);
    if (action?.tone && TONE_INK[action.tone]) return TONE_INK[action.tone];
    if (action?.tone === 'gold' || action?.tone === 'warning') return 'blue';
    return fallback;
}

/**
 * Paired footer action button rendered with #SMARTERDESIGN steel/cobalt controls.
 * Primary actions receive cobalt chrome; secondary actions receive steel chrome.
 */
export function TriviaPlateButton({ label, zone, className = '', children, tone, ink, ...buttonProps }) {
    const text = String(label ?? children ?? '');
    const isPrimary = zone === ZONES.primary;
    const resolved = resolveInk({ tone, ink }, isPrimary ? 'white' : 'silver');
    return (
        <button
            type="button"
            className={`sd-button ${isPrimary ? 'sd-primary ' : ''}${styles.plate} ${className}`.trim()}
            data-ink={resolved}
            {...buttonProps}
        >
            <span className={styles.plateWell}>
                <span className={`${styles.plateText} ${styles[`ink_${resolved}`]}`}>{text}</span>
            </span>
        </button>
    );
}

/**
 * Single-action / inline control rendered with #SMARTERDESIGN steel chrome and >= 44px touch target.
 */
export function TriviaGlassAction({ label, children, className = '', tone, ink, ...buttonProps }) {
    const text = String(label ?? children ?? '');
    const resolved = resolveInk({ tone, ink }, 'white');
    return (
        <button
            type="button"
            className={`sd-button ${styles.word} ${styles[`ink_${resolved}`]} ${className}`.trim()}
            data-ink={resolved}
            {...buttonProps}
        >
            {text}
        </button>
    );
}

/**
 * Variable-height Trivia surface on the canonical #SMARTERDESIGN steel-rimmed
 * ink-navy console system (styles/smarterdesign.css).
 *
 * Footer contract: two actions render as a paired steel/cobalt action bar;
 * a single action renders as a centered control in the body; no actions renders
 * no footer bar.
 */
export default function TriviaConsole({
    as: Tag = 'section',
    eyebrow,
    title,
    titleAs: TitleTag = 'h2',
    titleId,
    subtitle,
    pill,
    pillInk = 'blue',
    children,
    primaryAction,
    secondaryAction,
    className = '',
    ...rest
}) {
    useTriviaPreferenceRuntime();
    const hasPlates = Boolean(primaryAction && secondaryAction);
    const soleAction = hasPlates ? null : (primaryAction || secondaryAction || null);
    const hasBody = (children !== undefined && children !== null && children !== false) || Boolean(soleAction);
    const pillTone = normalizeInk(pillInk, 'blue');
    const hasHead = Boolean(eyebrow || title || subtitle || pill);

    return (
        <Tag
            className={`smarterdesign sd-panel ${styles.console} ${hasPlates ? styles.withPlates : ''} ${className}`.trim()}
            data-surface="smarterdesign"
            data-foot={hasPlates ? 'plates' : 'foot'}
            {...rest}
        >
            {hasHead ? (
                <header className={styles.head}>
                    <div className={styles.headCopy}>
                        {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
                        {title ? (
                            <TitleTag id={titleId} className={styles.title}>
                                {title}
                            </TitleTag>
                        ) : null}
                        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
                    </div>
                    {pill ? (
                        <span className={`${styles.pill} ${styles[`ink_${pillTone}`]}`}>
                            {pill}
                        </span>
                    ) : null}
                </header>
            ) : null}
            {hasBody ? (
                <div className={styles.body}>
                    {children}
                    {soleAction ? (
                        <div className={styles.glassActions}>
                            <TriviaGlassAction {...soleAction} />
                        </div>
                    ) : null}
                </div>
            ) : null}
            {hasPlates ? (
                <div className={styles.foot}>
                    <TriviaPlateButton zone={ZONES.secondary} {...secondaryAction} />
                    <TriviaPlateButton zone={ZONES.primary} {...primaryAction} />
                </div>
            ) : null}
        </Tag>
    );
}

export { ZONES as TRIVIA_CONSOLE_ZONES, INKS as TRIVIA_CONSOLE_INKS };
