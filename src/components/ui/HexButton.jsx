/**
 * HexButton - Hexagonal action button for Futuristic Metal UI
 * Features clip-path hexagonal shape, metal gradient, and neon cyan glow on hover
 */

import React from 'react';

export default function HexButton({
    children,
    label = null,  // alternative to children for convenience
    onClick,
    disabled = false,
    variant = 'primary', // 'primary' | 'secondary' | 'success' | 'danger'
    size = 'md', // 'sm' | 'md' | 'lg'
    fullWidth = false,
    icon = null,
    className = '',
    style = {}
}) {
    const sizeClasses = {
        sm: 'hex-button--sm',
        md: 'hex-button--md',
        lg: 'hex-button--lg'
    };

    return (
        <button
            className={`hex-button hex-button--${variant} ${sizeClasses[size]} ${fullWidth ? 'hex-button--full' : ''} ${disabled ? 'hex-button--disabled' : ''} ${className}`}
            onClick={disabled ? undefined : onClick}
            disabled={disabled}
            style={style}
        >
            {icon && (() => {
                // Support both rendered elements (<Play size={16} />) and
                // component constructors (icon={Play}) — Lucide icons are
                // forwardRef objects; rendering them directly causes React #31.
                const Icon = (typeof icon === 'function' || (icon && typeof icon === 'object' && icon.$$typeof)) ? icon : null;
                return (
                    <span className="hex-button__icon">
                        {Icon ? <Icon size={16} /> : icon}
                    </span>
                );
            })()}

            <span className="hex-button__text">{children ?? label}</span>

            <style>{`
                .hex-button {
                    position: relative;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    background: linear-gradient(180deg, #3d4f5f 0%, #2a3a4a 50%, #1a2332 100%);
                    border: 2px solid #3d4f5f;
                    clip-path: polygon(8% 0%, 92% 0%, 100% 50%, 92% 100%, 8% 100%, 0% 50%);
                    color: #ffffff;
                    font-family: 'Orbitron', 'Rajdhani', sans-serif;
                    font-weight: 700;
                    letter-spacing: 0.1em;
                    text-transform: uppercase;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.4);
                }

                .hex-button:hover:not(.hex-button--disabled) {
                    background: linear-gradient(180deg, rgba(0, 212, 255, 0.3) 0%, #2a3a4a 50%, #1a2332 100%);
                    border-color: #00D4FF;
                    box-shadow: 
                        0 0 10px #00D4FF,
                        0 0 20px rgba(0, 212, 255, 0.4),
                        0 4px 15px rgba(0,0,0,0.4);
                    transform: translateY(-2px);
                }

                .hex-button:active:not(.hex-button--disabled) {
                    transform: translateY(0);
                }

                /* Sizes */
                .hex-button--sm {
                    padding: 8px 24px;
                    font-size: 11px;
                }

                .hex-button--md {
                    padding: 12px 32px;
                    font-size: 13px;
                }

                .hex-button--lg {
                    padding: 16px 40px;
                    font-size: 15px;
                }

                .hex-button--full {
                    width: 100%;
                }

                /* Variants */
                .hex-button--primary {
                    border-color: #00D4FF;
                    text-shadow: 0 0 10px rgba(0, 212, 255, 0.5);
                }

                .hex-button--secondary {
                    border-color: #3d4f5f;
                }

                .hex-button--success {
                    border-color: #00FF87;
                    text-shadow: 0 0 10px rgba(0, 255, 135, 0.5);
                }

                .hex-button--success:hover:not(.hex-button--disabled) {
                    border-color: #00FF87;
                    box-shadow: 
                        0 0 10px #00FF87,
                        0 0 20px rgba(0, 255, 135, 0.4),
                        0 4px 15px rgba(0,0,0,0.4);
                }

                .hex-button--danger {
                    border-color: #FF4444;
                    text-shadow: 0 0 10px rgba(255, 68, 68, 0.5);
                }

                .hex-button--danger:hover:not(.hex-button--disabled) {
                    border-color: #FF4444;
                    box-shadow: 
                        0 0 10px #FF4444,
                        0 0 20px rgba(255, 68, 68, 0.4),
                        0 4px 15px rgba(0,0,0,0.4);
                }

                /* Disabled */
                .hex-button--disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    background: linear-gradient(180deg, #2a3a4a 0%, #1a2332 100%);
                    border-color: #2a3a4a;
                }

                .hex-button__icon {
                    display: flex;
                    align-items: center;
                }

                .hex-button__text {
                    position: relative;
                    z-index: 1;
                }
            `}</style>
        </button>
    );
}
