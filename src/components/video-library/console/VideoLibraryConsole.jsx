import {
    CONSOLE_CAP_HEIGHT,
    CONSOLE_PLATES_HEIGHT,
    CONSOLE_TOP_HEIGHT,
    CONSOLE_WIDTH,
    CONSOLE_ZONES,
    isConsolePlateAction,
    resolveConsoleFoot,
    zonePct,
} from './consoleGeometry.mjs';
import { useFitText } from './useFitText';
import styles from './VideoLibraryConsole.module.css';

const INK_CLASSES = Object.freeze({
    silver: styles.inkSilver,
    white: styles.inkWhite,
    blue: styles.inkBlue,
    green: styles.inkGreen,
    red: styles.inkRed,
    gold: styles.inkGold,
    muted: styles.inkMuted,
});

function joinClasses(...values) {
    return values.filter(Boolean).join(' ');
}

function inkClass(ink) {
    return INK_CLASSES[ink] || INK_CLASSES.silver;
}

/** Fitted, single-line text placed in a measured master-art zone. */
export function ConsoleZoneText({
    text,
    className = '',
    as: Tag = 'span',
    id,
    ink = 'silver',
    minRatio = 0.5,
    style,
}) {
    const ref = useFitText(text, 1, minRatio);

    return (
        <Tag className={joinClasses(styles.zone, inkClass(ink), className)} id={id} style={style}>
            <span ref={ref}>{text}</span>
        </Tag>
    );
}

/**
 * A native button placed over a plate already painted into bottom-plates.png.
 * The element itself paints no face, frame, border, gradient, or icon.
 */
export function ConsolePlateButton({
    position = 'primary',
    zone,
    canvasWidth = CONSOLE_WIDTH,
    canvasHeight = CONSOLE_PLATES_HEIGHT,
    label,
    ink = 'silver',
    buttonRef,
    className = '',
    style,
    type = 'button',
    'aria-label': ariaLabel,
    ...rest
}) {
    const ref = useFitText(label, 1, 0.5);
    const resolvedZone = zone || (
        position === 'secondary' ? CONSOLE_ZONES.plateSecondary : CONSOLE_ZONES.platePrimary
    );

    return (
        <button
            {...rest}
            ref={buttonRef}
            type={type}
            aria-label={ariaLabel || label}
            className={joinClasses(styles.plate, className)}
            style={{ ...zonePct(resolvedZone, canvasWidth, canvasHeight), ...style }}
        >
            <span className={styles.plateWell}>
                <span className={joinClasses(styles.plateText, inkClass(ink))} ref={ref}>
                    {label}
                </span>
            </span>
        </button>
    );
}

/** Body copy printed directly on the chassis glass. */
export function ConsoleCopy({ children, as: Tag = 'p', align = 'start', className = '', ...rest }) {
    return (
        <Tag
            {...rest}
            className={joinClasses(
                styles.copy,
                align === 'center' && styles.copyCentered,
                className
            )}
        >
            {children}
        </Tag>
    );
}

/** A fitted label/value pair printed directly on the chassis glass. */
export function ConsoleDataRow({ label, value, valueInk = 'silver', className = '', ...rest }) {
    const valueText = value === undefined || value === null ? '' : String(value);
    const labelRef = useFitText(label, 1, 0.55);
    const valueRef = useFitText(valueText, 1, 0.5);

    return (
        <div {...rest} className={joinClasses(styles.dataRow, className)}>
            <span className={joinClasses(styles.dataFace, styles.dataLabel)}>
                <span ref={labelRef}>{label}</span>
            </span>
            <span className={joinClasses(styles.dataFace, styles.dataValue, inkClass(valueInk))}>
                <span ref={valueRef}>{valueText}</span>
            </span>
        </div>
    );
}

/**
 * The approved Club Arena master rendered as three native-ratio slices.
 * `foot="foot"` and `foot="cap"` both select the flat closing cap.
 */
export function VideoLibraryConsole({
    eyebrow,
    title,
    titleId,
    titleAs: TitleTag = 'h2',
    subtitle,
    pill,
    pillInk = 'blue',
    foot,
    plates,
    children,
    className = '',
    as: Tag = 'section',
    ...rest
}) {
    const footKind = resolveConsoleFoot(foot, plates);

    return (
        <Tag
            {...rest}
            className={joinClasses(styles.console, footKind === 'plates' && styles.withPlates, className)}
            data-console-foot={footKind}
        >
            <div className={styles.head} aria-hidden={!eyebrow && !title && !subtitle && !pill}>
                {eyebrow ? (
                    <ConsoleZoneText
                        text={eyebrow}
                        ink="blue"
                        className={styles.eyebrow}
                        style={zonePct(CONSOLE_ZONES.eyebrow, CONSOLE_WIDTH, CONSOLE_TOP_HEIGHT)}
                    />
                ) : null}

                <ConsoleZoneText
                    as={TitleTag}
                    id={titleId}
                    text={title}
                    ink="silver"
                    className={styles.title}
                    style={zonePct(
                        pill ? CONSOLE_ZONES.titleBesidePill : CONSOLE_ZONES.title,
                        CONSOLE_WIDTH,
                        CONSOLE_TOP_HEIGHT
                    )}
                />

                {subtitle ? (
                    <ConsoleZoneText
                        text={subtitle}
                        ink="muted"
                        className={styles.subtitle}
                        style={zonePct(CONSOLE_ZONES.subtitle, CONSOLE_WIDTH, CONSOLE_TOP_HEIGHT)}
                    />
                ) : null}

                {pill ? (
                    <ConsoleZoneText
                        text={pill}
                        ink={pillInk}
                        className={styles.pill}
                        style={zonePct(CONSOLE_ZONES.pill, CONSOLE_WIDTH, CONSOLE_TOP_HEIGHT)}
                    />
                ) : null}
            </div>

            {children !== undefined && children !== null ? (
                <div className={styles.body}>{children}</div>
            ) : null}

            <div className={styles.foot}>
                {footKind === 'plates' ? (
                    <>
                        <ConsolePlateButton position="secondary" {...plates.secondary} />
                        <ConsolePlateButton position="primary" {...plates.primary} />
                    </>
                ) : null}
            </div>
        </Tag>
    );
}

export {
    CONSOLE_CAP_HEIGHT,
    CONSOLE_PLATES_HEIGHT,
    CONSOLE_TOP_HEIGHT,
    CONSOLE_WIDTH,
    CONSOLE_ZONES,
    isConsolePlateAction,
    zonePct,
};

export default VideoLibraryConsole;
