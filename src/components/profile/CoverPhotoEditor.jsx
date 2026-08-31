/**
 * 📷 COVER PHOTO EDITOR — Drag-to-Reposition Modal
 * 
 * Facebook-style cover photo repositioning. After uploading a cover photo,
 * this modal lets the user drag the image vertically to choose the visible
 * portion, then saves the position as a CSS object-position value.
 * 
 * Props:
 *   imageUrl    — URL of the cover photo to reposition
 *   initialPosition — current CSS object-position (e.g. '50% 30%'), default '50% 50%'
 *   onSave      — (positionString) => void — called with CSS value like '50% 30%'
 *   onCancel    — () => void — close without saving
 *   coverHeight — px height of the cover frame (default 200)
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';

export default function CoverPhotoEditor({
  imageUrl,
  initialPosition = '50% 50%',
  onSave,
  onCancel,
  coverHeight = 200,
}) {
  // Parse initial Y% from object-position string
  const parseYPercent = (pos) => {
    if (!pos) return 50;
    const parts = pos.split(/\s+/);
    const yStr = parts.length >= 2 ? parts[1] : parts[0];
    const parsed = parseFloat(yStr);
    return isNaN(parsed) ? 50 : parsed;
  };

  const [yPercent, setYPercent] = useState(() => parseYPercent(initialPosition));
  const [isDragging, setIsDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const startYRef = useRef(0);
  const startPercentRef = useRef(0);

  // Calculate how much 1px of drag maps to percentage change
  // This depends on how much the image overflows the container
  const getSensitivity = useCallback(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return 0.5;
    // naturalHeight / naturalWidth tells us the aspect ratio
    // The image fills width, so displayed height = container.width * (naturalHeight / naturalWidth)
    const displayedHeight = container.offsetWidth * (img.naturalHeight / img.naturalWidth);
    const overflow = displayedHeight - container.offsetHeight;
    if (overflow <= 0) return 0; // Image doesn't overflow — no panning needed
    // 100% of drag across the overflow maps to 100% of y-position
    return 100 / overflow;
  }, []);

  // Mouse handlers
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
    startYRef.current = e.clientY;
    startPercentRef.current = yPercent;
  }, [yPercent]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    const deltaY = startYRef.current - e.clientY; // Drag up = positive delta = image shifts down (higher %)
    const sensitivity = getSensitivity();
    const newPercent = Math.max(0, Math.min(100, startPercentRef.current + deltaY * sensitivity));
    setYPercent(newPercent);
  }, [isDragging, getSensitivity]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Touch handlers
  const handleTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    setIsDragging(true);
    startYRef.current = touch.clientY;
    startPercentRef.current = yPercent;
  }, [yPercent]);

  const handleTouchMove = useCallback((e) => {
    if (!isDragging) return;
    e.preventDefault(); // Prevent scroll
    const touch = e.touches[0];
    const deltaY = startYRef.current - touch.clientY;
    const sensitivity = getSensitivity();
    const newPercent = Math.max(0, Math.min(100, startPercentRef.current + deltaY * sensitivity));
    setYPercent(newPercent);
  }, [isDragging, getSensitivity]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Global mouse/touch cleanup
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const positionStr = `50% ${Math.round(yPercent)}%`;
    try {
      await onSave(positionStr);
    } finally {
      setSaving(false);
    }
  };

  const objectPosition = `50% ${Math.round(yPercent)}%`;

  return (
    <div className="cpe-overlay">
      {/* Backdrop */}
      <div className="cpe-backdrop" onClick={onCancel} />

      {/* Content */}
      <div className="cpe-modal">
        {/* Header */}
        <div className="cpe-header">
          <h3 className="cpe-title">Reposition Cover Photo</h3>
          <button className="cpe-close" onClick={onCancel} aria-label="Close">✕</button>
        </div>

        {/* Cover Preview — drag target */}
        <div
          ref={containerRef}
          className={`cpe-preview ${isDragging ? 'dragging' : ''}`}
          style={{ height: coverHeight }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          <img
            ref={imgRef}
            src={imageUrl}
            alt="Cover photo preview"
            className="cpe-image"
            style={{ objectPosition }}
            draggable={false}
          />

          {/* Drag instruction overlay */}
          {!isDragging && (
            <div className="cpe-instruction">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="7,10 12,5 17,10" />
                <polyline points="7,14 12,19 17,14" />
              </svg>
              <span>Drag To Reposition</span>
            </div>
          )}

          {/* Moving cursor indicator when dragging */}
          {isDragging && (
            <div className="cpe-dragging-indicator">
              Repositioning...
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="cpe-actions">
          <button className="cpe-btn cpe-btn-cancel" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="cpe-btn cpe-btn-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Position'}
          </button>
        </div>
      </div>

      <style>{`
        .cpe-overlay {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }

        .cpe-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
        }

        .cpe-modal {
          position: relative;
          width: 100%;
          max-width: 700px;
          background: #1a1a2e;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1);
          animation: cpeSlideIn 0.3s ease-out;
        }

        @keyframes cpeSlideIn {
          from { opacity: 0; transform: translateY(20px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .cpe-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .cpe-title {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          color: #ffffff;
        }

        .cpe-close {
          background: rgba(255, 255, 255, 0.1);
          border: none;
          color: #ffffff;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          font-size: 16px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }

        .cpe-close:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .cpe-preview {
          position: relative;
          overflow: hidden;
          cursor: grab;
          user-select: none;
          -webkit-user-select: none;
          background: #0d0d1e;
        }

        .cpe-preview.dragging {
          cursor: grabbing;
        }

        .cpe-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          pointer-events: none;
          transition: object-position 0.05s linear;
        }

        .cpe-instruction {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border-radius: 24px;
          color: #ffffff;
          font-size: 14px;
          font-weight: 600;
          pointer-events: none;
          animation: cpePulse 2s ease-in-out infinite;
          border: 1px solid rgba(255, 255, 255, 0.15);
        }

        @keyframes cpePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        .cpe-dragging-indicator {
          position: absolute;
          bottom: 12px;
          left: 50%;
          transform: translateX(-50%);
          padding: 6px 16px;
          background: rgba(24, 119, 242, 0.8);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border-radius: 16px;
          color: white;
          font-size: 12px;
          font-weight: 600;
          pointer-events: none;
        }

        .cpe-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding: 16px 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .cpe-btn {
          padding: 10px 24px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
        }

        .cpe-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .cpe-btn-cancel {
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .cpe-btn-cancel:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.15);
        }

        .cpe-btn-save {
          background: #1877F2;
          color: #ffffff;
        }

        .cpe-btn-save:hover:not(:disabled) {
          background: #166FE5;
          box-shadow: 0 4px 12px rgba(24, 119, 242, 0.4);
        }

        @media (max-width: 600px) {
          .cpe-modal {
            max-width: 100%;
            border-radius: 12px;
          }
        }
      `}</style>
    </div>
  );
}
