/**
 * useAbortEffect — like useEffect, but auto-provides an AbortSignal
 * and cleans up on unmount / dependency change.
 * 
 * Usage:
 *   useAbortEffect((signal) => {
 *     fetch('/api/data').then(...);
 *   }, [deps]);
 */
import { useEffect } from 'react';

export function useAbortEffect(fn, deps) {
  useEffect(() => {
    const controller = new AbortController();
    fn(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export default useAbortEffect;
