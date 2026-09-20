import { useEffect, useId, useRef } from 'react';
import TriviaConsole from './TriviaConsole';
import styles from './TriviaConsoleDialog.module.css';

const FOCUSABLE = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Accessible modal rendered on the approved variable-height console master. */
export default function TriviaConsoleDialog({
    open,
    onClose,
    eyebrow,
    title,
    subtitle,
    pill,
    children,
    primaryAction,
    secondaryAction,
    closeOnBackdrop = true,
}) {
    const generatedId = useId();
    const titleId = `trivia-console-dialog-${generatedId.replace(/:/g, '')}`;
    const dialogRef = useRef(null);
    const returnFocusRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        returnFocusRef.current = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const dialog = dialogRef.current;
        const focusables = () => Array.from(dialog?.querySelectorAll(FOCUSABLE) || []);
        window.requestAnimationFrame(() => {
            const nodes = focusables();
            (nodes[nodes.length - 1] || dialog)?.focus();
        });

        const onKeyDown = event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose?.();
                return;
            }
            if (event.key !== 'Tab') return;
            const nodes = focusables();
            if (nodes.length === 0) {
                event.preventDefault();
                dialog?.focus();
                return;
            }
            const first = nodes[0];
            const last = nodes[nodes.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = previousOverflow;
            returnFocusRef.current?.focus?.();
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className={styles.backdrop}
            onPointerDown={event => {
                if (closeOnBackdrop && event.target === event.currentTarget) onClose?.();
            }}
        >
            <div
                ref={dialogRef}
                className={styles.dialog}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
            >
                <TriviaConsole
                    eyebrow={eyebrow}
                    title={title}
                    titleId={titleId}
                    subtitle={subtitle}
                    pill={pill}
                    primaryAction={primaryAction}
                    secondaryAction={secondaryAction}
                >
                    {children}
                </TriviaConsole>
            </div>
        </div>
    );
}
