/**
 * MultiTableView — premium-style 4-slot multi-table system (Phase 2)
 * ═════════════════════════════════════════════════════════════════════
 *
 * Phase 2 Enhancements:
 *   - GAP 1: CSS offset for LivePokerTable fixed elements (top:8px → top:52px)
 *   - GAP 4: Close-tab confirmation modal
 *   - GAP 5: Swipe visual feedback (translateX during drag)
 *   - GAP 6: TableChatHUD bound to activeTable
 *   - ADV-1: Keyboard shortcuts (Ctrl+1..4, Ctrl+Tab, Ctrl+W)
 *   - ADV-2: EventBus integration
 *   - ADV-3: Haptic feedback on tab switch
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useMultiTable } from '../../hooks/useMultiTable';
import { eventBus, EventType, busEmit } from '../../engine/EventBus';
import useTrainingBus from '../../hooks/useTrainingBus';

// Lazy imports for heavy components
const LivePokerTable = dynamic(
  () => import('./LivePokerTable'),
  { ssr: false }
);

const TableChatHUD = dynamic(
  () => import('../club-arena/TableChatHUD'),
  { ssr: false, loading: () => null }
);

// BBJ imports — safe import (these are always present in Club Arena deployments)
import { BBJTicker, BBJModal, useBBJ } from '../club-arena/BBJDisplay';

// ═══════════════════════════════════════════════════════════════════════
// THEME TOKENS
// ═══════════════════════════════════════════════════════════════════════
const T = {
  bg: '#18191A',
  tabBar: 'rgba(15, 17, 23, 0.95)',
  tabActive: 'rgba(50, 55, 70, 0.9)',
  tabInactive: 'rgba(35, 38, 48, 0.8)',
  tabEmpty: 'rgba(25, 28, 35, 0.6)',
  gold: '#FFD700',
  borderActive: '#FFD700',
  borderInactive: 'rgba(255,255,255,0.2)',
  borderEmpty: 'rgba(255,255,255,0.15)',
  textBright: '#FFFFFF',
  textDim: '#B0B3B8',
  textMuted: 'rgba(255,255,255,0.3)',
  danger: '#FA383E',
  accent: '#2374E1',
  overlay: 'rgba(0,0,0,0.85)',
};

const TAB_BAR_HEIGHT = 44;

// ═══════════════════════════════════════════════════════════════════════
// CSS KEYFRAMES (GAP 1 fixed-element offset handled via JS in TableSlot)
// ═══════════════════════════════════════════════════════════════════════
const KEYFRAMES = `
@keyframes mtv_goldPulse {
  0%, 100% { border-color: #FFD700; box-shadow: 0 0 6px rgba(255,215,0,0.3); }
  50% { border-color: #FFA500; box-shadow: 0 0 14px rgba(255,215,0,0.6); }
}
@keyframes mtv_dotPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.4); }
}
@keyframes mtv_tileActionPulse {
  0% { box-shadow: 0 0 8px rgba(255,215,0,0.4), inset 0 0 4px rgba(255,215,0,0.1); }
  100% { box-shadow: 0 0 18px rgba(255,215,0,0.7), inset 0 0 10px rgba(255,215,0,0.2); }
}
@keyframes mtv_confirmIn {
  from { opacity: 0; transform: translateY(-8px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
`;
// ═══════════════════════════════════════════════════════════════════════
// HAPTIC FEEDBACK (ADV-3)
// ═══════════════════════════════════════════════════════════════════════
function haptic(type = 'light') {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  const patterns = { light: [10], medium: [30], heavy: [50] };
  try { navigator.vibrate(patterns[type] || patterns.light); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
}

// ═══════════════════════════════════════════════════════════════════════
// TAB BAR — Premium 4-Slot Layout
// ═══════════════════════════════════════════════════════════════════════
function TableTabBar({
  slots,
  activeIndex,
  actionNeeded,
  connectionStatus,
  unreadChat,
  onSwitch,
  onClose,
  onEmpty,
  viewMode,
  onToggleView,
  onSitOutAll,
}) {
  const filledCount = slots.filter(Boolean).length;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      height: TAB_BAR_HEIGHT,
      zIndex: 9999,
      background: T.tabBar,
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      padding: '4px 8px',
      gap: 6,
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      {/* ── Global Options Menu (Phase 6) ── */}
      {filledCount > 0 && (
        <GlobalControlsHUD onSitOutAll={onSitOutAll} />
      )}
      {slots.map((slot, idx) => {
        if (!slot) {
          // ── EMPTY SLOT: "+" ──
          return (
            <button
              key={`empty-${idx}`}
              id={`mt-slot-empty-${idx}`}
              onClick={() => onEmpty(idx)}
              style={{
                flex: 1,
                height: 34,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: T.tabEmpty,
                border: `1px dashed ${T.borderEmpty}`,
                borderRadius: 10,
                color: T.textMuted,
                fontSize: 20,
                fontWeight: 300,
                cursor: 'pointer',
                transition: 'all 0.2s',
                outline: 'none',
              }}
              title="Open a table"
            >
              +
            </button>
          );
        }

        const isActive = idx === activeIndex;
        const needsAction = actionNeeded.has(slot.tableId);
        const isDisconnected = connectionStatus?.[slot.tableId] === 'disconnected';
        const unreadCount = unreadChat?.[slot.tableId] || 0;
        const showPulse = needsAction && !isActive;

        return (
          <div
            key={slot.tableId}
            id={`mt-slot-${idx}`}
            onClick={() => onSwitch(idx)}
            style={{
              flex: 1,
              height: 34,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              position: 'relative',
              background: isActive ? T.tabActive : T.tabInactive,
              border: isActive
                ? `2px solid ${T.borderActive}`
                : isDisconnected
                  ? `2px solid ${T.danger}`
                  : showPulse
                    ? `2px solid ${T.gold}`
                    : `1px solid ${T.borderInactive}`,
              borderRadius: 10,
              cursor: isActive ? 'default' : 'pointer',
              transition: showPulse ? 'none' : 'all 0.2s',
              animation: showPulse ? 'mtv_goldPulse 1.4s ease-in-out infinite' : 'none',
              overflow: 'hidden',
              paddingLeft: 8,
              paddingRight: 6,
            }}
          >
            {/* Unread Chat Badge (Phase 6) */}
            {!isActive && unreadCount > 0 && (
              <div style={{
                position: 'absolute',
                top: -4,
                left: -4,
                background: T.danger,
                color: '#fff',
                fontSize: 10,
                fontWeight: 800,
                padding: '2px 5px',
                borderRadius: '10px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
                zIndex: 2,
              }}>
                💬{unreadCount > 9 ? '9+' : unreadCount}
              </div>
            )}

            {/* Pulsing gold dot — top-right */}
            {showPulse && (
              <div style={{
                position: 'absolute',
                top: 3,
                right: 3,
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: T.gold,
                animation: 'mtv_dotPulse 1s infinite',
                boxShadow: `0 0 4px ${T.gold}`,
              }} />
            )}

            {/* Variant label + Disconnect Warning */}
            <span style={{
              color: isDisconnected ? T.danger : (isActive ? T.textBright : T.textDim),
              fontSize: 12,
              fontWeight: isActive ? 700 : 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              letterSpacing: 0.3,
              flex: 1,
              textAlign: 'center',
            }}>
              {isDisconnected ? '⚠️ Offline' : `${slot.variant}${slot.stakes ? ` ${slot.stakes}` : ''}`}
            </span>

            {/* Close "×" button */}
            <button
              onClick={(e) => { e.stopPropagation(); onClose(slot.tableId, idx); }}
              style={{
                background: 'none',
                border: 'none',
                color: isActive ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)',
                cursor: 'pointer',
                padding: '0 2px',
                fontSize: 14,
                lineHeight: 1,
                flexShrink: 0,
                outline: 'none',
              }}
              title="Close table"
            >
              ×
            </button>
          </div>
        );
      })}

      {/* View toggle (only when 2+ tables) */}
      {filledCount > 1 && (
        <button
          id="mt-view-toggle"
          onClick={onToggleView}
          style={{
            background: viewMode === 'tile' ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${viewMode === 'tile' ? T.gold : 'rgba(255,255,255,0.15)'}`,
            color: viewMode === 'tile' ? T.gold : T.textDim,
            borderRadius: 6,
            padding: '2px 7px',
            cursor: 'pointer',
            fontSize: 13,
            flexShrink: 0,
            outline: 'none',
            transition: 'all 0.2s',
          }}
          title={viewMode === 'tile' ? 'Single view' : 'Tile view'}
        >
          ⊞
        </button>
      )}

      <style>{KEYFRAMES}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// GLOBAL CONTROLS HUD (Phase 6 - Sit Out All)
// ═══════════════════════════════════════════════════════════════════════
function GlobalControlsHUD({ onSitOutAll }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div style={{ position: 'relative' }} ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: open ? 'rgba(255,255,255,0.1)' : 'transparent',
          border: 'none',
          color: T.textBright,
          width: 34,
          height: 34,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          outline: 'none',
          flexShrink: 0,
          transition: 'background 0.2s',
        }}
        title="Multi-Table Options"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="21" x2="4" y2="14"></line>
          <line x1="4" y1="10" x2="4" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12" y2="3"></line>
          <line x1="20" y1="21" x2="20" y2="16"></line>
          <line x1="20" y1="12" x2="20" y2="3"></line>
          <line x1="1" y1="14" x2="7" y2="14"></line>
          <line x1="9" y1="8" x2="15" y2="8"></line>
          <line x1="17" y1="16" x2="23" y2="16"></line>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 42,
          left: 0,
          background: '#242526',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
          width: 200,
          padding: 8,
          zIndex: 10002,
          animation: 'mtv_confirmIn 0.15s ease-out',
        }}>
          <button
            onClick={() => {
              onSitOutAll();
              setOpen(false);
            }}
            style={{
              width: '100%',
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              padding: '12px 16px',
              color: T.danger,
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span style={{ fontSize: 18 }}>🛑</span>
            Sit Out All Tables
          </button>

          <button
            onClick={() => {
              try { eventBus.emit('DATA_MUTATED', 'global_sit_in_all'); } catch (e) { console.warn('SitInAll emit failed:', e); }
              setOpen(false);
            }}
            style={{
              width: '100%',
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              padding: '12px 16px',
              color: '#2ECC71',
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginTop: 4,
            }}
          >
            <span style={{ fontSize: 18 }}>▶️</span>
            Sit In All Tables
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// CLOSE CONFIRMATION MODAL (GAP 4)
// ═══════════════════════════════════════════════════════════════════════
function CloseConfirmation({ tableName, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10001,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)',
    }} onClick={onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#242526',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 14,
          padding: '20px 24px',
          maxWidth: 320,
          width: '90%',
          textAlign: 'center',
          animation: 'mtv_confirmIn 0.2s ease-out',
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ color: T.textBright, fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
          Leave Table?
        </div>
        <div style={{ color: T.textDim, fontSize: 13, marginBottom: 16, lineHeight: 1.4 }}>
          You&apos;ll be stood up from <strong style={{ color: T.textBright }}>{tableName}</strong>.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 8,
              background: '#3E4042', color: T.textDim, border: 'none',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 8,
              background: T.danger, color: '#fff', border: 'none',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════
// Single Table Slot Wrapper (with GAP 1 JS-based fixed-element offset)
// ═══════════════════════════════════════════════════════════════════════
const TableSlot = React.forwardRef(({ supabase, tableId, userId, displayName, avatarUrl, isVisible, onActionNeeded, onActionCleared, onLeave, onConnectionStatus, onTableMove }, ref) => {
  const localRef = useRef(null);
  const slotRef = ref || localRef;

  // GAP 1 FIX: React inline styles can't be targeted by CSS attribute selectors.
  // Instead, use a JS-based approach: scan for fixed-positioned children with top:8px
  // and shift them down by TAB_BAR_HEIGHT. Uses MutationObserver for dynamic content.
  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;

    const shiftFixedElements = () => {
      // Find all descendants and check computed positioning
      const allChildren = el.querySelectorAll('*');
      allChildren.forEach(child => {
        if (child.style.position === 'fixed' && child.style.top === '8px') {
          child.style.top = `${TAB_BAR_HEIGHT + 8}px`;
        }
        if (child.style.position === 'fixed' && child.style.top === '0px') {
          child.style.top = `${TAB_BAR_HEIGHT}px`;
        }
      });
    };

    // Initial scan after mount (delay for React to render children)
    const timer = setTimeout(shiftFixedElements, 500);

    // Watch for DOM mutations (dynamic modals, panels, etc.)
    const observer = new MutationObserver(() => {
      requestAnimationFrame(shiftFixedElements);
    });
    observer.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [isVisible]);

  return (
    <div
      ref={slotRef}
      className="mtv-table-slot"
      style={{
        visibility: isVisible ? 'visible' : 'hidden',
        position: isVisible ? 'relative' : 'absolute',
        inset: isVisible ? undefined : 0,
        width: '100%',
        height: '100%',
        pointerEvents: isVisible ? 'auto' : 'none',
        zIndex: isVisible ? 10 : 1,
      }}
    >
      <LivePokerTable
        supabase={supabase}
        tableId={tableId}
        userId={userId}
        displayName={displayName}
        avatarUrl={avatarUrl}
        isActive={isVisible} // Battery Saver Mode (throttles to 1fps in LivePokerTable when false)
        onActionRequired={onActionNeeded}
        onActionCleared={onActionCleared}
        onLeave={() => onLeave(tableId)}
        onConnectionStatus={onConnectionStatus}
        onTableMove={onTableMove}
      />
    </div>
  );
});
TableSlot.displayName = 'TableSlot';

// ═══════════════════════════════════════════════════════════════════════
// BBJ Win Overlay
// ═══════════════════════════════════════════════════════════════════════
function BBJOverlay({ bbjData, onDismiss }) {
  if (!bbjData) return null;
  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, background: T.overlay,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 10000, cursor: 'pointer',
      }}
    >
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        border: `3px solid ${T.gold}`, borderRadius: 16,
        padding: '32px 48px', textAlign: 'center', maxWidth: 500,
      }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🏆</div>
        <h2 style={{ color: T.gold, fontSize: 28, margin: '0 0 8px', fontWeight: 800 }}>
          BAD BEAT JACKPOT!
        </h2>
        <p style={{ color: '#fff', fontSize: 16, margin: '4px 0' }}>
          {bbjData.loserHand} <span style={{ color: T.danger }}>loses to</span> {bbjData.winnerHand}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, margin: '16px 0' }}>
          <div>
            <div style={{ color: T.textDim, fontSize: 12 }}>Loser Payout</div>
            <div style={{ color: T.gold, fontSize: 22, fontWeight: 700 }}>
              {Number(bbjData.loserPayout || 0).toLocaleString()}
            </div>
          </div>
          <div>
            <div style={{ color: T.textDim, fontSize: 12 }}>Winner Payout</div>
            <div style={{ color: '#4ade80', fontSize: 22, fontWeight: 700 }}>
              {Number(bbjData.winnerPayout || 0).toLocaleString()}
            </div>
          </div>
          <div>
            <div style={{ color: T.textDim, fontSize: 12 }}>Table Share</div>
            <div style={{ color: '#60a5fa', fontSize: 22, fontWeight: 700 }}>
              {Number(bbjData.tableSharePayout || 0).toLocaleString()}
            </div>
          </div>
        </div>
        <p style={{ color: T.textDim, fontSize: 12, margin: '8px 0 0' }}>
          Total: {Number(bbjData.totalPayout || 0).toLocaleString()} — Click to dismiss
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════
export default function MultiTableView({ supabase, userId, initialTable, onExit }) {
  const router = useRouter();
  useTrainingBus('multi-table-view');

  // Fetch user profile once for display name and avatar
  const [profile, setProfile] = useState({ displayName: 'Player', avatarUrl: null });
  useEffect(() => {
    if (!supabase || !userId) return;
    supabase.from('profiles').select('display_name, avatar_url').eq('id', userId).maybeSingle()
      .then(({ data }) => {
        if (data) setProfile({
          displayName: data.display_name || 'Player',
          avatarUrl: data.avatar_url || null,
        });
      });
  }, [supabase, userId]);

  const {
    slots, tables, activeIndex, activeTable, viewMode,
    actionNeeded, connectionStatus, unreadChat, bbjWin, setBbjWin, canOpenMore,
    openTable, closeTable, switchTo, toggleView,
    markActionNeeded, clearActionNeeded, clearSession,
    updateTableId, updateConnectionStatus, markUnreadChat,
    pendingSlotIndex, setPendingSlotIndex, getNextEmptySlot,
  } = useMultiTable({ supabase, userId });

  // ── Close confirmation state (GAP 4) ──
  const [closeConfirm, setCloseConfirm] = useState(null); // { tableId, name }

  // ── Global Refs (for Sit Out All) ──
  const slotRefs = useRef([]);

  // Algorithmic Grid Scaling State (tile mode)
  const containerRef = useRef(null);
  const [gridDimensions, setGridDimensions] = useState({ rows: 1, cols: 1 });

  useEffect(() => {
    if (!containerRef.current || viewMode !== 'tile' || tables.length === 0) return;

    const calculateGrid = (width, height) => {
      let maxTileSize = 0;
      let optRows = 1;
      let optCols = 1;
      const aspectRatio = 16 / 9;

      for (let cols = 1; cols <= tables.length; cols++) {
        const rows = Math.ceil(tables.length / cols);
        const cellWidth = width / cols;
        const cellHeightFromWidth = cellWidth / aspectRatio;
        const cellHeight = height / rows;
        const cellWidthFromHeight = cellHeight * aspectRatio;
        const w = Math.min(cellWidth, cellWidthFromHeight);
        const h = Math.min(cellHeight, cellHeightFromWidth);
        const area = w * h;
        if (area > maxTileSize) {
          maxTileSize = area;
          optRows = rows;
          optCols = cols;
        }
      }
      return { rows: optRows, cols: optCols };
    };

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setGridDimensions(calculateGrid(width, height));
      }
    });
    resizeObserver.observe(containerRef.current);

    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width && rect.height) {
      setGridDimensions(calculateGrid(rect.width, rect.height));
    }

    return () => resizeObserver.disconnect();
  }, [tables.length, viewMode]);

  const [showBBJModal, setShowBBJModal] = useState(false);

  // BBJ pool (realtime ticking)
  const clubId = initialTable?.clubId || tables[0]?.clubId || null;
  const { bbjData } = useBBJ(clubId, supabase);

  // Open initial table (from URL)
  useEffect(() => {
    if (initialTable) {
      openTable(initialTable);
      // Emit EventBus (ADV-2)
      try { busEmit.dataMutated?.('multi_table_opened'); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    }
  }, [initialTable, openTable]);

  // Read Chat messages from EventBus (Phase 6)
  useEffect(() => {
    const onChat = (data) => {
      // If data is a new message from a table that isn't currently active, mark it
      if (data?.tableId && data.tableId !== activeTable?.tableId) {
        markUnreadChat(data.tableId);
      }
    };
    const unsub1 = eventBus.on(EventType.SYSTEM_ERROR, onChat);
    const unsub2 = eventBus.on('chat_message_received', onChat);
    
    return () => {
      if (typeof unsub2 === 'function') unsub2();
      else eventBus.off('chat_message_received', onChat);
      
      if (typeof unsub1 === 'function') unsub1();
      else eventBus.off(EventType.SYSTEM_ERROR, onChat);
    };
  }, [activeTable?.tableId, markUnreadChat]);

  // ── Global Sit Out All (Phase 6) ──
  const handleSitOutAll = useCallback(() => {
    haptic('heavy');
    // We broadcast the intent. LivePokerTable will listen for this.
    try { busEmit.dataMutated?.('global_sit_out_all'); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
  }, []);

  // ═══ SWIPE NAVIGATION with visual feedback (GAP 5) ═══
  const touchRef = useRef({ startX: 0, startY: 0, swiping: false });
  const [swipeOffset, setSwipeOffset] = useState(0);

  const handleTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    touchRef.current = { startX: touch.clientX, startY: touch.clientY, swiping: true };
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!touchRef.current.swiping) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchRef.current.startX;
    const deltaY = touch.clientY - touchRef.current.startY;
    // Only apply horizontal offset if horizontal movement dominates
    if (Math.abs(deltaX) > 20 && Math.abs(deltaX) > Math.abs(deltaY)) {
      // Clamp to ±120px for visual feedback
      setSwipeOffset(Math.max(-120, Math.min(120, deltaX * 0.4)));
    }
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (!touchRef.current.swiping) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchRef.current.startX;
    const deltaY = touch.clientY - touchRef.current.startY;
    touchRef.current.swiping = false;
    setSwipeOffset(0); // Reset visual feedback

    // Only respond to horizontal swipes (>60px, not vertical)
    if (Math.abs(deltaX) < 60 || Math.abs(deltaY) > Math.abs(deltaX)) return;

    // Find adjacent filled slots
    const filledSlots = slots.map((s, i) => s ? i : -1).filter(i => i >= 0);
    if (filledSlots.length < 2) return;

    const currentPos = filledSlots.indexOf(activeIndex);
    if (currentPos < 0) return;

    if (deltaX < -60 && currentPos < filledSlots.length - 1) {
      switchTo(filledSlots[currentPos + 1]);
      haptic('light');
    } else if (deltaX > 60 && currentPos > 0) {
      switchTo(filledSlots[currentPos - 1]);
      haptic('light');
    }
  }, [slots, activeIndex, switchTo]);

  // ═══ KEYBOARD SHORTCUTS (ADV-1) ═══
  useEffect(() => {
    const handler = (e) => {
      // Ctrl+1..4 — switch to slot
      if (e.ctrlKey && e.key >= '1' && e.key <= '4') {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (slots[idx]) {
          switchTo(idx);
          haptic('light');
        }
      }
      // Ctrl+Tab — cycle to next filled slot
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        const filledSlots = slots.map((s, i) => s ? i : -1).filter(i => i >= 0);
        if (filledSlots.length < 2) return;
        const currentPos = filledSlots.indexOf(activeIndex);
        const nextPos = (currentPos + 1) % filledSlots.length;
        switchTo(filledSlots[nextPos]);
        haptic('light');
      }
      // Ctrl+W — close active table (with confirmation)
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        if (activeTable) {
          setCloseConfirm({ tableId: activeTable.tableId, name: activeTable.name || activeTable.variant });
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [slots, activeIndex, activeTable, switchTo]);

  // ── Handle tab switch with haptic (ADV-3) ──
  const handleSwitch = useCallback((idx) => {
    switchTo(idx);
    haptic('light');
    // Emit EventBus (ADV-2)
    try { busEmit.dataMutated?.('multi_table_switched'); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
  }, [switchTo]);

  // ── Handle table close (with confirmation) (GAP 4) ──
  const handleCloseRequest = useCallback((tableId, idx) => {
    const slot = slots.find(s => s?.tableId === tableId) || slots[idx];
    setCloseConfirm({
      tableId,
      name: slot?.name || slot?.variant || 'this table',
    });
  }, [slots]);

  const handleCloseConfirm = useCallback(() => {
    if (!closeConfirm) return;
    closeTable(closeConfirm.tableId);
    haptic('medium');
    // Emit EventBus (ADV-2)
    try { busEmit.dataMutated?.('multi_table_closed'); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    // Check if this was the last table
    const remaining = slots.filter(s => s && s.tableId !== closeConfirm.tableId);
    if (remaining.length === 0) {
      clearSession();
      onExit?.();
    }
    setCloseConfirm(null);
  }, [closeConfirm, closeTable, slots, clearSession, onExit]);

  // ── Handle "+" empty slot click → navigate to lobby ──
  const handleEmptySlot = useCallback((slotIndex) => {
    setPendingSlotIndex(slotIndex);
    const cid = initialTable?.clubId || tables[0]?.clubId || null;
    if (cid) {
      window.top.location.href = `/hub/club-arena?club=${cid}&mtslot=${slotIndex}`;
    } else {
      window.top.location.href = '/hub/club-arena';
    }
  }, [setPendingSlotIndex, initialTable, tables, router]);

  // ── No tables and no initial → show empty state ──
  if (tables.length === 0 && !initialTable) {
    return (
      <div style={{
        background: T.bg, minHeight: '100vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        color: T.textDim,
      }}>
        <TableTabBar
          slots={slots}
          activeIndex={activeIndex}
          actionNeeded={actionNeeded}
          connectionStatus={connectionStatus}
          unreadChat={unreadChat}
          onSwitch={handleSwitch}
          onClose={handleCloseRequest}
          onEmpty={handleEmptySlot}
          viewMode={viewMode}
          onToggleView={toggleView}
          onSitOutAll={handleSitOutAll}
        />
        <div style={{ marginTop: TAB_BAR_HEIGHT + 40, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.5 }}>🃏</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>No Tables Open</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            Tap a &quot;+&quot; slot to open a table from the lobby
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: T.bg,
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* ── Table Tab Bar ── */}
      <TableTabBar
        slots={slots}
        activeIndex={activeIndex}
        actionNeeded={actionNeeded}
        connectionStatus={connectionStatus}
        unreadChat={unreadChat}
        onSwitch={handleSwitch}
        onClose={handleCloseRequest}
        onEmpty={handleEmptySlot}
        viewMode={viewMode}
        onToggleView={toggleView}
        onSitOutAll={handleSitOutAll}
      />

      {/* ═══ PHASE 26: MULTI-TABLE HUD DASHBOARD (Bloomberg Bar) ═══ */}
      {tables.length > 1 && (
        <div style={{
          position: 'fixed', top: TAB_BAR_HEIGHT, left: 0, right: 0,
          height: 36, zIndex: 9999,
          background: 'linear-gradient(180deg, rgba(15,15,20,0.95) 0%, rgba(10,10,15,0.98) 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '0 10px', overflowX: 'auto', overflowY: 'hidden',
          scrollbarWidth: 'none',
        }}>
          {tables.map((t, idx) => {
            const slot = slots.find(s => s?.tableId === t.tableId);
            const isAction = actionNeeded.has(t.tableId);
            const isCurrent = activeTable?.tableId === t.tableId;
            return (
              <button
                key={t.tableId}
                onClick={() => handleSwitch(slots.indexOf(slot))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 6, border: 'none',
                  background: isCurrent ? 'rgba(255,215,0,0.12)' : isAction ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)',
                  cursor: 'pointer', flexShrink: 0, transition: 'all 0.2s',
                  animation: isAction ? 'mtv_tileActionPulse 1.5s ease-in-out infinite alternate' : 'none',
                }}
              >
                {isAction && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px #ef4444', flexShrink: 0 }} />}
                <span style={{ color: isCurrent ? '#FFD700' : '#B0B3B8', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {slot?.variant || 'Table'}
                </span>
                <span style={{ color: '#666', fontSize: 9, fontVariantNumeric: 'tabular-nums' }}>
                  {slot?.stakes || ''}
                </span>
              </button>
            );
          })}
          {/* Aggregate session total */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, paddingLeft: 8 }}>
            <span style={{ color: '#555', fontSize: 9 }}>TABLES:</span>
            <span style={{ color: '#FFD700', fontSize: 11, fontWeight: 800 }}>{tables.length}</span>
          </div>
        </div>
      )}

      {/* ── Table area (offset below tab bar) ── */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          flex: 1,
          position: 'relative',
          marginTop: TAB_BAR_HEIGHT,
          display: viewMode === 'tile' && tables.length > 1 ? 'grid' : 'block',
          gridTemplateColumns: viewMode === 'tile' ? `repeat(${gridDimensions.cols}, 1fr)` : undefined,
          gridTemplateRows: viewMode === 'tile' ? `repeat(${gridDimensions.rows}, 1fr)` : undefined,
          gap: viewMode === 'tile' ? 2 : 0,
          alignContent: 'center',
          justifyContent: 'center',
          // Swipe visual feedback (GAP 5)
          transform: viewMode === 'single' && swipeOffset ? `translateX(${swipeOffset}px)` : undefined,
          transition: swipeOffset ? 'none' : 'transform 0.3s ease-out',
        }}
      >
        {/* BBJ Ticker — top center */}
        {BBJTicker && bbjData && bbjData.pool?.amount > 0 && (
          <div style={{
            position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)',
            zIndex: 50, pointerEvents: 'auto',
          }}>
            <BBJTicker
              amount={bbjData.pool.amount}
              hourlyRate={bbjData.hourlyRate || 0}
              onClick={() => setShowBBJModal(true)}
            />
          </div>
        )}

        {/* Render ALL filled table slots */}
        {slots.map((slot, idx) => {
          if (!slot) return null;

          const isActive = idx === activeIndex;
          const isVisible = viewMode === 'tile' || isActive;

          // Tile-View Auto-Zoom: If action needed and in tile mode, clicking zooms in
          const handleTileClick = () => {
            if (viewMode === 'tile') {
              switchTo(idx);
              if (actionNeeded.has(slot.tableId)) {
                // Auto-zoom to single view if action is needed to make buttons larger
                toggleView(); 
                haptic('medium');
              }
            }
          };

          return (
            <div
              key={slot.tableId}
              onClick={handleTileClick}
              style={{
                width: '100%',
                height: viewMode === 'single' ? '100%' : undefined,
                position: viewMode === 'single' ? 'absolute' : 'relative',
                inset: viewMode === 'single' ? 0 : undefined,
                overflow: 'hidden',
                cursor: viewMode === 'tile' ? 'pointer' : 'default',
                border: viewMode === 'tile' && actionNeeded.has(slot.tableId)
                  ? `2px solid ${T.gold}`
                  : viewMode === 'tile' ? '1px solid rgba(255,255,255,0.1)' : 'none',
                borderRadius: viewMode === 'tile' ? 4 : 0,
                animation: viewMode === 'tile' && actionNeeded.has(slot.tableId)
                  ? 'mtv_tileActionPulse 1.5s ease-in-out infinite alternate'
                  : 'none',
                transition: 'border 0.3s, box-shadow 0.3s',
              }}
            >
              <TableSlot
                ref={el => slotRefs.current[idx] = el}
                supabase={supabase}
                tableId={slot.tableId}
                userId={userId}
                displayName={profile.displayName}
                avatarUrl={profile.avatarUrl}
                isVisible={isVisible}
                onActionNeeded={markActionNeeded}
                onActionCleared={clearActionNeeded}
                onLeave={handleCloseRequest}
                onConnectionStatus={(status) => updateConnectionStatus(slot.tableId, status)}
                onTableMove={(oldId, newId) => updateTableId(oldId, newId)}
              />
            </div>
          );
        })}
      </div>

      {/* ── TableChatHUDs mapped for all tables to keep WebSockets alive (GAP 6) ── */}
      {tables.map(t => (
        <div 
          key={`chat-${t.tableId}`} 
          style={{ display: activeTable?.tableId === t.tableId ? 'block' : 'none' }}
        >
          <TableChatHUD
            tableId={t.tableId}
            userId={userId}
            isMuted={false}
          />
        </div>
      ))}

      {/* ── Close Confirmation Modal (GAP 4) ── */}
      {closeConfirm && (
        <CloseConfirmation
          tableName={closeConfirm.name}
          onConfirm={handleCloseConfirm}
          onCancel={() => setCloseConfirm(null)}
        />
      )}

      {/* BBJ Win Overlay */}
      <BBJOverlay bbjData={bbjWin} onDismiss={() => setBbjWin(null)} />

      {/* BBJ Info Modal */}
      {showBBJModal && BBJModal && bbjData && (
        <BBJModal data={bbjData} onClose={() => setShowBBJModal(false)} />
      )}
    </div>
  );
}
