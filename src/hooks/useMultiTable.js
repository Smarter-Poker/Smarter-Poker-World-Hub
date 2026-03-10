/**
 * useMultiTable — PokerBros-style 4-slot multi-table manager
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Fixed 4-slot model: slots[0..3] where null = empty "+" slot.
 * Persists to sessionStorage so tables survive page refreshes.
 *
 * Features:
 *   - Always exactly 4 slots (PokerBros style)
 *   - Open up to MAX_TABLES (4) tables at once
 *   - SessionStorage persistence (not localStorage — session-scoped)
 *   - Action-needed tracking per slot
 *   - Tile view mode (2×2 grid)
 *   - pendingSlotIndex for lobby "+" navigation
 */

import { useState, useCallback, useRef, useEffect } from 'react';

const MAX_TABLES = 4;
const STORAGE_KEY = 'club-arena-multi-tables';

// ── SessionStorage helpers ──────────────────────────────────────────────
function saveSlots(slots) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(slots));
  } catch (_) { /* quota or SSR — silent */ }
}

function loadSlots() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [null, null, null, null];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === MAX_TABLES) return parsed;
    return [null, null, null, null];
  } catch (_) {
    return [null, null, null, null];
  }
}

/**
 * @param {Object} opts
 * @param {Object} opts.supabase - Supabase client
 * @param {string} opts.userId - Current user ID
 */
export function useMultiTable({ supabase, userId }) {
  // Fixed 4-slot array: each slot is { tableId, name, stakes, variant, clubName, clubId } | null
  const [slots, setSlots] = useState(() => loadSlots());
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewMode, setViewMode] = useState('single'); // 'single' | 'tile'

  // Track which tableIds need attention (it's your turn)
  const [actionNeeded, setActionNeeded] = useState(new Set());

  // Track BBJ wins
  const [bbjWin, setBbjWin] = useState(null);

  // Which "+" slot was tapped — lobby uses this to know where to put the next table
  const [pendingSlotIndex, setPendingSlotIndex] = useState(-1);

  // Sound ref for action notification
  const notifSoundRef = useRef(null);

  // ── Persist to sessionStorage on every change ──
  useEffect(() => {
    saveSlots(slots);
  }, [slots]);

  // ── Derived: non-null tables (for rendering) ──
  const tables = slots
    .map((slot, idx) => (slot ? { ...slot, _slotIndex: idx } : null))
    .filter(Boolean);

  const activeTable = slots[activeIndex] || null;
  const canOpenMore = slots.some(s => s === null);

  /**
   * Get the first empty slot index, or -1 if all full
   */
  const getNextEmptySlot = useCallback(() => {
    return slots.findIndex(s => s === null);
  }, [slots]);

  /**
   * Open a new table in a specific slot (or next empty)
   */
  const openTable = useCallback((tableInfo, targetSlot) => {
    setSlots(prev => {
      // Already open? Switch to it.
      const existingIdx = prev.findIndex(s => s?.tableId === tableInfo.tableId);
      if (existingIdx >= 0) {
        setActiveIndex(existingIdx);
        return prev;
      }

      // Find the target slot
      let slotIdx = typeof targetSlot === 'number' && targetSlot >= 0 && targetSlot < MAX_TABLES && prev[targetSlot] === null
        ? targetSlot
        : prev.findIndex(s => s === null);

      if (slotIdx < 0) return prev; // All full

      const next = [...prev];
      next[slotIdx] = {
        tableId: tableInfo.tableId,
        name: tableInfo.name || 'Table',
        stakes: tableInfo.stakes || '',
        variant: tableInfo.variant || 'NLH',
        clubName: tableInfo.clubName || '',
        clubId: tableInfo.clubId || null,
        tournamentId: tableInfo.tournamentId || null,
      };
      setActiveIndex(slotIdx);
      return next;
    });
    setPendingSlotIndex(-1);
  }, []);

  /**
   * Close a table (slot reverts to null / "+")
   */
  const closeTable = useCallback((tableId) => {
    setSlots(prev => {
      const idx = prev.findIndex(s => s?.tableId === tableId);
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = null;
      return next;
    });
    setActionNeeded(prev => {
      const next = new Set(prev);
      next.delete(tableId);
      return next;
    });
    // Move active to nearest filled slot
    setActiveIndex(prev => {
      const remaining = slots.map((s, i) => s && s.tableId !== tableId ? i : -1).filter(i => i >= 0);
      if (remaining.length === 0) return 0;
      // Find closest filled slot
      const closest = remaining.reduce((best, i) =>
        Math.abs(i - prev) < Math.abs(best - prev) ? i : best, remaining[0]);
      return closest;
    });
  }, [slots]);

  /**
   * Mark a table as needing action (your turn)
   */
  const markActionNeeded = useCallback((tableId) => {
    setActionNeeded(prev => {
      if (prev.has(tableId)) return prev;
      const next = new Set(prev);
      next.add(tableId);
      return next;
    });

    // Play notification sound
    try {
      if (!notifSoundRef.current) {
        notifSoundRef.current = new Audio('/sounds/action-needed.mp3');
        notifSoundRef.current.volume = 0.3;
      }
      notifSoundRef.current.play().catch(() => {});
    } catch (_) { /* no sound available */ }
  }, []);

  /**
   * Clear action needed flag (player acted)
   */
  const clearActionNeeded = useCallback((tableId) => {
    setActionNeeded(prev => {
      if (!prev.has(tableId)) return prev;
      const next = new Set(prev);
      next.delete(tableId);
      return next;
    });
  }, []);

  /**
   * Switch to specific slot
   */
  const switchTo = useCallback((index) => {
    if (index < 0 || index >= MAX_TABLES) return;
    // Only switch if slot has a table
    if (!slots[index]) return;
    setActiveIndex(index);
    // Clear action needed for that table
    const tableId = slots[index]?.tableId;
    if (tableId) {
      setActionNeeded(prev => {
        if (!prev.has(tableId)) return prev;
        const next = new Set(prev);
        next.delete(tableId);
        return next;
      });
    }
  }, [slots]);

  /**
   * Toggle view mode
   */
  const toggleView = useCallback(() => {
    setViewMode(prev => prev === 'single' ? 'tile' : 'single');
  }, []);

  return {
    slots,
    tables, // convenience: non-null slots with _slotIndex
    activeIndex,
    activeTable,
    viewMode,
    actionNeeded,
    bbjWin,
    setBbjWin,
    canOpenMore,
    maxTables: MAX_TABLES,
    pendingSlotIndex,
    setPendingSlotIndex,
    getNextEmptySlot,
    openTable,
    closeTable,
    switchTo,
    toggleView,
    markActionNeeded,
    clearActionNeeded,
  };
}

export default useMultiTable;
