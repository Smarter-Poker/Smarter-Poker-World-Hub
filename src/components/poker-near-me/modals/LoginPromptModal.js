import React, { useEffect, useId, useRef } from 'react';
import { useRouter } from 'next/router';
import { acquireScrollLock } from '../../../lib/scrollLock';
import PokerNearMeConsole from '../PokerNearMeConsole';

const FOCUSABLE = 'button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function LoginPromptModal({
  showLoginPrompt,
  setShowLoginPrompt,
}) {
  const router = useRouter();
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const returnFocusRef = useRef(null);
  const closeRef = useRef(() => undefined);

  closeRef.current = () => setShowLoginPrompt(false);

  useEffect(() => {
    if (!showLoginPrompt) return undefined;
    const releaseScrollLock = acquireScrollLock('PokerNearMeLoginPromptModal');
    returnFocusRef.current = document.activeElement;
    const frame = window.requestAnimationFrame(() => cancelRef.current?.focus());

    const handleKeyDown = (event) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll(FOCUSABLE));
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      releaseScrollLock();
      returnFocusRef.current?.focus?.();
    };
  }, [showLoginPrompt]);

  if (!showLoginPrompt) return null;

  const closePrompt = () => setShowLoginPrompt(false);
  const signIn = () => {
    setShowLoginPrompt(false);
    router.push(`/auth/login?redirect=${encodeURIComponent('/hub/poker-near-me/lobby')}`);
  };

  return (
    <div
      className="pnm-console-dialog-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closePrompt();
      }}
    >
      <section
        ref={dialogRef}
        className="pnm-console-dialog-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <PokerNearMeConsole
          as="div"
          className="pnm-console-dialog"
          crest="diamond"
          eyebrow="Account Access"
          title="Sign In Required"
          titleId={titleId}
          plates={{
            secondary: {
              label: 'Cancel',
              buttonRef: cancelRef,
              onClick: closePrompt,
              'aria-label': 'Cancel sign in',
            },
            primary: {
              label: 'Sign In',
              ink: 'blue',
              onClick: signIn,
              'aria-label': 'Sign in',
            },
          }}
        >
          <div className="pnm-console-dialog__body">
            <p id={descriptionId} className="pnm-console-dialog__copy pnm-console-dialog__copy--center">
              You Need To Be Signed In To Check In At Venues And Leave Reviews. Create A Free Account To Unlock All Features.
            </p>
          </div>
        </PokerNearMeConsole>
      </section>
    </div>
  );
}
