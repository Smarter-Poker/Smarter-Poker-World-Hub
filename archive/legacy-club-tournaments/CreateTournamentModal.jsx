/**
 * CreateTournamentModal — Comprehensive SNG + MTT creation
 * ═══════════════════════════════════════════════════════════════════════
 * Matches premium feature-for-feature from Images 7-12:
 * 
 * SNG: VIP Only, Satellite, Ban Chat, Label NEW, Table Size, Action Time,
 *      Auto Restart, Auto Create, Fee %, Buy-in, Blind Structure (Slow/Standard/
 *      Turbo/HyperTurbo), Payout Structure, Starting Chips, Blinds Up timer,
 *      Restrictions (Device, Observers, GPS, IP, Emulator, Hide Club Name)
 * 
 * MTT: All SNG settings PLUS: Private, Short Description, Accelerated MTT,
 *      All-in or Fold, Custom Rebuy/Re-entry, Number of Rebuys, Add-on,
 *      Add-on Break Length, KO Bounty, GTD Prize Pool, Final Table Deal,
 *      Big-Blind Ante, Authorized to Register, Late Registration level,
 *      Early Bird Registration, Bubble Protection, Featured Tournament,
 *      Player Number (min-max), Multi-Day MTT, Start Time, Tournament Schedule,
 *      Synchronized Breaks, Restart Tournament
 */

import React, { useState, useCallback } from 'react';

const FB = {
  bg: '#18191A', cardBg: '#242526', elevated: '#3A3B3C',
  border: '#3E4042', primary: '#1877F2', success: '#31A24C',
  warning: '#F5A623', danger: '#FA383E',
  textPrimary: '#E4E6EB', textSecondary: '#B0B3B8', textDim: '#65676B',
};

const VARIANTS = [
  { value: 'nlh', label: 'NLH' }, { value: 'flh', label: 'FLH' },
  { value: 'short_deck', label: '6+' }, { value: 'plo4', label: 'PLO' },
  { value: 'plo5', label: 'PLO5' }, { value: 'plo6', label: 'PLO6' },
  { value: 'plo8', label: 'Hi/Lo' }, { value: 'flo', label: 'FLO' },
  { value: 'mixed', label: 'Mixed' }, { value: 'ofc', label: 'OFC' },
];

const DEFAULT_TOURNAMENT = {
  name: '',
  type: 'sng', // sng | mtt
  variant: 'nlh',
  // ── Common Settings ──
  vipOnly: false,
  banChat: false,
  labelNew: false,
  tableSize: 9,
  actionTime: 15,
  fee: 10,
  buyIn: 100,
  customBuyIn: false,
  blindStructure: 'standard', // slow | standard | turbo | hyper_turbo
  payoutStructure: 'standard', // standard | top_heavy | winner_take_all | satellite
  startingChips: 1000,
  blindsUpMinutes: 3,
  // ── SNG Specific (Image 7-8) ──
  satellite: false,
  autoRestart: false,
  autoCreateTable: false,
  // ── Security (shared) ──
  restrictDevice: true,
  restrictObservers: false,
  gpsRestriction: true,
  ipRestriction: true,
  emulatorRestriction: false,
  photoRotationVerification: false,
  hideClubName: false,
  // ── MTT Specific (Images 9-12) ──
  privateGame: false,
  shortDescription: '',
  acceleratedMTT: false,
  allInOrFold: false,
  // Rebuy/Re-entry
  customRebuyCost: false,
  numberOfRebuys: 3,
  // Add-on
  addOnMultiplier: 1.0,
  customAddOn: false,
  addOnBreakLength: 1, // minutes
  // Special modes
  // ── Bounty System ──
  bountyType: 'none', // 'none' | 'ko' | 'pko' | 'mystery'
  bountyPercent: 25,  // % of buy-in allocated to bounties
  mysteryThreshold: 25, // % of field remaining to activate mystery phase
  gtdPrizePool: false,
  gtdAmount: 0,
  finalTableDeal: false,
  bigBlindAnte: false,
  authorizedToRegister: false,
  // Registration
  lateRegistrationLevel: 6,
  earlyBirdRegistration: false,
  bubbleProtection: false,
  featuredTournament: false,
  // Player count
  minPlayers: 30,
  maxPlayers: 300,
  // Schedule
  multiDayMTT: false,
  saveStartTime: false,
  startTime: '',
  restartTournament: false,
  tournamentSchedule: false,
  synchronizedBreaks: true,
};

// ═══════════════════════════════════════════════════════════════
// REUSABLE COMPONENTS
// ═══════════════════════════════════════════════════════════════

function Section({ label }) {
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

function Radio4({ label, value, onChange, options, help }) {
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
              width: 14, height: 14, borderRadius: 7, border: `2px solid ${value === o.value ? FB.warning : FB.textDim}`,
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

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function CreateTournamentModal({ club, onClose, onCreated, apiCall }) {
  const [t, setT] = useState({ ...DEFAULT_TOURNAMENT });
  const [creating, setCreating] = useState(false);

  const set = useCallback((k, v) => setT(p => ({ ...p, [k]: v })), []);

  const handleCreate = async () => {
    if (!club?.id) return;
    setCreating(true);
    try {
      const result = await apiCall('/api/club-arena/tournaments', {
        action: 'create',
        clubId: club.id,
        name: t.name || `${t.variant.toUpperCase()} ${t.type.toUpperCase()}`,
        type: t.type,
        variant: t.variant,
        buy_in: t.buyIn,
        starting_chips: t.startingChips,
        max_players: t.type === 'sng' ? t.tableSize : t.maxPlayers,
        settings: {
          // Common
          vip_only: t.vipOnly,
          ban_chat: t.banChat,
          label_new: t.labelNew,
          table_size: t.tableSize,
          action_time: t.actionTime,
          fee_percent: t.fee,
          custom_buy_in: t.customBuyIn,
          blind_structure: t.blindStructure,
          payout_structure: t.payoutStructure,
          blinds_up_minutes: t.blindsUpMinutes,
          // SNG specific
          satellite: t.satellite,
          auto_restart: t.autoRestart,
          auto_create_table: t.autoCreateTable,
          // Security
          restrict_device: t.restrictDevice,
          restrict_observers: t.restrictObservers,
          gps_restriction: t.gpsRestriction,
          ip_restriction: t.ipRestriction,
          emulator_restriction: t.emulatorRestriction,
          photo_rotation_verification: t.photoRotationVerification,
          hide_club_name: t.hideClubName,
          // MTT specific
          private_game: t.privateGame,
          short_description: t.shortDescription,
          accelerated_mtt: t.acceleratedMTT,
          all_in_or_fold: t.allInOrFold,
          custom_rebuy_cost: t.customRebuyCost,
          number_of_rebuys: t.numberOfRebuys,
          add_on_multiplier: t.addOnMultiplier,
          custom_add_on: t.customAddOn,
          add_on_break_length: t.addOnBreakLength,
          // ── Bounty System ──
          bounty_type: t.bountyType,
          bounty_percent: t.bountyPercent,
          bounty_amount: Math.floor(t.buyIn * t.bountyPercent / 100),
          mystery_threshold: t.mysteryThreshold,
          gtd_prize_pool: t.gtdPrizePool,
          gtd_amount: t.gtdAmount,
          final_table_deal: t.finalTableDeal,
          big_blind_ante: t.bigBlindAnte,
          authorized_to_register: t.authorizedToRegister,
          late_registration_level: t.lateRegistrationLevel,
          early_bird_registration: t.earlyBirdRegistration,
          bubble_protection: t.bubbleProtection,
          featured_tournament: t.featuredTournament,
          min_players: t.minPlayers,
          max_players: t.maxPlayers,
          multi_day_mtt: t.multiDayMTT,
          save_start_time: t.saveStartTime,
          start_time: t.startTime,
          restart_tournament: t.restartTournament,
          tournament_schedule: t.tournamentSchedule,
          synchronized_breaks: t.synchronizedBreaks,
        },
      });
      onCreated?.(result);
      onClose?.();
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  const isMTT = t.type === 'mtt';

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

        {/* ── HEADER with type tabs ── */}
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${FB.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h2 style={{ color: FB.textPrimary, fontSize: 16, fontWeight: 800, margin: 0 }}>
              🏆 Create Tournament
            </h2>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: FB.textDim, fontSize: 20, cursor: 'pointer',
            }}>✕</button>
          </div>
          {/* SNG / MTT tabs (Regular|SNG|MTT) */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[{ key: 'sng', label: 'SNG' }, { key: 'mtt', label: 'MTT' }].map(tab => (
              <button key={tab.key} onClick={() => set('type', tab.key)} style={{
                flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: t.type === tab.key ? FB.warning : FB.elevated,
                color: t.type === tab.key ? '#000' : FB.textSecondary,
                fontSize: 13, fontWeight: 700,
              }}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '0 18px',
          scrollbarWidth: 'thin', scrollbarColor: `${FB.elevated} transparent`,
        }}>

          {/* Name */}
          <div style={{ padding: '12px 0 8px' }}>
            <input type="text" placeholder="Enter table name here..."
              value={t.name} onChange={e => set('name', e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', background: FB.cardBg,
                border: `1px solid ${FB.border}`, borderRadius: 8,
                color: FB.textPrimary, fontSize: 14, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Variant selector */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
            {VARIANTS.map(v => (
              <button key={v.value} onClick={() => set('variant', v.value)} style={{
                padding: '4px 10px', borderRadius: 6,
                border: `1px solid ${t.variant === v.value ? FB.warning : FB.border}`,
                background: t.variant === v.value ? `${FB.warning}22` : FB.cardBg,
                color: t.variant === v.value ? FB.warning : FB.textSecondary,
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}>
                {v.label}
              </button>
            ))}
          </div>

          {/* ════ MTT-ONLY: Description, Privacy ════ */}
          {isMTT && (
            <>
              <Section label="Tournament Info" />
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
            </>
          )}

          {/* ════ SHARED: General Toggles ════ */}
          <Section label="General Settings" />
          {!isMTT && <Toggle label="VIP Only" value={t.vipOnly} onChange={v => set('vipOnly', v)} />}
          <Toggle label={isMTT ? "Next Step (Satellite)" : "Next Step (Satellite)"} value={t.satellite} onChange={v => set('satellite', v)} help />
          {isMTT && <Toggle label="Accelerated MTT" value={t.acceleratedMTT} onChange={v => set('acceleratedMTT', v)} help />}
          <Toggle label="Ban Chat" value={t.banChat} onChange={v => set('banChat', v)} />
          {isMTT && <Toggle label="All-in or Fold" value={t.allInOrFold} onChange={v => set('allInOrFold', v)} help />}
          <Toggle label="Label as NEW" value={t.labelNew} onChange={v => set('labelNew', v)} help />

          {/* ════ TABLE / SIZE ════ */}
          <Section label="Table & Time" />
          <Slider label="Table Size" value={t.tableSize} onChange={v => set('tableSize', v)} min={2} max={10} suffix=" max" />
          <Slider label="Action Time" value={t.actionTime} onChange={v => set('actionTime', v)} min={5} max={60} suffix=" sec" />

          {/* ════ AUTO SETTINGS (SNG) ════ */}
          {!isMTT && (
            <>
              <Toggle label="Auto Restart" value={t.autoRestart} onChange={v => set('autoRestart', v)} />
              <Toggle label="Auto Create Table" value={t.autoCreateTable} onChange={v => set('autoCreateTable', v)} help />
            </>
          )}

          {/* ════ FEE & BUY-IN ════ */}
          <Section label="Buy-in & Fee" />
          <Slider label="Fee" value={t.fee} onChange={v => set('fee', v)} min={0} max={25} suffix="%" />
          <Slider label="Buy-in" value={t.buyIn} onChange={v => set('buyIn', v)} min={10} max={10000} step={10} />
          <Toggle label="Custom Buy-in" value={t.customBuyIn} onChange={v => set('customBuyIn', v)} />

          {/* ════ MTT: REBUY & ADD-ON (Image 10) ════ */}
          {isMTT && (
            <>
              <Section label="Rebuy & Add-on" />
              <Toggle label="Custom Rebuy/Re-entry Cost" value={t.customRebuyCost} onChange={v => set('customRebuyCost', v)} />
              <Slider label="Number of Rebuys/Re-entries" value={t.numberOfRebuys} onChange={v => set('numberOfRebuys', v)} min={0} max={10} />
              <Slider label="Add-on" value={t.addOnMultiplier} onChange={v => set('addOnMultiplier', v)} min={0} max={5} step={0.5}
                format={v => `${v}x`} />
              <Toggle label="Custom Add-on" value={t.customAddOn} onChange={v => set('customAddOn', v)} />
              <Slider label="Add-on Break Length" value={t.addOnBreakLength} onChange={v => set('addOnBreakLength', v)} min={0} max={10} suffix=" min" />
            </>
          )}

          {/* ════ MTT: SPECIAL MODES (Image 11) ════ */}
          {isMTT && (
            <>
              <Section label="Bounty Format" />
              <Radio4 label="Bounty Type" value={t.bountyType} onChange={v => set('bountyType', v)}
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'ko', label: 'KO' },
                  { value: 'pko', label: 'PKO' },
                  { value: 'mystery', label: 'Mystery' },
                ]}
              />
              {t.bountyType !== 'none' && (
                <Slider label="Bounty %" value={t.bountyPercent} onChange={v => set('bountyPercent', v)}
                  min={10} max={50} step={5} suffix="%"
                />
              )}
              {t.bountyType !== 'none' && (
                <div style={{ padding: '4px 0 8px', borderBottom: `1px solid ${FB.border}22` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: FB.textSecondary }}>Bounty per player</span>
                    <span style={{ color: FB.warning, fontWeight: 700 }}>
                      {Math.floor(t.buyIn * t.bountyPercent / 100).toLocaleString()} chips
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 2 }}>
                    <span style={{ color: FB.textSecondary }}>Prize pool per player</span>
                    <span style={{ color: FB.textPrimary, fontWeight: 600 }}>
                      {(t.buyIn - Math.floor(t.buyIn * t.bountyPercent / 100)).toLocaleString()} chips
                    </span>
                  </div>
                </div>
              )}
              {t.bountyType === 'mystery' && (
                <>
                  <Slider label="Mystery Phase Activation" value={t.mysteryThreshold}
                    onChange={v => set('mysteryThreshold', v)}
                    min={0} max={50} step={5}
                    format={v => v === 0 ? 'Immediate' : `Top ${v}%`}
                  />
                  <div style={{
                    background: `${FB.elevated}88`, borderRadius: 8, padding: '8px 12px',
                    marginTop: 4, marginBottom: 8, border: `1px solid ${FB.border}`,
                  }}>
                    <div style={{ fontSize: 11, color: FB.warning, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase' }}>
                      Mystery Prize Tiers
                    </div>
                    {[
                      { label: 'Min Prize', pct: '50%', color: '#6b7280' },
                      { label: 'Small Prize', pct: '20%', color: '#60a5fa' },
                      { label: 'Medium Prize', pct: '15%', color: '#34d399' },
                      { label: 'Large Prize', pct: '8%', color: '#fbbf24' },
                      { label: 'Huge Prize', pct: '4%', color: '#f97316' },
                      { label: 'Mega Prize', pct: '2%', color: '#ef4444' },
                      { label: 'Grand Prize', pct: '0.8%', color: '#a855f7' },
                      { label: 'JACKPOT', pct: '0.2%', color: '#FFD700' },
                    ].map(tier => (
                      <div key={tier.label} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '2px 0', fontSize: 11,
                      }}>
                        <span style={{ color: tier.color, fontWeight: 600 }}>{tier.label}</span>
                        <span style={{ color: FB.textDim }}>{tier.pct}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <Section label="Special Modes" />
              <Toggle label="GTD Prize Pool" value={t.gtdPrizePool} onChange={v => set('gtdPrizePool', v)} />
              {t.gtdPrizePool && (
                <Slider label="GTD Amount" value={t.gtdAmount} onChange={v => set('gtdAmount', v)} min={0} max={100000} step={100} />
              )}
              <Toggle label="Final Table Deal" value={t.finalTableDeal} onChange={v => set('finalTableDeal', v)} help />
              <Toggle label="Big-Blind Ante" value={t.bigBlindAnte} onChange={v => set('bigBlindAnte', v)} />
              <Toggle label="Authorized to Register" value={t.authorizedToRegister} onChange={v => set('authorizedToRegister', v)} />
            </>
          )}

          {/* ════ BLIND STRUCTURE (shared — Image 8, 11) ════ */}
          <Section label="Blind Structure" />
          <Radio4 label="Blind Structure" value={t.blindStructure} onChange={v => set('blindStructure', v)} help
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

          {/* ════ MTT: REGISTRATION (Image 12) ════ */}
          {isMTT && (
            <>
              <Section label="Registration" />
              <Slider label="Late Registration" value={t.lateRegistrationLevel} onChange={v => set('lateRegistrationLevel', v)}
                min={0} max={20} format={v => `Level ${v}`} />
              <Toggle label="Early Bird Registration" value={t.earlyBirdRegistration} onChange={v => set('earlyBirdRegistration', v)} help />
              <Toggle label="Bubble Protection" value={t.bubbleProtection} onChange={v => set('bubbleProtection', v)} />
              <Toggle label="Featured Tournament" value={t.featuredTournament} onChange={v => set('featuredTournament', v)} />

              <Section label="Player Count" />
              <div style={{ padding: '8px 0', borderBottom: `1px solid ${FB.border}22` }}>
                <div style={{ color: FB.textPrimary, fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                  Player Number: {t.minPlayers} - {t.maxPlayers}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="range" min={2} max={500} value={t.minPlayers}
                    onChange={e => { const v = parseInt(e.target.value); if (v <= t.maxPlayers) set('minPlayers', v); }}
                    style={{ flex: 1, height: 6, appearance: 'none', background: FB.elevated, borderRadius: 3, accentColor: FB.warning }}
                  />
                  <input type="range" min={2} max={500} value={t.maxPlayers}
                    onChange={e => { const v = parseInt(e.target.value); if (v >= t.minPlayers) set('maxPlayers', v); }}
                    style={{ flex: 1, height: 6, appearance: 'none', background: FB.elevated, borderRadius: 3, accentColor: FB.warning }}
                  />
                </div>
              </div>

              <Section label="Schedule" />
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
              <Toggle label="Synchronized Breaks" value={t.synchronizedBreaks} onChange={v => set('synchronizedBreaks', v)} />
            </>
          )}

          {/* ════ SECURITY (shared — Images 5, 7, 8) ════ */}
          <Section label="Security & Restrictions" />
          <Toggle label="Restrict Device" value={t.restrictDevice} onChange={v => set('restrictDevice', v)} help />
          <Toggle label="Restrict Observers" value={t.restrictObservers} onChange={v => set('restrictObservers', v)} />
          <Toggle label="GPS Restriction" value={t.gpsRestriction} onChange={v => set('gpsRestriction', v)} />
          <Toggle label="IP Restriction" value={t.ipRestriction} onChange={v => set('ipRestriction', v)} />
          <Toggle label="PC Emulator Restriction" value={t.emulatorRestriction} onChange={v => set('emulatorRestriction', v)} />
          {isMTT && <Toggle label="Photo Rotation Verification" value={t.photoRotationVerification} onChange={v => set('photoRotationVerification', v)} help />}
          <Toggle label="Hide Club Name" value={t.hideClubName} onChange={v => set('hideClubName', v)} />

          <div style={{ height: 16 }} />
        </div>

        {/* ── FOOTER (Save + Start) ── */}
        <div style={{
          display: 'flex', gap: 10, padding: '14px 18px',
          borderTop: `1px solid ${FB.border}`,
        }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px', borderRadius: 10, border: `1px solid ${FB.border}`,
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
