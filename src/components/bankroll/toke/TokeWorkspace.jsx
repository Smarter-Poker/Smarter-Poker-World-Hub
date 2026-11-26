import Link from 'next/link';
import { ArrowLeft, ChevronRight, Coins } from 'lucide-react';
import styles from './TokeWorkspace.module.css';

const home = '/hub/toke-tracker';
const sections = [
    { slug: 'shift', title: 'Shift Tracker', description: 'Clock in, track downs, and log tokes.', art: '/images/toke-shift.webp' },
    { slug: 'analytics', title: 'Analytics', description: 'Review earnings, hourly rates, and trends.', art: '/images/toke-analytics.webp' },
    { slug: 'vault', title: 'Dealer Vault', description: 'Manage licenses, pay stubs, and tax documents.', art: '/images/toke-vault.webp' },
    { slug: 'venues', title: 'Venue Intel', description: 'Compare venues and plan shifts on your calendar.', art: '/images/toke-venues.webp' },
];

export function TokeDestinations() {
    return (
        <nav aria-label="Toke Tracker Tools" className={styles.destinations}>
            {sections.map(section => (
                <Link href={home + '/' + section.slug} key={section.slug} className={styles.destination}>
                    <span className={styles.destinationArt}><img src={section.art} alt="" width="112" height="112" /></span>
                    <span className={styles.destinationCopy}>
                        <strong>{section.title}</strong>
                        <span>{section.description}</span>
                    </span>
                    <ChevronRight size={19} aria-hidden="true" />
                </Link>
            ))}
        </nav>
    );
}

export function TokeWorkspace({ section, children }) {
    const current = sections.find(item => item.slug === section);
    return (
        <div className={'smarterdesign ' + styles.workspace}>
            <div className={styles.shell}>
                <header className={'sd-masthead ' + styles.masthead}>
                    {current && <span className={styles.mastArt}><img src={current.art} alt="" /></span>}
                    <div className={styles.mastCopy}>
                        {current && (
                            <Link href={home} className={styles.back}><ArrowLeft size={14} aria-hidden="true" /> Toke Tracker</Link>
                        )}
                        <h1>{!current && <Coins size={30} aria-hidden="true" className={styles.titleIcon} />}{current?.title || 'Toke Tracker'}</h1>
                    </div>
                </header>
                {current && (
                    <nav aria-label="Toke Tracker Tools" className={'sd-tabs ' + styles.sectionNav}>
                        {sections.map(item => (
                            <Link key={item.slug} href={home + '/' + item.slug} aria-current={item.slug === section ? 'page' : undefined}>{item.title}</Link>
                        ))}
                    </nav>
                )}
                {children}
            </div>
        </div>
    );
}
