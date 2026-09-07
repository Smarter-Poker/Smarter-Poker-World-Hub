import { useEffect, useId, useRef } from 'react';
import { acquireScrollLock } from '../../lib/scrollLock';

/**
 * Small, shared confirmation surface for Poker Near Me and Home Games actions.
 * It deliberately uses continuous rectangular borders rather than clipped
 * corners or decorative pseudo-elements, so the frame remains crisp at every
 * device-pixel ratio.
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
      className="pnm-action-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose?.();
      }}
    >
      <section
        ref={dialogRef}
        className="pnm-action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
      >
        <div className="pnm-action-dialog-rail" aria-hidden="true" />
        <div className="pnm-action-dialog-eyebrow">{eyebrow}</div>
        <h2 id={titleId}>{title}</h2>
        {message ? <p id={messageId}>{message}</p> : null}
        {children ? <div className="pnm-action-dialog-content">{children}</div> : null}
        <div className="pnm-action-dialog-actions">
          <button
            ref={cancelRef}
            type="button"
            className="pnm-action-dialog-button secondary"
            onClick={onClose}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`pnm-action-dialog-button ${destructive ? 'destructive' : 'primary'}`}
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </section>

      <style jsx>{`
        .pnm-action-dialog-backdrop {
          position: fixed;
          inset: 0;
          z-index: 12000;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(0, 3, 8, 0.86);
        }
        .pnm-action-dialog {
          position: relative;
          width: min(100%, 460px);
          overflow: hidden;
          border: 1px solid #657386;
          border-radius: 3px;
          padding: 28px;
          background: #070b12;
          box-shadow:
            inset 0 0 0 1px rgba(255, 255, 255, 0.06),
            0 24px 80px rgba(0, 0, 0, 0.72),
            0 0 24px rgba(14, 165, 233, 0.1);
          color: #f8fafc;
        }
        .pnm-action-dialog-rail {
          position: absolute;
          inset: 0 0 auto;
          height: 2px;
          background: #38bdf8;
          box-shadow: 0 0 14px rgba(56, 189, 248, 0.65);
        }
        .pnm-action-dialog-eyebrow {
          margin-bottom: 10px;
          color: #7dd3fc;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }
        h2 {
          margin: 0;
          color: #f8fafc;
          font-size: clamp(21px, 5vw, 28px);
          font-weight: 500;
          letter-spacing: 0.025em;
          line-height: 1.12;
        }
        p {
          margin: 14px 0 0;
          color: #aeb9c8;
          font-size: 14px;
          line-height: 1.65;
          white-space: pre-line;
        }
        .pnm-action-dialog-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 24px;
        }
        .pnm-action-dialog-content {
          margin-top: 16px;
        }
        .pnm-action-dialog-content :global(input),
        .pnm-action-dialog-content :global(textarea),
        .pnm-action-dialog-content :global(select) {
          width: 100%;
          min-height: 46px;
          border: 1px solid #526071;
          border-radius: 2px;
          padding: 11px 12px;
          background: #03060a;
          color: #f8fafc;
          font: inherit;
          font-size: 14px;
          line-height: 1.5;
          outline: none;
        }
        .pnm-action-dialog-content :global(textarea) {
          min-height: 124px;
          resize: vertical;
        }
        .pnm-action-dialog-content :global(input:focus),
        .pnm-action-dialog-content :global(textarea:focus),
        .pnm-action-dialog-content :global(select:focus) {
          border-color: #38bdf8;
          box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.15);
        }
        .pnm-action-dialog-button {
          min-height: 46px;
          border: 1px solid #526071;
          border-radius: 2px;
          padding: 0 16px;
          font: inherit;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .pnm-action-dialog-button.secondary {
          background: #0d131c;
          color: #cbd5e1;
        }
        .pnm-action-dialog-button.primary {
          border-color: #38bdf8;
          background: #071c2a;
          color: #e0f2fe;
          box-shadow: inset 0 0 18px rgba(56, 189, 248, 0.08);
        }
        .pnm-action-dialog-button.destructive {
          border-color: #ef4444;
          background: #210a0d;
          color: #fecaca;
          box-shadow: inset 0 0 18px rgba(239, 68, 68, 0.08);
        }
        .pnm-action-dialog-button:focus-visible {
          outline: 2px solid #e0f2fe;
          outline-offset: 3px;
        }
        .pnm-action-dialog-button:disabled {
          cursor: wait;
          opacity: 0.58;
        }
        @media (max-width: 480px) {
          .pnm-action-dialog-backdrop { align-items: end; padding: 12px; }
          .pnm-action-dialog { padding: 24px 18px 18px; }
          .pnm-action-dialog-actions { grid-template-columns: 1fr; }
          .pnm-action-dialog-button { min-height: 48px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .pnm-action-dialog-rail { box-shadow: none; }
        }
      `}</style>
    </div>
  );
}
