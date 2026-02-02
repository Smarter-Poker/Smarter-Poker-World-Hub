/**
 * PortholeIcon - Circular porthole-style icon container
 * Features glowing rings and metallic frame for the Futuristic Metal UI system
 */

import React from 'react';

export default function PortholeIcon({
    icon: Icon,
    size = 80,
    glowColor = '#00D4FF',
    iconSize = null,
    animated = true,
    className = '',
    style = {}
}) {
    const computedIconSize = iconSize || Math.floor(size * 0.5);

    return (
        <div
            className={`porthole-icon ${animated ? 'porthole-icon--animated' : ''} ${className}`}
            style={{
                width: size,
                height: size,
                '--glow-color': glowColor,
                '--glow-rgba': `${glowColor}80`,
                ...style
            }}
        >
            {/* Outer Ring */}
            <div className="porthole-ring porthole-ring--outer" />

            {/* Inner Ring */}
            <div className="porthole-ring porthole-ring--inner" />

            {/* Icon */}
            <div className="porthole-icon__content">
                {Icon && <Icon size={computedIconSize} strokeWidth={1.5} />}
            </div>

            <style jsx>{`
                .porthole-icon {
                    position: relative;
                    border-radius: 50%;
                    background: linear-gradient(180deg, #3d4f5f 0%, #1a2332 50%, #0d1117 100%);
                    border: 4px solid #3d4f5f;
                    box-shadow: 
                        inset 0 2px 4px rgba(255,255,255,0.1),
                        inset 0 -2px 4px rgba(0,0,0,0.3),
                        0 4px 15px rgba(0,0,0,0.4);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .porthole-ring {
                    position: absolute;
                    border-radius: 50%;
                    pointer-events: none;
                }

                .porthole-ring--outer {
                    inset: 6px;
                    border: 2px solid #2a3a4a;
                }

                .porthole-ring--inner {
                    inset: 12px;
                    border: 2px solid var(--glow-color);
                    box-shadow: 
                        0 0 10px var(--glow-color),
                        0 0 20px var(--glow-rgba),
                        inset 0 0 10px var(--glow-rgba);
                }

                .porthole-icon__content {
                    position: relative;
                    z-index: 1;
                    color: var(--glow-color);
                    filter: drop-shadow(0 0 8px var(--glow-color));
                }

                .porthole-icon--animated .porthole-ring--inner {
                    animation: ring-pulse 2s ease-in-out infinite;
                }

                .porthole-icon--animated .porthole-icon__content {
                    animation: icon-glow 2s ease-in-out infinite;
                }

                @keyframes ring-pulse {
                    0%, 100% {
                        box-shadow: 
                            0 0 10px var(--glow-color),
                            0 0 20px var(--glow-rgba),
                            inset 0 0 10px var(--glow-rgba);
                    }
                    50% {
                        box-shadow: 
                            0 0 15px var(--glow-color),
                            0 0 30px var(--glow-rgba),
                            inset 0 0 15px var(--glow-rgba);
                    }
                }

                @keyframes icon-glow {
                    0%, 100% {
                        filter: drop-shadow(0 0 8px var(--glow-color));
                    }
                    50% {
                        filter: drop-shadow(0 0 12px var(--glow-color));
                    }
                }
            `}</style>
        </div>
    );
}
