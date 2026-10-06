import { useEffect, useRef, useState } from 'react';
import { useFitText } from './useFitText';
import styles from './TriviaFrameCard.module.css';

const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const CARD_ART_ROOT_MARGIN = '128px 0px';

function useDeferredCardArt(priority) {
    const visualRef = useRef(null);
    const [ready, setReady] = useState(Boolean(priority));

    useEffect(() => {
        if (ready || priority) {
            if (priority && !ready) setReady(true);
            return undefined;
        }
        const visual = visualRef.current;
        if (!visual || typeof IntersectionObserver === 'undefined') {
            setReady(true);
            return undefined;
        }
        const observer = new IntersectionObserver((entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            setReady(true);
            observer.disconnect();
        }, { rootMargin: CARD_ART_ROOT_MARGIN });
        observer.observe(visual);
        return () => observer.disconnect();
    }, [priority, ready]);

    return { visualRef, ready };
}

// WebP renders of the approved frame masters (same 1254 x 1254 pixels with
// alpha, about a fifth of the PNG weight).
const FRAME_ASSETS = Object.freeze({
    knowledge: '/images/trivia/console/card-frames/knowledge-v1.webp',
    strategy: '/images/trivia/console/card-frames/strategy-v1.webp',
    challenge: '/images/trivia/console/card-frames/endurance-v1.webp',
    competitive: '/images/trivia/console/card-frames/competitive-v1.webp',
    // The progress master turned over (#ClubArenaConsole 5.7 flat-cap technique):
    // its compass crest now sits at the top and the caption slot at the bottom,
    // which is Dan's 'icon at the top, flat bottom' law.
    progress: '/images/trivia/console/card-frames/progress-v2.webp',
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
    imagePreview,
    ...rest
}) {
    const resolvedFamily = FRAME_ASSETS[family] ? family : 'knowledge';
    const labelRef = useFitText(frameLabel, 1, 0.5);
    const { visualRef, ready: artReady } = useDeferredCardArt(imagePriority);
    return (
        <button
            type="button"
            className={`${styles.card} ${styles[resolvedFamily]} ${className}`.trim()}
            data-master-art={`trivia-${resolvedFamily}-frame-v1`}
            {...rest}
        >
            <span
                ref={visualRef}
                className={styles.visual}
                data-card-art-ready={artReady ? 'true' : 'false'}
            >
                {/* The picture's own tiny preview paints the well until the file
                    decodes, so a fast scroll never shows an empty window. */}
                <span
                    className={styles.artWell}
                    style={imagePreview ? { '--trivia-art-preview': `url("${imagePreview}")` } : undefined}
                >
                    <img
                        className={styles.art}
                        src={artReady ? image : TRANSPARENT_PIXEL}
                        alt={imageAlt}
                        width="1024"
                        height="1024"
                        loading={imagePriority ? 'eager' : 'lazy'}
                        decoding="async"
                    />
                </span>
                <img
                    className={styles.frame}
                    src={artReady ? FRAME_ASSETS[resolvedFamily] : TRANSPARENT_PIXEL}
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
