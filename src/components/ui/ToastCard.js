/**
 * TOAST CARD - the markup of one toast, shared by the animated ToastStack and
 * the plain list ToastContainer falls back to.
 *
 * ToastStack is a separate chunk so framer-motion stays out of the site-wide
 * _app bundle (#3252). A chunk has to be downloaded, and the toast most likely
 * to be the first one a visit shows is "You Are Offline" - exactly when the
 * download cannot happen. That toast then never appeared at all (e2e/029,
 * standalone export offline cases). This file has no framer-motion import, so
 * it rides in _app and the same card always renders, with or without motion.
 */

import { useToastStore } from '../../stores/toastStore';

export const toastStyles = {
    success: {
        background: '#ffffff',
        color: '#000000',
        border: '1px solid #e2e8f0',
        icon: '✓',
    },
    error: {
        background: 'linear-gradient(135deg, #ff4444, #cc0000)',
        color: '#fff',
        icon: '✕',
    },
    info: {
        background: 'linear-gradient(135deg, #00d4ff, #0088cc)',
        color: '#fff',
        icon: 'ℹ',
    },
    warning: {
        background: 'linear-gradient(135deg, #ffd700, #ff9900)',
        color: '#000',
        icon: '⚠',
    },
};

const toTitleCase = (str) => {
    if (!str || typeof str !== 'string') return str;
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
};

export default function ToastCard({ toast: t, removeToast, as: Wrapper = 'div', wrapperProps = {} }) {
    const style = toastStyles[t.type] || toastStyles.info;
    const isActionable = typeof t.onClick === 'function';

    const handleClick = () => {
        // Only auto-dismiss on body click when toast has an action.
        // Persistent warning toasts (onClick=null) must be dismissed
        // via the explicit ✕ button to prevent accidental dismissal.
        if (isActionable) {
            t.onClick();
            removeToast(t.id);
        }
    };

    return (
        <Wrapper
            {...wrapperProps}
            onClick={handleClick}
            style={{
                ...style,
                padding: '16px 20px',
                borderRadius: '12px',
                boxShadow: isActionable
                    ? '0 4px 24px rgba(0,0,0,0.4), 0 0 0 2px rgba(255,255,255,0.3)'
                    : '0 4px 20px rgba(0,0,0,0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                minWidth: 300,
                maxWidth: 420,
                cursor: isActionable ? 'pointer' : 'default',
                userSelect: 'none',
            }}
        >
            <span style={{ fontSize: 20, fontWeight: 700, flexShrink: 0, color: t.type === 'success' ? '#10b981' : 'inherit' }}>{style.icon}</span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>
                {t.type === 'success' ? toTitleCase(t.message) : t.message}
                {isActionable && (
                    <span style={{ display: 'block', fontSize: 11, opacity: 0.75, marginTop: 2 }}>
                        Tap To View →
                    </span>
                )}
            </span>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    removeToast(t.id);
                }}
                style={{
                    background: 'rgba(0,0,0,0.2)',
                    border: 'none',
                    borderRadius: '50%',
                    width: 24,
                    height: 24,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: 14,
                    color: 'inherit',
                    flexShrink: 0,
                }}
            >
                ✕
            </button>
        </Wrapper>
    );
}

/** The same cards without motion: shown while ToastStack cannot load. */
export function ToastPlainList() {
    const toasts = useToastStore((s) => s.toasts);
    const removeToast = useToastStore((s) => s.removeToast);
    return toasts.map((t) => <ToastCard key={t.id} toast={t} removeToast={removeToast} />);
}
