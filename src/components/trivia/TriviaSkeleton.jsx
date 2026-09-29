/**
 * TRIVIA CONSOLE LOADING STATE
 * Live status only. The parent TriviaConsole owns the painted chassis.
 */

import React from 'react';
import styles from './TriviaSkeleton.module.css';

export default function TriviaSkeleton({ label = 'Loading Questions' }) {
    return (
        <div
            className={styles.container}
            data-testid="trivia-skeleton"
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <p className={styles.label}>{label}</p>
            <div className={styles.pulseRail} aria-hidden="true">
                <span />
                <span />
                <span />
            </div>
        </div>
    );
}
