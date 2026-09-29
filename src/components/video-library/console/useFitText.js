import { useEffect, useLayoutEffect, useRef } from 'react';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Fits one line inside its painted face without growing beyond its art-directed size.
 */
export function useFitText(text, scaleX = 1, minRatio = 0.5) {
    const ref = useRef(null);

    useIsomorphicLayoutEffect(() => {
        const element = ref.current;
        const zone = element?.parentElement;
        if (!element || !zone) return undefined;

        const fit = () => {
            element.style.setProperty('--console-fit', '1');
            const available = zone.clientWidth;
            const range = (
                typeof document !== 'undefined' && typeof document.createRange === 'function'
                    ? document.createRange()
                    : null
            );
            range?.selectNodeContents(element);
            const glyphWidth = range?.getBoundingClientRect().width || 0;
            const needed = Math.max(element.scrollWidth, glyphWidth) * scaleX;
            if (!available || !needed) return;

            const ratio = Math.min(1, Math.max(minRatio, available / needed));
            element.style.setProperty('--console-fit', ratio < 0.995 ? ratio.toFixed(3) : '1');
        };

        fit();

        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
        observer?.observe(zone);

        if (typeof document !== 'undefined' && 'fonts' in document) {
            document.fonts.ready.then(fit).catch(() => undefined);
        }

        return () => observer?.disconnect();
    }, [text, scaleX, minRatio]);

    return ref;
}
