import { useFitText } from './useFitText';
import styles from './TriviaConsole.module.css';

const MASTER_WIDTH = 1000;
const TOP_HEIGHT = 348;
const PLATES_HEIGHT = 277;

const ZONES = Object.freeze({
    eyebrow: { x: 100, y: 128, width: 540, height: 34 },
    title: { x: 100, y: 166, width: 540, height: 86 },
    titleBesidePill: { x: 100, y: 166, width: 470, height: 86 },
    subtitle: { x: 102, y: 262, width: 540, height: 42 },
    pill: { x: 673, y: 190, width: 197, height: 54 },
    secondary: { x: 100, y: 46, width: 381, height: 129 },
    primary: { x: 520, y: 46, width: 381, height: 129 },
});

// Inks the master paints with. Anything else is not a schema colour.
const INKS = Object.freeze(['silver', 'white', 'blue', 'green', 'red', 'gold', 'muted']);
const TONE_INK = Object.freeze({ danger: 'red', positive: 'green', gold: 'gold' });

function resolveInk(action, fallback) {
    if (action?.ink && INKS.includes(action.ink)) return action.ink;
    if (action?.tone && TONE_INK[action.tone]) return TONE_INK[action.tone];
    return fallback;
}

function zoneStyle(zone, canvasHeight) {
    return {
        left: `${(zone.x / MASTER_WIDTH) * 100}%`,
        top: `${(zone.y / canvasHeight) * 100}%`,
        width: `${(zone.width / MASTER_WIDTH) * 100}%`,
        height: `${(zone.height / canvasHeight) * 100}%`,
    };
}

function ZoneText({ as: Tag = 'span', text, zone, canvasHeight = TOP_HEIGHT, className = '', id }) {
    const ref = useFitText(text, 1, 0.5);
    return (
        <Tag className={`${styles.zone} ${className}`.trim()} style={zoneStyle(zone, canvasHeight)} id={id}>
            <span ref={ref}>{text}</span>
        </Tag>
    );
}

/**
 * A transparent button laid over one of the two PAINTED plates. It paints
 * nothing; the steel (secondary) and blue glass (primary) faces are in
 * bottom-plates.png. Only ever rendered in pairs - see TriviaConsole.
 */
export function TriviaPlateButton({ label, zone, className = '', children, tone, ink, ...buttonProps }) {
    const text = String(label ?? children ?? '');
    const ref = useFitText(text, 1, 0.5);
    const resolved = resolveInk({ tone, ink }, zone === ZONES.primary ? 'white' : 'silver');
    return (
        <button
            type="button"
            className={`${styles.plate} ${className}`.trim()}
            style={zoneStyle(zone, PLATES_HEIGHT)}
            data-ink={resolved}
            {...buttonProps}
        >
            <span className={styles.plateWell}>
                <span ref={ref} className={`${styles.plateText} ${styles[`ink_${resolved}`]}`}>{text}</span>
            </span>
        </button>
    );
}

/**
 * The single-action control: the flat closing cap carries no plate, so the one
 * action is printed as a lit word on the black glass above it (the Club Arena
 * console's own answer for Copy, Retry and Close). A lone painted plate beside
 * an empty one reads as broken, so a single action never selects the plates.
 */
export function TriviaGlassAction({ label, children, className = '', tone, ink, ...buttonProps }) {
    const text = String(label ?? children ?? '');
    const resolved = resolveInk({ tone, ink }, 'white');
    return (
        <button
            type="button"
            className={`${styles.word} ${styles[`ink_${resolved}`]} ${className}`.trim()}
            data-ink={resolved}
            {...buttonProps}
        >
            {text}
        </button>
    );
}

/**
 * Variable-height Trivia chassis cut from the approved Club Arena spade master.
 * Nothing except live text is painted in DOM/CSS.
 *
 * Footer law (#ClubArenaConsole): two painted plates or none. Both actions
 * present -> bottom-plates.png with one label per plate. Exactly one action ->
 * the flat foot, and the action prints as a lit word on the glass. No actions
 * -> the flat foot alone.
 */
export default function TriviaConsole({
    as: Tag = 'section',
    eyebrow,
    title,
    titleAs = 'h2',
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
    const hasPlates = Boolean(primaryAction && secondaryAction);
    const soleAction = hasPlates ? null : (primaryAction || secondaryAction || null);
    const hasBody = (children !== undefined && children !== null && children !== false) || Boolean(soleAction);
    const pillTone = INKS.includes(pillInk) ? pillInk : 'blue';
    return (
        <Tag
            className={`${styles.console} ${hasPlates ? styles.withPlates : ''} ${className}`.trim()}
            data-master-art="spade-console-v1"
            data-foot={hasPlates ? 'plates' : 'foot'}
            {...rest}
        >
            <div className={styles.head} aria-hidden={!eyebrow && !title && !subtitle && !pill}>
                {eyebrow ? <ZoneText text={eyebrow} zone={ZONES.eyebrow} className={styles.eyebrow} /> : null}
                <ZoneText
                    as={titleAs}
                    id={titleId}
                    text={title}
                    zone={pill ? ZONES.titleBesidePill : ZONES.title}
                    className={styles.title}
                />
                {subtitle ? <ZoneText text={subtitle} zone={ZONES.subtitle} className={styles.subtitle} /> : null}
                {pill ? <ZoneText text={pill} zone={ZONES.pill} className={`${styles.pill} ${styles[`ink_${pillTone}`]}`} /> : null}
            </div>
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
            <div className={styles.foot}>
                {hasPlates ? <TriviaPlateButton zone={ZONES.secondary} {...secondaryAction} /> : null}
                {hasPlates ? <TriviaPlateButton zone={ZONES.primary} {...primaryAction} /> : null}
            </div>
        </Tag>
    );
}

export { ZONES as TRIVIA_CONSOLE_ZONES, INKS as TRIVIA_CONSOLE_INKS };
