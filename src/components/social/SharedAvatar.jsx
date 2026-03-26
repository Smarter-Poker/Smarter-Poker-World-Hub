/**
 * SharedAvatar — Extracted from social-media/index.js L104-121
 * Reusable avatar component with online indicator and click/link support.
 */
import { useRouter } from 'next/router';
import { SOCIAL_COLORS as C } from '../../lib/socialHelpers';

export function SharedAvatar({ src, name, size = 40, online, onClick, linkTo }) {
    const router = useRouter();
    const handleClick = onClick || (linkTo ? () => router.push(linkTo) : null);

    return (
        <div
            style={{ position: 'relative', display: 'inline-block', cursor: handleClick ? 'pointer' : 'default' }}
            onClick={handleClick}
        >
            <img
                src={src || '/default-avatar.png'}
                alt={name || 'User'}
                style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }}
            />
            {online !== undefined && <div style={{ position: 'absolute', bottom: 0, right: 0, width: size * 0.28, height: size * 0.28, borderRadius: '50%', background: online ? C.green : '#ccc', border: '2px solid white' }} />}
        </div>
    );
}

export default SharedAvatar;
