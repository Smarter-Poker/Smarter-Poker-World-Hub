/**
 * ThemePicker — Table theme & card back selector
 * ═══════════════════════════════════════════════════
 * 
 * Renders as a settings gear icon on the table.
 * Opens a modal with:
 *   - 8 pre-built table felt themes (swatches)
 *   - 7 card back designs
 * Persists choices to localStorage.
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TABLE_THEMES, THEME_ORDER, CARD_BACKS, setStoredThemeId, setStoredCardBack,
} from './TableThemes';
import { saveAppSetting } from '../../lib/appSettingsSync';

export default function ThemePicker({ currentThemeId, onThemeChange, currentCardBack, onCardBackChange, soundEnabled, onToggleSound, fourColorDeck, onToggleFourColor, hapticEnabled, onToggleHaptic }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('theme'); // 'theme' | 'cardback' | 'sound' | 'display'
  // Phase 27 audit: React state for Sound Pack + Auto-Muck so UI updates on click
  const [soundPack, setSoundPack] = useState(() => {
    try { return (typeof localStorage !== 'undefined' && localStorage.getItem('poker-sound-pack')) || 'casino'; } catch (_) { return 'casino'; }
  });
  const [autoMuck, setAutoMuck] = useState(() => {
    try { return typeof localStorage !== 'undefined' && localStorage.getItem('poker-auto-muck') === 'true'; } catch (_) { return false; }
  });

  const handleTheme = useCallback((id) => {
    setStoredThemeId(id);
    onThemeChange?.(id);
  }, [onThemeChange]);

  const handleCardBack = useCallback((path) => {
    setStoredCardBack(path);
    onCardBackChange?.(path);
  }, [onCardBackChange]);

  return (
    <>
      {/* Gear icon trigger */}
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'absolute', top: 8, right: 8, zIndex: 55,
          background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.12)',
          color: '#B0B3B8', borderRadius: 20, width: 32, height: 32,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', fontSize: 15, backdropFilter: 'blur(8px)',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#fff'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.5)'; e.currentTarget.style.color = '#B0B3B8'; }}
        title="Table Settings"
      >
        
      </button>

      {/* Modal */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 200,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(4px)',
            }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}
              style={{
                background: '#18191a', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 16, width: 360, maxWidth: '92vw',
                maxHeight: '80vh', overflow: 'hidden',
                boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
              }}
            >
              {/* Header */}
              <div style={{
                padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>Table Settings</span>
                <button
                  onClick={() => setOpen(false)}
                  style={{
                    background: 'none', border: 'none', color: '#65676B',
                    fontSize: 20, cursor: 'pointer', padding: 0, lineHeight: 1,
                  }}
                >✕</button>
              </div>

              {/* Tabs */}
              <div style={{
                display: 'flex', gap: 0,
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}>
                {[['theme', 'Theme'], ['cardback', 'Cards'], ['sound', 'Sound'], ['display', 'Display']].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    style={{
                      flex: 1, padding: '10px 0', border: 'none',
                      background: tab === key ? 'rgba(255,255,255,0.06)' : 'transparent',
                      color: tab === key ? '#fff' : '#65676B',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      borderBottom: tab === key ? '2px solid #1877F2' : '2px solid transparent',
                      transition: 'all 0.15s',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div style={{ padding: 16, overflowY: 'auto', maxHeight: '55vh' }}>
                {tab === 'theme' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                    {THEME_ORDER.map(id => {
                      const theme = TABLE_THEMES[id];
                      const isActive = id === currentThemeId;
                      return (
                        <motion.button
                          key={id}
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => handleTheme(id)}
                          style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: isActive ? `2px solid ${theme.accent}` : '2px solid rgba(255,255,255,0.08)',
                            borderRadius: 12, padding: 10, cursor: 'pointer',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                            transition: 'border-color 0.2s',
                          }}
                        >
                          {/* Mini table preview */}
                          <div style={{
                            width: '100%', height: 60, borderRadius: 30,
                            background: `radial-gradient(ellipse at center, ${theme.feltGrad2}, ${theme.feltGrad1})`,
                            border: `2px solid ${theme.railColor}`,
                            boxShadow: `0 0 8px ${theme.edgeGlow}, inset 0 0 20px rgba(0,0,0,0.3)`,
                            position: 'relative', overflow: 'hidden',
                          }}>
                            {/* Mini pot chip */}
                            <div style={{
                              position: 'absolute', top: '50%', left: '50%',
                              transform: 'translate(-50%, -50%)',
                              display: 'flex', gap: 2,
                            }}>
                              {[theme.accent, theme.railColor, theme.accentDim].map((c, i) => (
                                <div key={i} style={{
                                  width: 6, height: 6, borderRadius: '50%',
                                  background: c, border: '1px solid rgba(255,255,255,0.3)',
                                }} />
                              ))}
                            </div>
                          </div>

                          {/* Label */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {isActive && <span style={{ color: theme.accent, fontSize: 12 }}>✓</span>}
                            <span style={{
                              color: isActive ? theme.accent : '#B0B3B8',
                              fontSize: 11, fontWeight: 700,
                            }}>
                              {theme.label}
                            </span>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                )}

                {tab === 'cardback' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                    {CARD_BACKS.map(cb => {
                      const isActive = cb.path === currentCardBack;
                      return (
                        <motion.button
                          key={cb.id}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleCardBack(cb.path)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                            padding: 4,
                          }}
                        >
                          {/* Card back preview */}
                          <div style={{
                            width: 48, height: 67, borderRadius: 5,
                            background: `linear-gradient(145deg, ${cb.color}, ${cb.color}dd)`,
                            border: isActive ? '2px solid #1877F2' : '2px solid rgba(255,255,255,0.12)',
                            boxShadow: isActive ? '0 0 12px rgba(24,119,242,0.4)' : '0 2px 6px rgba(0,0,0,0.4)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            overflow: 'hidden', position: 'relative',
                          }}>
                            {/* Pattern overlay */}
                            <div style={{
                              position: 'absolute', inset: 3,
                              border: '1px solid rgba(255,255,255,0.15)',
                              borderRadius: 3,
                              background: `repeating-linear-gradient(
                                45deg, transparent, transparent 3px,
                                rgba(255,255,255,0.03) 3px, rgba(255,255,255,0.03) 6px
                              )`,
                            }} />
                            <span style={{ fontSize: 16, opacity: 0.6 }}></span>
                          </div>
                          <span style={{
                            fontSize: 10, fontWeight: 600,
                            color: isActive ? '#1877F2' : '#8a8a9a',
                          }}>
                            {cb.label}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                )}

                {/* Sound Settings */}
                {tab === 'sound' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
                      <div>
                        <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>Sound Effects</div>
                        <div style={{ color: '#65676B', fontSize: 11 }}>Cards, chips, timer alerts</div>
                      </div>
                      <button
                        onClick={() => onToggleSound?.()}
                        style={{
                          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                          background: soundEnabled ? '#1877F2' : '#3A3B3C',
                          position: 'relative', transition: 'background 0.2s',
                        }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: '50%', background: '#fff',
                          position: 'absolute', top: 3,
                          left: soundEnabled ? 23 : 3,
                          transition: 'left 0.2s',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        }} />
                      </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
                      <div>
                        <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>Haptic Feedback</div>
                        <div style={{ color: '#65676B', fontSize: 11, marginTop: 2 }}>Vibration on your turn (mobile)</div>
                      </div>
                      <button
                        onClick={() => onToggleHaptic?.()}
                        style={{
                          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                          background: hapticEnabled ? '#1877F2' : '#3A3B3C',
                          position: 'relative', transition: 'background 0.2s',
                        }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: '50%', background: '#fff',
                          position: 'absolute', top: 3,
                          left: hapticEnabled ? 23 : 3,
                          transition: 'left 0.2s',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        }} />
                      </button>
                    </div>

                    <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
                      <div style={{ color: '#65676B', fontSize: 11 }}>
                        Tip: Mute sounds for multi-tabling or late-night sessions
                      </div>
                    </div>

                    {/* Phase 26: Sound Pack Picker */}
                    <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
                      <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Sound Pack</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {[
                          { id: 'casino', label: 'Casino', desc: 'Warm, reverbed' },
                          { id: 'minimal', label: 'Minimal', desc: 'Clicks only' },
                          { id: 'retro', label: 'Retro', desc: '8-bit chiptune' },
                        ].map(pack => {
                          const isActive = soundPack === pack.id;
                          return (
                            <button
                              key={pack.id}
                              onClick={() => {
                                setSoundPack(pack.id);
                                try { localStorage.setItem('poker-sound-pack', pack.id); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                                saveAppSetting('poker_sound_pack', pack.id, 'poker-sound-pack');
                                try { window.dispatchEvent(new CustomEvent('poker-sound-pack-changed', { detail: pack.id })); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                              }}
                              style={{
                                flex: 1, padding: '8px 4px', borderRadius: 8,
                                background: isActive ? 'rgba(24,119,242,0.12)' : 'rgba(255,255,255,0.04)',
                                border: isActive ? '1px solid #1877F2' : '1px solid rgba(255,255,255,0.08)',
                                color: isActive ? '#1877F2' : '#B0B3B8',
                                cursor: 'pointer', textAlign: 'center',
                              }}
                            >
                              <div style={{ fontSize: 12, fontWeight: 700 }}>{pack.label}</div>
                              <div style={{ fontSize: 9, color: '#65676B', marginTop: 2 }}>{pack.desc}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Display Settings */}
                {tab === 'display' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* 4-Color Deck */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
                      <div>
                        <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>4-Color Deck</div>
                        <div style={{ color: '#65676B', fontSize: 11 }}>Green clubs, blue diamonds</div>
                      </div>
                      <button
                        onClick={() => onToggleFourColor?.()}
                        style={{
                          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                          background: fourColorDeck ? '#22c55e' : '#3A3B3C',
                          position: 'relative', transition: 'background 0.2s',
                        }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: '50%', background: '#fff',
                          position: 'absolute', top: 3,
                          left: fourColorDeck ? 23 : 3,
                          transition: 'left 0.2s',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        }} />
                      </button>
                    </div>

                    {/* Haptic Feedback */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
                      <div>
                        <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>Haptic Feedback</div>
                        <div style={{ color: '#65676B', fontSize: 11 }}>Vibration on your turn</div>
                      </div>
                      <button
                        onClick={() => onToggleHaptic?.()}
                        style={{
                          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                          background: hapticEnabled ? '#1877F2' : '#3A3B3C',
                          position: 'relative', transition: 'background 0.2s',
                        }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: '50%', background: '#fff',
                          position: 'absolute', top: 3,
                          left: hapticEnabled ? 23 : 3,
                          transition: 'left 0.2s',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        }} />
                      </button>
                    </div>

                    {/* Phase 27 #6: Auto-Muck Toggle */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
                      <div>
                        <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>Auto-Muck</div>
                        <div style={{ color: '#65676B', fontSize: 11 }}>Auto-hide losing hands</div>
                      </div>
                      <button
                        onClick={() => {
                          const next = !autoMuck;
                          setAutoMuck(next);
                          try { localStorage.setItem('poker-auto-muck', String(next)); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                          saveAppSetting('poker_auto_muck', next, 'poker-auto-muck');
                          try { window.dispatchEvent(new CustomEvent('poker-auto-muck-changed', { detail: next })); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                        }}
                        style={{
                          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                          background: autoMuck ? '#22c55e' : '#3A3B3C',
                          position: 'relative', transition: 'background 0.2s',
                        }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: '50%', background: '#fff',
                          position: 'absolute', top: 3,
                          left: autoMuck ? 23 : 3,
                          transition: 'left 0.2s',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        }} />
                      </button>
                    </div>

                    <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
                      <div style={{ color: '#65676B', fontSize: 11 }}>
                        4-color deck uses green for ♣ and blue for ♦ to reduce misreads
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
