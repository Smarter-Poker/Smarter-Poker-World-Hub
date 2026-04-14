import React from 'react';

export default function IframeModal({ isOpen, url, title, onClose }) {
    if (!isOpen) return null;

    return (
        <div className="discovery-iframe-modal-overlay">
            <div className="discovery-iframe-modal-container">
                <div className="discovery-iframe-modal-header">
                    <h2>{title || 'View Map'}</h2>
                    <button onClick={onClose} className="discovery-iframe-modal-close" aria-label="Close modal">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
                <div className="discovery-iframe-modal-content">
                    {url ? (
                        <iframe 
                            src={url} 
                            title={title} 
                            allowFullScreen 
                            loading="lazy" 
                            className="discovery-iframe"
                        />
                    ) : (
                        <div className="discovery-iframe-loading">Loading Map...</div>
                    )}
                </div>
            </div>

            <style jsx>{`
                .discovery-iframe-modal-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0, 0, 0, 0.85);
                    backdrop-filter: blur(8px);
                    z-index: 100000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 1rem;
                }
                .discovery-iframe-modal-container {
                    background: #111827;
                    border: 1px solid #374151;
                    border-radius: 12px;
                    width: 100%;
                    max-width: 1100px;
                    height: 85vh;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                }
                .discovery-iframe-modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1rem 1.5rem;
                    background: #1f2937;
                    border-bottom: 1px solid #374151;
                }
                .discovery-iframe-modal-header h2 {
                    margin: 0;
                    color: #fff;
                    font-size: 1.1rem;
                    font-weight: 600;
                    letter-spacing: 0.05em;
                }
                .discovery-iframe-modal-close {
                    background: transparent;
                    border: none;
                    color: #9ca3af;
                    cursor: pointer;
                    padding: 0.5rem;
                    border-radius: 6px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }
                .discovery-iframe-modal-close:hover {
                    color: #fff;
                    background: #374151;
                }
                .discovery-iframe-modal-content {
                    flex: 1;
                    background: #000;
                    position: relative;
                }
                .discovery-iframe {
                    width: 100%;
                    height: 100%;
                    border: none;
                }
                .discovery-iframe-loading {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #9ca3af;
                    font-size: 1.2rem;
                }
            `}</style>
        </div>
    );
}
