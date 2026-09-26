import Link from 'next/link';
import { useRouter } from 'next/router';

import styles from './ReelCollectionCommandRail.module.css';

const COMMANDS = Object.freeze([
    { href: '/hub/video-library', label: 'Video Library' },
    { href: '/hub/reels', label: 'All Reels' },
    { href: '/hub/reels/my-reels', label: 'My Reels' },
    { href: '/hub/reels/saved', label: 'Saved Reels' },
]);

export default function ReelCollectionCommandRail() {
    const router = useRouter();
    const currentPath = String(router.asPath || router.pathname || '').split('?')[0];

    return (
        <nav className={styles.rail} aria-label="Video Library Command Rail">
            <span className={styles.label}>Command Rail</span>
            <div className={styles.track}>
                {COMMANDS.map(command => {
                    const current = currentPath === command.href;
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

