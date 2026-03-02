/**
 * PlayerNoteModal — In-game opponent notes (PokerStars-style)
 * ═══════════════════════════════════════════════════════════
 * Click player avatar → modal with:
 *   - Player type classification (fish/reg/shark/etc)
 *   - Color label (colored dot on avatar)
 *   - Free-text notes, tells, tendencies
 * 
 * Data persists across sessions via player_notes API
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const PLAYER_TYPES = [
  { value: 'unknown', label: '❓ Unknown', color: '#666' },
  { value: 'fish', label: '🐟 Fish', color: '#4fc3f7' },
  { value: 'reg', label: '🎯 Regular', color: '#81c784' },
  { value: 'shark', label: '🦈 Shark', color: '#ef5350' },
  { value: 'whale', label: '🐋 Whale', color: '#FFD700' },
  { value: 'nit', label: '🐢 Nit', color: '#9e9e9e' },
  { value: 'lag', label: '🔥 LAG', color: '#ff9800' },
  { value: 'tag', label: '🎯 TAG', color: '#7e57c2' },
];

const COLOR_LABELS = [
  { value: 'none', color: 'transparent', label: 'None' },
  { value: 'red', color: '#ef5350', label: 'Red' },
  { value: 'orange', color: '#ff9800', label: 'Orange' },
  { value: 'yellow', color: '#ffeb3b', label: 'Yellow' },
  { value: 'green', color: '#4caf50', label: 'Green' },
  { value: 'blue', color: '#2196f3', label: 'Blue' },
  { value: 'purple', color: '#9c27b0', label: 'Purple' },
];

async function apiPost(url, body, supabase) {
  let headers = { 'Content-Type': 'application/json' };
  // BUG #147 FIX: Include auth token — server requires Bearer auth
  if (supabase) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    } catch (_) {}
  }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return res.json();
}

export default function PlayerNoteModal({ isOpen, onClose, userId, targetPlayer, supabase }) {
  const [note, setNote] = useState({
    player_type: 'unknown',
    color_label: 'none',
    notes: '',
    tells: '',
    tendencies: '',
    nickname: '',
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load existing note
  useEffect(() => {
    if (!isOpen || !userId || !targetPlayer?.id) return;
    setLoading(true);
    setSaved(false);
    apiPost('/api/club-arena/player-notes', {
      action: 'get',
      targetUserId: targetPlayer.id,
    }, supabase).then(r => {
      if (r.note) {
        setNote({
          player_type: r.note.player_type || 'unknown',
          color_label: r.note.color_label || 'none',
          notes: r.note.notes || '',
          tells: r.note.tells || '',
          tendencies: r.note.tendencies || '',
          nickname: r.note.nickname || '',
        });
      } else {
        setNote({
          player_type: 'unknown', color_label: 'none',
          notes: '', tells: '', tendencies: '',
          nickname: targetPlayer.displayName || '',
        });
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [isOpen, userId, targetPlayer?.id]);

  const handleSave = useCallback(async () => {
    if (!userId || !targetPlayer?.id) return;
    setSaving(true);
    try {
      await apiPost('/api/club-arena/player-notes', {
        action: 'upsert',
        targetUserId: targetPlayer.id,
        note,
      }, supabase);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('Note save failed:', e);
    } finally {
      setSaving(false);
    }
  }, [userId, targetPlayer?.id, note]);

  const handleDelete = useCallback(async () => {
    if (!userId || !targetPlayer?.id) return;
    await apiPost('/api/club-arena/player-notes', {
      action: 'delete', targetUserId: targetPlayer.id,
    }, supabase);
    onClose();
  }, [userId, targetPlayer?.id, onClose, supabase]);

  if (!isOpen || !targetPlayer) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={e => e.stopPropagation()}
          style={{
            background: '#242526', borderRadius: 16, padding: 20,
            width: 340, maxHeight: '80vh', overflowY: 'auto',
            border: '1px solid #3a3b3c', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ color: '#e4e6eb', fontSize: 16, fontWeight: 700 }}>
              📝 Notes: {targetPlayer.displayName || 'Player'}
            </div>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: '#b0b3b8', fontSize: 18, cursor: 'pointer',
            }}>✕</button>
          </div>

          {loading ? (
            <div style={{ color: '#b0b3b8', textAlign: 'center', padding: 20 }}>Loading...</div>
          ) : (
            <>
              {/* Player Type */}
              <label style={labelStyle}>Player Type</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                {PLAYER_TYPES.map(pt => (
                  <button
                    key={pt.value}
                    onClick={() => setNote(n => ({ ...n, player_type: pt.value }))}
                    style={{
                      background: note.player_type === pt.value ? pt.color + '33' : '#3a3b3c',
                      border: `1px solid ${note.player_type === pt.value ? pt.color : '#4e4f50'}`,
                      borderRadius: 6, padding: '4px 8px', fontSize: 11, color: '#e4e6eb',
                      cursor: 'pointer', fontWeight: note.player_type === pt.value ? 700 : 400,
                    }}
                  >{pt.label}</button>
                ))}
              </div>

              {/* Color Label */}
              <label style={labelStyle}>Color Label</label>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {COLOR_LABELS.map(cl => (
                  <button
                    key={cl.value}
                    onClick={() => setNote(n => ({ ...n, color_label: cl.value }))}
                    title={cl.label}
                    style={{
                      width: 24, height: 24, borderRadius: '50%', cursor: 'pointer',
                      background: cl.value === 'none' ? '#3a3b3c' : cl.color,
                      border: `2px solid ${note.color_label === cl.value ? '#fff' : 'transparent'}`,
                      position: 'relative',
                    }}
                  >
                    {cl.value === 'none' && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#666' }}>✕</span>}
                  </button>
                ))}
              </div>

              {/* Notes */}
              <label style={labelStyle}>Notes</label>
              <textarea
                value={note.notes}
                onChange={e => setNote(n => ({ ...n, notes: e.target.value }))}
                placeholder="General notes about this player..."
                maxLength={2000}
                style={textareaStyle}
                rows={3}
              />

              {/* Tendencies */}
              <label style={labelStyle}>Tendencies</label>
              <textarea
                value={note.tendencies}
                onChange={e => setNote(n => ({ ...n, tendencies: e.target.value }))}
                placeholder="e.g. 3bets wide from BTN, never bluffs river..."
                maxLength={1000}
                style={textareaStyle}
                rows={2}
              />

              {/* Tells */}
              <label style={labelStyle}>Tells</label>
              <textarea
                value={note.tells}
                onChange={e => setNote(n => ({ ...n, tells: e.target.value }))}
                placeholder="e.g. quick-calls when strong, tanks when bluffing..."
                maxLength={1000}
                style={textareaStyle}
                rows={2}
              />

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={handleSave} disabled={saving} style={{
                  flex: 1, padding: '8px 16px', borderRadius: 8, border: 'none',
                  background: saved ? '#4caf50' : '#2374E1', color: '#fff',
                  fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}>
                  {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Note'}
                </button>
                <button onClick={handleDelete} style={{
                  padding: '8px 12px', borderRadius: 8, border: '1px solid #4e4f50',
                  background: 'transparent', color: '#ef5350',
                  fontWeight: 600, fontSize: 12, cursor: 'pointer',
                }}>🗑️</button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// Exported for use by PlayerSeat to show color dot
export { COLOR_LABELS };

const labelStyle = {
  display: 'block', color: '#b0b3b8', fontSize: 11, fontWeight: 600,
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5,
};

const textareaStyle = {
  width: '100%', background: '#3a3b3c', border: '1px solid #4e4f50',
  borderRadius: 8, padding: 8, color: '#e4e6eb', fontSize: 13,
  resize: 'vertical', fontFamily: 'inherit', marginBottom: 8,
  outline: 'none',
};
