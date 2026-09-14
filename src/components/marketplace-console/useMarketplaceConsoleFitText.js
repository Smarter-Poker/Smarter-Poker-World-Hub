import { useEffect, useLayoutEffect, useRef } from 'react';

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Fits one line of live text inside a measured painted zone.
 * The scale never grows above the designed size and is recalculated whenever
 * the zone or the loaded font changes size.
 */
export function useMarketplaceConsoleFitText(text, minScale = 0.48) {
  const textRef = useRef(null);

  useBrowserLayoutEffect(() => {
    const textElement = textRef.current;
    const zone = textElement?.parentElement;
    if (!textElement || !zone) return undefined;

    const fit = () => {
      textElement.style.setProperty('--marketplace-console-fit', '1');
      const zoneRect = zone.getBoundingClientRect();
      const availableWidth = Math.min(zone.clientWidth, zoneRect.width);
      const requiredWidth = textElement.scrollWidth;

      if (!availableWidth || !requiredWidth || requiredWidth <= availableWidth) return;

      let ratio = Math.max(minScale, availableWidth / requiredWidth);
      for (let pass = 0; pass < 4; pass += 1) {
        textElement.style.setProperty('--marketplace-console-fit', ratio.toFixed(4));
        const actualWidth = textElement.scrollWidth;
        if (actualWidth <= availableWidth || ratio <= minScale) break;
        ratio = Math.max(minScale, ratio * (availableWidth / actualWidth));
      }

      textElement.style.setProperty(
        '--marketplace-console-fit',
        ratio >= 0.995 ? '1' : ratio.toFixed(4)
      );
    };

    fit();

    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    resizeObserver?.observe(zone);

    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(fit).catch(() => undefined);
    }

    return () => resizeObserver?.disconnect();
  }, [minScale, text]);

  return textRef;
}
