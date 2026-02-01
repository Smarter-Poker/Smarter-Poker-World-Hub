/**
 * 💎 DIAMOND ICON COMPONENT
 * Renders the custom blue diamond image
 */

import React from 'react';

export default function DiamondIcon({
    size = 20,
    className = '',
    style = {}
}) {
    return (
        <img
            src="/images/diamond.png"
            alt="Diamond"
            width={size}
            height={size}
            className={`diamond-icon ${className}`}
            style={{
                display: 'inline-block',
                verticalAlign: 'middle',
                ...style
            }}
        />
    );
}

// Convenience exports for common sizes
export const DiamondSmall = (props) => <DiamondIcon size={16} {...props} />;
export const DiamondMedium = (props) => <DiamondIcon size={20} {...props} />;
export const DiamondLarge = (props) => <DiamondIcon size={24} {...props} />;
export const DiamondXL = (props) => <DiamondIcon size={32} {...props} />;
