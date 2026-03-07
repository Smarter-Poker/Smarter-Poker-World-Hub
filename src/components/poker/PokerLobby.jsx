/**
 * 🎮 POKER LOBBY — Browse, Join & Create Tables
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Live lobby connected via Supabase Realtime channel.
 * Updates every 5s with active table list from LobbyManager.
 * 
 * Features:
 *   - Live table list with player counts, stakes, open seats
 *   - Filter by variant, stakes, open seats
 *   - Quick-seat (auto-join best available table)
 *   - Create new table
 *   - Responsive grid layout
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════

const T = {
  bg: '#050505',
  bgCard: '#0e0e14',
  bgHover: '#14141c',
  accent: '#FFD700',
  accentDim: '#B8860B',
  green: '#16a34a',
  red: '#dc2626',
  blue: '#2563eb',
  textPrimary: '#f0f0f0',
  textSecondary: '#8a8a9a',
  textMuted: '#555566',
  border: 'rgba(255,255,255,0.06)',
};

const VARIANT_LABELS = {
  holdem: "No Limit Hold'em",
  omaha4: 'PLO (4-Card)',
  omaha5: 'PLO 5-Card',
  omaha6: 'PLO 6-Card',
  omaha_hilo: 'Omaha Hi-Lo',
  short_deck: 'Short Deck',
  // Aliases (from DB or Club Arena)
  omaha: 'Pot Limit Omaha',
  nlh: "No Limit Hold'em",
  plo: 'PLO (4-Card)',
  plo4: 'PLO (4-Card)',
  plo5: 'PLO 5-Card',
  plo6: 'PLO 6-Card',
  plo8: 'Omaha Hi-Lo',
  omaha_hi_lo: 'Omaha Hi-Lo',
};

const VARIANT_COLORS = {
  holdem: '#22c55e',
  nlh: '#22c55e',
  omaha: '#f59e0b',
  omaha4: '#f59e0b',
  plo: '#f59e0b',
  plo4: '#f59e0b',
  omaha5: '#e67e22',
  plo5: '#e67e22',
  omaha6: '#e74c3c',
  plo6: '#e74c3c',
  omaha_hilo: '#ef4444',
  omaha_hi_lo: '#ef4444',
  plo8: '#ef4444',
  short_deck: '#8b5cf6',
};

// Primary variants for filter chips and create-table selector
const FILTER_VARIANTS = {
  holdem: "No Limit Hold'em",
  omaha4: 'PLO (4-Card)',
  omaha5: 'PLO 5-Card',
  omaha6: 'PLO 6-Card',
  omaha_hilo: 'Omaha Hi-Lo',
  short_deck: 'Short Deck',
};

// ═══════════════════════════════════════════════════════════════════════════
// TABLE CARD
// ═══════════════════════════════════════════════════════════════════════════

function TableCard({ table, onJoin }) {
  const openSeats = table.maxSeats - table.playerCount;
  const fillPct = (table.playerCount / table.maxSeats) * 100;
  const variantColor = VARIANT_COLORS[table.variant] || T.green;

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onJoin(table.tableId)}
      style={{
        background: T.bgCard,
        borderRadius: 14,
        padding: 18,
        cursor: 'pointer',
        border: `1px solid ${T.border}`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Fill bar at top */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: 'rgba(255,255,255,0.03)',
      }}>
        <div style={{
          height: '100%', width: `${fillPct}%`,
          background: `linear-gradient(90deg, ${variantColor}, ${variantColor}88)`,
          transition: 'width 0.5s',
        }} />
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ color: T.textPrimary, fontSize: 15, fontWeight: 700 }}>
            {table.tableName || table.name || table.tableId}
          </div>
          <div style={{
            color: variantColor, fontSize: 11, fontWeight: 600, marginTop: 2,
            display: 'inline-block',
            background: `${variantColor}15`,
            padding: '1px 8px',
            borderRadius: 4,
          }}>
            {VARIANT_LABELS[table.variant] || table.variant}
          </div>
        </div>

        <div style={{
          background: openSeats > 0 ? `${T.green}20` : `${T.red}20`,
          color: openSeats > 0 ? T.green : T.red,
          fontSize: 11, fontWeight: 700,
          padding: '3px 8px', borderRadius: 6,
        }}>
          {openSeats > 0 ? `${openSeats} open` : 'Full'}
        </div>
      </div>

      {/* Stakes */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ color: T.accent, fontSize: 18, fontWeight: 800 }}>
          {table.smallBlind}/{table.bigBlind}
        </div>
        <div style={{ color: T.textMuted, fontSize: 11 }}>
          Buy-in: {table.minBuyIn}–{table.maxBuyIn}
        </div>
      </div>

      {/* Seat indicators */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {Array.from({ length: table.maxSeats }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 8, height: 8, borderRadius: '50%',
              background: i < table.playerCount ? variantColor : 'rgba(255,255,255,0.08)',
              transition: 'background 0.3s',
            }}
          />
        ))}
      </div>

      {/* Footer stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', color: T.textMuted, fontSize: 11 }}>
        <span>{table.playerCount}/{table.maxSeats} players</span>
        <span>Avg pot: {table.avgPot || '—'}</span>
        <span>{table.handsPerHour || '—'} h/hr</span>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CREATE TABLE DIALOG
// ═══════════════════════════════════════════════════════════════════════════

function CreateTableDialog({ onConfirm, onCancel }) {
  const [config, setConfig] = useState({
    name: '',
    variant: 'holdem',
    maxSeats: 9,
    smallBlind: 1,
    bigBlind: 2,
    minBuyIn: 40,
    maxBuyIn: 200,
  });

  const update = (key, val) => setConfig(prev => ({ ...prev, [key]: val }));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#111118',
          borderRadius: 16,
          padding: 28,
          border: `1px solid ${T.accentDim}`,
          width: 380,
          maxWidth: '95%',
        }}
      >
        <h3 style={{ color: T.accent, fontSize: 18, fontWeight: 800, marginBottom: 20 }}>
          Create Table
        </h3>

        {/* Table name */}
        <Field label="Table Name">
          <input
            type="text"
            value={config.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="My Table"
            style={inputStyle}
          />
        </Field>

        {/* Variant */}
        <Field label="Game">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.entries(FILTER_VARIANTS).map(([k, v]) => (
              <Chip key={k} label={v} active={config.variant === k} onClick={() => update('variant', k)} />
            ))}
          </div>
        </Field>

        {/* Seats */}
        <Field label="Max Seats">
          <div style={{ display: 'flex', gap: 6 }}>
            {[2, 6, 9, 10].map(n => (
              <Chip key={n} label={`${n}`} active={config.maxSeats === n} onClick={() => update('maxSeats', n)} />
            ))}
          </div>
        </Field>

        {/* Blinds */}
        <Field label="Blinds">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="number" min={1} value={config.smallBlind}
              onChange={(e) => {
                const sb = parseInt(e.target.value) || 1;
                update('smallBlind', sb);
                update('bigBlind', sb * 2);
                update('minBuyIn', sb * 40);
                update('maxBuyIn', sb * 200);
              }}
              style={{ ...inputStyle, width: 70, textAlign: 'center' }}
            />
            <span style={{ color: T.textMuted }}>/</span>
            <input
              type="number" min={2} value={config.bigBlind}
              onChange={(e) => update('bigBlind', parseInt(e.target.value) || 2)}
              style={{ ...inputStyle, width: 70, textAlign: 'center' }}
            />
          </div>
        </Field>

        {/* Buy-in range */}
        <Field label={`Buy-in: ${config.minBuyIn}–${config.maxBuyIn}`}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="number" value={config.minBuyIn}
              onChange={(e) => update('minBuyIn', parseInt(e.target.value) || 20)}
              style={{ ...inputStyle, width: 90, textAlign: 'center' }}
            />
            <span style={{ color: T.textMuted, alignSelf: 'center' }}>to</span>
            <input
              type="number" value={config.maxBuyIn}
              onChange={(e) => update('maxBuyIn', parseInt(e.target.value) || 200)}
              style={{ ...inputStyle, width: 90, textAlign: 'center' }}
            />
          </div>
        </Field>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} style={cancelBtnStyle}>Cancel</button>
          <button
            onClick={() => onConfirm(config)}
            style={{
              flex: 1,
              background: `linear-gradient(135deg, ${T.accent}, ${T.accentDim})`,
              color: '#000',
              border: 'none',
              borderRadius: 10,
              padding: 12,
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Create Table
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ color: T.textSecondary, fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Chip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? T.accent : 'rgba(255,255,255,0.05)',
        color: active ? '#000' : T.textSecondary,
        border: `1px solid ${active ? T.accent : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 6,
        padding: '4px 12px',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

const inputStyle = {
  background: 'rgba(255,255,255,0.05)',
  color: T.textPrimary,
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 13,
  outline: 'none',
  width: '100%',
};

const cancelBtnStyle = {
  flex: 1,
  background: 'transparent',
  color: T.textSecondary,
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  padding: 12,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN: PokerLobby
// ═══════════════════════════════════════════════════════════════════════════

export default function PokerLobby({ supabase, userId, onJoinTable }) {
  const [tables, setTables] = useState([]);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [showCreate, setShowCreate] = useState(false);

  // Filters
  const [filterVariant, setFilterVariant] = useState('all');
  const [filterOpenOnly, setFilterOpenOnly] = useState(false);
  const [search, setSearch] = useState('');

  // Fetch tables via HTTP + subscribe to Realtime for live updates
  useEffect(() => {
    let pollTimer;

    // HTTP fetch (primary source)
    const fetchTables = async () => {
      try {
        const res = await fetch('/api/poker/engine/tables');
        const data = await res.json();
        if (data.tables) {
          setTables(data.tables);
          setTotalPlayers(data.tables.reduce((sum, t) => sum + (t.playerCount || 0), 0));
        }
      } catch (err) {
        console.warn('[Lobby] HTTP fetch failed:', err.message);
      }
    };

    fetchTables();
    pollTimer = setInterval(fetchTables, 8000); // Poll every 8s as fallback

    // Realtime supplement (instant updates when available)
    let channel;
    if (supabase) {
      channel = supabase.channel('lobby');
      channel.on('broadcast', { event: 'lobby_update' }, (payload) => {
        setTables(payload.payload.tables || []);
        setTotalPlayers(payload.payload.totalPlayers || 0);
      });
      channel.subscribe();
    }

    return () => {
      if (pollTimer) clearInterval(pollTimer);
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Filtered tables
  const filtered = useMemo(() => {
    let list = tables;
    if (filterVariant !== 'all') list = list.filter(t => t.variant === filterVariant);
    if (filterOpenOnly) list = list.filter(t => t.playerCount < t.maxSeats);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(t => (t.tableName || t.name || t.tableId).toLowerCase().includes(s));
    }
    return list;
  }, [tables, filterVariant, filterOpenOnly, search]);

  // Quick seat — join the best available table
  const handleQuickSeat = useCallback(() => {
    const open = tables.filter(t => t.playerCount < t.maxSeats && t.playerCount > 0);
    if (open.length > 0) {
      // Pick fullest table with open seats
      open.sort((a, b) => b.playerCount - a.playerCount);
      onJoinTable?.(open[0].tableId);
    } else if (tables.length > 0) {
      onJoinTable?.(tables[0].tableId);
    }
  }, [tables, onJoinTable]);

  const handleCreateTable = useCallback(async (config) => {
    setShowCreate(false);
    try {
      // BUG #149 FIX: Server requires Bearer auth via authenticatePlayer()
      const session = { access_token: JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}').access_token };
      const res = await fetch('/api/poker/create-live-table', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ ...config, userId }),
      });
      const data = await res.json();
      if (data.tableId) {
        onJoinTable?.(data.tableId);
      }
    } catch (err) {
      console.error('Create table failed:', err);
    }
  }, [userId, onJoinTable]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: T.bg,
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        color: T.textPrimary,
      }}
    >
      {/* Header */}
      <div style={{
        padding: '20px 24px 16px',
        borderBottom: `1px solid ${T.border}`,
        background: 'rgba(10,10,16,0.9)',
        backdropFilter: 'blur(10px)',
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: T.accent, margin: 0 }}>
              Poker Lobby
            </h1>
            <p style={{ color: T.textMuted, fontSize: 12, margin: '2px 0 0' }}>
              {tables.length} tables • {totalPlayers} players online
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleQuickSeat}
              style={{
                background: `linear-gradient(135deg, ${T.green}, #15803d)`,
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                padding: '8px 18px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ⚡ Quick Seat
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowCreate(true)}
              style={{
                background: `linear-gradient(135deg, ${T.accent}, ${T.accentDim})`,
                color: '#000',
                border: 'none',
                borderRadius: 10,
                padding: '8px 18px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              + Create Table
            </motion.button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tables..."
            style={{
              background: 'rgba(255,255,255,0.05)',
              color: T.textPrimary,
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 12,
              outline: 'none',
              width: 180,
            }}
          />

          {['all', ...Object.keys(FILTER_VARIANTS)].map(v => (
            <Chip
              key={v}
              label={v === 'all' ? 'All Games' : FILTER_VARIANTS[v]}
              active={filterVariant === v}
              onClick={() => setFilterVariant(v)}
            />
          ))}

          <Chip
            label="Open Seats"
            active={filterOpenOnly}
            onClick={() => setFilterOpenOnly(!filterOpenOnly)}
          />
        </div>
      </div>

      {/* Table grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 14,
        padding: 20,
        maxWidth: 1200,
        margin: '0 auto',
      }}>
        <AnimatePresence>
          {filtered.map((table) => (
            <motion.div
              key={table.tableId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              layout
            >
              <TableCard table={table} onJoin={onJoinTable} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: T.textMuted }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🃏</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>No tables found</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {tables.length === 0
              ? 'Be the first — create a table!'
              : 'Try adjusting your filters'}
          </div>
        </div>
      )}

      {/* Create dialog */}
      <AnimatePresence>
        {showCreate && (
          <CreateTableDialog
            onConfirm={handleCreateTable}
            onCancel={() => setShowCreate(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
