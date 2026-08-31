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
            <div style={{
                height: 56, paddingTop: 'env(safe-area-inset-top, 0px)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 16px', borderBottom: '1px solid #e4e6eb', flexShrink: 0,
            }}>
                <button
                    onClick={onClose}
                    aria-label="Back"
                    style={{
                        background: 'none', border: 'none', color: '#050505',
                        fontSize: 22, padding: 8, cursor: 'pointer',
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
