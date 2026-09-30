import { useEffect, useLayoutEffect, useRef } from 'react';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Fits live text inside a painted master-art zone on both axes.
 * The art owns the dimensions; dynamic copy is allowed to shrink, never grow.
 */
export function useFitText(text, scaleX = 1, minRatio = 0.5) {
    const ref = useRef(null);

    useIsomorphicLayoutEffect(() => {
        const element = ref.current;
        const zone = element?.parentElement;
        if (!element || !zone) return undefined;

        // A fitted label never animates its size. The world sheet's reduced-
        // motion rule gives every element a 0.01ms transition on `all`, so the
        // font-size set below was still the old value when it was measured in
        // the same task: the fit chased a stale size and left labels wider than
        // their face (measured 2026-09-30, 'Back To Trivia' cut at 320, 390 and
        // 1440). Inline !important is the only declaration that outranks it.
        element.style.setProperty('transition', 'none', 'important');

        const fit = () => {
            element.style.setProperty('--fit', '1');
            const zoneRect = zone.getBoundingClientRect();
            const availableWidth = Math.min(zone.clientWidth, zoneRect.width);
            const availableHeight = Math.min(zone.clientHeight, zoneRect.height);
            const elementRect = element.getBoundingClientRect();
            const neededWidth = Math.max(element.scrollWidth, elementRect.width) * scaleX;
            const neededHeight = Math.max(element.scrollHeight, elementRect.height);
            if (!availableWidth || !availableHeight || !neededWidth || !neededHeight) return;
            if (neededWidth <= availableWidth && neededHeight <= availableHeight) return;

            let ratio = Math.max(minRatio, Math.min(
                availableWidth / neededWidth,
                availableHeight / neededHeight
            ));
            for (let pass = 0; pass < 6; pass += 1) {
                element.style.setProperty('--fit', ratio.toFixed(4));
                const actualRect = element.getBoundingClientRect();
                const actualWidth = Math.max(element.scrollWidth, actualRect.width) * scaleX;
                const actualHeight = Math.max(element.scrollHeight, actualRect.height);
                if (
                    (actualWidth <= availableWidth && actualHeight <= availableHeight)
                    || ratio <= minRatio
                ) break;
                const corrected = Math.max(minRatio, ratio * Math.min(
                    availableWidth / actualWidth,
                    availableHeight / actualHeight
                ));
                if (ratio - corrected < 0.0005) break;
                ratio = corrected;
            }
            element.style.setProperty('--fit', ratio >= 0.995 ? '1' : ratio.toFixed(4));
        };

        fit();
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
        observer?.observe(zone);
        if (typeof document !== 'undefined' && document.fonts?.ready) {
            document.fonts.ready.then(fit).catch(() => undefined);
        }
        // A face is only requested once text that uses it renders, so it can
        // start loading after `ready` has already resolved. Re-fit whenever
        // any font load ends, so a late face never leaves a label unfitted.
        const fontSet = typeof document !== 'undefined' ? document.fonts : null;
        fontSet?.addEventListener?.('loadingdone', fit);
        return () => {
            observer?.disconnect();
            fontSet?.removeEventListener?.('loadingdone', fit);
        };
    }, [text, scaleX, minRatio]);

    return ref;
}
