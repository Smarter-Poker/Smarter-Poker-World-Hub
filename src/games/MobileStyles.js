/**
 * 📱 Memory Matrix Mobile Styles
 * 
 * CSS-in-JS utility for mobile-optimized Memory Matrix grid
 */

// Mobile breakpoints
export const BREAKPOINTS = {
    mobile: 480,
    tablet: 768,
    desktop: 1024
};

// Touch-friendly minimum sizes
export const TOUCH_MIN = {
    tapTarget: 44, // iOS/Android minimum
    cellSize: 36,
    buttonHeight: 48,
    fontSize: 16
};

/**
 * Get responsive cell size based on viewport
 */
export function getResponsiveCellSize(viewportWidth, gridSize = 13) {
    // Calculate available width (viewport - padding)
    const padding = viewportWidth < BREAKPOINTS.mobile ? 20 : 40;
    const availableWidth = viewportWidth - padding * 2;

    // Calculate cell size to fit grid
    const maxCellSize = Math.floor(availableWidth / gridSize);

    // Ensure minimum touch target size
    return Math.max(maxCellSize, TOUCH_MIN.cellSize);
}

/**
 * Mobile-friendly grid styles
 */
export const mobileGridStyles = {
    container: {
        width: '100%',
        maxWidth: '100vw',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        padding: '10px',
    },

    grid: {
        display: 'grid',
        gap: '2px',
        margin: '0 auto',
        touchAction: 'manipulation', // Prevent zoom on tap
    },

    cell: {
        minWidth: `${TOUCH_MIN.tapTarget}px`,
        minHeight: `${TOUCH_MIN.tapTarget}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        transition: 'transform 0.1s ease, background 0.15s ease',
    },

    cellActive: {
        transform: 'scale(0.95)',
    }
};

/**
 * Mobile-responsive button styles
 */
export const mobileButtonStyles = {
    primary: {
        minHeight: `${TOUCH_MIN.buttonHeight}px`,
        padding: '12px 24px',
        fontSize: `${TOUCH_MIN.fontSize}px`,
        fontWeight: 600,
        borderRadius: '12px',
        cursor: 'pointer',
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
    },

    secondary: {
        minHeight: `${TOUCH_MIN.tapTarget}px`,
        padding: '10px 16px',
        fontSize: '14px',
        fontWeight: 500,
        borderRadius: '8px',
        cursor: 'pointer',
        touchAction: 'manipulation',
    }
};

/**
 * Generate inline style for grid based on viewport
 */
export function getGridStyle(viewportWidth, cellCount = 13) {
    const cellSize = getResponsiveCellSize(viewportWidth, cellCount);
    const gridWidth = cellSize * cellCount + (cellCount - 1) * 2; // cells + gaps

    return {
        ...mobileGridStyles.grid,
        gridTemplateColumns: `repeat(${cellCount}, ${cellSize}px)`,
        gridTemplateRows: `repeat(${cellCount}, ${cellSize}px)`,
        width: `${gridWidth}px`,
    };
}

/**
 * Check if device is touch-capable
 */
export function isTouchDevice() {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * Media query hook helper
 */
export function getViewportWidth() {
    if (typeof window === 'undefined') return 1024;
    return window.innerWidth;
}

export default {
    BREAKPOINTS,
    TOUCH_MIN,
    getResponsiveCellSize,
    mobileGridStyles,
    mobileButtonStyles,
    getGridStyle,
    isTouchDevice,
    getViewportWidth
};
