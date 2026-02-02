/**
 * MetalFrame - Futuristic Metal UI container component
 * Skeuomorphic Sci-Fi design with metal frames, corner bolts, and neon accents
 */

import React from 'react';

export default function MetalFrame({
    children,
    padding = '24px',
    showBolts = true,
    showNeonStrips = true,
    variant = 'elevated', // 'elevated' | 'inset' | 'flat'
    className = '',
    style = {}
}) {
    return (
        <div className={`metal-frame metal-frame--${variant} ${className}`} style={{ padding, ...style }}>
            {/* Corner Bolts */}
            {showBolts && (
                <>
                    <div className="frame-bolt frame-bolt--tl" />
                    <div className="frame-bolt frame-bolt--tr" />
                    <div className="frame-bolt frame-bolt--bl" />
                    <div className="frame-bolt frame-bolt--br" />
                </>
            )}

            {/* Neon Accent Strips */}
            {showNeonStrips && (
                <>
                    <div className="neon-strip neon-strip--left" />
                    <div className="neon-strip neon-strip--right" />
                </>
            )}

            {/* Content */}
            <div className="metal-frame__content">
                {children}
            </div>

            <style jsx>{`
                .metal-frame {
                    position: relative;
                    background: linear-gradient(180deg, #3d4f5f 0%, #1a2332 50%, #0d1117 100%);
                    border: 3px solid #3d4f5f;
                    border-radius: 12px;
                    box-shadow: 
                        inset 0 1px 0 rgba(255,255,255,0.1),
                        inset 0 -1px 0 rgba(0,0,0,0.3),
                        0 4px 20px rgba(0,0,0,0.5);
                }

                .metal-frame--elevated {
                    box-shadow: 
                        inset 0 1px 0 rgba(255,255,255,0.1),
                        inset 0 -1px 0 rgba(0,0,0,0.3),
                        0 8px 32px rgba(0,0,0,0.6),
                        0 2px 8px rgba(0,0,0,0.4);
                }

                .metal-frame--inset {
                    background: linear-gradient(180deg, #0a0a15 0%, #1a2332 100%);
                    box-shadow: 
                        inset 0 2px 4px rgba(0,0,0,0.5),
                        inset 0 -1px 0 rgba(255,255,255,0.05);
                }

                .metal-frame--flat {
                    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                }

                .metal-frame__content {
                    position: relative;
                    z-index: 1;
                }

                /* Corner Bolts */
                .frame-bolt {
                    position: absolute;
                    width: 14px;
                    height: 14px;
                    background: radial-gradient(circle, #5a6a7a 30%, #3a4a5a 70%);
                    border-radius: 50%;
                    border: 1px solid #2a3a4a;
                    box-shadow: 
                        inset 0 1px 2px rgba(255,255,255,0.2),
                        0 2px 4px rgba(0,0,0,0.3);
                    z-index: 2;
                }

                .frame-bolt::after {
                    content: '+';
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    font-size: 10px;
                    font-weight: bold;
                    color: #1a2a3a;
                    line-height: 1;
                }

                .frame-bolt--tl { top: 8px; left: 8px; }
                .frame-bolt--tr { top: 8px; right: 8px; }
                .frame-bolt--bl { bottom: 8px; left: 8px; }
                .frame-bolt--br { bottom: 8px; right: 8px; }

                /* Neon Accent Strips */
                .neon-strip {
                    position: absolute;
                    width: 4px;
                    top: 15%;
                    bottom: 15%;
                    background: #00D4FF;
                    border-radius: 2px;
                    box-shadow: 
                        0 0 10px #00D4FF,
                        0 0 20px rgba(0, 212, 255, 0.6);
                    z-index: 2;
                    animation: neon-pulse 2s ease-in-out infinite;
                }

                .neon-strip--left { left: 12px; }
                .neon-strip--right { right: 12px; }

                @keyframes neon-pulse {
                    0%, 100% { 
                        opacity: 1;
                        box-shadow: 0 0 10px #00D4FF, 0 0 20px rgba(0, 212, 255, 0.6);
                    }
                    50% { 
                        opacity: 0.8;
                        box-shadow: 0 0 15px #00D4FF, 0 0 30px rgba(0, 212, 255, 0.8);
                    }
                }
            `}</style>
        </div>
    );
}
