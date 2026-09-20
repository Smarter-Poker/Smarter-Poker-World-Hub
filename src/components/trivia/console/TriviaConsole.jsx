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

export function TriviaPlateButton({ label, zone, className = '', children, ...buttonProps }) {
    const text = String(label ?? children ?? '');
    const ref = useFitText(text, 1, 0.5);
    return (
        <button
            type="button"
            className={`${styles.plate} ${className}`.trim()}
            style={zoneStyle(zone, PLATES_HEIGHT)}
            {...buttonProps}
        >
            <span className={styles.plateWell}>
                <span ref={ref} className={styles.plateText}>{text}</span>
            </span>
        </button>
    );
}

/**
 * Variable-height Trivia chassis cut from the approved Club Arena spade master.
 * Nothing except live text is painted in DOM/CSS.
 */
export default function TriviaConsole({
    as: Tag = 'section',
    eyebrow,
    title,
    titleAs = 'h2',
    titleId,
    subtitle,
    pill,
    children,
    primaryAction,
    secondaryAction,
    className = '',
    ...rest
}) {
    const hasActions = Boolean(primaryAction || secondaryAction);
    return (
        <Tag
            className={`${styles.console} ${hasActions ? styles.withPlates : ''} ${className}`.trim()}
            data-master-art="spade-console-v1"
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
                {pill ? <ZoneText text={pill} zone={ZONES.pill} className={styles.pill} /> : null}
            </div>
            {children !== undefined && children !== null ? <div className={styles.body}>{children}</div> : null}
            <div className={styles.foot}>
                {secondaryAction ? <TriviaPlateButton zone={ZONES.secondary} {...secondaryAction} /> : null}
                {primaryAction ? <TriviaPlateButton zone={ZONES.primary} {...primaryAction} /> : null}
            </div>
        </Tag>
    );
}

export { ZONES as TRIVIA_CONSOLE_ZONES };
