/**
 * POWER-UP BAR — In-game purchasable power-ups display
 *
 * Shows available power-ups as compact diamond-cost buttons.
 * Handles purchase flow and activation state.
 *
 * Props:
 *   powerUps:       Array of power-up definitions from getGamePowerUps()
 *   usedPowerUps:   Set of used power-up IDs (to disable after use)
 *   activePowerUp:  string|null — currently active power-up ID (e.g. DOUBLE_POINTS waiting for next answer)
 *   onActivate:     (powerUp) => void — called when user taps to activate
 *   diamondBalance: number — current diamond balance for affordability check
 *   compact:        boolean — use compact layout for mobile
 */

import React from 'react';
import { Clock3, Lightbulb, ShieldCheck, Sparkles } from 'lucide-react';

const POWER_UP_ICONS = { shield: ShieldCheck, timer: Clock3, hint: Lightbulb, double: Sparkles };

export default function PowerUpBar({
    powerUps = [],
    usedPowerUps = new Set(),
    activePowerUp = null,
    onActivate,
    diamondBalance = 0,
    compact = false,
}) {
    if (!powerUps || powerUps.length === 0) return null;

    return (
        <div style={{
            display: 'flex',
            gap: compact ? 6 : 8,
            justifyContent: 'center',
            marginBottom: compact ? 8 : 12,
            flexWrap: 'wrap',
        }}>
            {powerUps.map(pu => {
                const isUsed = usedPowerUps.has(pu.id);
                const isActive = activePowerUp === pu.id;
                const canAfford = diamondBalance >= pu.cost;
                const isDisabled = isUsed || !canAfford;

                return (
                    <button
                        key={pu.id}
                        onClick={() => {
                            if (!isDisabled && !isActive && onActivate) {
                                onActivate(pu);
                            }
                        }}
                        disabled={isDisabled}
                        title={`${pu.name}: ${pu.description} (${pu.cost} ◆)`}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: compact ? '4px 8px' : '6px 10px',
                            background: isActive
                                ? `${pu.color}30`
                                : isUsed
                                    ? 'rgba(255,255,255,0.03)'
                                    : 'linear-gradient(180deg, #1c3248, #0a1726)',
                            border: isActive
                                ? `2px solid ${pu.color}`
                                : isUsed
                                    ? '1px solid rgba(255,255,255,0.05)'
                                    : `1px solid ${canAfford ? pu.color + '40' : 'rgba(255,255,255,0.08)'}`,
                            borderRadius: 0,
                            borderImage: isActive ? 'none' : "url('/images/smarterdesign/chrome-stat.webp') 11 / 3px stretch",
                            minHeight: 44,
                            cursor: isDisabled ? 'default' : 'pointer',
                            opacity: isDisabled ? 0.35 : 1,
                            transition: 'all 0.2s ease',
                            touchAction: 'manipulation',
                            animation: isActive ? 'powerUpPulse 1.5s ease-in-out infinite' : 'none',
                        }}
                    >
                        {(() => { const Icon = POWER_UP_ICONS[pu.icon] || Sparkles; return <Icon size={compact ? 14 : 16} aria-hidden style={{ color: pu.color }} />; })()}
                        <span style={{
                            fontSize: compact ? 12 : 12,
                            fontWeight: 700,
                            color: isActive ? '#ffffff' : isUsed ? 'rgba(255,255,255,0.35)' : '#f2f7ff',
                            letterSpacing: 0.5,
                        }}>
                            {isUsed ? 'Used' : isActive ? 'Active' : pu.cost}
                        </span>
                        {!isUsed && !isActive && (
                            <span style={{ fontSize: compact ? 12 : 12, opacity: 0.5 }}>◆</span>
                        )}
                    </button>
                );
            })}

            {/* Keyframes for active pulse */}
            <style>{`
                @keyframes powerUpPulse {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(0,212,255,0.3); }
                    50% { box-shadow: 0 0 12px 2px rgba(0,212,255,0.2); }
                }
            `}</style>
        </div>
    );
}
