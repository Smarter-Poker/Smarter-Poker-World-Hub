/* ═══════════════════════════════════════════════════════════════════════════
   HUB VANGUARD — WORLD HUD (11-ORB VERSION)
   Overlay UI for world navigation and state feedback
   ═══════════════════════════════════════════════════════════════════════════ */

import { motion, AnimatePresence } from 'framer-motion';
import { useWorldStore, selectActiveOrb } from '../state/worldStore';
import { POKER_IQ_ORBS, getOrbById, type OrbConfig } from '../orbs/manifest/registry';

export type OrbId = string;

export function WorldHUD() {
    const activeOrb = useWorldStore(selectActiveOrb);
    const exitOrb = useWorldStore((s) => s.exitOrb);

    return (
        <div className="hud-overlay">
            {/* Top Bar */}
            <TopBar />

            {/* Active Orb Indicator */}
            <AnimatePresence>
                {activeOrb && (
                    <ActiveOrbBanner orbId={activeOrb} onExit={exitOrb} />
                )}
            </AnimatePresence>

            {/* Bottom Orb Navigator - Scrollable for 11 orbs */}
            <OrbNavigator />

            {/* Instructions */}
            <Instructions />
        </div>
    );
}

function TopBar() {
    return (
        <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            style={{
                padding: '20px 32px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                    width: '40px',
                    height: '40px',
                    background: 'linear-gradient(135deg, #00f6ff, #9d4edd, #ff006e)',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                    boxShadow: '0 0 20px rgba(0, 246, 255, 0.3)',
                }}>
                    🌌
                </div>
                <div>
                    <h1 style={{
                        fontFamily: 'Outfit, sans-serif',
                        fontSize: '20px',
                        fontWeight: 800,
                        background: 'linear-gradient(135deg, #00f6ff, #9d4edd)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        margin: 0,
                        letterSpacing: '-0.02em',
                    }}>
                        Smarter.Poker
                    </h1>
                    <p style={{
                        fontFamily: 'Inter, sans-serif',
                        fontSize: '11px',
                        color: 'rgba(255,255,255,0.5)',
                        margin: 0,
                        letterSpacing: '0.5px',
                    }}>
                        Hub Vanguard • 11 Worlds
                    </p>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <StatusIndicator label="System" status="online" />
                <OrbCounter />
            </div>
        </motion.header>
    );
}

function StatusIndicator({ label, status }: { label: string; status: 'online' | 'offline' }) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            background: 'rgba(255,255,255,0.03)',
            backdropFilter: 'blur(12px)',
            borderRadius: '20px',
            border: '1px solid rgba(255,255,255,0.08)',
        }}>
            <div style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: status === 'online' ? '#00f593' : '#ff4444',
                boxShadow: status === 'online' ? '0 0 8px #00f593' : '0 0 8px #ff4444',
            }} />
            <span style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: '11px',
                color: 'rgba(255,255,255,0.7)',
            }}>
                {label}
            </span>
        </div>
    );
}

function OrbCounter() {
    return (
        <div style={{
            padding: '6px 14px',
            background: 'linear-gradient(135deg, rgba(0, 246, 255, 0.1), rgba(157, 78, 221, 0.1))',
            backdropFilter: 'blur(12px)',
            borderRadius: '20px',
            border: '1px solid rgba(0, 246, 255, 0.2)',
        }}>
            <span style={{
                fontFamily: 'Outfit, sans-serif',
                fontSize: '12px',
                fontWeight: 600,
                color: '#00f6ff',
            }}>
                {POKER_IQ_ORBS.length} Orbs
            </span>
        </div>
    );
}

function ActiveOrbBanner({ orbId, onExit }: { orbId: OrbId; onExit: () => void }) {
    const orb = getOrbById(orbId);
    if (!orb) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            style={{
                position: 'absolute',
                top: '80px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '14px 24px',
                background: 'rgba(10, 10, 15, 0.9)',
                backdropFilter: 'blur(24px)',
                borderRadius: '16px',
                border: `1px solid ${orb.color}50`,
                boxShadow: `0 0 40px ${orb.color}30`,
            }}
        >
            <span style={{ fontSize: '28px' }}>🎯</span>
            <div>
                <h2 style={{
                    fontFamily: 'Outfit, sans-serif',
                    fontSize: '18px',
                    fontWeight: 700,
                    color: orb.color,
                    margin: 0,
                }}>
                    {orb.label}
                </h2>
                <p style={{
                    fontFamily: 'Inter, sans-serif',
                    fontSize: '12px',
                    color: 'rgba(255,255,255,0.6)',
                    margin: 0,
                }}>
                    Active Session
                </p>
            </div>
            <button
                onClick={onExit}
                style={{
                    marginLeft: '12px',
                    padding: '10px 18px',
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '10px',
                    color: 'white',
                    fontFamily: 'Inter, sans-serif',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                }}
            >
                Exit World →
            </button>
        </motion.div>
    );
}

function OrbNavigator() {
    const activeOrb = useWorldStore(selectActiveOrb);
    const selectOrb = useWorldStore((s) => s.selectOrb);

    const handleOrbClick = (orbId: OrbId) => {
        selectOrb(orbId);
    };

    return (
        <motion.nav
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{
                position: 'absolute',
                bottom: '24px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: '6px',
                padding: '10px 14px',
                background: 'rgba(10, 10, 15, 0.85)',
                backdropFilter: 'blur(24px)',
                borderRadius: '20px',
                border: '1px solid rgba(255,255,255,0.08)',
                maxWidth: '90vw',
                overflowX: 'auto',
            }}
        >
            {POKER_IQ_ORBS.map((orb) => (
                <OrbNavButton
                    key={orb.id}
                    orb={orb}
                    isActive={activeOrb === orb.id}
                    onClick={() => handleOrbClick(orb.id)}
                />
            ))}
        </motion.nav>
    );
}

function OrbNavButton({
    orb,
    isActive,
    onClick
}: {
    orb: OrbConfig;
    isActive: boolean;
    onClick: () => void;
}) {
    return (
        <motion.button
            onClick={onClick}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '3px',
                padding: '8px 10px',
                background: isActive ? `${orb.color}25` : 'transparent',
                border: isActive ? `1px solid ${orb.color}50` : '1px solid transparent',
                borderRadius: '10px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                minWidth: '54px',
                position: 'relative',
            }}
        >
            <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: `radial-gradient(circle at 30% 30%, ${orb.color}, ${orb.color}80)`,
                boxShadow: isActive ? `0 0 12px ${orb.color}60` : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
            }}>
                🎮
            </div>
            <span style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: '8px',
                color: isActive ? orb.color : 'rgba(255,255,255,0.5)',
                fontWeight: isActive ? 600 : 400,
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
                whiteSpace: 'nowrap',
            }}>
                {orb.label.split(' ')[0]}
            </span>
            {isActive && (
                <motion.div
                    layoutId="activeOrbIndicator"
                    style={{
                        position: 'absolute',
                        bottom: '2px',
                        width: '16px',
                        height: '2px',
                        background: orb.color,
                        borderRadius: '1px',
                        boxShadow: `0 0 6px ${orb.color}`,
                    }}
                />
            )}
        </motion.button>
    );
}

function Instructions() {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            style={{
                position: 'absolute',
                bottom: '90px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: '20px',
                padding: '8px 16px',
                background: 'rgba(0,0,0,0.4)',
                backdropFilter: 'blur(8px)',
                borderRadius: '8px',
            }}
        >
            <InstructionItem icon="🖱️" text="Drag to rotate" />
            <InstructionItem icon="👆" text="Click orb to enter" />
            <InstructionItem icon="🔍" text="Scroll to zoom" />
        </motion.div>
    );
}

function InstructionItem({ icon, text }: { icon: string; text: string }) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
        }}>
            <span style={{ fontSize: '12px' }}>{icon}</span>
            <span style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: '10px',
                color: 'rgba(255,255,255,0.5)',
            }}>
                {text}
            </span>
        </div>
    );
}
