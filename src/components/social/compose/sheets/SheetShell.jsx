/**
 * SheetShell — shared full-screen overlay for compose sub-pickers.
 * Header with back arrow + title + optional right-CTA, scrollable body.
 */
import React from 'react';

export default function SheetShell({ title, onClose, rightAction, children }) {
    return (
        <div style={{
            position: 'fixed', inset: 0, background: '#fff', color: '#050505',
            display: 'flex', flexDirection: 'column', zIndex: 10000,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        }}>
            {/* The status-bar inset is declared AFTER the padding shorthand:
                the previous order (paddingTop, then padding) reset it to 0, so
                the back arrow sat under the clock on a phone (mobile phase 0b). */}
            <div style={{
                minHeight: 56, boxSizing: 'content-box',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 16px', paddingTop: 'env(safe-area-inset-top, 0px)',
                borderBottom: '1px solid #e4e6eb', flexShrink: 0,
            }}>
                <button
                    onClick={onClose}
                    aria-label="Back"
                    className="sp-icon-btn"
                    style={{
                        background: 'none', border: 'none', color: '#050505',
                        fontSize: 22, padding: 8, cursor: 'pointer',
                        minWidth: 44, minHeight: 44,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
                    }}
                >&#X2190;</button>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{title}</div>
                <div style={{ minWidth: 40, textAlign: 'right' }}>{rightAction || null}</div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
                {children}
            </div>
        </div>
    );
}
