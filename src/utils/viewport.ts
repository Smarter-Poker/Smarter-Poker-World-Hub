/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VIEWPORT SCALING UTILITIES — Smarter.Poker Global Standard
 * 
 * Provides standardized helpers for viewport-responsive CSS across all pages.
 * Ensures visual consistency from 375px mobile to 4K displays.
 * 
 * @see .agent/workflows/viewport-scaling.md for full documentation
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Standard design canvas dimensions
 */
export const DESIGN_CANVAS = {
    // Cinematic 16:9 (intros, landscapes)
    CINEMATIC: { width: 1920, height: 1080 },

    // Portrait 3:4 (game tables, pokerbros clone)
    PORTRAIT: { width: 600, height: 800 },

    // Square (some overlays, modals)
    SQUARE: { width: 1000, height: 1000 },
} as const;

/**
 * Viewport scaling hook for React components
 * 
 * @example
 * const { clampVh, clampVw } = useViewportScale();
 * <div style={{ fontSize: clampVh(80, 140, 140) }}>Hero Text</div>
 */
export function useViewportScale(
    designWidth = DESIGN_CANVAS.CINEMATIC.width,
    designHeight = DESIGN_CANVAS.CINEMATIC.height
) {
    /**
     * Convert design canvas pixels to viewport width percentage
     */
    const toVw = (px: number) => `${(px / designWidth) * 100}vw`;

    /**
     * Convert design canvas pixels to viewport height percentage
     */
    const toVh = (px: number) => `${(px / designHeight) * 100}vh`;

    /**
     * Responsive clamp based on viewport width
     * @param min Minimum size in px
     * @param ideal Ideal size in design canvas px
     * @param max Maximum size in px
     */
    const clampVw = (min: number, ideal: number, max: number) =>
        `clamp(${min}px, ${(ideal / designWidth) * 100}vw, ${max}px)`;

    /**
     * Responsive clamp based on viewport height
     * @param min Minimum size in px
     * @param ideal Ideal size in design canvas px
     * @param max Maximum size in px
     */
    const clampVh = (min: number, ideal: number, max: number) =>
        `clamp(${min}px, ${(ideal / designHeight) * 100}vh, ${max}px)`;

    return { toVw, toVh, clampVw, clampVh };
}

/**
 * Pre-computed common text sizes based on 1080px design height
 * Use these for consistent typography across the app
 */
export const VIEWPORT_TEXT = {
    // Hero text (140px ideal on 1080p)
    hero: 'clamp(80px, 13vh, 140px)',

    // Page titles (64px ideal)
    title: 'clamp(32px, 5.9vh, 64px)',

    // Subtitles (18px ideal)
    subtitle: 'clamp(12px, 1.7vh, 18px)',

    // Body text (16px ideal)
    body: 'clamp(14px, 1.5vh, 16px)',

    // Small labels (10-12px ideal)
    label: 'clamp(9px, 1.2vh, 12px)',
} as const;

/**
 * Pre-computed common spacing based on viewport
 */
export const VIEWPORT_SPACING = {
    xs: 'clamp(4px, 0.6vh, 8px)',
    sm: 'clamp(8px, 1.2vh, 12px)',
    md: 'clamp(12px, 1.8vh, 16px)',
    lg: 'clamp(16px, 2.5vh, 24px)',
    xl: 'clamp(24px, 3.7vh, 32px)',
    xxl: 'clamp(32px, 5vh, 48px)',
} as const;

/**
 * Calculate dynamic size based on viewport height
 * Used for orbs, icons, and other circular elements
 */
export const calcViewportSize = (
    min: number,
    idealVh: number,
    max: number
): number => {
    if (typeof window === 'undefined') return max;
    return Math.min(max, Math.max(min, window.innerHeight * (idealVh / 100)));
};

/**
 * Fixed aspect ratio container helper
 * Returns CSS properties for a container that maintains aspect ratio
 * 
 * @example
 * <div style={getAspectRatioContainer(600, 800)}> // 3:4 Portrait
 */
export const getAspectRatioContainer = (width: number, height: number) => ({
    position: 'relative' as const,
    width: '100vw',
    height: `${(100 * height) / width}vw`,
    maxHeight: '100vh',
    maxWidth: `${(100 * width) / height}vh`,
    margin: 'auto',
});

/**
 * Mobile detection helper (matches our standard 768px breakpoint)
 */
export const useIsMobile = () => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
};
