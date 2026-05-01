import React from 'react';
import SheetShell from './SheetShell';
import { useComposeStore } from '../../../../stores/composeStore';

const OPTIONS = [
    { mode: 'public',         label: 'Public',           desc: 'Anyone on or off the platform',      icon: '\u{1F310}' },
    { mode: 'friends',        label: 'Friends',          desc: 'Your friends on smarter.poker',     icon: '\u{1F465}' },
    { mode: 'friends_except', label: 'Friends except…',  desc: "Don't show to some friends",         icon: '\u{1F6AB}' },
    { mode: 'specific',       label: 'Specific friends', desc: 'Only show to selected friends',      icon: '\u{1F465}' },
    { mode: 'only_me',        label: 'Only me',          desc: 'Just you',                           icon: '\u{1F512}' },
    { mode: 'custom',         label: 'Custom',           desc: 'Include or exclude specific people', icon: '\u{2699}' },
];

export default function VisibilityPickerSheet({ onClose }) {
    const audienceMode = useComposeStore(s => s.audienceMode);
    const setAudience = useComposeStore(s => s.setAudience);

    const handlePick = (mode) => {
        setAudience(mode);
        // Persist last choice so the next compose session defaults to it
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('sp-compose-last-audience', mode);
            }
        } catch (_) {}
        onClose?.();
    };

    return (
        <SheetShell title="Audience" onClose={onClose}>
            <div style={{ padding: '16px 0' }}>
                <div style={{
                    fontSize: 13, color: '#65676B',
                    padding: '0 16px 16px', lineHeight: 1.4,
                }}>
                    Who can see this post? You can change the audience of any post later.
                </div>
                {OPTIONS.map(opt => {
                    const isSelected = audienceMode === opt.mode;
                    return (
                        <button
                            key={opt.mode}
                            onClick={() => handlePick(opt.mode)}
                            style={{
                                width: '100%', display: 'flex', gap: 12, alignItems: 'center',
                                padding: '14px 16px', background: 'none', border: 'none',
                                borderTop: '1px solid #e4e6eb', cursor: 'pointer', textAlign: 'left',
                            }}
                        >
                            <span aria-hidden="true" style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{opt.icon}</span>
                            <span style={{ flex: 1 }}>
                                <span style={{ display: 'block', fontWeight: 600, fontSize: 15, color: '#050505' }}>{opt.label}</span>
                                <span style={{ display: 'block', fontSize: 12, color: '#65676B', marginTop: 2 }}>{opt.desc}</span>
                            </span>
                            <span aria-hidden="true" style={{
                                width: 22, height: 22, borderRadius: 11,
                                border: isSelected ? '7px solid #1877F2' : '2px solid #bcc0c4',
                                background: '#fff', boxSizing: 'border-box',
                            }} />
                        </button>
                    );
                })}
            </div>
        </SheetShell>
    );
}
