/**
 * CUSTOM DRILL BUILDER (W6-3)
 * Allows users to configure exact parameters (Street, Position) for QuickSpotDrill.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';

const M = {
    bg: 'rgba(11,13,17,0.95)',
    card: '#242526',
    text: '#E4E6EB',
    sub: '#B0B3B8',
    border: '#3E4042',
    accent: '#4599FF',
    green: '#00E676',
};

const STREETS = ['Any', 'Preflop', 'Flop', 'Turn', 'River'];
const POSITIONS = ['Any', 'EP', 'MP', 'CO', 'BTN', 'SB', 'BB'];

export default function CustomDrillBuilder({ onClose, onStartDrill }) {
    const [street, setStreet] = useState('Any');
    const [position, setPosition] = useState('Any');
    const [handCount, setHandCount] = useState(10);

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100003, padding: 16 }}
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }}
                onClick={e => e.stopPropagation()}
                style={{ background: M.card, borderRadius: 16, width: '100%', maxWidth: 460, border: `1px solid ${M.border}`, boxShadow: '0 12px 48px rgba(0,0,0,0.6)', overflow: 'hidden' }}
            >
                <div style={{ padding: '20px', borderBottom: `1px solid ${M.border}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: M.text }}>⚡ Custom Drill Builder</div>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', color: M.sub, fontSize: 18, cursor: 'pointer' }}>✕</button>
                    </div>
                    <div style={{ fontSize: 13, color: M.sub, marginTop: 4 }}>Configure hyper-specific spots to practice.</div>
                </div>

                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Street */}
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: M.text, marginBottom: 8 }}>Target Street</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {STREETS.map(s => (
                                <button key={s} onClick={() => setStreet(s)} style={{ padding: '8px 12px', background: street === s ? M.accent : 'rgba(255,255,255,0.05)', color: street === s ? '#fff' : M.sub, border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{s}</button>
                            ))}
                        </div>
                    </div>

                    {/* Position */}
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: M.text, marginBottom: 8 }}>Hero Position</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {POSITIONS.map(p => (
                                <button key={p} onClick={() => setPosition(p)} style={{ padding: '8px 12px', background: position === p ? '#a78bfa' : 'rgba(255,255,255,0.05)', color: position === p ? '#fff' : M.sub, border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{p}</button>
                            ))}
                        </div>
                    </div>

                    {/* Hand Count */}
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: M.text, marginBottom: 8 }}>Number of Hands</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {[5, 10, 20, 50].map(c => (
                                <button key={c} onClick={() => setHandCount(c)} style={{ flex: 1, padding: '10px 0', background: handCount === c ? M.green : 'rgba(255,255,255,0.05)', color: handCount === c ? '#000' : M.sub, border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{c}</button>
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={() => onStartDrill({ street, position, limit: handCount })}
                        style={{ width: '100%', padding: '16px', background: M.accent, color: '#fff', fontSize: 16, fontWeight: 800, border: 'none', borderRadius: 8, cursor: 'pointer', marginTop: 8 }}
                    >
                        Launch Drill
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}
