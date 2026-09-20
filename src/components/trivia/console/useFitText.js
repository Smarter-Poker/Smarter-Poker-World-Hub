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
        return () => observer?.disconnect();
    }, [text, scaleX, minRatio]);

    return ref;
}
