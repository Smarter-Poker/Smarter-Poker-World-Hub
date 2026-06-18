

function Toast({ message, onDismiss, isExiting }) {
    if (!message) return null;
    const isError = message.includes('Error');
    const isUndo = message.includes('Undo');
    const bgColor = isError ? '#FEF2F2' : isUndo ? '#FFFBEB' : '#F0FDF4';
    const borderColor = isError ? 'rgba(220,38,38,0.4)' : isUndo ? 'rgba(217,119,6,0.4)' : 'rgba(22,163,74,0.4)';
    const textColor = isError ? '#DC2626' : isUndo ? '#B45309' : '#16A34A';
    const icon = isError ? '⚠️' : isUndo ? '↩️' : '✅';
    return (
        <div style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 10001,
            maxWidth: 400, minWidth: 240,
            background: bgColor,
            border: `1px solid ${borderColor}`,
            borderRadius: 12, padding: '14px 20px',
            boxShadow: `0 8px 32px ${borderColor.replace('0.4', '0.2')}`,
            display: 'flex', alignItems: 'center', gap: 12,
            animation: isExiting ? 'toastSlideOut 0.3s ease-in forwards' : 'toastSlideIn 0.3s ease-out',
            cursor: 'pointer',
            backdropFilter: 'blur(12px)',
        }} onClick={onDismiss}>
            <div style={{ fontSize: 22, flexShrink: 0 }}>{icon}</div>
            <div style={{ fontSize: 13, color: textColor, lineHeight: 1.4, fontWeight: 500, flex: 1 }}>
                {message}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.3)', flexShrink: 0 }}>✕</div>
        </div>
    );
}

export default Toast;
