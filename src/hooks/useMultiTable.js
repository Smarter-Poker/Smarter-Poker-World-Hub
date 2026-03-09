/**
 * useMultiTable — Manages up to 4 simultaneous poker table connections
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * Features:
 *   - Open up to MAX_TABLES (4) tables at once
 *   - Tab bar with table info (stakes, variant, player count)
 *   - Auto-switch to table requiring action (your turn)
 *   - Notification badges on inactive tables
 *   - Tile view mode (2x2 grid)
 *   - Independent state per table (no cross-contamination)
 * 
 * Architecture:
 *   Each table gets its own useTableConnection instance.
 *   This hook orchestrates which is active/visible.
 */

import { useState, useCallback, useRef } from 'react';

const MAX_TABLES = 4;

/**
 * @param {Object} supabase - Supabase client
 * @param {string} userId - Current user ID
 */
export function useMultiTable({ supabase, userId }) {
  // Active table slots: [{ tableId, name, stakes, variant, clubName, clubId }]
  const [tables, setTables] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewMode, setViewMode] = useState('single'); // 'single' | 'tile'
  
  // Track which tables need attention (it's your turn)
  const [actionNeeded, setActionNeeded] = useState(new Set());
  
  // Track BBJ wins
  const [bbjWin, setBbjWin] = useState(null);

  // Sound ref for action notification
  const notifSoundRef = useRef(null);

  /**
   * Open a new table (if under MAX_TABLES limit)
   */
  const openTable = useCallback((tableInfo) => {
    setTables(prev => {
      // Already open?
      const existingIdx = prev.findIndex(t => t.tableId === tableInfo.tableId);
      if (existingIdx >= 0) {
        setActiveIndex(existingIdx);
        return prev;
      }
      if (prev.length >= MAX_TABLES) {
        return prev; // Max reached
      }
      const newTables = [...prev, {
        tableId: tableInfo.tableId,
        name: tableInfo.name || 'Table',
        stakes: tableInfo.stakes || '',
        variant: tableInfo.variant || 'NLH',
        clubName: tableInfo.clubName || '',
        clubId: tableInfo.clubId || null,
      }];
      setActiveIndex(newTables.length - 1);
      return newTables;
    });
  }, []);

  /**
   * Close a table
   */
  const closeTable = useCallback((tableId) => {
    setTables(prev => {
      const idx = prev.findIndex(t => t.tableId === tableId);
      if (idx < 0) return prev;
      const newTables = prev.filter(t => t.tableId !== tableId);
      setActionNeeded(prevAct => {
        const next = new Set(prevAct);
        next.delete(tableId);
        return next;
      });
      return newTables;
    });
    setActiveIndex(prev => Math.min(prev, Math.max(0, tables.length - 2)));
  }, [tables.length]);

  /**
   * Mark a table as needing action (your turn)
   */
  const markActionNeeded = useCallback((tableId) => {
    setActionNeeded(prev => {
      const next = new Set(prev);
      next.add(tableId);
      return next;
    });
    
    // Auto-switch to this table if it's not active (in single mode)
    if (viewMode === 'single') {
      setTables(prev => {
        const idx = prev.findIndex(t => t.tableId === tableId);
        if (idx >= 0) setActiveIndex(idx);
        return prev;
      });
    }

    // Play notification sound
    try {
      if (!notifSoundRef.current) {
        notifSoundRef.current = new Audio('/sounds/action-needed.mp3');
        notifSoundRef.current.volume = 0.3;
      }
      notifSoundRef.current.play().catch(() => {});
    } catch (e) { /* no sound available */ }
  }, [viewMode]);

  /**
   * Clear action needed flag (player acted)
   */
  const clearActionNeeded = useCallback((tableId) => {
    setActionNeeded(prev => {
      const next = new Set(prev);
      next.delete(tableId);
      return next;
    });
  }, []);

  /**
   * Switch to specific table tab
   */
  const switchTo = useCallback((index) => {
    setActiveIndex(index);
    // Clear action needed if switching to that table
    if (tables[index]) {
      setActionNeeded(prev => {
        const next = new Set(prev);
        next.delete(tables[index].tableId);
        return next;
      });
    }
  }, [tables]);

  /**
   * Toggle view mode
   */
  const toggleView = useCallback(() => {
    setViewMode(prev => prev === 'single' ? 'tile' : 'single');
  }, []);

  /**
   * Can open more tables?
   */
  const canOpenMore = tables.length < MAX_TABLES;

  /**
   * Get the currently active table
   */
  const activeTable = tables[activeIndex] || null;

  return {
    tables,
    activeIndex,
    activeTable,
    viewMode,
    actionNeeded,
    bbjWin,
    setBbjWin,
    canOpenMore,
    maxTables: MAX_TABLES,
    openTable,
    closeTable,
    switchTo,
    toggleView,
    markActionNeeded,
    clearActionNeeded,
  };
}

export default useMultiTable;
