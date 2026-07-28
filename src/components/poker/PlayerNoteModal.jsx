import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { eventBus } from '../../engine/EventBus';

const T = {
  bg: 'rgba(15,15,20,0.95)',
  border: 'rgba(255,255,255,0.12)',
  text: '#E4E6EB',
  dim: '#8E8E93',
  accent: '#2374E1',
  danger: '#FA383E',
  success: '#31A24C',
};

const PLAYER_TYPES = [
  { id: 'unknown', emoji: '', label: 'Unknown' },
  { id: 'fish', emoji: '', label: 'Fish' },
  { id: 'reg', emoji: '', label: 'Regular' },
  { id: 'shark', emoji: '', label: 'Shark' },
  { id: 'whale', emoji: '', label: 'Whale' },
  { id: 'nit', emoji: '', label: 'Nit' },
  { id: 'lag', emoji: '', label: 'LAG' },
  { id: 'tag', emoji: '', label: 'TAG' },
];

export default function PlayerNoteModal({ isOpen, onClose, player, initialNote, onSave }) {
  const [noteText, setNoteText] = useState('');
  const [playerType, setPlayerType] = useState('unknown');
  const [colorLabel, setColorLabel] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [saving, setSaving] = useState(false);

  const BADGE_COLORS = [
    { id: null, hex: null, label: 'Auto' },
    { id: '#22c55e', hex: '#22c55e', label: 'Green' },
    { id: '#ef4444', hex: '#ef4444', label: 'Red' },
    { id: '#3b82f6', hex: '#3b82f6', label: 'Blue' },
    { id: '#f97316', hex: '#f97316', label: 'Orange' },
    { id: '#a855f7', hex: '#a855f7', label: 'Purple' },
    { id: '#eab308', hex: '#eab308', label: 'Gold' },
    { id: '#14b8a6', hex: '#14b8a6', label: 'Teal' },
  ];

  // Initialize state when modal opens
  useEffect(() => {
    if (isOpen && player) {
      setNoteText(initialNote?.notes || '');
      setPlayerType(initialNote?.player_type || 'unknown');
      setColorLabel(initialNote?.color_label || null);

      // Check local storage for mute status
      try {
        const mutedStr = localStorage.getItem('ca_muted_players');
        const mutedArr = mutedStr ? JSON.parse(mutedStr) : [];
        setIsMuted(mutedArr.includes(player.id));
      } catch (err) {
        console.warn('Failed to read mute list:', err);
      }
    }
  }, [isOpen, player, initialNote]);

  const handleToggleMute = () => {
    try {
      const mutedStr = localStorage.getItem('ca_muted_players');
      let mutedArr = mutedStr ? JSON.parse(mutedStr) : [];
      let nextMuted = false;

      if (mutedArr.includes(player.id)) {
        // Unmute
        mutedArr = mutedArr.filter(id => id !== player.id);
      } else {
        // Mute
        mutedArr.push(player.id);
        nextMuted = true;
      }

      localStorage.setItem('ca_muted_players', JSON.stringify(mutedArr));
      setIsMuted(nextMuted);

      // Dispatch a custom event so TableChatHUD can update immediately
      window.dispatchEvent(new CustomEvent('ca_mute_updated'));
      try { eventBus.emit('DATA_MUTATED', `player_mute_${nextMuted ? 'added' : 'removed'}`); } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
    } catch (err) {
      console.warn('Failed to update mute list:', err);
    }
  };

  const handleSave = async () => {
    if (!player) return;
    setSaving(true);
    try {
      // We assume onSave performs the API call or we can do it here directly.
      // Doing it here makes the component self-contained for API logic.
      const res = await fetch('/api/club-arena/player-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetId: player.id,
          notes: noteText,
          playerType: playerType,
          color: colorLabel || null
        })
      });

      const data = await res.json();
      if (data.success) {
        if (onSave) {
          onSave({ notes: noteText, player_type: playerType, color_label: colorLabel });
        }
        try { eventBus.emit('DATA_MUTATED', 'player_note_saved'); } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
        onClose();
      } else {
        alert(data.error || 'Failed to save note');
      }
    } catch (err) {
      console.warn('Note save error:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !player) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          onClick={e => e.stopPropagation()}
          style={{
            background: T.bg, border: `1px solid ${T.border}`,
            borderRadius: 16, width: 340, maxWidth: '90%',
            overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          }}
        >
          {/* Header */}
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {player.avatarUrl ? <img src={player.avatarUrl} style={{ width: '100%', height: '100%' }} /> : null}
              </div>
              {player.displayName || 'Player'}
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.dim, fontSize: 20, cursor: 'pointer' }}>✕</button>
          </div>

          <div style={{ padding: 20 }}>
            {/* Tag Selection */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: T.dim, marginBottom: 8, textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }}>Player Type Tag</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {PLAYER_TYPES.map(type => (
                  <button
                    key={type.id}
                    onClick={() => setPlayerType(type.id)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 20,
                      background: playerType === type.id ? 'rgba(35, 116, 225, 0.2)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${playerType === type.id ? T.accent : T.border}`,
                      color: playerType === type.id ? '#fff' : T.dim,
                      fontSize: 13,
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4,
                      transition: 'all 0.2s',
                    }}
                  >
                    <span>{type.emoji}</span>
                    <span>{type.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Badge Color Picker */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: T.dim, marginBottom: 8, textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }}>Badge Color</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {BADGE_COLORS.map(bc => (
                  <button
                    key={bc.label}
                    onClick={() => setColorLabel(bc.id)}
                    title={bc.label}
                    style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: bc.hex || 'linear-gradient(135deg, #444, #666)',
                      border: colorLabel === bc.id ? '3px solid #fff' : '2px solid rgba(255,255,255,0.15)',
                      cursor: 'pointer',
                      boxShadow: colorLabel === bc.id ? `0 0 8px ${bc.hex || '#666'}` : 'none',
                      transition: 'all 0.2s',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, color: '#fff', fontWeight: 700,
                    }}
                  >
                    {!bc.hex && 'A'}
                  </button>
                ))}
              </div>
            </div>

            {/* Note Textarea */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: T.dim, marginBottom: 8, textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }}>Custom Notes</div>
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="Write observation here..."
                style={{
                  width: '100%', height: 80,
                  background: 'rgba(0,0,0,0.3)', border: `1px solid ${T.border}`,
                  borderRadius: 8, padding: 12, color: T.text, fontSize: 14,
                  resize: 'none', outline: 'none', fontFamily: 'inherit'
                }}
              />
            </div>

            {/* Mute Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Mute Chat</div>
                <div style={{ fontSize: 11, color: T.dim }}>Hide messages from this player</div>
              </div>
              <button
                onClick={handleToggleMute}
                style={{
                  width: 44, height: 24, borderRadius: 12,
                  background: isMuted ? T.danger : 'rgba(255,255,255,0.1)',
                  border: 'none', position: 'relative', cursor: 'pointer',
                  transition: 'background 0.3s'
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: 2, left: isMuted ? 22 : 2,
                  transition: 'left 0.3s'
                }} />
              </button>
            </div>

            {/* Save Action */}
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                width: '100%', padding: '12px 0',
                background: T.accent, color: '#fff', border: 'none',
                borderRadius: 8, fontSize: 15, fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving...' : 'Save Note'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
