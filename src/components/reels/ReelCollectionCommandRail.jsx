import Link from 'next/link';
import { useRouter } from 'next/router';

import styles from './ReelCollectionCommandRail.module.css';
import { categoryForReelsRoute } from '../../lib/reelsFeedClient';

const COMMANDS = Object.freeze([
    { href: '/hub/video-library', label: 'Video Library' },
    { href: '/hub/reels?category=for-you', label: 'For You', category: 'for-you' },
    { href: '/hub/reels?category=poker', label: 'Poker', category: 'poker' },
    { href: '/hub/reels?category=casino-slots', label: 'Casino And Slots', category: 'casino-slots' },
    { href: '/hub/reels?category=sports', label: 'Sports', category: 'sports' },
    { href: '/hub/reels?category=following', label: 'Following', category: 'following' },
    { href: '/hub/reels/my-reels', label: 'My Reels' },
    { href: '/hub/reels/saved', label: 'Saved Reels' },
    { href: '/hub/reels/creator', label: 'Creator Rights' },
]);

export default function ReelCollectionCommandRail() {
    const router = useRouter();
    const currentPath = String(router.asPath || router.pathname || '').split('?')[0];

    return (
        <nav className={styles.rail} aria-label="Video Library Command Rail">
            <span className={styles.label}>Command Rail</span>
            <div className={styles.track}>
                {COMMANDS.map(command => {
                    const current = command.category
                        ? currentPath === '/hub/reels'
                            && categoryForReelsRoute(router.query) === command.category
                        : currentPath === command.href;
                    return (
                        <Link
                            key={command.href}
                            href={command.href}
                            className={styles.command}
                            aria-current={current ? 'page' : undefined}
                        >
                            {command.label}
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
