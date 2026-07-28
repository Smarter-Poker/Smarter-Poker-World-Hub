/**
 * MapPreferenceChooser.jsx — Lets users pick their preferred map app
 * Stores choice in localStorage ('smarter_preferred_maps')
 * Renders as a small floating gear button + dropdown on the map
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';

const MAP_OPTIONS = [
  { id: 'auto', label: 'Auto-Detect', desc: 'Use your device default', icon: '◆' },
  { id: 'apple', label: 'Apple Maps', desc: 'iOS, iPad, Mac', icon: null, svg: 'apple' },
  { id: 'google', label: 'Google Maps', desc: 'Works everywhere', icon: null, svg: 'google' },
  { id: 'waze', label: 'Waze', desc: 'Real-time traffic', icon: null, svg: 'waze' },
];

function getStoredPreference() {
  try {
    return localStorage.getItem('smarter_preferred_maps') || 'auto';
  } catch { return 'auto'; }
}

function setStoredPreference(pref) {
  try {
    if (pref === 'auto') {
      localStorage.removeItem('smarter_preferred_maps');
    } else {
      localStorage.setItem('smarter_preferred_maps', pref);
    }
  } catch { /* localStorage unavailable */ }
}

function MapIcon({ type }) {
  if (type === 'apple') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
  if (type === 'google') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
  if (type === 'waze') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 11 22 2 13 21 11 13 3 11" />
    </svg>
  );
  return null;
}

export default function MapPreferenceChooser({ position = 'bottom-right' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState('auto');
  const panelRef = useRef(null);

  useEffect(() => {
    setSelected(getStoredPreference());
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const handleSelect = useCallback((id) => {
    setSelected(id);
    setStoredPreference(id);
    setIsOpen(false);
  }, []);

  const posStyle = position === 'top-right'
    ? { top: 10, right: 10 }
    : position === 'top-left'
    ? { top: 10, left: 10 }
    : position === 'bottom-left'
    ? { bottom: 10, left: 10 }
    : { bottom: 10, right: 10 }; // default bottom-right

  const dropDirection = position.startsWith('bottom') ? 'up' : 'down';

  return (
    <div ref={panelRef} className="map-pref-wrapper" style={posStyle}>
      {/* Gear trigger button */}
      <button
        className="map-pref-trigger"
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        title="Map App Preference"
        aria-label="Choose preferred map app"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          className={`map-pref-panel ${dropDirection}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="map-pref-title">Preferred Map App</div>
          {MAP_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              className={`map-pref-option ${selected === opt.id ? 'active' : ''}`}
              onClick={() => handleSelect(opt.id)}
            >
              <div className="map-pref-icon">
                {opt.icon ? <span style={{ fontSize: 16 }}>{opt.icon}</span> : <MapIcon type={opt.svg} />}
              </div>
              <div className="map-pref-text">
                <div className="map-pref-label">{opt.label}</div>
                <div className="map-pref-desc">{opt.desc}</div>
              </div>
              {selected === opt.id && (
                <svg className="map-pref-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}

      <style>{`
        .map-pref-wrapper {
          position: absolute;
          z-index: 1000;
        }
        .map-pref-trigger {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          background: rgba(10,14,25,0.88);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.25);
          color: rgba(255,255,255,0.8);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          box-shadow: 0 2px 10px rgba(0,0,0,0.5);
          padding: 0;
          -webkit-appearance: none;
          appearance: none;
          font-family: inherit;
        }
        .map-pref-trigger:hover {
          background: rgba(20,28,45,0.95);
          border-color: rgba(255,255,255,0.5);
          color: #ffffff;
          transform: scale(1.05);
        }
        .map-pref-panel {
          position: absolute;
          right: 0;
          width: 220px;
          background: rgba(10,14,25,0.96);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 12px;
          padding: 10px 6px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.7), 0 0 1px rgba(255,255,255,0.15);
          animation: mapPrefSlide 0.15s ease-out;
        }
        .map-pref-panel.up {
          bottom: 42px;
        }
        .map-pref-panel.down {
          top: 42px;
        }
        @keyframes mapPrefSlide {
          from { opacity: 0; transform: translateY(6px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .map-pref-title {
          font-size: 10px;
          font-weight: 700;
          color: rgba(255,255,255,0.6);
          text-transform: uppercase;
          letter-spacing: 1px;
          padding: 4px 10px 8px;
        }
        .map-pref-option {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 8px 10px;
          border: none;
          background: transparent;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s;
          font-family: inherit;
          -webkit-appearance: none;
          appearance: none;
          text-align: left;
        }
        .map-pref-option:hover {
          background: rgba(255,255,255,0.08);
        }
        .map-pref-option.active {
          background: rgba(255,255,255,0.12);
          border: 1px solid rgba(255,255,255,0.2);
        }
        .map-pref-icon {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          background: rgba(255,255,255,0.06);
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255,255,255,0.7);
          flex-shrink: 0;
        }
        .map-pref-option.active .map-pref-icon {
          background: rgba(255,255,255,0.15);
          color: #ffffff;
        }
        .map-pref-text {
          flex: 1;
          min-width: 0;
        }
        .map-pref-label {
          font-size: 13px;
          font-weight: 600;
          color: #e2e8f0;
          line-height: 1.2;
        }
        .map-pref-desc {
          font-size: 10px;
          color: rgba(148,163,184,0.5);
          margin-top: 1px;
        }
        .map-pref-check {
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}

/**
 * MapToast — Brief toast notification when opening maps
 * Usage: showMapToast('Opening in Apple Maps...')
 */
export function showMapToast(message) {
  if (typeof document === 'undefined') return;

  // Remove any existing toast
  const existing = document.getElementById('sp-map-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'sp-map-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%) translateY(10px);
    background: rgba(10,14,25,0.94);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: #e2e8f0;
    padding: 10px 20px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    font-family: Inter, -apple-system, sans-serif;
    border: 1px solid rgba(255,255,255,0.25);
    box-shadow: 0 4px 20px rgba(0,0,0,0.6);
    z-index: 99999;
    display: flex;
    align-items: center;
    gap: 8px;
    opacity: 0;
    transition: opacity 0.25s ease, transform 0.25s ease;
    pointer-events: none;
  `;
  toast.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="3 11 22 2 13 21 11 13 3 11" />
    </svg>
    ${message}
  `;
  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });

  // Animate out after 2s
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}
