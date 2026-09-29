/**
 * MapPreferenceChooser.jsx — Lets users pick their preferred map app
 * Stores choice in localStorage ('smarter_preferred_maps')
 * Renders as a small floating gear button + dropdown on the map
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import useAccessibleDialog from '../../hooks/useAccessibleDialog';
import { PokerNearMeConsoleIcon } from './PokerNearMeConsole';

// Options print as live text on painted plates. Brand marks are never
// imitated with vector glyphs; the selected plate says so in words.
const MAP_OPTIONS = [
  { id: 'auto', label: 'Auto-Detect', desc: 'Use Your Device Default' },
  { id: 'apple', label: 'Apple Maps', desc: 'Apple Devices' },
  { id: 'google', label: 'Google Maps', desc: 'Works Everywhere' },
  { id: 'waze', label: 'Waze', desc: 'Real-Time Traffic' },
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

export default function MapPreferenceChooser({ position = 'bottom-right' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState('auto');
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef([]);

  const selectedIndex = Math.max(0, MAP_OPTIONS.findIndex((option) => option.id === selected));
  const closeMenu = useCallback(() => setIsOpen(false), []);
  const { dialogRef, initialFocusRef } = useAccessibleDialog({
    open: isOpen,
    onClose: closeMenu,
    lockScroll: false,
    isolateBackground: false,
  });

  useEffect(() => {
    const stored = getStoredPreference();
    setSelected(MAP_OPTIONS.some((option) => option.id === stored) ? stored : 'auto');
  }, []);

  // The menu owns Escape through the shared dialog stack. The only independent
  // global listener needed here is pointer dismissal.
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        closeMenu();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
    };
  }, [isOpen, closeMenu]);

  const openMenu = useCallback((index = selectedIndex) => {
    setActiveIndex(index);
    setIsOpen(true);
  }, [selectedIndex]);

  const focusOption = useCallback((index) => {
    const nextIndex = (index + MAP_OPTIONS.length) % MAP_OPTIONS.length;
    setActiveIndex(nextIndex);
    optionRefs.current[nextIndex]?.focus?.();
  }, []);

  const handleMenuKeyDown = useCallback((event) => {
    let nextIndex = activeIndex;
    if (event.key === 'ArrowDown') nextIndex = activeIndex + 1;
    else if (event.key === 'ArrowUp') nextIndex = activeIndex - 1;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = MAP_OPTIONS.length - 1;
    else return;

    event.preventDefault();
    event.stopPropagation();
    focusOption(nextIndex);
  }, [activeIndex, focusOption]);

  const handleTriggerKeyDown = useCallback((event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    event.stopPropagation();
    openMenu(event.key === 'ArrowUp' ? MAP_OPTIONS.length - 1 : selectedIndex);
  }, [openMenu, selectedIndex]);

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
    <div ref={wrapperRef} className="map-pref-wrapper" style={posStyle}>
      {/* Gear trigger button */}
      <button
        ref={triggerRef}
        type="button"
        className="map-pref-trigger"
        onClick={(e) => {
          e.stopPropagation();
          if (isOpen) closeMenu();
          else openMenu();
        }}
        onKeyDown={handleTriggerKeyDown}
        title="Map App Preference"
        aria-label="Choose preferred map app"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <PokerNearMeConsoleIcon name="directions" />
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          ref={dialogRef}
          className={`map-pref-panel pnc-panel ${dropDirection}`}
          data-pnm-console="painted-panel-v1"
          role="menu"
          aria-label="Preferred map app"
          onKeyDown={handleMenuKeyDown}
          onClick={(e) => e.stopPropagation()}
        >
          {/* The shared three-slice painted panel: head, repeating body rail
              and foot are separate boxes, so no rail paints past a cap. */}
          <span className="pnc-panel__head" aria-hidden="true" />
          <div className="pnc-panel__body map-pref-panel__body">
          <div className="map-pref-title">Preferred Map App</div>
          {MAP_OPTIONS.map((opt, index) => (
            <button
              key={opt.id}
              ref={(node) => {
                optionRefs.current[index] = node;
                if (index === activeIndex) initialFocusRef.current = node;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={selected === opt.id}
              tabIndex={activeIndex === index ? 0 : -1}
              className={`map-pref-option ${selected === opt.id ? 'active' : ''}`}
              onFocus={() => setActiveIndex(index)}
              onClick={() => handleSelect(opt.id)}
            >
              <span className="map-pref-text">
                <span className="map-pref-label">{opt.label}</span>
                <span className="map-pref-desc">{selected === opt.id ? 'Selected' : opt.desc}</span>
              </span>
            </button>
          ))}
          </div>
          <span className="pnc-panel__foot" aria-hidden="true" />
        </div>
      )}

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
  toast.className = 'pnm-map-toast';
  toast.setAttribute('role', 'status');
  // Geometry and motion only; the painted well and ink live in
  // poker-near-me-console-map.css.
  toast.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%) translateY(10px);
    z-index: 99999;
    opacity: 0;
    transition: opacity 0.25s ease, transform 0.25s ease;
    pointer-events: none;
  `;
  // SECURITY: the caller's message used to be interpolated into innerHTML, so a
  // scraped venue name such as `<img src=x onerror=...>` would execute. The
  // painted icon is a static element and the message is appended as text.
  const iconWrap = document.createElement('span');
  iconWrap.className = 'pnc-icon pnc-icon--directions pnm-map-toast__icon';
  iconWrap.setAttribute('aria-hidden', 'true');
  toast.appendChild(iconWrap);

  const label = document.createElement('span');
  label.className = 'pnm-map-toast__label';
  label.textContent = String(message == null ? '' : message);
  toast.appendChild(label);

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
