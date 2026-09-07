import { useEffect, useRef } from 'react';
import { acquireScrollLock } from '../lib/scrollLock';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const DIALOG_STACK_KEY = '__spAccessibleDialogStack';

function dialogStack() {
  if (typeof window === 'undefined') return [];
  if (!Array.isArray(window[DIALOG_STACK_KEY])) window[DIALOG_STACK_KEY] = [];
  return window[DIALOG_STACK_KEY];
}

function isolateDialogBackground(root) {
  if (!root || typeof document === 'undefined') return () => {};
  const changed = [];
  let activeBranch = root;

  while (activeBranch?.parentElement) {
    const parent = activeBranch.parentElement;
    for (const sibling of parent.children) {
      if (sibling === activeBranch || ['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName)) continue;
      changed.push({
        element: sibling,
        inert: sibling.hasAttribute('inert'),
        ariaHidden: sibling.getAttribute('aria-hidden'),
      });
      sibling.setAttribute('inert', '');
      sibling.setAttribute('aria-hidden', 'true');
    }
    if (parent === document.body) break;
    activeBranch = parent;
  }

  return () => {
    for (let index = changed.length - 1; index >= 0; index -= 1) {
      const { element, inert, ariaHidden } = changed[index];
      if (!element?.isConnected) continue;
      if (!inert) element.removeAttribute('inert');
      if (ariaHidden == null) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', ariaHidden);
    }
  };
}

/**
 * Keyboard and scroll behavior shared by Poker Near Me modal forms.
 *
 * The returned `initialFocusRef` should be attached to the safest first
 * control (normally Close/Cancel, or the primary input for a data-entry
 * dialog). If it is omitted, the hook focuses the first operable control.
 */
export default function useAccessibleDialog({
  open,
  onClose,
  dismissDisabled = false,
  lockScroll = true,
  isolateBackground = true,
  trapFocus = true,
}) {
  const dialogRef = useRef(null);
  const initialFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const dismissDisabledRef = useRef(dismissDisabled);
  const lockScrollRef = useRef(lockScroll);
  const isolateBackgroundRef = useRef(isolateBackground);
  const trapFocusRef = useRef(trapFocus);

  onCloseRef.current = onClose;
  dismissDisabledRef.current = dismissDisabled;
  lockScrollRef.current = lockScroll;
  isolateBackgroundRef.current = isolateBackground;
  trapFocusRef.current = trapFocus;

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;

    const previouslyFocused = document.activeElement;
    const token = Symbol('PokerNearMeAccessibleDialog');
    const stack = dialogStack();
    stack.push(token);
    const isTopDialog = () => dialogStack().at(-1) === token;
    const releaseScrollLock = lockScrollRef.current
      ? acquireScrollLock('PokerNearMeAccessibleDialog')
      : () => {};
    const restoreBackground = isolateBackgroundRef.current
      ? isolateDialogBackground(dialogRef.current)
      : () => {};

    const focusTimer = window.setTimeout(() => {
      const root = dialogRef.current;
      const target = initialFocusRef.current || root?.querySelector(FOCUSABLE_SELECTOR) || root;
      if (isTopDialog()) target?.focus?.();
    }, 0);

    const handleKeyDown = (event) => {
      const root = dialogRef.current;
      if (!root || event.defaultPrevented || !isTopDialog()) return;

      if (event.key === 'Escape' && !dismissDisabledRef.current) {
        event.preventDefault();
        event.stopPropagation();
        // Escape belongs exclusively to the top-most dialog. The stack check
        // protects other instances of this hook; stopping same-target legacy
        // listeners protects older sheets that still listen on `document`.
        event.stopImmediatePropagation?.();
        onCloseRef.current?.();
        return;
      }

      if (event.key !== 'Tab' || !trapFocusRef.current) return;
      const focusable = Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (element) => element.getAttribute('aria-hidden') !== 'true'
      );
      if (focusable.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!root.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const handleFocusIn = (event) => {
      const root = dialogRef.current;
      if (!trapFocusRef.current || !root || !isTopDialog() || root.contains(event.target)) return;
      const target = initialFocusRef.current || root.querySelector(FOCUSABLE_SELECTOR) || root;
      target?.focus?.();
    };

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('focusin', handleFocusIn, true);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('focusin', handleFocusIn, true);
      const currentStack = dialogStack();
      const tokenIndex = currentStack.lastIndexOf(token);
      if (tokenIndex >= 0) currentStack.splice(tokenIndex, 1);
      restoreBackground();
      releaseScrollLock();
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus?.();
      }
    };
  }, [open]);

  return { dialogRef, initialFocusRef };
}
