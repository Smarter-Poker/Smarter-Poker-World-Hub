import { useEffect, useRef } from 'react';

import VideoLibraryConsole, {
    ConsoleCopy,
    ConsoleDataRow,
} from '../video-library/console/VideoLibraryConsole';
import styles from './ReelsGalleryModal.module.css';

const FOCUSABLE = [
    'button:not([disabled])',
    'video[controls]',
    'a[href]',
    'input:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

export default function ReelsGalleryModal({ isOpen, onClose, userReels = [] }) {
    const dialogRef = useRef(null);
    const returnFocusRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return undefined;
        returnFocusRef.current = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const focusTimer = window.setTimeout(() => {
            dialogRef.current?.querySelector(FOCUSABLE)?.focus();
        }, 0);
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = [...(dialogRef.current?.querySelectorAll(FOCUSABLE) || [])]
                .filter(element => element.getClientRects().length > 0);
            if (!focusable.length) {
                event.preventDefault();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            window.clearTimeout(focusTimer);
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
            const returnFocus = returnFocusRef.current;
            if (returnFocus?.isConnected) returnFocus.focus();
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;
    const reels = Array.isArray(userReels) ? userReels.filter(Boolean) : [];

    return (
        <div className={styles.overlay} role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
        }}>
            <div
                ref={dialogRef}
                className={styles.dialog}
                role="dialog"
                aria-modal="true"
                aria-labelledby="profile-reels-title"
            >
                <VideoLibraryConsole
                    eyebrow="Profile Archive"
                    title="My Reels"
                    titleId="profile-reels-title"
                    titleAs="h2"
                    subtitle="Videos Published From Your Poker Posts"
                    pill={`${reels.length} Loaded`}
                    pillInk="blue"
                    foot="foot"
                    className={styles.console}
                >
                    <ConsoleDataRow
                        label="Archive Status"
                        value={reels.length ? 'Reels Available' : 'No Reels Yet'}
                        valueInk={reels.length ? 'green' : 'gold'}
                    />
                    <button type="button" className={styles.closeAction} onClick={onClose}>
                        Close Gallery
                    </button>
                    {reels.length === 0 ? (
                        <ConsoleCopy align="center">
                            Videos From Your Posts Will Appear Here
                        </ConsoleCopy>
                    ) : (
                        <div className={styles.gallery} aria-label="My Published Reels">
                            {reels.map((reel, index) => (
                                <article className={styles.reel} key={reel.id || `${reel.media_url}-${index}`}>
                                    {reel.media_url ? (
                                        <video
                                            className={styles.media}
                                            src={reel.media_url}
                                            poster={reel.thumbnail_url || undefined}
                                            controls
                                            playsInline
                                            preload="metadata"
                                            aria-label={`Reel ${index + 1}${reel.caption ? `: ${reel.caption}` : ''}`}
                                        />
                                    ) : (
                                        <ConsoleCopy align="center">Reel Media Is Unavailable</ConsoleCopy>
                                    )}
                                    {reel.caption ? <p className={styles.caption}>{reel.caption}</p> : null}
                                </article>
                            ))}
                        </div>
                    )}
                </VideoLibraryConsole>
            </div>
        </div>
    );
}
