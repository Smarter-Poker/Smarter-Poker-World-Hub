import Image from 'next/image';
import { useMemo } from 'react';

/**
 * SPImage (Smarter Poker Image)
 * ═══════════════════════════════════════════════════════════════════════════
 * A universal wrapper for Next.js <Image> that safely degrades to an unoptimized
 * native render if the source URL is not in our approved next.config.js list.
 * Prevents Next.js Server 500 crashes from external OAuth domains (FB, Google, etc).
 * 
 * Usage is identical to <img>, except you MUST provide layout="fill" OR width/height.
 */
export function SPImage({ src, alt = "", width, height, layout = "fill", objectFit = "cover", className = "", style = {}, unoptimized, ...props }) {
    
    const finalSrc = src || '/default-avatar.png';
    
    // Safety check: is this domain whitelisted for Edge optimization in next.config.js?
    const isAllowedDomain = useMemo(() => {
        if (typeof finalSrc !== 'string') return false; 
        if (finalSrc.startsWith('/') || finalSrc.startsWith('data:')) return true;
        
        const allowedMasks = [
            'supabase.co', 
            'smarter.poker', 
            'unsplash.com', 
            'img.youtube.com', 
            'api.qrserver.com'
        ];
        
        try {
            const urlObj = new URL(finalSrc);
            return allowedMasks.some(mask => urlObj.hostname.includes(mask));
        } catch (e) {
            return false; // Invalid URL, fallback to unoptimized rendering
        }
    }, [finalSrc]);

    // If width/height are provided, use fixed sizing format
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

    // Otherwise use fill logic (parent must have position: 'relative' or similar)
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
