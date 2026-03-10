/**
 * MultiTableView — PokerBros-style 4-slot multi-table system
 * ═════════════════════════════════════════════════════════════
 *
 * Fixed 4-slot tab bar at the top of screen (44px).
 * Active table: gold border pill. Inactive: subtle border pill.
 * Empty slots: dashed "+" button → navigates to lobby.
 *
 * Modes:
 *   - Single: One table visible, tabs to switch
 *   - Tile: 2×2 grid showing all tables
 *
 * Features:
 *   - Tab bar with variant/stakes labels (PokerBros replica)
 *   - Pulsing gold glow on tabs where action is needed
 *   - Swipe left/right between tables (mobile)
 *   - SessionStorage persistence via useMultiTable hook
 *   - BBJ ticker overlay
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useMultiTable } from '../../hooks/useMultiTable';
import { BBJTicker, BBJModal, useBBJ } from '../club-arena/BBJDisplay';
import { PokerSoundManager } from './PokerSoundManager';

const LivePokerTable = dynamic(
  () => import('./LivePokerTable'),
  { ssr: false }
);

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
// CSS KEYFRAMES (injected once)
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
`;

// ═══════════════════════════════════════════════════════════════════════
// TAB BAR — PokerBros 4-Slot Replica
// ═══════════════════════════════════════════════════════════════════════
function TableTabBar({
  slots,
  activeIndex,
  actionNeeded,
  onSwitch,
  onClose,
  onEmpty,
  viewMode,
  onToggleView,
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
      {slots.map((slot, idx) => {
        if (!slot) {
          // ── EMPTY SLOT: "+" ──
          return (
            <button
              key={`empty-${idx}`}
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
        const showPulse = needsAction && !isActive;

        return (
          <div
            key={slot.tableId}
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

            {/* Variant label */}
            <span style={{
              color: isActive ? T.textBright : T.textDim,
              fontSize: 12,
              fontWeight: isActive ? 700 : 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              letterSpacing: 0.3,
              flex: 1,
              textAlign: 'center',
            }}>
              {slot.variant}{slot.stakes ? ` ${slot.stakes}` : ''}
            </span>

            {/* Close "×" button */}
            <button
              onClick={(e) => { e.stopPropagation(); onClose(slot.tableId); }}
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
// Single Table Slot Wrapper
// ═══════════════════════════════════════════════════════════════════════
function TableSlot({ supabase, tableId, userId, displayName, avatarUrl, isVisible, onActionNeeded, onActionCleared, onLeave }) {
  return (
    <div style={{
      visibility: isVisible ? 'visible' : 'hidden',
      position: isVisible ? 'relative' : 'absolute',
      inset: isVisible ? undefined : 0,
      width: '100%',
      height: '100%',
      pointerEvents: isVisible ? 'auto' : 'none',
      zIndex: isVisible ? 10 : 1,
    }}>
      <LivePokerTable
        supabase={supabase}
        tableId={tableId}
        userId={userId}
        displayName={displayName}
        avatarUrl={avatarUrl}
        onActionRequired={onActionNeeded}
        onActionCleared={onActionCleared}
        onLeave={() => onLeave(tableId)}
      />
    </div>
  );
}

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
    actionNeeded, bbjWin, setBbjWin, canOpenMore,
    openTable, closeTable, switchTo, toggleView,
    markActionNeeded, clearActionNeeded,
    pendingSlotIndex, setPendingSlotIndex, getNextEmptySlot,
  } = useMultiTable({ supabase, userId });

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

  const soundManagerRef = useRef(null);
  const [showBBJModal, setShowBBJModal] = useState(false);

  // BBJ pool (realtime ticking)
  const clubId = initialTable?.clubId || tables[0]?.clubId || null;
  const { bbjData } = useBBJ(clubId, supabase);

  // Initialize sound manager
  useEffect(() => {
    soundManagerRef.current = new PokerSoundManager();
    return () => { soundManagerRef.current?.dispose(); };
  }, []);

  // Open initial table (from URL)
  useEffect(() => {
    if (initialTable) {
      openTable(initialTable);
    }
  }, [initialTable, openTable]);

  // ── Swipe navigation (mobile) ──
  const touchRef = useRef({ startX: 0, startY: 0, swiping: false });

  const handleTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    touchRef.current = { startX: touch.clientX, startY: touch.clientY, swiping: true };
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (!touchRef.current.swiping) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchRef.current.startX;
    const deltaY = touch.clientY - touchRef.current.startY;
    touchRef.current.swiping = false;

    // Only respond to horizontal swipes (>60px, not vertical)
    if (Math.abs(deltaX) < 60 || Math.abs(deltaY) > Math.abs(deltaX)) return;

    // Find adjacent filled slots
    const filledSlots = slots.map((s, i) => s ? i : -1).filter(i => i >= 0);
    if (filledSlots.length < 2) return;

    const currentPos = filledSlots.indexOf(activeIndex);
    if (currentPos < 0) return;

    if (deltaX < -60 && currentPos < filledSlots.length - 1) {
      // Swipe left → next table
      switchTo(filledSlots[currentPos + 1]);
    } else if (deltaX > 60 && currentPos > 0) {
      // Swipe right → prev table
      switchTo(filledSlots[currentPos - 1]);
    }
  }, [slots, activeIndex, switchTo]);

  // ── Handle table close (with exit-to-lobby for last table) ──
  const handleLeave = useCallback((tableId) => {
    closeTable(tableId);
    // Check if this was the last table
    const remaining = slots.filter(s => s && s.tableId !== tableId);
    if (remaining.length === 0) {
      onExit?.();
    }
  }, [closeTable, slots, onExit]);

  // ── Handle "+" empty slot click → navigate to lobby ──
  const handleEmptySlot = useCallback((slotIndex) => {
    setPendingSlotIndex(slotIndex);
    // Get the club ID from any open table, or from initial
    const cid = initialTable?.clubId || tables[0]?.clubId || null;
    if (cid) {
      router.push(`/hub/club-arena/lobby?club=${cid}&mtslot=${slotIndex}`);
    } else {
      router.push('/hub/club-arena');
    }
  }, [setPendingSlotIndex, initialTable, tables, router]);

  // ── No tables and no initial → show loading message ──
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
          onSwitch={switchTo}
          onClose={(id) => handleLeave(id)}
          onEmpty={handleEmptySlot}
          viewMode={viewMode}
          onToggleView={toggleView}
        />
        <div style={{ marginTop: TAB_BAR_HEIGHT + 40, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.5 }}>🃏</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>No Tables Open</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            Tap a "+" slot to open a table from the lobby
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
      {/* ── PokerBros Tab Bar ── */}
      <TableTabBar
        slots={slots}
        activeIndex={activeIndex}
        actionNeeded={actionNeeded}
        onSwitch={switchTo}
        onClose={(id) => handleLeave(id)}
        onEmpty={handleEmptySlot}
        viewMode={viewMode}
        onToggleView={toggleView}
      />

      {/* ── Table area (offset below tab bar) ── */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
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
        }}
      >
        {/* BBJ Ticker — top center */}
        {bbjData && bbjData.pool?.amount > 0 && (
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

          return (
            <div
              key={slot.tableId}
              onClick={() => viewMode === 'tile' && switchTo(idx)}
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
                supabase={supabase}
                tableId={slot.tableId}
                userId={userId}
                displayName={profile.displayName}
                avatarUrl={profile.avatarUrl}
                isVisible={isVisible}
                onActionNeeded={markActionNeeded}
                onActionCleared={clearActionNeeded}
                onLeave={handleLeave}
              />
            </div>
          );
        })}
      </div>

      {/* BBJ Win Overlay */}
      <BBJOverlay bbjData={bbjWin} onDismiss={() => setBbjWin(null)} />

      {/* BBJ Info Modal */}
      {showBBJModal && bbjData && (
        <BBJModal data={bbjData} onClose={() => setShowBBJModal(false)} />
      )}
    </div>
  );
}
