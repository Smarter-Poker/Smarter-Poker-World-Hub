/**
 * CreateGameModal — Unified table/tournament creation (PokerBros-exact)
 * ═══════════════════════════════════════════════════════════════════════
 * Flow:
 *   1) Game Type Selector (NLH, FLH, 6+, PLO, FLO, Mixed, OFC)  [Image 2]
 *   2) Regular | SNG | MTT tabs with full options                 [Images 1-12]
 *
 * Regular (Cash) Images 1-6:
 *   Game modes, Table settings, Player requirements, Auto settings,
 *   Straddle, Insurance, Run It Multi-Times, Rake/Fees, Agent,
 *   Security, Game Length
 *
 * SNG Images 7-8:
 *   VIP, Satellite, Ban Chat, Label NEW, Table Size, Action Time,
 *   Auto Restart, Auto Create, Fee, Buy-in, Blind Structure,
 *   Payout, Starting Chips, Blinds Up, Restrictions
 *
 * MTT Images 9-12:
 *   All SNG + Private, Description, Accelerated, All-in or Fold,
 *   Rebuy/Re-entry, Add-on, KO Bounty, GTD Prize, Final Table Deal,
 *   Big Blind Ante, Auth to Register, Late Reg, Early Bird, Bubble,
 *   Featured, Player Count, Multi-Day, Start Time, Schedule, Breaks
 */

import React, { useState, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════
// THEME — Facebook Dark
// ═══════════════════════════════════════════════════════════════
const FB = {
  bg: '#18191A', cardBg: '#242526', elevated: '#3A3B3C',
  border: '#3E4042', primary: '#1877F2', success: '#31A24C',
  warning: '#F5A623', danger: '#FA383E',
  textPrimary: '#E4E6EB', textSecondary: '#B0B3B8', textDim: '#65676B',
};

// ═══════════════════════════════════════════════════════════════
// GAME VARIANTS — Image 2
// ═══════════════════════════════════════════════════════════════
const GAME_VARIANTS = [
  { value: 'nlh',        label: 'NLH',    full: 'No Limit Hold\'em',          color: '#E74C3C', icon: '♠' },
  { value: 'flh',        label: 'FLH',    full: 'Fixed Limit Hold\'em',       color: '#2ECC71', icon: '♥' },
  { value: 'short_deck', label: '6+',     full: '6+ Hold\'em',                color: '#3498DB', icon: '🃏' },
  { value: 'plo4',       label: 'OMAHA',  full: 'Pot Limit Omaha',            color: '#9B59B6', icon: '♦' },
  { value: 'plo5',       label: 'PLO5',   full: 'Pot Limit Omaha 5',          color: '#8E44AD', icon: '♦' },
  { value: 'plo6',       label: 'PLO6',   full: 'Pot Limit Omaha 6',          color: '#7D3C98', icon: '♦' },
  { value: 'plo8',       label: 'Hi/Lo',  full: 'PLO Hi/Lo (8-or-Better)',    color: '#E67E22', icon: '♦' },
  { value: 'flo',        label: 'FLO',    full: 'Fixed Limit Omaha',          color: '#1ABC9C', icon: '♣' },
  { value: 'mixed',      label: 'MIXED',  full: 'Hold\'em/Omaha',             color: '#F39C12', icon: '🔀' },
  { value: 'ofc',        label: 'OFC',    full: 'Open Face Chinese Poker',    color: '#E91E63', icon: '🀄' },
];

// ═══════════════════════════════════════════════════════════════
// DEFAULT STATES
// ═══════════════════════════════════════════════════════════════

const DEFAULT_CASH = {
  name: '',
  tableSize: 9, actionTime: 15,
  smallBlind: 1, bigBlind: 2,
  minBuyInBB: 20, maxBuyInBB: 200,
  ante: 0,
  // Game Modes (Image 1)
  privateGame: false, vipOnly: false, bombPot: false,
  doubleBoard: false, tripleBoard: false, pineapple: false,
  sevenDeuce: false, nitGame: false, anonymousTable: false,
  cap: false, capAmount: 0, banChat: false, labelNew: false,
  featuredTable: false, noRathole: false,
  // Player Requirements (Image 3)
  calltime: false, careerPercent: 0, maintainPercent: 0, maintainHands: 10,
  // Auto Settings (Image 4)
  autoStartPlayers: 2, autoExtension: false, autoRestart: false, autoCreateTable: false,
  // Straddle (Image 4)
  autoUtgStraddle: false, voluntaryStraddle: false,
  // Insurance & Run It (Image 4)
  insurance: false, runItMode: 'none',
  // Rake/Fee (Image 5)
  rakePercent: '', feeCap: 3, bbjPercent: '',
  // Agent (Image 5)
  sameAgentDownlineLimit: 0, buyInAuthorization: false,
  // Security (Image 5-6)
  restrictDevice: true, restrictObservers: false,
  gpsRestriction: true, ipRestriction: true,
  emulatorRestriction: false, photoRotationVerification: false,
  hideClubName: false, gameLength: 12,
};

const DEFAULT_TOURNAMENT = {
  name: '',
  vipOnly: false, banChat: false, labelNew: false,
  tableSize: 9, actionTime: 15,
  fee: 10, buyIn: 100, customBuyIn: false,
  blindStructure: 'standard', payoutStructure: 'standard',
  startingChips: 1000, blindsUpMinutes: 3,
  // SNG-specific (Image 7-8)
  satellite: false, autoRestart: false, autoCreateTable: false,
  // Security (shared)
  restrictDevice: true, restrictObservers: false,
  gpsRestriction: true, ipRestriction: true,
  emulatorRestriction: false, photoRotationVerification: false, hideClubName: false,
  // MTT-specific (Images 9-12)
  privateGame: false, shortDescription: '',
  acceleratedMTT: false, allInOrFold: false,
  customRebuyCost: false, numberOfRebuys: 3,
  addOnMultiplier: 1.0, customAddOn: false, addOnBreakLength: 1,
  koBounty: false, gtdPrizePool: false, gtdAmount: 0,
  finalTableDeal: false, bigBlindAnte: false, authorizedToRegister: false,
  lateRegistrationLevel: 6, earlyBirdRegistration: false,
  bubbleProtection: false, featuredTournament: false,
  minPlayers: 30, maxPlayers: 300,
  multiDayMTT: false, saveStartTime: false, startTime: '',
  restartTournament: false, tournamentSchedule: false, synchronizedBreaks: true,
};

// ═══════════════════════════════════════════════════════════════
// REUSABLE COMPONENTS
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

function Toggle({ label, value, onChange, help }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0', borderBottom: `1px solid ${FB.border}22`,
    }}>
      <div>
        <span style={{ color: FB.textPrimary, fontSize: 13, fontWeight: 500 }}>{label}</span>
        {help && <span style={{ color: FB.textDim, fontSize: 11, marginLeft: 6 }}>ⓘ</span>}
      </div>
      <button onClick={() => onChange(!value)} style={{
        width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
        background: value ? FB.warning : FB.elevated, position: 'relative', transition: 'background 0.2s',
      }}>
        <div style={{
          width: 20, height: 20, borderRadius: 10, background: '#fff',
          position: 'absolute', top: 2, left: value ? 22 : 2, transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </button>
    </div>
  );
}

function Slider({ label, value, onChange, min, max, step = 1, suffix = '', format }) {
  const disp = format ? format(value) : `${value}${suffix}`;
  return (
    <div style={{ padding: '8px 0', borderBottom: `1px solid ${FB.border}22` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: FB.textPrimary, fontSize: 13, fontWeight: 500 }}>{label}</span>
        <span style={{ color: FB.warning, fontSize: 13, fontWeight: 700 }}>{disp}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', height: 6, appearance: 'none', background: FB.elevated, borderRadius: 3, accentColor: FB.warning }}
      />
    </div>
  );
}

function RangeSlider({ label, minVal, maxVal, onMinChange, onMaxChange, min, max, step = 1, suffix = '' }) {
  return (
    <div style={{ padding: '8px 0', borderBottom: `1px solid ${FB.border}22` }}>
      <div style={{ color: FB.textPrimary, fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
        {label}: {minVal}{suffix} - {maxVal}{suffix}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="range" min={min} max={max} step={step} value={minVal}
          onChange={e => { const v = parseFloat(e.target.value); if (v <= maxVal) onMinChange(v); }}
          style={{ flex: 1, height: 6, appearance: 'none', background: FB.elevated, borderRadius: 3, accentColor: FB.warning }}
        />
        <input type="range" min={min} max={max} step={step} value={maxVal}
          onChange={e => { const v = parseFloat(e.target.value); if (v >= minVal) onMaxChange(v); }}
          style={{ flex: 1, height: 6, appearance: 'none', background: FB.elevated, borderRadius: 3, accentColor: FB.warning }}
        />
      </div>
    </div>
  );
}

function RadioGroup({ label, value, onChange, options, help }) {
  return (
    <div style={{ padding: '8px 0', borderBottom: `1px solid ${FB.border}22` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ color: FB.textPrimary, fontSize: 13, fontWeight: 500 }}>{label}</span>
        {help && <span style={{ color: FB.textDim, fontSize: 11 }}>ⓘ</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {options.map(o => (
          <label key={o.value} onClick={() => onChange(o.value)} style={{
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
            padding: '6px 8px', borderRadius: 8,
            background: value === o.value ? `${FB.warning}22` : 'transparent',
            border: `1px solid ${value === o.value ? FB.warning : FB.border}`,
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: 7,
              border: `2px solid ${value === o.value ? FB.warning : FB.textDim}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {value === o.value && <div style={{ width: 6, height: 6, borderRadius: 3, background: FB.warning }} />}
            </div>
            <span style={{ color: FB.textPrimary, fontSize: 12 }}>{o.label}</span>
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
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
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

// ═══════════════════════════════════════════════════════════════
// SCREEN 1: GAME TYPE SELECTOR (Image 2)
// ═══════════════════════════════════════════════════════════════

function GameTypeSelector({ onSelect, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: FB.bg, borderRadius: 16, width: '100%', maxWidth: 420,
        maxHeight: '90vh', overflow: 'auto',
        border: `1px solid ${FB.border}`, boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
        padding: '20px 16px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ color: FB.textPrimary, fontSize: 18, fontWeight: 800, margin: 0 }}>
            Select Game Type
          </h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: FB.textDim, fontSize: 22, cursor: 'pointer',
          }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {GAME_VARIANTS.map(v => (
            <button key={v.value} onClick={() => onSelect(v.value)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: `linear-gradient(135deg, ${v.color}44, ${v.color}11)`,
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = `0 4px 20px ${v.color}33`; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 10, background: `${v.color}33`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, border: `1px solid ${v.color}55`,
                }}>
                  {v.icon}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ color: '#fff', fontSize: 16, fontWeight: 800, letterSpacing: 1 }}>{v.label}</div>
                  <div style={{ color: FB.textSecondary, fontSize: 11, fontWeight: 500 }}>{v.full.toUpperCase()}</div>
                </div>
              </div>
              <div style={{
                padding: '5px 14px', borderRadius: 6, background: `${v.color}55`,
                color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
              }}>
                CREATE »
              </div>
            </button>
          ))}
        </div>

        {/* Table Template button */}
        <button style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', padding: '12px', marginTop: 14, borderRadius: 10,
          border: `1px solid ${FB.border}`, background: FB.cardBg,
          color: FB.textSecondary, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>
          Table Template 📋
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// REGULAR (CASH) TAB — Images 1, 3-6
// ═══════════════════════════════════════════════════════════════

function CashTab({ t, set, variant }) {
  return (
    <>
      {/* ── GAME MODES (Image 1) ── */}
      <SectionHeader label="Game Modes" />
      <Toggle label="Private Game" value={t.privateGame} onChange={v => set('privateGame', v)} />
      <Toggle label="VIP Only" value={t.vipOnly} onChange={v => set('vipOnly', v)} />
      <Toggle label="Bomb Pot" value={t.bombPot} onChange={v => set('bombPot', v)} help />
      <Toggle label="Double Board" value={t.doubleBoard} onChange={v => set('doubleBoard', v)} />
      <Toggle label="Triple Board" value={t.tripleBoard} onChange={v => set('tripleBoard', v)} />
      {(variant === 'nlh' || variant === 'flh') && (
        <Toggle label="Pineapple Hold'em" value={t.pineapple} onChange={v => set('pineapple', v)} help />
      )}
      <Toggle label="Seven-Deuce" value={t.sevenDeuce} onChange={v => set('sevenDeuce', v)} help />
      <Toggle label="NIT Game" value={t.nitGame} onChange={v => set('nitGame', v)} help />
      <Toggle label="Anonymous Table" value={t.anonymousTable} onChange={v => set('anonymousTable', v)} />
      <Toggle label="Cap" value={t.cap} onChange={v => set('cap', v)} help />
      {t.cap && (
        <Slider label="Cap Amount (BB)" value={t.capAmount || 20} onChange={v => set('capAmount', v)} min={5} max={200} suffix=" BB" />
      )}
      <Toggle label="Ban Chat" value={t.banChat} onChange={v => set('banChat', v)} />
      <Toggle label="Label as NEW" value={t.labelNew} onChange={v => set('labelNew', v)} help />
      <Toggle label="Featured Table" value={t.featuredTable} onChange={v => set('featuredTable', v)} help />
      <Toggle label="No Rathole" value={t.noRathole} onChange={v => set('noRathole', v)} help />

      {/* ── TABLE SETTINGS (Image 3) ── */}
      <SectionHeader label="Table Settings" />
      <Slider label="Table Size" value={t.tableSize} onChange={v => set('tableSize', v)} min={2} max={10} suffix=" max" />
      <Toggle label="Calltime" value={t.calltime} onChange={v => set('calltime', v)} help />
      <Slider label="Action Time" value={t.actionTime} onChange={v => set('actionTime', v)} min={5} max={60} suffix=" sec" />

      {/* Blinds input */}
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

      <RangeSlider label="Buy-in" minVal={t.minBuyInBB} maxVal={t.maxBuyInBB}
        onMinChange={v => set('minBuyInBB', v)} onMaxChange={v => set('maxBuyInBB', v)}
        min={5} max={500} suffix=" BB" />
      <Slider label="Ante" value={t.ante} onChange={v => set('ante', v)} min={0} max={10} step={0.5}
        format={v => `${v} Big Blind`} />

      {/* ── PLAYER REQUIREMENTS (Image 3) ── */}
      <SectionHeader label="Player Requirements" />
      <Slider label="Career %" value={t.careerPercent} onChange={v => set('careerPercent', v)} min={0} max={100} format={v => `>=${v}%`} />
      <Slider label="Maintain %" value={t.maintainPercent} onChange={v => set('maintainPercent', v)} min={0} max={100} format={v => `>=${v}%`} />
      <Slider label="Maintain #" value={t.maintainHands} onChange={v => set('maintainHands', v)} min={0} max={100} suffix=" hands" />

      {/* ── AUTO SETTINGS (Image 4) ── */}
      <SectionHeader label="Auto Settings" />
      <Slider label="AutoStart" value={t.autoStartPlayers} onChange={v => set('autoStartPlayers', v)} min={2} max={10}
        format={v => `👤 ${v}`} />
      <Toggle label="Auto Extension" value={t.autoExtension} onChange={v => set('autoExtension', v)} help />
      <Toggle label="Auto Restart" value={t.autoRestart} onChange={v => set('autoRestart', v)} />
      <Toggle label="Auto Create Table" value={t.autoCreateTable} onChange={v => set('autoCreateTable', v)} help />

      {/* ── STRADDLE (Image 4) ── */}
      <SectionHeader label="Straddle" />
      <Toggle label="Auto UTG Straddle" value={t.autoUtgStraddle} onChange={v => set('autoUtgStraddle', v)} help />
      <Toggle label="Voluntary Straddle" value={t.voluntaryStraddle} onChange={v => set('voluntaryStraddle', v)} help />

      {/* ── INSURANCE & RUN IT (Image 4) ── */}
      <SectionHeader label="Insurance & Run It" />
      <Toggle label="Insurance" value={t.insurance} onChange={v => set('insurance', v)} help />
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
      <Slider label="FeeCap" value={t.feeCap} onChange={v => set('feeCap', v)} min={0} max={10} step={0.5}
        format={v => `${v} x Big Blind`} />
      <InputRow label="BBJ Fee" value={t.bbjPercent} onChange={v => set('bbjPercent', v)}
        type="number" placeholder="Auto" suffix="BB" />

      {/* ── AGENT SETTINGS (Image 5) ── */}
      <SectionHeader label="Agent Settings" />
      <Slider label="Same Agent Downline Limit" value={t.sameAgentDownlineLimit}
        onChange={v => set('sameAgentDownlineLimit', v)} min={0} max={20}
        format={v => v === 0 ? 'No Limit' : `${v} players`} />
      <Toggle label="Buy-in Authorization" value={t.buyInAuthorization} onChange={v => set('buyInAuthorization', v)} />

      {/* ── SECURITY (Image 5-6) ── */}
      <SectionHeader label="Security & Restrictions" />
      <Toggle label="Restrict Device" value={t.restrictDevice} onChange={v => set('restrictDevice', v)} help />
      <Toggle label="Restrict Observers" value={t.restrictObservers} onChange={v => set('restrictObservers', v)} />
      <Toggle label="GPS Restriction" value={t.gpsRestriction} onChange={v => set('gpsRestriction', v)} />
      <Toggle label="IP Restriction" value={t.ipRestriction} onChange={v => set('ipRestriction', v)} />
      <Toggle label="PC Emulator Restriction" value={t.emulatorRestriction} onChange={v => set('emulatorRestriction', v)} />
      <Toggle label="Photo Rotation Verification" value={t.photoRotationVerification}
        onChange={v => set('photoRotationVerification', v)} help />
      <Toggle label="Hide Club Name" value={t.hideClubName} onChange={v => set('hideClubName', v)} />
      <Slider label="Game Length" value={t.gameLength} onChange={v => set('gameLength', v)} min={1} max={24} suffix=" hour" />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// SNG TAB — Images 7-8
// ═══════════════════════════════════════════════════════════════

function SngTab({ t, set }) {
  return (
    <>
      <SectionHeader label="General Settings" />
      <Toggle label="VIP Only" value={t.vipOnly} onChange={v => set('vipOnly', v)} />
      <Toggle label="Next Step (Satellite)" value={t.satellite} onChange={v => set('satellite', v)} help />
      <Toggle label="Ban Chat" value={t.banChat} onChange={v => set('banChat', v)} />
      <Toggle label="Label as NEW" value={t.labelNew} onChange={v => set('labelNew', v)} help />

      <SectionHeader label="Table & Time" />
      <Slider label="Table Size" value={t.tableSize} onChange={v => set('tableSize', v)} min={2} max={10} suffix=" max" />
      <Slider label="Action Time" value={t.actionTime} onChange={v => set('actionTime', v)} min={5} max={60} suffix=" sec" />

      <Toggle label="Auto Restart" value={t.autoRestart} onChange={v => set('autoRestart', v)} />
      <Toggle label="Auto Create Table" value={t.autoCreateTable} onChange={v => set('autoCreateTable', v)} help />

      <SectionHeader label="Buy-in & Fee" />
      <Slider label="Fee" value={t.fee} onChange={v => set('fee', v)} min={0} max={25} suffix="%" />
      <Slider label="Buy-in" value={t.buyIn} onChange={v => set('buyIn', v)} min={10} max={10000} step={10} />
      <Toggle label="Custom Buy-in" value={t.customBuyIn} onChange={v => set('customBuyIn', v)} />

      <SectionHeader label="Blind Structure" />
      <RadioGroup label="Blind Structure" value={t.blindStructure} onChange={v => set('blindStructure', v)} help
        options={[
          { value: 'slow', label: 'Slow' },
          { value: 'standard', label: 'Standard' },
          { value: 'turbo', label: 'Turbo' },
          { value: 'hyper_turbo', label: 'HyperTurbo' },
        ]}
      />

      {/* Payout Structure */}
      <div style={{ padding: '8px 0', borderBottom: `1px solid ${FB.border}22` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: FB.textPrimary, fontSize: 13, fontWeight: 500 }}>Payout Structure</span>
            <span style={{ color: FB.textDim, fontSize: 11 }}>ⓘ</span>
          </div>
          <select value={t.payoutStructure} onChange={e => set('payoutStructure', e.target.value)} style={{
            padding: '4px 10px', background: FB.elevated, border: `1px solid ${FB.border}`,
            borderRadius: 6, color: FB.warning, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
            <option value="standard">Standard</option>
            <option value="top_heavy">10% Top-Heavy</option>
            <option value="winner_take_all">Winner Take All</option>
            <option value="satellite">Satellite</option>
            <option value="payout_1">Payout 1</option>
            <option value="payout_2">Payout 2</option>
            <option value="payout_3">Payout 3</option>
          </select>
        </div>
      </div>

      <Slider label="Starting Chips" value={t.startingChips} onChange={v => set('startingChips', v)} min={100} max={50000} step={100} />
      <Slider label="Blinds Up" value={t.blindsUpMinutes} onChange={v => set('blindsUpMinutes', v)} min={1} max={30} suffix=" min" />

      <SectionHeader label="Security & Restrictions" />
      <Toggle label="Restrict Device" value={t.restrictDevice} onChange={v => set('restrictDevice', v)} help />
      <Toggle label="Restrict Observers" value={t.restrictObservers} onChange={v => set('restrictObservers', v)} />
      <Toggle label="GPS Restriction" value={t.gpsRestriction} onChange={v => set('gpsRestriction', v)} />
      <Toggle label="IP Restriction" value={t.ipRestriction} onChange={v => set('ipRestriction', v)} />
      <Toggle label="PC Emulator Restriction" value={t.emulatorRestriction} onChange={v => set('emulatorRestriction', v)} />
      <Toggle label="Hide Club Name" value={t.hideClubName} onChange={v => set('hideClubName', v)} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// MTT TAB — Images 9-12
// ═══════════════════════════════════════════════════════════════

function MttTab({ t, set }) {
  return (
    <>
      {/* ── Tournament Info (Image 9 top) ── */}
      <SectionHeader label="Tournament Info" />
      <Toggle label="Private Game" value={t.privateGame} onChange={v => set('privateGame', v)} />
      <Toggle label="VIP Only" value={t.vipOnly} onChange={v => set('vipOnly', v)} />
      <div style={{ padding: '8px 0', borderBottom: `1px solid ${FB.border}22` }}>
        <span style={{ color: FB.textPrimary, fontSize: 13, fontWeight: 500 }}>Short Description</span>
        <textarea value={t.shortDescription} onChange={e => set('shortDescription', e.target.value)}
          placeholder="Write a short description of the tournament."
          rows={3} style={{
            width: '100%', marginTop: 6, padding: '8px 12px', background: FB.cardBg,
            border: `1px solid ${FB.border}`, borderRadius: 8,
            color: FB.textPrimary, fontSize: 13, resize: 'vertical', outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* ── General Settings (Image 9) ── */}
      <SectionHeader label="General Settings" />
      <Toggle label="Next Step (Satellite)" value={t.satellite} onChange={v => set('satellite', v)} help />
      <Toggle label="Accelerated MTT" value={t.acceleratedMTT} onChange={v => set('acceleratedMTT', v)} help />
      <Toggle label="Ban Chat" value={t.banChat} onChange={v => set('banChat', v)} />
      <Toggle label="All-in or Fold" value={t.allInOrFold} onChange={v => set('allInOrFold', v)} help />
      <Toggle label="Label as NEW" value={t.labelNew} onChange={v => set('labelNew', v)} help />

      <SectionHeader label="Table & Time" />
      <Slider label="Table Size" value={t.tableSize} onChange={v => set('tableSize', v)} min={2} max={10} suffix=" max" />
      <Slider label="Action Time" value={t.actionTime} onChange={v => set('actionTime', v)} min={5} max={60} suffix=" sec" />

      {/* ── Fee & Buy-in (Image 10 top) ── */}
      <SectionHeader label="Buy-in & Fee" />
      <Slider label="Fee" value={t.fee} onChange={v => set('fee', v)} min={0} max={25} suffix="%" />
      <Toggle label="PC Emulator Restriction" value={t.emulatorRestriction} onChange={v => set('emulatorRestriction', v)} />
      <Toggle label="Photo Rotation Verification" value={t.photoRotationVerification}
        onChange={v => set('photoRotationVerification', v)} help />
      <Toggle label="Hide Club Name" value={t.hideClubName} onChange={v => set('hideClubName', v)} />
      <Slider label="Buy-in" value={t.buyIn} onChange={v => set('buyIn', v)} min={10} max={10000} step={10} />
      <Toggle label="Custom Buy-in" value={t.customBuyIn} onChange={v => set('customBuyIn', v)} />

      {/* ── Rebuy & Add-on (Image 10 bottom) ── */}
      <SectionHeader label="Rebuy & Add-on" />
      <Toggle label="Custom Rebuy/Re-entry Cost" value={t.customRebuyCost} onChange={v => set('customRebuyCost', v)} />
      <Slider label="Number of Rebuys/Re-entries" value={t.numberOfRebuys} onChange={v => set('numberOfRebuys', v)} min={0} max={10} />
      <Slider label="Add-on" value={t.addOnMultiplier} onChange={v => set('addOnMultiplier', v)} min={0} max={5} step={0.5}
        format={v => `${v}x`} />
      <Toggle label="Custom Add-on" value={t.customAddOn} onChange={v => set('customAddOn', v)} />
      <Slider label="Add-on Break Length" value={t.addOnBreakLength} onChange={v => set('addOnBreakLength', v)} min={0} max={10} suffix=" min" />

      {/* ── Special Modes (Image 11 top) ── */}
      <SectionHeader label="Special Modes" />
      <Toggle label="KOBounty" value={t.koBounty} onChange={v => set('koBounty', v)} />
      <Toggle label="GTD Prize Pool" value={t.gtdPrizePool} onChange={v => set('gtdPrizePool', v)} />
      {t.gtdPrizePool && (
        <Slider label="GTD Amount" value={t.gtdAmount} onChange={v => set('gtdAmount', v)} min={0} max={100000} step={100} />
      )}
      <Toggle label="Final Table Deal" value={t.finalTableDeal} onChange={v => set('finalTableDeal', v)} help />
      <Toggle label="Big Blind Ante" value={t.bigBlindAnte} onChange={v => set('bigBlindAnte', v)} />
      <Toggle label="Authorized to Register" value={t.authorizedToRegister} onChange={v => set('authorizedToRegister', v)} />

      {/* ── Blind Structure (Image 11 bottom) ── */}
      <SectionHeader label="Blind Structure" />
      <RadioGroup label="Blind Structure" value={t.blindStructure} onChange={v => set('blindStructure', v)} help
        options={[
          { value: 'slow', label: 'Slow' },
          { value: 'standard', label: 'Standard' },
          { value: 'turbo', label: 'Turbo' },
          { value: 'hyper_turbo', label: 'HyperTurbo' },
        ]}
      />

      <div style={{ padding: '8px 0', borderBottom: `1px solid ${FB.border}22` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: FB.textPrimary, fontSize: 13, fontWeight: 500 }}>Payout Structure</span>
            <span style={{ color: FB.textDim, fontSize: 11 }}>ⓘ</span>
          </div>
          <select value={t.payoutStructure} onChange={e => set('payoutStructure', e.target.value)} style={{
            padding: '4px 10px', background: FB.elevated, border: `1px solid ${FB.border}`,
            borderRadius: 6, color: FB.warning, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
            <option value="standard">Standard</option>
            <option value="top_heavy">10% Top-Heavy</option>
            <option value="winner_take_all">Winner Take All</option>
            <option value="satellite">Satellite</option>
            <option value="payout_1">Payout 1</option>
          </select>
        </div>
      </div>

      <Slider label="Starting Chips" value={t.startingChips} onChange={v => set('startingChips', v)} min={100} max={50000} step={100} />
      <Slider label="Blinds Up" value={t.blindsUpMinutes} onChange={v => set('blindsUpMinutes', v)} min={1} max={30} suffix=" min" />

      {/* ── Registration (Image 12) ── */}
      <SectionHeader label="Registration" />
      <Slider label="Late Registration" value={t.lateRegistrationLevel} onChange={v => set('lateRegistrationLevel', v)}
        min={0} max={20} format={v => `Level ${v}`} />
      <Toggle label="Early Bird Registration" value={t.earlyBirdRegistration} onChange={v => set('earlyBirdRegistration', v)} help />
      <Toggle label="Bubble Protection" value={t.bubbleProtection} onChange={v => set('bubbleProtection', v)} help />
      <Toggle label="Featured Tournament" value={t.featuredTournament} onChange={v => set('featuredTournament', v)} />

      <SectionHeader label="Player Count" />
      <RangeSlider label="Player Number" minVal={t.minPlayers} maxVal={t.maxPlayers}
        onMinChange={v => set('minPlayers', v)} onMaxChange={v => set('maxPlayers', v)}
        min={2} max={500} />

      {/* ── Schedule (Image 12) ── */}
      <SectionHeader label="Schedule" />
      <Toggle label="Multi-Day MTT" value={t.multiDayMTT} onChange={v => set('multiDayMTT', v)} help />
      <Toggle label="Save the Start Time" value={t.saveStartTime} onChange={v => set('saveStartTime', v)} help />
      <div style={{ padding: '8px 0', borderBottom: `1px solid ${FB.border}22` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: FB.textPrimary, fontSize: 13, fontWeight: 500 }}>Start Time</span>
          <input type="datetime-local" value={t.startTime} onChange={e => set('startTime', e.target.value)}
            style={{
              padding: '4px 8px', background: FB.elevated, border: `1px solid ${FB.border}`,
              borderRadius: 6, color: FB.warning, fontSize: 12, cursor: 'pointer',
            }}
          />
        </div>
      </div>
      <Toggle label="Restart the Tournament every..." value={t.restartTournament} onChange={v => set('restartTournament', v)} help />
      <Toggle label="Tournament Schedule" value={t.tournamentSchedule} onChange={v => set('tournamentSchedule', v)} help />
      <Toggle label="Synchronized Breaks" value={t.synchronizedBreaks} onChange={v => set('synchronizedBreaks', v)} help />

      <SectionHeader label="Security & Restrictions" />
      <Toggle label="Restrict Device" value={t.restrictDevice} onChange={v => set('restrictDevice', v)} help />
      <Toggle label="Restrict Observers" value={t.restrictObservers} onChange={v => set('restrictObservers', v)} />
      <Toggle label="GPS Restriction" value={t.gpsRestriction} onChange={v => set('gpsRestriction', v)} />
      <Toggle label="IP Restriction" value={t.ipRestriction} onChange={v => set('ipRestriction', v)} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// SCREEN 2: CONFIGURATION MODAL (Regular | SNG | MTT tabs)
// ═══════════════════════════════════════════════════════════════

function ConfigModal({ variant, onClose, onCreated, club, apiCall, initialTab }) {
  const [tab, setTab] = useState(initialTab || 'regular'); // regular | sng | mtt
  const [cash, setCash] = useState({ ...DEFAULT_CASH });
  const [tourney, setTourney] = useState({ ...DEFAULT_TOURNAMENT });
  const [creating, setCreating] = useState(false);

  const setCashField = useCallback((k, v) => setCash(p => ({ ...p, [k]: v })), []);
  const setTourneyField = useCallback((k, v) => setTourney(p => ({ ...p, [k]: v })), []);

  const variantInfo = GAME_VARIANTS.find(v => v.value === variant) || GAME_VARIANTS[0];
  const isCash = tab === 'regular';

  // ── Create handler ──
  const handleCreate = async () => {
    if (!club?.id) return;
    setCreating(true);
    try {
      if (isCash) {
        // Cash game → create-table API
        const bb = parseFloat(cash.bigBlind) || 2;
        const sb = parseFloat(cash.smallBlind) || 1;
        const result = await apiCall('/api/club-arena/create-table', {
          clubId: club.id,
          name: cash.name || `${variantInfo.label} ${sb}/${bb}`,
          gameType: 'cash',
          variant,
          smallBlind: sb, bigBlind: bb,
          maxPlayers: cash.tableSize,
          minBuyIn: cash.minBuyInBB * bb, maxBuyIn: cash.maxBuyInBB * bb,
          ante: parseFloat(cash.ante) || 0,
          actionTime: cash.actionTime,
          settings: {
            private_game: cash.privateGame, vip_only: cash.vipOnly,
            bomb_pot: cash.bombPot, double_board: cash.doubleBoard,
            triple_board: cash.tripleBoard, pineapple: cash.pineapple,
            seven_deuce: cash.sevenDeuce, nit_game: cash.nitGame,
            anonymous_table: cash.anonymousTable, cap: cash.cap,
            cap_amount: cash.capAmount, ban_chat: cash.banChat,
            label_new: cash.labelNew, featured_table: cash.featuredTable,
            no_rathole: cash.noRathole, calltime: cash.calltime,
            career_percent: cash.careerPercent, maintain_percent: cash.maintainPercent,
            maintain_hands: cash.maintainHands,
            auto_start_players: cash.autoStartPlayers,
            auto_extension: cash.autoExtension, auto_restart: cash.autoRestart,
            auto_create_table: cash.autoCreateTable,
            auto_utg_straddle: cash.autoUtgStraddle,
            voluntary_straddle: cash.voluntaryStraddle,
            straddle_enabled: cash.autoUtgStraddle || cash.voluntaryStraddle,
            insurance: cash.insurance, run_it_mode: cash.runItMode,
            run_it_twice: cash.runItMode === 'mandatory_twice' || cash.runItMode === 'player_choice',
            run_it_thrice: cash.runItMode === 'mandatory_thrice',
            rakePercent: cash.rakePercent ? parseFloat(cash.rakePercent) : undefined,
            fee_cap_bb: cash.feeCap,
            bbjPercent: cash.bbjPercent ? parseFloat(cash.bbjPercent) : undefined,
            same_agent_downline_limit: cash.sameAgentDownlineLimit,
            buy_in_authorization: cash.buyInAuthorization,
            restrict_device: cash.restrictDevice, restrict_observers: cash.restrictObservers,
            gps_restriction: cash.gpsRestriction, ip_restriction: cash.ipRestriction,
            emulator_restriction: cash.emulatorRestriction,
            photo_rotation_verification: cash.photoRotationVerification,
            hide_club_name: cash.hideClubName,
            game_length_hours: cash.gameLength, auto_muck: true,
          },
        });
        if (result?.table) onCreated?.(result.table);
      } else {
        // SNG or MTT → tournaments API
        const t = tourney;
        const type = tab; // 'sng' or 'mtt'
        const result = await apiCall('/api/club-arena/tournaments', {
          action: 'create',
          clubId: club.id,
          name: t.name || `${variantInfo.label} ${type.toUpperCase()}`,
          type,
          variant,
          buy_in: t.buyIn,
          starting_chips: t.startingChips,
          max_players: type === 'sng' ? t.tableSize : t.maxPlayers,
          settings: {
            vip_only: t.vipOnly, ban_chat: t.banChat,
            label_new: t.labelNew, table_size: t.tableSize,
            action_time: t.actionTime, fee_percent: t.fee,
            custom_buy_in: t.customBuyIn, blind_structure: t.blindStructure,
            payout_structure: t.payoutStructure, blinds_up_minutes: t.blindsUpMinutes,
            satellite: t.satellite, auto_restart: t.autoRestart,
            auto_create_table: t.autoCreateTable,
            restrict_device: t.restrictDevice, restrict_observers: t.restrictObservers,
            gps_restriction: t.gpsRestriction, ip_restriction: t.ipRestriction,
            emulator_restriction: t.emulatorRestriction,
            photo_rotation_verification: t.photoRotationVerification,
            hide_club_name: t.hideClubName,
            // MTT-specific
            private_game: t.privateGame, short_description: t.shortDescription,
            accelerated_mtt: t.acceleratedMTT, all_in_or_fold: t.allInOrFold,
            custom_rebuy_cost: t.customRebuyCost, number_of_rebuys: t.numberOfRebuys,
            add_on_multiplier: t.addOnMultiplier, custom_add_on: t.customAddOn,
            add_on_break_length: t.addOnBreakLength, ko_bounty: t.koBounty,
            gtd_prize_pool: t.gtdPrizePool, gtd_amount: t.gtdAmount,
            final_table_deal: t.finalTableDeal, big_blind_ante: t.bigBlindAnte,
            authorized_to_register: t.authorizedToRegister,
            late_registration_level: t.lateRegistrationLevel,
            early_bird_registration: t.earlyBirdRegistration,
            bubble_protection: t.bubbleProtection, featured_tournament: t.featuredTournament,
            min_players: t.minPlayers, max_players: t.maxPlayers,
            multi_day_mtt: t.multiDayMTT, save_start_time: t.saveStartTime,
            start_time: t.startTime, restart_tournament: t.restartTournament,
            tournament_schedule: t.tournamentSchedule,
            synchronized_breaks: t.synchronizedBreaks,
          },
        });
        onCreated?.(result);
      }
      onClose?.();
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  const currentName = isCash ? cash.name : tourney.name;
  const setName = (v) => isCash ? setCashField('name', v) : setTourneyField('name', v);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: FB.bg, borderRadius: 16, width: '100%', maxWidth: 440,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        border: `1px solid ${FB.border}`, boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
      }}>

        {/* ── HEADER ── */}
        <div style={{ padding: '14px 18px 0', borderBottom: `1px solid ${FB.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={onClose} style={{
                background: 'none', border: 'none', color: FB.textDim, fontSize: 16, cursor: 'pointer', padding: 0,
              }}>«</button>
              <h2 style={{ color: FB.textPrimary, fontSize: 16, fontWeight: 800, margin: 0 }}>
                {variantInfo.label}
              </h2>
            </div>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: FB.textDim, fontSize: 20, cursor: 'pointer',
            }}>✕</button>
          </div>

          {/* ── Regular | SNG | MTT tabs ── */}
          <div style={{ display: 'flex', gap: 4, paddingBottom: 10 }}>
            {[
              { key: 'regular', label: 'Regular' },
              { key: 'sng', label: 'SNG' },
              { key: 'mtt', label: 'MTT' },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: tab === t.key ? FB.warning : FB.elevated,
                color: tab === t.key ? '#000' : FB.textSecondary,
                fontSize: 13, fontWeight: 700, transition: 'all 0.2s',
              }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '0 18px',
          scrollbarWidth: 'thin', scrollbarColor: `${FB.elevated} transparent`,
        }}>

          {/* Name input */}
          <div style={{ padding: '12px 0 8px' }}>
            <input type="text" placeholder="Enter table name here..."
              value={currentName} onChange={e => setName(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', background: FB.cardBg,
                border: `1px solid ${FB.border}`, borderRadius: 8,
                color: FB.textPrimary, fontSize: 14, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Tab content */}
          {tab === 'regular' && <CashTab t={cash} set={setCashField} variant={variant} />}
          {tab === 'sng' && <SngTab t={tourney} set={setTourneyField} />}
          {tab === 'mtt' && <MttTab t={tourney} set={setTourneyField} />}

          <div style={{ height: 16 }} />
        </div>

        {/* ── FOOTER (Save + Start) ── */}
        <div style={{
          display: 'flex', gap: 10, padding: '14px 18px',
          borderTop: `1px solid ${FB.border}`,
        }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px', borderRadius: 10, border: `1px solid ${FB.warning}`,
            background: 'transparent', color: FB.warning, fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>
            Save
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

// ═══════════════════════════════════════════════════════════════
// MAIN EXPORT — orchestrates Screen 1 → Screen 2
// ═══════════════════════════════════════════════════════════════

export default function CreateGameModal({ club, onClose, onCreated, apiCall, initialTab, initialVariant }) {
  const [screen, setScreen] = useState(initialVariant ? 'config' : 'type_select');
  const [variant, setVariant] = useState(initialVariant || 'nlh');

  const handleVariantSelect = (v) => {
    setVariant(v);
    setScreen('config');
  };

  if (screen === 'type_select') {
    return <GameTypeSelector onSelect={handleVariantSelect} onClose={onClose} />;
  }

  return (
    <ConfigModal
      variant={variant}
      onClose={() => {
        if (initialVariant) { onClose(); } else { setScreen('type_select'); }
      }}
      onCreated={onCreated}
      club={club}
      apiCall={apiCall}
      initialTab={initialTab}
    />
  );
}
