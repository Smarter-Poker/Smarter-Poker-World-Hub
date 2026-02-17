/**
 * MetalModal - Futuristic Metal UI Modal Component
 * Skeuomorphic Sci-Fi design with metal frames, corner bolts, and neon accents
 */

import React, { useEffect, useRef } from 'react';

export default function MetalModal({
    isOpen,
    onClose,
    title,
    children,
    size = 'medium', // 'small' | 'medium' | 'large'
    showCloseButton = true,
    className = ''
}) {
    const modalRef = useRef(null);

    // Close on escape key
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape' && onClose) onClose();
        };
        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose]);

    // Close on overlay click
    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget && onClose) onClose();
    };

    if (!isOpen) return null;

    const sizeClass = size === 'small' ? 'modal--small' : size === 'large' ? 'modal--large' : '';

    return (
        <div className="metal-modal-overlay" onClick={handleOverlayClick}>
            <div className={`metal-modal ${sizeClass} ${className}`} ref={modalRef}>
                {/* Corner Bolts */}
                <div className="bolt bolt-tl" />
                <div className="bolt bolt-tr" />
                <div className="bolt bolt-bl" />
                <div className="bolt bolt-br" />

                {/* Neon Accent Strips */}
                <div className="neon-strip neon-left" />
                <div className="neon-strip neon-right" />

                {/* Header */}
                {(title || showCloseButton) && (
                    <div className="modal-header">
                        {title && <h2 className="modal-title">{title}</h2>}
                        {showCloseButton && (
                            <button className="close-btn" onClick={onClose} aria-label="Close Modal">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                )}

                {/* Content */}
                <div className="modal-content">
                    {children}
                </div>
            </div>

            <style jsx>{`
                .metal-modal-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.85);
                    backdrop-filter: blur(8px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                    padding: 20px;
                    animation: fadeIn 0.2s ease-out;
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                .metal-modal {
                    position: relative;
                    background: linear-gradient(180deg, #3d4f5f 0%, #1a2332 50%, #0d1117 100%);
                    border: 3px solid #3d4f5f;
                    border-radius: 16px;
                    max-width: 480px;
                    width: 100%;
                    max-height: 90vh;
                    overflow: hidden;
                    box-shadow: 
                        inset 0 1px 0 rgba(255,255,255,0.1),
                        inset 0 -1px 0 rgba(0,0,0,0.3),
                        0 8px 40px rgba(0,0,0,0.6),
                        0 0 60px rgba(0, 212, 255, 0.15);
                    animation: slideUp 0.3s ease-out;
                    font-family: 'Rajdhani', 'Inter', -apple-system, sans-serif;
                }

                .metal-modal--small { max-width: 360px; }
                .metal-modal--large { max-width: 640px; }

                @keyframes slideUp {
                    from { 
                        opacity: 0; 
                        transform: translateY(20px) scale(0.95); 
                    }
                    to { 
                        opacity: 1; 
                        transform: translateY(0) scale(1); 
                    }
                }

                /* Corner Bolts */
                .bolt {
                    position: absolute;
                    width: 14px;
                    height: 14px;
                    background: radial-gradient(circle at 30% 30%, #6a7a8a 0%, #3a4a5a 60%, #1a2a3a 100%);
                    border-radius: 50%;
                    border: 1px solid rgba(255,255,255,0.15);
                    box-shadow: 
                        inset 0 1px 2px rgba(255,255,255,0.2),
                        0 2px 4px rgba(0,0,0,0.4);
                    z-index: 10;
                }

                .bolt::after {
                    content: '+';
                    position: absolute;
                    inset: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 9px;
                    color: #1a2a3a;
                    font-weight: bold;
                }

                .bolt-tl { top: 10px; left: 10px; }
                .bolt-tr { top: 10px; right: 10px; }
                .bolt-bl { bottom: 10px; left: 10px; }
                .bolt-br { bottom: 10px; right: 10px; }

                /* Neon Strips */
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
                    z-index: 5;
                    animation: neon-pulse 2s ease-in-out infinite;
                }

                .neon-left { left: 14px; }
                .neon-right { right: 14px; }

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

                /* Header */
                .modal-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 20px 36px;
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                }

                .modal-title {
                    margin: 0;
                    font-family: 'Orbitron', 'Rajdhani', sans-serif;
                    font-size: 20px;
                    font-weight: 600;
                    color: #fff;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    text-shadow: 0 0 20px rgba(0, 212, 255, 0.4);
                }

                .close-btn {
                    background: rgba(255,255,255,0.1);
                    border: 1px solid rgba(255,255,255,0.2);
                    border-radius: 8px;
                    width: 36px;
                    height: 36px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    color: rgba(255,255,255,0.6);
                    transition: all 0.2s ease;
                }

                .close-btn:hover {
                    background: rgba(255, 77, 77, 0.2);
                    border-color: #ff4d4d;
                    color: #ff4d4d;
                    box-shadow: 0 0 15px rgba(255, 77, 77, 0.3);
                }

                /* Content */
                .modal-content {
                    padding: 24px 36px;
                    overflow-y: auto;
                    max-height: calc(90vh - 100px);
                    color: #e2e8f0;
                }
            `}</style>
        </div>
    );
}
