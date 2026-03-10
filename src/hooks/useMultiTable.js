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
function saveState(slots, activeIndex, viewMode, pendingSlotIndex) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ slots, activeIndex, viewMode, pendingSlotIndex }));
  } catch (_) { /* quota or SSR — silent */ }
}

function loadState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const defaults = { slots: [null, null, null, null], activeIndex: 0, viewMode: 'single', pendingSlotIndex: -1 };
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    // Support legacy format (bare array)
    if (Array.isArray(parsed)) {
      return { ...defaults, slots: parsed.length === MAX_TABLES ? parsed : defaults.slots };
    }
    if (parsed && Array.isArray(parsed.slots) && parsed.slots.length === MAX_TABLES) {
      return { 
        slots: parsed.slots, 
        activeIndex: parsed.activeIndex || 0,
        viewMode: parsed.viewMode || 'single',
        pendingSlotIndex: typeof parsed.pendingSlotIndex === 'number' ? parsed.pendingSlotIndex : -1
      };
    }
    return defaults;
  } catch (_) {
    return { slots: [null, null, null, null], activeIndex: 0, viewMode: 'single', pendingSlotIndex: -1 };
  }
}

function clearSession() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) { }
}

/**
 * @param {Object} opts
 * @param {Object} opts.supabase - Supabase client
 * @param {string} opts.userId - Current user ID
 */
export function useMultiTable({ supabase, userId }) {
  // Fixed 4-slot array: each slot is { tableId, name, stakes, variant, clubName, clubId } | null
  const initialState = loadState();
  const [slots, setSlots] = useState(initialState.slots);
  const [activeIndex, setActiveIndex] = useState(initialState.activeIndex);
  const [viewMode, setViewMode] = useState(initialState.viewMode); // 'single' | 'tile'

  // Track which tableIds need attention (it's your turn)
  const [actionNeeded, setActionNeeded] = useState(new Set());

  // Track BBJ wins
  const [bbjWin, setBbjWin] = useState(null);

  // Track WebSocket connection status per slot (for offline indicators)
  const [connectionStatus, setConnectionStatus] = useState({});

  // Which "+" slot was tapped — lobby uses this to know where to put the next table
  const [pendingSlotIndex, setPendingSlotIndex] = useState(initialState.pendingSlotIndex);

  // Sound ref for action notification
  const notifSoundRef = useRef(null);

  // Auto-switch timer ref
  const autoSwitchRef = useRef(null);
  
  // Audio debounce ref (Anti-Spam 500ms lock)
  const lastAudioPlayRef = useRef(0);

  // CRITICAL: Ref to track latest slots/activeIndex for closures that run asynchronously
  // (avoids stale closure bug in closeTable/markActionNeeded)
  const slotsRef = useRef(slots);
  const activeIndexRef = useRef(activeIndex);
  const pendingSlotIndexRef = useRef(pendingSlotIndex);
  
  useEffect(() => { slotsRef.current = slots; }, [slots]);
  useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);
  useEffect(() => { pendingSlotIndexRef.current = pendingSlotIndex; }, [pendingSlotIndex]);

  // ── Persist to sessionStorage on every change ──
  useEffect(() => {
    const hasAny = slots.some(s => s !== null);
    if (hasAny) {
      saveState(slots, activeIndex, viewMode, pendingSlotIndex);
    }
  }, [slots, activeIndex, viewMode, pendingSlotIndex]);

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
  const openTable = useCallback((tableInfo) => {
    setSlots(prev => {
      // Already open? Switch to it.
      const existingIdx = prev.findIndex(s => s?.tableId === tableInfo.tableId);
      if (existingIdx >= 0) {
        setActiveIndex(existingIdx);
        return prev;
      }

      // Read target slot from pendingSlotIndex via ref
      const targetSlot = pendingSlotIndexRef.current;
      
      let slotIdx = targetSlot >= 0 && targetSlot < MAX_TABLES && prev[targetSlot] === null
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
    // Reset pending slot after successful open
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
    // Clear connection status for this table
    setConnectionStatus(prev => {
      const next = { ...prev };
      delete next[tableId];
      return next;
    });
    // Move active to nearest filled slot — use slotsRef to get the LATEST state
    setActiveIndex(prev => {
      const currentSlots = slotsRef.current;
      const remaining = currentSlots.map((s, i) => s && s.tableId !== tableId ? i : -1).filter(i => i >= 0);
      if (remaining.length === 0) {
        // Last table closed — clear session
        clearSession();
        return 0;
      }
      // Find closest filled slot
      const closest = remaining.reduce((best, i) =>
        Math.abs(i - prev) < Math.abs(best - prev) ? i : best, remaining[0]);
      return closest;
    });
  }, []); // No dependency on `slots` — we read from slotsRef

  /**
   * Mark a table as needing action (your turn)
   * Auto-switches to the action table after 3s if active table has no action
   */
  const markActionNeeded = useCallback((tableId) => {
    setActionNeeded(prev => {
      if (prev.has(tableId)) return prev;
      const next = new Set(prev);
      next.add(tableId);
      return next;
    });

    // Play notification sound (debounced 500ms to prevent spam overlap if 4 tables ping instantly)
    try {
      const now = Date.now();
      if (now - lastAudioPlayRef.current > 500) {
        lastAudioPlayRef.current = now;
        if (!notifSoundRef.current) {
          notifSoundRef.current = new Audio('/sounds/action-needed.mp3');
          notifSoundRef.current.volume = 0.3;
        }
        notifSoundRef.current.play().catch(() => {});
      }
    } catch (_) { /* no sound available */ }

    // Auto-switch: if active table has no action, switch to this one after 3s
    // Read from refs to avoid stale closure
    const activeSlot = slotsRef.current[activeIndexRef.current];
    if (activeSlot && activeSlot.tableId !== tableId) {
      // Clear any pending auto-switch
      if (autoSwitchRef.current) clearTimeout(autoSwitchRef.current);
      autoSwitchRef.current = setTimeout(() => {
        // Re-check: only auto-switch if the table still needs action
        setActiveIndex(prevIdx => {
          const latestSlots = slotsRef.current;
          const targetIdx = latestSlots.findIndex(s => s?.tableId === tableId);
          if (targetIdx >= 0) return targetIdx;
          return prevIdx;
        });
        autoSwitchRef.current = null;
      }, 3000);
    }
  }, []); // Stable callback — reads from refs

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
    // Read from ref for latest state
    const currentSlots = slotsRef.current;
    if (!currentSlots[index]) return;
    setActiveIndex(index);
    // Clear action needed for that table
    const tableId = currentSlots[index]?.tableId;
    if (tableId) {
      setActionNeeded(prev => {
        if (!prev.has(tableId)) return prev;
        const next = new Set(prev);
        next.delete(tableId);
        return next;
      });
    }
  }, []); // Stable callback — reads from slotsRef

  /**
   * Toggle view mode
   */
  const toggleView = useCallback(() => {
    setViewMode(prev => prev === 'single' ? 'tile' : 'single');
  }, []);

  /**
   * Track WebSocket connection status (for offline indicator)
   */
  const updateConnectionStatus = useCallback((tableId, status) => {
    setConnectionStatus(prev => {
      if (prev[tableId] === status) return prev;
      return { ...prev, [tableId]: status };
    });
  }, []);

  /**
   * Hot-swap table ID (for MTT auto-moves when a player is balanced)
   */
  const updateTableId = useCallback((oldId, newId) => {
    if (oldId === newId) return;
    setSlots(prev => {
      const idx = prev.findIndex(s => s?.tableId === oldId);
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], tableId: newId };
      return next;
    });
    
    // Migrate action-needed flag
    setActionNeeded(prev => {
      if (!prev.has(oldId)) return prev;
      const next = new Set(prev);
      next.delete(oldId);
      next.add(newId);
      return next;
    });

    // Migrate connection status
    setConnectionStatus(prev => {
      if (prev[oldId] === undefined) return prev;
      const next = { ...prev };
      next[newId] = next[oldId];
      delete next[oldId];
      return next;
    });
  }, []);

  // Cleanup auto-switch on unmount
  useEffect(() => {
    return () => {
      if (autoSwitchRef.current) clearTimeout(autoSwitchRef.current);
    };
  }, []);

  return {
    slots,
    tables, // convenience: non-null slots with _slotIndex
    activeIndex,
    activeTable,
    viewMode,
    actionNeeded,
    connectionStatus,
    bbjWin,
    setBbjWin,
    canOpenMore,
    maxTables: MAX_TABLES,
    pendingSlotIndex,
    setPendingSlotIndex,
    getNextEmptySlot,
    openTable,
    closeTable,
    updateTableId,
    switchTo,
    toggleView,
    updateConnectionStatus,
    markActionNeeded,
    clearActionNeeded,
    clearSession,
  };
}

export default useMultiTable;
