/**
 * LiveDiamondIcon — single-source-of-truth gift icon for live streaming.
 *
 * BUG-FIX-LIVE-LIST-5: Dan asked for the diamond icon to be swapped to a
 * custom asset (background-removed). The image hasn't been uploaded yet,
 * so this component renders the existing 💎 emoji. When the image lands,
 * swap the body of this component for a single <img src=...> and EVERY
 * call site upgrades for free.
 *
 * Usage:
 *   <LiveDiamondIcon />          // default 16px inline
 *   <LiveDiamondIcon size={24} /> // arbitrary size
 *   <LiveDiamondIcon size={28} alt="Diamond gift" />
 *
 * To swap to an image (when /public/icons/diamond.png exists):
 *   replace the return below with:
 *   return <img src="/icons/diamond.png" alt={alt} width={size} height={size}
 *               style={{ display: 'inline-block', verticalAlign: 'middle', ...style }} />;
 */
import React from 'react';

export function LiveDiamondIcon({ size = 16, alt = 'diamond', style = {} }) {
    // Render the emoji at the requested size. line-height:1 prevents the
    // emoji's natural baseline padding from misaligning it next to text.
    return (
        <span
            role="img"
            aria-label={alt}
            style={{
                fontSize: `${size}px`,
                lineHeight: 1,
                display: 'inline-block',
                verticalAlign: 'middle',
                ...style,
            }}
        >
            💎
        </span>
    );
}

export default LiveDiamondIcon;
