import { C } from './constants';

function ProfileField({ label, value, onChange, type = 'text', placeholder, icon, maxLength, showCount, suffix }) {
    const charCount = value ? String(value).length : 0;
    return (
        <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.textSec, marginBottom: 4, textTransform: 'capitalize' }}>
                {icon && <span style={{ marginRight: 6 }}>{icon}</span>}
                {label}
            </label>
            {type === 'textarea' ? (
                <>
                    <textarea
                        value={value || ''}
                        onChange={e => onChange(e.target.value)}
                        placeholder={placeholder}
                        maxLength={maxLength}
                        spellCheck={false}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        style={{
                            width: '100%', padding: 12, borderRadius: 8, border: `1px solid ${C.border}`,
                            fontSize: 15, resize: 'vertical', minHeight: 80, boxSizing: 'border-box',
                            fontFamily: 'inherit', color: '#000000', background: '#ffffff'
                        }}
                    />
                    {showCount && maxLength && (
                        <div style={{ fontSize: 11, color: charCount > maxLength * 0.9 ? '#e53935' : C.textSec, textAlign: 'right', marginTop: 2 }}>
                            {charCount}/{maxLength}
                        </div>
                    )}
                </>
            ) : (
                <div style={{ position: 'relative' }}>
                    <input
                        type={type}
                        value={value || ''}
                        onChange={e => onChange(e.target.value)}
                        placeholder={placeholder}
                        maxLength={maxLength}
                        spellCheck={false}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        style={{
                            width: '100%', padding: 12, paddingRight: suffix ? 40 : 12, borderRadius: 8, border: `1px solid ${C.border}`,
                            fontSize: 15, boxSizing: 'border-box', color: '#000000', background: '#ffffff'
                        }}
                    />
                    {suffix && (
                        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 16 }}>
                            {suffix}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

export default ProfileField;
