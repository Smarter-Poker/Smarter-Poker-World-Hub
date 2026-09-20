import { useEffect, useId, useRef } from 'react';
import { acquireScrollLock } from '../../lib/scrollLock';
import PokerNearMeConsole from './PokerNearMeConsole';

/**
 * Shared confirmation surface for Poker Near Me and Home Games actions.
 * The interaction contract lives here; PokerNearMeConsole supplies the
 * approved painted chassis and its two physical action plates.
 */
export default function CasinoActionDialog({
  open,
  eyebrow = 'Confirm action',
  title,
  message,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  busy = false,
  confirmDisabled = false,
  destructive = false,
  onConfirm,
  onClose,
}) {
  const titleId = useId();
  const messageId = useId();
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);
  busyRef.current = busy;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const releaseScrollLock = acquireScrollLock('PokerNearMeCasinoActionDialog');
    const focusTimer = window.setTimeout(() => cancelRef.current?.focus(), 0);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !busyRef.current) onCloseRef.current?.();
      if (event.key === 'Tab') {
        const focusable = Array.from(
          dialogRef.current?.querySelectorAll(
            'a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'
          ) || []
        );
        if (focusable.length === 0) {
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
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      releaseScrollLock();
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="pnm-console-dialog-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose?.();
      }}
    >
      <section
        ref={dialogRef}
        className="pnm-console-dialog-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        aria-busy={busy}
      >
        <PokerNearMeConsole
          as="div"
          className="pnm-console-dialog"
          crest={destructive ? 'diamond' : 'flat'}
          eyebrow={eyebrow}
          title={title}
          titleId={titleId}
          plates={{
            secondary: {
              label: cancelLabel,
              buttonRef: cancelRef,
              onClick: onClose,
              disabled: busy,
              'aria-label': cancelLabel,
            },
            primary: {
              label: busy ? 'Working...' : confirmLabel,
              ink: destructive ? 'red' : 'blue',
              onClick: onConfirm,
              disabled: busy || confirmDisabled,
              'aria-label': busy ? 'Working' : confirmLabel,
            },
          }}
        >
          <div className="pnm-console-dialog__body">
            {message ? <p id={messageId} className="pnm-console-dialog__copy">{message}</p> : null}
            {children ? <div className="pnm-console-dialog__content">{children}</div> : null}
          </div>
        </PokerNearMeConsole>
      </section>
    </div>
  );
}
