import { useState } from 'react';
import { C } from './constants';

function CollapsibleSection({ id, title, icon, children, defaultOpen = true }) {
    const [open, setOpen] = useState(() => {
        try {
            const saved = localStorage.getItem(`sp-section-${id}`);
            if (saved !== null) return saved === 'true';
        } catch { /* noop */ }
        return defaultOpen;
    });
    const toggle = () => {
        setOpen(o => {
            const next = !o;
            try { localStorage.setItem(`sp-section-${id}`, String(next)); } catch { /* noop */ }
            return next;
        });
    };
    return (
        <div id={id} data-section={id} style={{
            background: C.card, borderRadius: 12, marginBottom: 16,
            border: `1px solid ${C.border}`, overflow: 'hidden',
            transition: 'box-shadow 0.2s ease',
        }}>
            <button
                type="button"
                onClick={toggle}
                style={{
                    width: '100%', padding: '16px 20px',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    color: C.text, fontSize: 17, fontWeight: 700,
                }}
            >
                <span>{icon && <span style={{ marginRight: 8 }}>{icon}</span>}{title}</span>
                <span style={{
                    fontSize: 12, color: C.textSec,
                    transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.3s ease',
                    display: 'inline-block',
                }}>▼</span>
            </button>
            <div style={{
                maxHeight: open ? '5000px' : '0',
                overflow: 'hidden',
                transition: open ? 'max-height 0.5s ease-in' : 'max-height 0.3s ease-out',
                opacity: open ? 1 : 0,
            }}>
                <div style={{ padding: '0 20px 20px' }}>
                    {children}
                </div>
            </div>
        </div>
    );
}

export default CollapsibleSection;
