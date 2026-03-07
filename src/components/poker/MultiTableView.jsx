/**
 * MultiTableView — Play up to 4 poker tables simultaneously
 * ═════════════════════════════════════════════════════════════
 * 
 * Modes:
 *   - Single: One table visible, tab bar to switch
 *   - Tile: 2x2 grid showing all tables
 * 
 * Features:
 *   - Tab bar with stakes/variant labels
 *   - Pulsing red dot on tabs where action is needed
 *   - Auto-switch to table when it's your turn
 *   - BBJ win overlay
 *   - Close button per tab
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useMultiTable } from '../../hooks/useMultiTable';
// REMOVED: useTableConnection was imported but never called — causes ReferenceError during SSG
import { BBJTicker, BBJModal, useBBJ } from '../club-arena/BBJDisplay';
import { PokerSoundManager } from './PokerSoundManager';

const LivePokerTable = dynamic(
  () => import('./LivePokerTable'),
  { ssr: false }
);

// ═══════════════════════════════════════════════════════
// THEME (Facebook Dark)
// ═══════════════════════════════════════════════════════
const T = {
  bg: '#18191A',
  tabBar: '#242526',
  tabActive: '#2374E1',
  tabInactive: '#3E4042',
  tabText: '#E4E6EB',
  tabTextDim: '#B0B3B8',
  danger: '#FA383E',
  accent: '#2374E1',
  gold: '#FFD700',
  overlay: 'rgba(0,0,0,0.85)',
};

// ═══════════════════════════════════════════════════════
// Single Table Connection Wrapper
// ═══════════════════════════════════════════════════════
function TableSlot({ supabase, tableId, userId, displayName, avatarUrl, isVisible, onActionNeeded, onActionCleared, onLeave, soundManager }) {
  if (!isVisible) {
    // Even when hidden, keep connection alive — LivePokerTable manages its own hook
    return (
      <div style={{ display: 'none' }}>
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

  return (
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
  );
}

// ═══════════════════════════════════════════════════════
// Tab Bar Component
// ═══════════════════════════════════════════════════════
function TabBar({ tables, activeIndex, actionNeeded, onSwitch, onClose, viewMode, onToggleView, canOpenMore }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      background: T.tabBar,
      borderBottom: `1px solid ${T.tabInactive}`,
      height: 40,
      padding: '0 8px',
      gap: 4,
      zIndex: 100,
      flexShrink: 0,
    }}>
      {tables.map((table, idx) => {
        const isActive = idx === activeIndex;
        const needsAction = actionNeeded.has(table.tableId);

        return (
          <div
            key={table.tableId}
            onClick={() => onSwitch(idx)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 12px',
              borderRadius: 6,
              background: isActive ? T.tabActive : 'transparent',
              cursor: 'pointer',
              transition: 'background 0.2s',
              position: 'relative',
              border: needsAction && !isActive ? `1px solid ${T.danger}` : '1px solid transparent',
            }}
          >
            {/* Action needed indicator */}
            {needsAction && !isActive && (
              <div style={{
                position: 'absolute',
                top: 2,
                right: 2,
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: T.danger,
                animation: 'pulse 1s infinite',
              }} />
            )}

            <span style={{
              color: isActive ? '#fff' : T.tabTextDim,
              fontSize: 12,
              fontWeight: isActive ? 700 : 500,
              whiteSpace: 'nowrap',
            }}>
              {table.variant} {table.stakes}
            </span>

            {/* Close button */}
            <button
              onClick={(e) => { e.stopPropagation(); onClose(table.tableId); }}
              style={{
                background: 'none',
                border: 'none',
                color: T.tabTextDim,
                cursor: 'pointer',
                padding: '0 2px',
                fontSize: 14,
                lineHeight: 1,
                opacity: 0.6,
              }}
            >
              ×
            </button>
          </div>
        );
      })}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* View toggle */}
      {tables.length > 1 && (
        <button
          onClick={onToggleView}
          style={{
            background: viewMode === 'tile' ? T.tabActive : 'transparent',
            border: `1px solid ${T.tabInactive}`,
            color: T.tabText,
            borderRadius: 4,
            padding: '2px 8px',
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          {viewMode === 'tile' ? '⊞ Tile' : '□ Single'}
        </button>
      )}

      {/* Table count */}
      <span style={{ color: T.tabTextDim, fontSize: 11 }}>
        {tables.length}/4
      </span>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// BBJ Win Overlay
// ═══════════════════════════════════════════════════════
function BBJOverlay({ bbjData, onDismiss }) {
  if (!bbjData) return null;

  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed',
        inset: 0,
        background: T.overlay,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        cursor: 'pointer',
      }}
    >
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        border: `3px solid ${T.gold}`,
        borderRadius: 16,
        padding: '32px 48px',
        textAlign: 'center',
        maxWidth: 500,
      }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🎰</div>
        <h2 style={{ color: T.gold, fontSize: 28, margin: '0 0 8px', fontWeight: 800 }}>
          BAD BEAT JACKPOT!
        </h2>
        <p style={{ color: '#fff', fontSize: 16, margin: '4px 0' }}>
          {bbjData.loserHand} <span style={{ color: T.danger }}>loses to</span> {bbjData.winnerHand}
        </p>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 24,
          margin: '16px 0',
        }}>
          <div>
            <div style={{ color: T.tabTextDim, fontSize: 12 }}>Loser Payout</div>
            <div style={{ color: T.gold, fontSize: 22, fontWeight: 700 }}>
              {Number(bbjData.loserPayout || 0).toLocaleString()}
            </div>
          </div>
          <div>
            <div style={{ color: T.tabTextDim, fontSize: 12 }}>Winner Payout</div>
            <div style={{ color: '#4ade80', fontSize: 22, fontWeight: 700 }}>
              {Number(bbjData.winnerPayout || 0).toLocaleString()}
            </div>
          </div>
          <div>
            <div style={{ color: T.tabTextDim, fontSize: 12 }}>Table Share</div>
            <div style={{ color: '#60a5fa', fontSize: 22, fontWeight: 700 }}>
              {Number(bbjData.tableSharePayout || 0).toLocaleString()}
            </div>
          </div>
        </div>
        <p style={{ color: T.tabTextDim, fontSize: 12, margin: '8px 0 0' }}>
          Total: {Number(bbjData.totalPayout || 0).toLocaleString()} — Click to dismiss
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════
export default function MultiTableView({ supabase, userId, initialTable, onExit }) {
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
    tables, activeIndex, activeTable, viewMode,
    actionNeeded, bbjWin, setBbjWin, canOpenMore,
    openTable, closeTable, switchTo, toggleView,
    markActionNeeded, clearActionNeeded,
  } = useMultiTable({ supabase, userId });

  const soundManagerRef = useRef(null);
  const [showBBJModal, setShowBBJModal] = useState(false);

  // BBJ pool (realtime ticking)
  const clubId = initialTable?.clubId || tables[0]?.clubId || null;
  const { bbjData } = useBBJ(clubId, supabase);

  // Initialize sound manager
  useEffect(() => {
    soundManagerRef.current = new PokerSoundManager();
    return () => {
      soundManagerRef.current?.dispose();
    };
  }, []);

  // Open initial table
  useEffect(() => {
    if (initialTable) {
      openTable(initialTable);
    }
  }, [initialTable, openTable]);

  const handleLeave = useCallback((tableId) => {
    closeTable(tableId);
    if (tables.length <= 1) {
      onExit?.();
    }
  }, [closeTable, tables.length, onExit]);

  if (tables.length === 0) {
    return (
      <div style={{
        background: T.bg,
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: T.tabTextDim,
      }}>
        No tables open
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
      {/* Tab bar */}
      {tables.length > 1 && (
        <TabBar
          tables={tables}
          activeIndex={activeIndex}
          actionNeeded={actionNeeded}
          onSwitch={switchTo}
          onClose={(id) => handleLeave(id)}
          viewMode={viewMode}
          onToggleView={toggleView}
          canOpenMore={canOpenMore}
        />
      )}

      {/* Table area */}
      <div style={{
        flex: 1,
        position: 'relative',
        display: viewMode === 'tile' && tables.length > 1 ? 'grid' : 'block',
        gridTemplateColumns: tables.length > 2 ? '1fr 1fr' : tables.length === 2 ? '1fr 1fr' : '1fr',
        gridTemplateRows: tables.length > 2 ? '1fr 1fr' : '1fr',
        gap: 2,
      }}>
        {/* BBJ Ticker — top center, always visible */}
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
        {tables.map((table, idx) => (
          <div
            key={table.tableId}
            style={{
              display: viewMode === 'single' && idx !== activeIndex ? 'none' : 'block',
              width: '100%',
              height: '100%',
              position: viewMode === 'single' ? 'absolute' : 'relative',
              inset: viewMode === 'single' ? 0 : undefined,
              overflow: 'hidden',
            }}
          >
            <TableSlot
              supabase={supabase}
              tableId={table.tableId}
              userId={userId}
              displayName={profile.displayName}
              avatarUrl={profile.avatarUrl}
              isVisible={viewMode === 'tile' || idx === activeIndex}
              onActionNeeded={markActionNeeded}
              onActionCleared={clearActionNeeded}
              onLeave={handleLeave}
              soundManager={soundManagerRef.current}
            />
          </div>
        ))}
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
