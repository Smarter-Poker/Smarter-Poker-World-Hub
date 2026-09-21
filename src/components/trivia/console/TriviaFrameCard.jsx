import { useFitText } from './useFitText';
import styles from './TriviaFrameCard.module.css';

const FRAME_ASSETS = Object.freeze({
    knowledge: '/images/trivia/console/card-frames/knowledge-v1.png',
    strategy: '/images/trivia/console/card-frames/strategy-v1.png',
    challenge: '/images/trivia/console/card-frames/endurance-v1.png',
    competitive: '/images/trivia/console/card-frames/competitive-v1.png',
    progress: '/images/trivia/console/card-frames/progress-v1.png',
});

/**
 * A single painted frame around one live artwork image. Copy stays below the
 * picture on mobile and desktop; there is never a second CSS card/frame.
 */
export default function TriviaFrameCard({
    family,
    image,
    imageAlt,
    frameLabel,
    children,
    className = '',
    imagePriority = false,
    ...rest
}) {
    const resolvedFamily = FRAME_ASSETS[family] ? family : 'knowledge';
    const labelRef = useFitText(frameLabel, 1, 0.5);
    return (
        <button
            type="button"
            className={`${styles.card} ${styles[resolvedFamily]} ${className}`.trim()}
            data-master-art={`trivia-${resolvedFamily}-frame-v1`}
            {...rest}
        >
            <span className={styles.visual}>
                <span className={styles.artWell}>
                    <img
                        className={styles.art}
                        src={image}
                        alt={imageAlt}
                        width="1024"
                        height="1024"
                        loading={imagePriority ? 'eager' : 'lazy'}
                        decoding="async"
                    />
                </span>
                <img
                    className={styles.frame}
                    src={FRAME_ASSETS[resolvedFamily]}
                    alt=""
                    aria-hidden="true"
                    width="1254"
                    height="1254"
                    loading={imagePriority ? 'eager' : 'lazy'}
                    decoding="async"
                />
                {frameLabel ? (
                    <span className={styles.caption}>
                        <span className={styles.captionFace}>
                            <span ref={labelRef} className={styles.captionText}>{frameLabel}</span>
                        </span>
                    </span>
                ) : null}
            </span>
            <span className={styles.copy}>{children}</span>
        </button>
    );
}

export { FRAME_ASSETS as TRIVIA_FRAME_ASSETS };
