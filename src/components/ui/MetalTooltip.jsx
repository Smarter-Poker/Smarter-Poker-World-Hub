/**
 * MetalTooltip - Futuristic Metal UI Tooltip Component
 * Mini metal frame with pointer and neon accent
 */

import React, { useState, useRef, useEffect } from 'react';

export default function MetalTooltip({
    children,
    content,
    position = 'top', // 'top' | 'bottom' | 'left' | 'right'
    delay = 200,
    className = ''
}) {
    const [isVisible, setIsVisible] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const triggerRef = useRef(null);
    const tooltipRef = useRef(null);
    const timeoutRef = useRef(null);

    const showTooltip = () => {
        timeoutRef.current = setTimeout(() => {
            setIsVisible(true);
        }, delay);
    };

    const hideTooltip = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setIsVisible(false);
    };

    useEffect(() => {
        if (isVisible && triggerRef.current && tooltipRef.current) {
            const triggerRect = triggerRef.current.getBoundingClientRect();
            const tooltipRect = tooltipRef.current.getBoundingClientRect();

            let top = 0, left = 0;

            switch (position) {
                case 'top':
                    top = triggerRect.top - tooltipRect.height - 10;
                    left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
                    break;
                case 'bottom':
                    top = triggerRect.bottom + 10;
                    left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
                    break;
                case 'left':
                    top = triggerRect.top + (triggerRect.height / 2) - (tooltipRect.height / 2);
                    left = triggerRect.left - tooltipRect.width - 10;
                    break;
                case 'right':
                    top = triggerRect.top + (triggerRect.height / 2) - (tooltipRect.height / 2);
                    left = triggerRect.right + 10;
                    break;
            }

            // Keep tooltip within viewport
            left = Math.max(10, Math.min(left, window.innerWidth - tooltipRect.width - 10));
            top = Math.max(10, Math.min(top, window.innerHeight - tooltipRect.height - 10));

            setCoords({ top, left });
        }
    }, [isVisible, position]);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    return (
        <>
            <span
                ref={triggerRef}
                onMouseEnter={showTooltip}
                onMouseLeave={hideTooltip}
                onFocus={showTooltip}
                onBlur={hideTooltip}
                className={`metal-tooltip-trigger ${className}`}
            >
                {children}
            </span>

            {isVisible && (
                <div
                    ref={tooltipRef}
                    className={`metal-tooltip metal-tooltip--${position}`}
                    style={{ top: coords.top, left: coords.left }}
                >
                    <div className="tooltip-content">{content}</div>
                    <div className={`tooltip-arrow tooltip-arrow--${position}`} />
                </div>
            )}

            <style jsx>{`
                .metal-tooltip-trigger {
                    display: inline-flex;
                    cursor: help;
                }

                .metal-tooltip {
                    position: fixed;
                    z-index: 10001;
                    animation: tooltipFade 0.2s ease-out;
                    font-family: 'Rajdhani', 'Inter', -apple-system, sans-serif;
                }

                @keyframes tooltipFade {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }

                .tooltip-content {
                    background: linear-gradient(180deg, #3d4f5f 0%, #1a2332 100%);
                    border: 2px solid #00D4FF;
                    border-radius: 8px;
                    padding: 10px 14px;
                    font-size: 13px;
                    font-weight: 500;
                    color: #e2e8f0;
                    max-width: 280px;
                    box-shadow: 
                        0 0 15px rgba(0, 212, 255, 0.3),
                        0 4px 20px rgba(0, 0, 0, 0.5);
                    text-align: center;
                }

                .tooltip-arrow {
                    position: absolute;
                    width: 10px;
                    height: 10px;
                    background: linear-gradient(135deg, #3d4f5f 0%, #1a2332 100%);
                    border: 2px solid #00D4FF;
                    transform: rotate(45deg);
                }

                .tooltip-arrow--top {
                    bottom: -6px;
                    left: 50%;
                    margin-left: -5px;
                    border-top: none;
                    border-left: none;
                }

                .tooltip-arrow--bottom {
                    top: -6px;
                    left: 50%;
                    margin-left: -5px;
                    border-bottom: none;
                    border-right: none;
                }

                .tooltip-arrow--left {
                    right: -6px;
                    top: 50%;
                    margin-top: -5px;
                    border-top: none;
                    border-left: none;
                }

                .tooltip-arrow--right {
                    left: -6px;
                    top: 50%;
                    margin-top: -5px;
                    border-bottom: none;
                    border-right: none;
                }
            `}</style>
        </>
    );
}
