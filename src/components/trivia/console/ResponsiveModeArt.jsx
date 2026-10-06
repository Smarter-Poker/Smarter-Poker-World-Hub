import { useEffect, useRef, useState } from 'react';
import styles from './ResponsiveModeArt.module.css';

/**
 * The wide crop takes over from this width: tablets, landscape phones and
 * desktop get the 12:5 cinematic band, phones get the 16:10 crop that stacks
 * above the copy. The stylesheet switches the reserved box at the same width.
 */
export const TRIVIA_ART_WIDE_MEDIA = '(min-width: 768px)';

// The art spans the console glass: 79% of the console, which stops at 1000px.
const DEFAULT_SIZES = '(min-width: 1000px) 790px, 79vw';

/**
 * One Trivia family's destination art (#SmarterCasinoRealism unique art
 * program, src/config/triviaIntroArt.mjs). It is a text-free picture: every
 * word a player needs is printed live beside it, so it is decorative unless
 * the caller passes `alt`.
 *
 * - Art direction: a 16:10 crop below 768px and a 12:5 band from 768px, each
 *   offered as AVIF then WebP at 640/960/1440 with intrinsic sizes. Files are
 *   content-hashed, so a changed picture is always a new URL.
 * - The box is reserved by aspect-ratio and painted with the art's own 32x20
 *   preview, so a slow network, a fast scroll or a failed file never leaves a
 *   blank panel. A failed image is hidden and the preview stays.
 * - `priority` is for the single hero of the current page (eager, high fetch
 *   priority). Everything else loads lazily.
 */
export default function ResponsiveModeArt({
    art,
    priority = false,
    sizes = DEFAULT_SIZES,
    alt = '',
    className = '',
    ...rest
}) {
    const artRef = useRef(null);
    const imageRef = useRef(null);
    const artKey = art?.key || null;
    const [artFailure, setArtFailure] = useState(() => ({ key: artKey, failed: false }));
    const [ready, setReady] = useState(Boolean(priority));
    // A failed request belongs to the exact art identity that emitted it. Do
    // not carry that failure through a Pages-router reuse into the next mode.
    // Identity-derived state resets in the same render (an effect would leave
    // the replacement hidden for one paint).
    let currentFailure = artFailure;
    if (artFailure.key !== artKey) {
        currentFailure = { key: artKey, failed: false };
        setArtFailure(currentFailure);
    }
    const failed = Boolean(artKey) && currentFailure.failed;

    useEffect(() => {
        if (ready || priority) {
            if (priority && !ready) setReady(true);
            return undefined;
        }
        const artNode = artRef.current;
        if (!artNode || typeof IntersectionObserver === 'undefined') {
            setReady(true);
            return undefined;
        }
        const observer = new IntersectionObserver((entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            setReady(true);
            observer.disconnect();
        }, { rootMargin: '128px 0px' });
        observer.observe(artNode);
        return () => observer.disconnect();
    }, [priority, ready]);

    // A file that failed before hydration never fires onError for React.
    useEffect(() => {
        const image = imageRef.current;
        if (ready && image && image.complete && image.naturalWidth === 0 && image.currentSrc) {
            setArtFailure((current) => current.key === artKey
                ? { ...current, failed: true }
                : current);
        }
    }, [artKey, ready]);

    if (!art) return null;
    const decorative = !alt;

    return (
        <span
            ref={artRef}
            className={`${styles.art} ${className}`.trim()}
            data-art={art.key}
            data-art-state={failed ? 'error' : 'ready'}
            style={{ '--trivia-art-preview': `url("${art.preview}")` }}
            {...rest}
        >
            <picture key={art.key} className={styles.picture}>
                <source
                    media={TRIVIA_ART_WIDE_MEDIA}
                    type="image/avif"
                    srcSet={ready ? art.wide.avif : undefined}
                    sizes={sizes}
                    width={art.wide.width}
                    height={art.wide.height}
                />
                <source
                    media={TRIVIA_ART_WIDE_MEDIA}
                    type="image/webp"
                    srcSet={ready ? art.wide.webp : undefined}
                    sizes={sizes}
                    width={art.wide.width}
                    height={art.wide.height}
                />
                <source type="image/avif" srcSet={ready ? art.mobile.avif : undefined} sizes={sizes} />
                <img
                    ref={imageRef}
                    className={styles.image}
                    src={ready ? art.mobile.src : art.preview}
                    srcSet={ready ? art.mobile.webp : undefined}
                    sizes={sizes}
                    width={art.mobile.width}
                    height={art.mobile.height}
                    alt={alt}
                    aria-hidden={decorative ? 'true' : undefined}
                    loading={priority ? 'eager' : 'lazy'}
                    fetchpriority={priority ? 'high' : 'auto'}
                    decoding="async"
                    draggable={false}
                    onError={() => setArtFailure((current) => current.key === art.key
                        ? { ...current, failed: true }
                        : current)}
                />
            </picture>
        </span>
    );
}
