/**
 * SharedAvatar — Extracted from social-media/index.js L104-121
 * Reusable avatar component with online indicator and click/link support.
 */
import { useRouter } from 'next/router';
import Image from 'next/image';
import { SOCIAL_COLORS as C } from '../../lib/socialHelpers';

export function SharedAvatar({ src, name, size = 40, online, onClick, linkTo }) {
    const router = useRouter();
    const handleClick = onClick || (linkTo ? () => router.push(linkTo) : null);
    
    const finalSrc = src || '/default-avatar.png';
    // Only apply edge-compression to domains we whitelisted in next.config.js to prevent 500 errors on random OAuth domains
    const isAllowedDomain = finalSrc.startsWith('/') || finalSrc.includes('supabase.co') || finalSrc.includes('smarter.poker') || finalSrc.includes('unsplash.com');

    return (
        <div
            className="sp-avatar"
            style={{
                '--sp-avatar-size': `${size}px`,
                position: 'relative',
                display: 'inline-block',
                cursor: handleClick ? 'pointer' : 'default',
                width: size,
                height: size,
                minWidth: size,
                minHeight: size,
                aspectRatio: '1 / 1',
                borderRadius: '50%',
                overflow: 'hidden',
                flexShrink: 0,
            }}
            onClick={handleClick}
        >
            <Image
                src={finalSrc}
                alt={name || 'User'}
                width={size}
                height={size}
                unoptimized={!isAllowedDomain}
                style={{ borderRadius: '50%', objectFit: 'cover', width: '100%', height: '100%' }}
            />
            {online !== undefined && <div style={{ position: 'absolute', bottom: 0, right: 0, width: size * 0.28, height: size * 0.28, borderRadius: '50%', background: online ? C.green : '#ccc', border: '2px solid white', zIndex: 2 }} />}
        </div>
    );
}

export default SharedAvatar;
