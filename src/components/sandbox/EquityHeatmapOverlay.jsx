/**
 * EQUITY HEATMAP OVERLAY (W7-2)
 * Visualizes range advantage directly on the Sandbox Felt.
 */
import { motion, AnimatePresence } from 'framer-motion';

export default function EquityHeatmapOverlay({ isVisible, board, heroPosition, villains }) {
    if (!isVisible || !board || board.length < 3) return null;

    // Deterministic mock equity generator based on board texture
    let heroEq = 50;
    const hasAce = board.some(c => c.startsWith('A'));
    const isPaired = new Set(board.map(c => c[0])).size !== board.length;
    const isFlushy = new Set(board.map(c => c[1])).size <= Math.max(1, board.length - 2);

    if (heroPosition === 'BTN' || heroPosition === 'CO') heroEq += 5; // IP advantage
    if (hasAce) heroEq += 3; // Preflop aggressor favors A-high boards
    if (isPaired && (heroPosition === 'BB' || heroPosition === 'SB')) heroEq += 4; // OOP defend pairs well

    // Normalize against villains
    const activeVillains = villains.filter(v => ['BB', 'SB', 'BTN', 'CO', 'MP', 'EP'].includes(v.position));
    const vEqShare = (100 - heroEq) / (activeVillains.length || 1);

    const getHeatColor = (eq) => {
        if (eq > 55) return 'rgba(34, 197, 94, 0.4)';  // Green (Advantage)
        if (eq < 45) return 'rgba(239, 68, 68, 0.4)';  // Red (Disadvantage)
        return 'rgba(245, 166, 35, 0.3)';              // Gold (Neutral/Marginal)
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{
                    position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none',
                    background: 'radial-gradient(circle at center, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.7) 100%)'
                }}
            >
                {/* Board Texture Overlay */}
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', marginTop: 100, textAlign: 'center', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: 1, textTransform: 'uppercase' }}>
                        Texture: {hasAce ? 'A-High' : 'Dynamic'} {isPaired ? 'Paired' : ''} {isFlushy ? 'Draw-Heavy' : 'Rainbow'}
                    </div>
                    <div style={{ fontSize: 11, color: '#B0B3B8', marginTop: 4 }}>
                        Range Advantage: {heroEq > 50 ? 'Hero (IP)' : 'Villain (OOP)'}
                    </div>
                </div>

                {/* Hero Heatmap Tag */}
                <div style={{ position: 'absolute', bottom: 120, left: '50%', transform: 'translateX(-50%)', background: getHeatColor(heroEq), padding: '6px 16px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(4px)' }}>
                    <span style={{ color: '#fff', fontSize: 14, fontWeight: 800 }}>Hero Eq: {heroEq.toFixed(1)}%</span>
                </div>

                {/* Villain Heatmap Tags - Positioning around the table top */}
                <div style={{ position: 'absolute', top: 120, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 20 }}>
                    {activeVillains.map((v, i) => (
                        <div key={v.id || i} style={{ background: getHeatColor(vEqShare), padding: '6px 12px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(4px)' }}>
                            <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{v.position} Eq: {vEqShare.toFixed(1)}%</span>
                        </div>
                    ))}
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
