/**
 * useScrimDismiss: close a modal on a tap OUTSIDE it, never on a gesture
 * that merely ENDED outside it.
 *
 * WHY: a `click` event fires on the closest common ancestor of where the
 * pointer went down and where it came up. A player who starts selecting
 * text in a form (or drags a slider) and releases over the scrim produces a
 * click whose target IS the scrim, so a plain `onClick={onClose}` on the
 * overlay throws the half-filled form away. Native sheets do not do that.
 *
 * Usage:
 *   const scrim = useScrimDismiss(onClose);
 *   <div className="..-overlay" {...scrim}>            // spreads onPointerDown + onClick
 *     <div className="..-modal" onClick={(e) => e.stopPropagation()}>...</div>
 *   </div>
 *
 * The pointer-down target check does the work; the inner stopPropagation
 * stays as belt and braces for synthetic clicks (keyboard activation).
 */
import { useCallback, useRef } from 'react';

export function useScrimDismiss(onClose) {
  const downOnScrimRef = useRef(false);

  const onPointerDown = useCallback((e) => {
    downOnScrimRef.current = e.target === e.currentTarget;
  }, []);

  const onClick = useCallback(
    (e) => {
      const startedOnScrim = downOnScrimRef.current;
      downOnScrimRef.current = false;
      if (!startedOnScrim) return;
      if (e.target !== e.currentTarget) return;
      if (typeof onClose === 'function') onClose();
    },
    [onClose],
  );

  return { onPointerDown, onClick };
}

export default useScrimDismiss;
