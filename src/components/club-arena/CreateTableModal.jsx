/**
 * CreateTableModal — Comprehensive table creation for Cash/Regular games
 * ═══════════════════════════════════════════════════════════════════════
 * Matches PokerBros feature-for-feature:
 * - Game variants (NLH, FLH, 6+, PLO, FLO, Mixed, OFC)
 * - Game mode toggles (Bomb Pot, Double/Triple Board, Pineapple, 7-2, NIT, etc.)
 * - Table settings (size, action time, blinds, buy-in, ante)
 * - Player requirements (Career %, Maintain %, Maintain #)
 * - Auto settings (AutoStart, Auto Extension, Auto Restart, Auto Create)
 * - Straddle options (UTG, Voluntary)
 * - Insurance, Run It Multi-Times
 * - Rake/Fee settings (FeeCap, BBJ)
 * - Restrictions (Device, Observers, GPS, IP, Emulator, Photo Verification)
 * - Privacy (Anonymous, Hide Club Name, Private Game, VIP Only)
 * - Game Length, Buy-in Authorization, No Rathole, Cap, Ban Chat
 */

import React, { useState, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════
// THEME — SmarterPoker Dark
// ═══════════════════════════════════════════════════════════════
const FB = {
  bg: '#18191A', cardBg: '#242526', elevated: '#3A3B3C',
  border: '#3E4042', primary: '#1877F2', success: '#31A24C',
  warning: '#F5A623', danger: '#FA383E',
  textPrimary: '#E4E6EB', textSecondary: '#B0B3B8', textDim: '#65676B',
};

// ═══════════════════════════════════════════════════════════════
// GAME VARIANTS — matches PokerBros Image 2
// ═══════════════════════════════════════════════════════════════
const GAME_VARIANTS = [
  { value: 'nlh', label: 'NLH', full: 'No Limit Hold\'em', icon: '♠️' },
  { value: 'flh', label: 'FLH', full: 'Fixed Limit Hold\'em', icon: '♥️' },
  { value: 'short_deck', label: '6+', full: '6+ Hold\'em (Short Deck)', icon: '🃏' },
  { value: 'plo4', label: 'PLO', full: 'Pot Limit Omaha (4-Card)', icon: '♦️' },
  { value: 'plo5', label: 'PLO5', full: 'Pot Limit Omaha 5-Card', icon: '♦️' },
  { value: 'plo6', label: 'PLO6', full: 'Pot Limit Omaha 6-Card', icon: '♦️' },
  { value: 'plo8', label: 'PLO Hi/Lo', full: 'PLO Hi/Lo (8-or-Better)', icon: '♦️' },
  { value: 'flo', label: 'FLO', full: 'Fixed Limit Omaha', icon: '♣️' },
  { value: 'mixed', label: 'Mixed', full: 'Mixed Game (Hold\'em/Omaha)', icon: '🔀' },
  { value: 'ofc', label: 'OFC', full: 'Open Face Chinese Poker', icon: '🀄' },
];

// ═══════════════════════════════════════════════════════════════
// DEFAULT STATE — all settings from PokerBros screenshots
// ═══════════════════════════════════════════════════════════════
const DEFAULT_TABLE = {
  name: '',
  variant: 'nlh',
  // ── Table Settings ──
  tableSize: 9,
  actionTime: 15,
  smallBlind: 1,
  bigBlind: 2,
  minBuyInBB: 20,
  maxBuyInBB: 200,
  ante: 0,
  // ── Game Modes (Image 1) ──
  privateGame: false,
  vipOnly: false,
  bombPot: false,
  doubleBoard: false,
  tripleBoard: false,
  pineapple: false,
  sevenDeuce: false,
  nitGame: false,
  anonymousTable: false,
  cap: false,
  capAmount: 0,
  banChat: false,
  labelNew: false,
  featuredTable: false,
  noRathole: false,
  // ── Player Requirements (Image 3) ──
  calltime: false,
  careerPercent: 0,
  maintainPercent: 0,
  maintainHands: 10,
  // ── Auto Settings (Image 4) ──
  autoStartPlayers: 2,
  autoExtension: false,
  autoRestart: false,
  autoCreateTable: false,
  // ── Straddle (Image 4) ──
  autoUtgStraddle: false,
  voluntaryStraddle: false,
  // ── Insurance & Run It (Image 4) ──
  insurance: false,
  runItMode: 'none', // none | player_choice | mandatory_twice | mandatory_thrice
  // ── Rake/Fee (Image 5) ──
  rakePercent: '',
  feeCap: 3, // x Big-Blind
  bbjPercent: '',
  // ── Agent Restrictions (Image 5) ──
  sameAgentDownlineLimit: 0, // 0 = no limit
  buyInAuthorization: false,
  // ── Security/Restrictions (Image 5) ──
  restrictDevice: true,
  restrictObservers: false,
  gpsRestriction: true,
  ipRestriction: true,
  emulatorRestriction: false,
  photoRotationVerification: false,
  hideClubName: false,
  // ── Game Length ──
  gameLength: 12, // hours
};

// ═══════════════════════════════════════════════════════════════
// SECTION COMPONENTS — reusable building blocks
// ═══════════════════════════════════════════════════════════════

function SectionHeader({ label }) {
  return (
    <div style={{
      color: FB.warning, fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: 1.2, padding: '10px 0 6px', borderBottom: `1px solid ${FB.border}`,
      marginBottom: 8,
    }}>
      {label}
    </div>
  );
}

function ToggleRow({ label, value, onChange, helpText }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0', borderBottom: `1px solid ${FB.border}22`,
    }}>
      <div>
        <span style={{ color: FB.textPrimary, fontSize: 13, fontWeight: 500 }}>{label}</span>
        {helpText && <span style={{ color: FB.textDim, fontSize: 11, marginLeft: 6 }}>ⓘ</span>}
      </div>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
          background: value ? FB.warning : FB.elevated,
          position: 'relative', transition: 'background 0.2s',
        }}
      >
        <div style={{
          width: 20, height: 20, borderRadius: 10, background: '#fff',
          position: 'absolute', top: 2,
          left: value ? 22 : 2, transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </button>
    </div>
  );
}

function SliderRow({ label, value, onChange, min, max, step = 1, suffix = '', format }) {
  const displayVal = format ? format(value) : `${value}${suffix}`;
  return (
    <div style={{ padding: '8px 0', borderBottom: `1px solid ${FB.border}22` }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4,
      }}>
        <span style={{ color: FB.textPrimary, fontSize: 13, fontWeight: 500 }}>{label}</span>
        <span style={{ color: FB.warning, fontSize: 13, fontWeight: 700 }}>{displayVal}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{
          width: '100%', height: 6, appearance: 'none', background: FB.elevated,
          borderRadius: 3, outline: 'none',
          accentColor: FB.warning,
        }}
      />
    </div>
  );
}

function RadioGroup({ label, value, onChange, options }) {
  return (
    <div style={{ padding: '8px 0', borderBottom: `1px solid ${FB.border}22` }}>
      <div style={{ color: FB.textPrimary, fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {options.map(opt => (
          <label key={opt.value} style={{
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
            padding: '6px 8px', borderRadius: 8,
            background: value === opt.value ? `${FB.warning}22` : 'transparent',
            border: `1px solid ${value === opt.value ? FB.warning : FB.border}`,
          }} onClick={() => onChange(opt.value)}>
            <div style={{
              width: 14, height: 14, borderRadius: 7, border: `2px solid ${value === opt.value ? FB.warning : FB.textDim}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {value === opt.value && <div style={{ width: 6, height: 6, borderRadius: 3, background: FB.warning }} />}
            </div>
            <span style={{ color: FB.textPrimary, fontSize: 12 }}>{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function InputRow({ label, value, onChange, type = 'text', placeholder = '', suffix = '' }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0', borderBottom: `1px solid ${FB.border}22`,
    }}>
      <span style={{ color: FB.textPrimary, fontSize: 13, fontWeight: 500 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type={type} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: 80, padding: '4px 8px', background: FB.elevated,
            border: `1px solid ${FB.border}`, borderRadius: 6,
            color: FB.textPrimary, fontSize: 13, textAlign: 'right', outline: 'none',
          }}
        />
        {suffix && <span style={{ color: FB.textDim, fontSize: 11 }}>{suffix}</span>}
      </div>
    </div>
  );
}

function RangeSliderRow({ label, minVal, maxVal, onMinChange, onMaxChange, min, max, step = 1, suffix = '' }) {
  return (
    <div style={{ padding: '8px 0', borderBottom: `1px solid ${FB.border}22` }}>
      <div style={{ color: FB.textPrimary, fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
        {label}: {minVal}{suffix} - {maxVal}{suffix}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="range" min={min} max={max} step={step} value={minVal}
          onChange={e => { const v = parseFloat(e.target.value); if (v <= maxVal) onMinChange(v); }}
          style={{ flex: 1, height: 6, appearance: 'none', background: FB.elevated, borderRadius: 3, accentColor: FB.warning }}
        />
        <input
          type="range" min={min} max={max} step={step} value={maxVal}
          onChange={e => { const v = parseFloat(e.target.value); if (v >= minVal) onMaxChange(v); }}
          style={{ flex: 1, height: 6, appearance: 'none', background: FB.elevated, borderRadius: 3, accentColor: FB.warning }}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function CreateTableModal({ club, onClose, onCreated, apiCall }) {
  const [t, setT] = useState({ ...DEFAULT_TABLE });
  const [creating, setCreating] = useState(false);

  const set = useCallback((key, val) => {
    setT(prev => ({ ...prev, [key]: val }));
  }, []);

  const handleCreate = async () => {
    if (!club?.id) return;
    setCreating(true);
    try {
      const bb = parseFloat(t.bigBlind) || 2;
      const sb = parseFloat(t.smallBlind) || 1;
      const result = await apiCall('/api/club-arena/create-table', {
        clubId: club.id,
        name: t.name || `${t.variant.toUpperCase()} ${sb}/${bb}`,
        gameType: 'cash',
        variant: t.variant,
        smallBlind: sb,
        bigBlind: bb,
        maxPlayers: t.tableSize,
        minBuyIn: t.minBuyInBB * bb,
        maxBuyIn: t.maxBuyInBB * bb,
        ante: parseFloat(t.ante) || 0,
        actionTime: t.actionTime,
        settings: {
          // Game modes
          private_game: t.privateGame,
          vip_only: t.vipOnly,
          bomb_pot: t.bombPot,
          double_board: t.doubleBoard,
          triple_board: t.tripleBoard,
          pineapple: t.pineapple,
          seven_deuce: t.sevenDeuce,
          nit_game: t.nitGame,
          anonymous_table: t.anonymousTable,
          cap: t.cap,
          cap_amount: t.capAmount,
          ban_chat: t.banChat,
          label_new: t.labelNew,
          featured_table: t.featuredTable,
          no_rathole: t.noRathole,
          // Player requirements
          calltime: t.calltime,
          career_percent: t.careerPercent,
          maintain_percent: t.maintainPercent,
          maintain_hands: t.maintainHands,
          // Auto settings
          auto_start_players: t.autoStartPlayers,
          auto_extension: t.autoExtension,
          auto_restart: t.autoRestart,
          auto_create_table: t.autoCreateTable,
          // Straddle
          auto_utg_straddle: t.autoUtgStraddle,
          voluntary_straddle: t.voluntaryStraddle,
          straddle_enabled: t.autoUtgStraddle || t.voluntaryStraddle,
          // Insurance & run-it
          insurance: t.insurance,
          run_it_mode: t.runItMode,
          run_it_twice: t.runItMode === 'mandatory_twice' || t.runItMode === 'player_choice',
          run_it_thrice: t.runItMode === 'mandatory_thrice',
          // Rake
          rakePercent: t.rakePercent ? parseFloat(t.rakePercent) : undefined,
          fee_cap_bb: t.feeCap,
          bbjPercent: t.bbjPercent ? parseFloat(t.bbjPercent) : undefined,
          // Agent
          same_agent_downline_limit: t.sameAgentDownlineLimit,
          buy_in_authorization: t.buyInAuthorization,
          // Security
          restrict_device: t.restrictDevice,
          restrict_observers: t.restrictObservers,
          gps_restriction: t.gpsRestriction,
          ip_restriction: t.ipRestriction,
          emulator_restriction: t.emulatorRestriction,
          photo_rotation_verification: t.photoRotationVerification,
          hide_club_name: t.hideClubName,
          game_length_hours: t.gameLength,
          auto_muck: true,
        },
      });
      if (result?.table) onCreated?.(result.table);
      onClose?.();
    } catch (err) {
      alert('Failed to create table: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: FB.bg, borderRadius: 16, width: '100%', maxWidth: 440,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        border: `1px solid ${FB.border}`,
        boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
      }}>
        {/* ── HEADER ── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 18px', borderBottom: `1px solid ${FB.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>🎴</span>
            <h2 style={{ color: FB.textPrimary, fontSize: 16, fontWeight: 800, margin: 0 }}>
              {GAME_VARIANTS.find(v => v.value === t.variant)?.label || 'NLH'}
            </h2>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: FB.textDim, fontSize: 20, cursor: 'pointer',
          }}>✕</button>
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '0 18px',
          scrollbarWidth: 'thin', scrollbarColor: `${FB.elevated} transparent`,
        }}>

          {/* Table Name */}
          <div style={{ padding: '12px 0 8px' }}>
            <input
              type="text" placeholder="Enter table name here..."
              value={t.name} onChange={e => set('name', e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', background: FB.cardBg,
                border: `1px solid ${FB.border}`, borderRadius: 8,
                color: FB.textPrimary, fontSize: 14, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* ── GAME VARIANT SELECTOR ── */}
          <SectionHeader label="Game Type" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 8 }}>
            {GAME_VARIANTS.map(v => (
              <button key={v.value} onClick={() => set('variant', v.value)} style={{
                padding: '6px 2px', borderRadius: 8, border: `1px solid ${t.variant === v.value ? FB.warning : FB.border}`,
                background: t.variant === v.value ? `${FB.warning}22` : FB.cardBg,
                color: t.variant === v.value ? FB.warning : FB.textSecondary,
                fontSize: 10, fontWeight: 700, cursor: 'pointer', textAlign: 'center',
              }}>
                <div style={{ fontSize: 16, marginBottom: 1 }}>{v.icon}</div>
                {v.label}
              </button>
            ))}
          </div>

          {/* ── GAME MODES (Image 1) ── */}
          <SectionHeader label="Game Modes" />
          <ToggleRow label="Private Game" value={t.privateGame} onChange={v => set('privateGame', v)} />
          <ToggleRow label="VIP Only" value={t.vipOnly} onChange={v => set('vipOnly', v)} />
          <ToggleRow label="Bomb Pot" value={t.bombPot} onChange={v => set('bombPot', v)} helpText />
          <ToggleRow label="Double Board" value={t.doubleBoard} onChange={v => set('doubleBoard', v)} />
          <ToggleRow label="Triple Board" value={t.tripleBoard} onChange={v => set('tripleBoard', v)} />
          {(t.variant === 'nlh' || t.variant === 'flh') && (
            <ToggleRow label="Pineapple Hold'em" value={t.pineapple} onChange={v => set('pineapple', v)} helpText />
          )}
          <ToggleRow label="Seven-Deuce" value={t.sevenDeuce} onChange={v => set('sevenDeuce', v)} helpText />
          <ToggleRow label="NIT Game" value={t.nitGame} onChange={v => set('nitGame', v)} helpText />
          <ToggleRow label="Anonymous Table" value={t.anonymousTable} onChange={v => set('anonymousTable', v)} />
          <ToggleRow label="Cap" value={t.cap} onChange={v => set('cap', v)} helpText />
          {t.cap && (
            <SliderRow label="Cap Amount (BB)" value={t.capAmount || 20} onChange={v => set('capAmount', v)} min={5} max={200} suffix=" BB" />
          )}
          <ToggleRow label="Ban Chat" value={t.banChat} onChange={v => set('banChat', v)} />
          <ToggleRow label="Label as NEW" value={t.labelNew} onChange={v => set('labelNew', v)} helpText />
          <ToggleRow label="Featured Table" value={t.featuredTable} onChange={v => set('featuredTable', v)} helpText />
          <ToggleRow label="No Rathole" value={t.noRathole} onChange={v => set('noRathole', v)} helpText />

          {/* ── TABLE SETTINGS (Image 3) ── */}
          <SectionHeader label="Table Settings" />
          <SliderRow label="Table Size" value={t.tableSize} onChange={v => set('tableSize', v)} min={2} max={10} suffix=" max" />
          <ToggleRow label="Calltime" value={t.calltime} onChange={v => set('calltime', v)} helpText />
          <SliderRow label="Action Time" value={t.actionTime} onChange={v => set('actionTime', v)} min={5} max={60} suffix=" sec" />
          <div style={{ padding: '8px 0', borderBottom: `1px solid ${FB.border}22` }}>
            <div style={{ color: FB.textPrimary, fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
              Blinds: {t.smallBlind}/{t.bigBlind}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="number" value={t.smallBlind} min={0.01} step={0.01}
                onChange={e => { set('smallBlind', e.target.value); set('bigBlind', String(parseFloat(e.target.value || 0) * 2)); }}
                style={{
                  flex: 1, padding: '6px 10px', background: FB.elevated, border: `1px solid ${FB.border}`,
                  borderRadius: 6, color: FB.textPrimary, fontSize: 13, outline: 'none',
                }}
                placeholder="SB"
              />
              <span style={{ color: FB.textDim, lineHeight: '32px' }}>/</span>
              <input type="number" value={t.bigBlind} min={0.02} step={0.01}
                onChange={e => set('bigBlind', e.target.value)}
                style={{
                  flex: 1, padding: '6px 10px', background: FB.elevated, border: `1px solid ${FB.border}`,
                  borderRadius: 6, color: FB.textPrimary, fontSize: 13, outline: 'none',
                }}
                placeholder="BB"
              />
            </div>
          </div>
          <RangeSliderRow label="Buy-in" minVal={t.minBuyInBB} maxVal={t.maxBuyInBB}
            onMinChange={v => set('minBuyInBB', v)} onMaxChange={v => set('maxBuyInBB', v)}
            min={5} max={500} suffix=" BB" />
          <SliderRow label="Ante" value={t.ante} onChange={v => set('ante', v)} min={0} max={10} step={0.5}
            format={v => `${v} Big-Blind`} />

          {/* ── PLAYER REQUIREMENTS (Image 3) ── */}
          <SectionHeader label="Player Requirements" />
          <SliderRow label="Career %" value={t.careerPercent} onChange={v => set('careerPercent', v)} min={0} max={100} format={v => `>=${v}%`} />
          <SliderRow label="Maintain %" value={t.maintainPercent} onChange={v => set('maintainPercent', v)} min={0} max={100} format={v => `>=${v}%`} />
          <SliderRow label="Maintain #" value={t.maintainHands} onChange={v => set('maintainHands', v)} min={0} max={100} suffix=" hands" />

          {/* ── AUTO SETTINGS (Image 4) ── */}
          <SectionHeader label="Auto Settings" />
          <SliderRow label="AutoStart" value={t.autoStartPlayers} onChange={v => set('autoStartPlayers', v)} min={2} max={10}
            format={v => `👤 ${v} players`} />
          <ToggleRow label="Auto Extension" value={t.autoExtension} onChange={v => set('autoExtension', v)} helpText />
          <ToggleRow label="Auto Restart" value={t.autoRestart} onChange={v => set('autoRestart', v)} />
          <ToggleRow label="Auto Create Table" value={t.autoCreateTable} onChange={v => set('autoCreateTable', v)} helpText />

          {/* ── STRADDLE (Image 4) ── */}
          <SectionHeader label="Straddle" />
          <ToggleRow label="Auto UTG Straddle" value={t.autoUtgStraddle} onChange={v => set('autoUtgStraddle', v)} helpText />
          <ToggleRow label="Voluntary Straddle" value={t.voluntaryStraddle} onChange={v => set('voluntaryStraddle', v)} />

          {/* ── INSURANCE & RUN IT (Image 4) ── */}
          <SectionHeader label="Insurance & Run It" />
          <ToggleRow label="Insurance" value={t.insurance} onChange={v => set('insurance', v)} helpText />
          <RadioGroup label="Run It Multi-Times" value={t.runItMode} onChange={v => set('runItMode', v)}
            options={[
              { value: 'none', label: 'None' },
              { value: 'player_choice', label: "Player's Choice" },
              { value: 'mandatory_twice', label: 'Mandatory Twice' },
              { value: 'mandatory_thrice', label: 'Mandatory 3 Times' },
            ]}
          />

          {/* ── RAKE & FEES (Image 5) ── */}
          <SectionHeader label="Rake & Fees" />
          <InputRow label="Rake %" value={t.rakePercent} onChange={v => set('rakePercent', v)}
            type="number" placeholder="Auto" suffix="%" />
          <SliderRow label="FeeCap" value={t.feeCap} onChange={v => set('feeCap', v)} min={0} max={10} step={0.5}
            format={v => `${v} x Big-Blind`} />
          <InputRow label="BBJ Fee" value={t.bbjPercent} onChange={v => set('bbjPercent', v)}
            type="number" placeholder="Auto" suffix="BB" />

          {/* ── AGENT SETTINGS (Image 5) ── */}
          <SectionHeader label="Agent Settings" />
          <SliderRow label="Same Agent Downline Limit" value={t.sameAgentDownlineLimit} onChange={v => set('sameAgentDownlineLimit', v)}
            min={0} max={20} format={v => v === 0 ? 'No Limit' : `${v} players`} />
          <ToggleRow label="Buy-in Authorization" value={t.buyInAuthorization} onChange={v => set('buyInAuthorization', v)} />

          {/* ── SECURITY / RESTRICTIONS (Image 5) ── */}
          <SectionHeader label="Security & Restrictions" />
          <ToggleRow label="Restrict Device" value={t.restrictDevice} onChange={v => set('restrictDevice', v)} helpText />
          <ToggleRow label="Restrict Observers" value={t.restrictObservers} onChange={v => set('restrictObservers', v)} />
          <ToggleRow label="GPS Restriction" value={t.gpsRestriction} onChange={v => set('gpsRestriction', v)} />
          <ToggleRow label="IP Restriction" value={t.ipRestriction} onChange={v => set('ipRestriction', v)} />
          <ToggleRow label="PC Emulator Restriction" value={t.emulatorRestriction} onChange={v => set('emulatorRestriction', v)} />
          <ToggleRow label="Photo Rotation Verification" value={t.photoRotationVerification} onChange={v => set('photoRotationVerification', v)} helpText />
          <ToggleRow label="Hide Club Name" value={t.hideClubName} onChange={v => set('hideClubName', v)} />
          <SliderRow label="Game Length" value={t.gameLength} onChange={v => set('gameLength', v)} min={1} max={24} suffix=" hour" />

          <div style={{ height: 16 }} />
        </div>

        {/* ── FOOTER BUTTONS (Image 6: Save + Start) ── */}
        <div style={{
          display: 'flex', gap: 10, padding: '14px 18px',
          borderTop: `1px solid ${FB.border}`,
        }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px', borderRadius: 10, border: `1px solid ${FB.border}`,
            background: 'transparent', color: FB.textSecondary, fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>
            Cancel
          </button>
          <button onClick={handleCreate} disabled={creating} style={{
            flex: 1, padding: '12px', borderRadius: 10, border: 'none',
            background: creating ? FB.elevated : FB.success, color: '#fff',
            fontSize: 14, fontWeight: 700, cursor: creating ? 'default' : 'pointer',
          }}>
            {creating ? 'Creating...' : 'Start'}
          </button>
        </div>
      </div>
    </div>
  );
}
