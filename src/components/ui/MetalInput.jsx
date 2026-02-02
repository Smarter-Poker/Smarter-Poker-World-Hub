/**
 * MetalInput - Futuristic Metal UI Input Component
 * Inset metal styling with neon cyan focus glow
 */

import React, { useState } from 'react';

export default function MetalInput({
    type = 'text',
    placeholder = '',
    value,
    onChange,
    onFocus,
    onBlur,
    label,
    icon,
    error,
    disabled = false,
    className = '',
    ...props
}) {
    const [isFocused, setIsFocused] = useState(false);

    const handleFocus = (e) => {
        setIsFocused(true);
        if (onFocus) onFocus(e);
    };

    const handleBlur = (e) => {
        setIsFocused(false);
        if (onBlur) onBlur(e);
    };

    return (
        <div className={`metal-input-wrapper ${className}`}>
            {label && <label className="metal-input-label">{label}</label>}

            <div className={`metal-input-container ${isFocused ? 'focused' : ''} ${error ? 'error' : ''} ${disabled ? 'disabled' : ''}`}>
                {icon && <span className="metal-input-icon">{icon}</span>}

                <input
                    type={type}
                    placeholder={placeholder}
                    value={value}
                    onChange={onChange}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    disabled={disabled}
                    className="metal-input"
                    {...props}
                />

                {/* Accent Line */}
                <div className="accent-line" />
            </div>

            {error && <span className="metal-input-error">{error}</span>}

            <style jsx>{`
                .metal-input-wrapper {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    font-family: 'Rajdhani', 'Inter', -apple-system, sans-serif;
                }

                .metal-input-label {
                    font-size: 13px;
                    font-weight: 600;
                    color: rgba(255, 255, 255, 0.7);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .metal-input-container {
                    position: relative;
                    display: flex;
                    align-items: center;
                    background: linear-gradient(180deg, #0a0a15 0%, #1a2332 100%);
                    border: 2px solid #3d4f5f;
                    border-radius: 10px;
                    box-shadow: 
                        inset 0 2px 4px rgba(0,0,0,0.4),
                        inset 0 -1px 0 rgba(255,255,255,0.05);
                    transition: all 0.2s ease;
                    overflow: hidden;
                }

                .metal-input-container.focused {
                    border-color: #00D4FF;
                    box-shadow: 
                        inset 0 2px 4px rgba(0,0,0,0.4),
                        0 0 15px rgba(0, 212, 255, 0.3),
                        0 0 30px rgba(0, 212, 255, 0.15);
                }

                .metal-input-container.error {
                    border-color: #ff4d4d;
                    box-shadow: 
                        inset 0 2px 4px rgba(0,0,0,0.4),
                        0 0 15px rgba(255, 77, 77, 0.3);
                }

                .metal-input-container.disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .metal-input-icon {
                    padding-left: 14px;
                    color: rgba(255, 255, 255, 0.4);
                    display: flex;
                    align-items: center;
                }

                .metal-input {
                    flex: 1;
                    background: transparent;
                    border: none;
                    outline: none;
                    padding: 14px 16px;
                    font-size: 15px;
                    font-weight: 500;
                    color: #fff;
                    font-family: 'Rajdhani', 'Inter', -apple-system, sans-serif;
                }

                .metal-input::placeholder {
                    color: rgba(255, 255, 255, 0.35);
                }

                .metal-input:disabled {
                    cursor: not-allowed;
                }

                /* Animated accent line at bottom */
                .accent-line {
                    position: absolute;
                    bottom: 0;
                    left: 50%;
                    width: 0;
                    height: 2px;
                    background: linear-gradient(90deg, transparent, #00D4FF, transparent);
                    transition: all 0.3s ease;
                    transform: translateX(-50%);
                }

                .metal-input-container.focused .accent-line {
                    width: 100%;
                    box-shadow: 0 0 10px rgba(0, 212, 255, 0.6);
                }

                .metal-input-error {
                    font-size: 12px;
                    color: #ff4d4d;
                    padding-left: 4px;
                }
            `}</style>
        </div>
    );
}
