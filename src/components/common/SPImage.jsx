import Image from 'next/image';
import { useMemo } from 'react';
import { shouldOptimizeSpImageSrc } from '../../lib/security/spImageOptimization.mjs';

export { shouldOptimizeSpImageSrc };

/**
 * SPImage (Smarter Poker Image)
 * ═══════════════════════════════════════════════════════════════════════════
 * A universal wrapper for Next.js <Image> that safely degrades to an unoptimized
 * native render if the source URL is not in our approved next.config.js list or
 * is a dynamic `/api/*` / query-string local route (preventing Next.js 16
 * `/_next/image` 400 `INVALID_IMAGE_OPTIMIZE_REQUEST` errors).
 *
 * Usage is identical to <img>, except you MUST provide layout="fill" OR width/height.
 */
export function SPImage({ src, alt = "", width, height, layout = "fill", objectFit = "cover", className = "", style = {}, unoptimized, ...props }) {
    // Strings are trimmed so a stray space can neither break the URL nor desync the optimizer decision.
    const cleanSrc = typeof src === 'string' ? src.trim() : src;
    const finalSrc = cleanSrc || '/default-avatar.png';
    const isAllowedDomain = useMemo(() => shouldOptimizeSpImageSrc(finalSrc), [finalSrc]);

    if (width && height) {
        return (
            <Image
                {...props}
                src={finalSrc}
                alt={alt}
                width={width}
                height={height}
                className={className}
                style={{ objectFit, ...style }}
                unoptimized={unoptimized || !isAllowedDomain}
            />
        );
    }

    return (
        <Image
            {...props}
            src={finalSrc}
            alt={alt}
            fill
            className={className}
            style={{ objectFit, ...style }}
            unoptimized={unoptimized || !isAllowedDomain}
        />
    );
}

export default SPImage;
