/**
 * CUSTOM DRILL BUILDER — GTO Wizard-Style Practice Drills
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Create focused practice drills targeting specific weaknesses.
 * Select format, positions, streets, stack depths, hand categories.
 * Quick presets for common study scenarios.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-10 — hex sweep batch 5: literals routed to --sp-* tokens
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType, busEmit } from '../../../src/engine/EventBus';
import ConnectionToast from '../../../src/components/training/ConnectionToast';

let _supabase = null;
function getSupabase() {
  if (typeof window === 'undefined') return null;
  if (!_supabase) {
    const { createClient } = require('@supabase/supabase-js');
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return _supabase;
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// DRILL PRESETS
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const PRESETS = [
  {
    id: 'bb-defense',
    name: 'BB Defense',
    desc: 'Practice defending your Big-Blind vs opens',
    config: {
      format: 'cash',
      positions: ['BB'],
      streets: ['preflop'],
      stackMin: 80,
      stackMax: 200,
      scenarios: ['vs_raise'],
    },
    color: 'var(--sp-accent-blue)',
  },
  {
    id: 'btn-opens',
    name: 'BTN Opens',
    desc: 'Master your button opening range',
    config: {
      format: 'cash',
      positions: ['BTN'],
      streets: ['preflop'],
      stackMin: 80,
      stackMax: 200,
      scenarios: ['rfi'],
    },
    color: 'var(--sp-accent-green)',
  },
  {
    id: '3bet-pots',
    name: '3-Bet Pots',
    desc: 'Navigate postflop in 3-bet pots',
    config: {
      format: 'cash',
      positions: [],
      streets: ['flop', 'turn'],
      stackMin: 80,
      stackMax: 200,
      scenarios: ['3bet_pot'],
    },
    color: 'var(--sp-accent-purple)',
  },
  {
    id: 'cbet-spots',
    name: 'C-Bet Spots',
    desc: 'Learn when to continuation bet and when to check',
    config: {
      format: 'cash',
      positions: [],
      streets: ['flop'],
      stackMin: 80,
      stackMax: 200,
      scenarios: ['cbet'],
    },
    color: 'var(--sp-accent-orange)',
  },
  {
    id: 'mtt-push-fold',
    name: 'MTT Push/Fold',
    desc: 'Short stack tournament shove or fold decisions',
    config: {
      format: 'mtt',
      positions: [],
      streets: ['preflop'],
      stackMin: 5,
      stackMax: 20,
      scenarios: ['push_fold'],
    },
    color: 'var(--sp-accent-red)',
  },
  {
    id: 'river-decisions',
    name: 'River Decisions',
    desc: 'Tough river spots: value bet, bluff, or give up',
    config: {
      format: 'cash',
      positions: [],
      streets: ['river'],
      stackMin: 50,
      stackMax: 200,
      scenarios: ['river'],
    },
    color: 'var(--sp-accent-amber)',
  },
];

const FORMATS = [
  { id: 'cash', label: 'Cash Game' },
  { id: 'mtt', label: 'Tournament' },
  { id: 'spins', label: 'Spins' },
];

const POSITIONS = ['BTN', 'CO', 'HJ', 'MP', 'UTG', 'SB', 'BB'];

const STREETS = [
  { id: 'preflop', label: 'Preflop' },
  { id: 'flop', label: 'Flop' },
  { id: 'turn', label: 'Turn' },
  { id: 'river', label: 'River' },
];

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// CHIP BUTTON
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function Chip({ label, selected, onClick, color = 'var(--sp-accent-cyan)' }) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      style={{
        padding: '8px 16px',
        borderRadius: 8,
        border: `1px solid ${selected ? `${color}55` : 'rgba(255,255,255,0.08)'}`,
        background: selected ? `${color}15` : 'rgba(255,255,255,0.03)',
        color: selected ? color : 'var(--sp-fg-muted)',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      {label}
    </motion.button>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MAIN PAGE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function DrillBuilderPage() {
  const router = useRouter();
  useTrainingBus('drill-builder');
  const [drillName, setDrillName] = useState('');
  const [format, setFormat] = useState('cash');
  const [selectedPositions, setSelectedPositions] = useState([]);
  const [selectedStreets, setSelectedStreets] = useState([]);
  const [stackMin, setStackMin] = useState(80);
  const [stackMax, setStackMax] = useState(200);
  const [savedDrills, setSavedDrills] = useState([]);
  const [saving, setSaving] = useState(false);

  // Load saved drills
  const loadDrills = async () => {
    if (!getSupabase()) return;
    try {
      const { data: userData } = await getSupabase().auth.getUser();
      if (!userData?.user) return;
      const { data } = await getSupabase()
        .from('training_custom_drills')
        .select('*')
        .eq('user_id', userData.user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) setSavedDrills(data);
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
  };

  useEffect(() => {
    loadDrills();
  }, []);

  // Bus Listeners — refresh drills when session completes
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', () => loadDrills());
    return unsub;
  }, []);

  const togglePosition = (pos) => {
    setSelectedPositions((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );
  };

  const toggleStreet = (street) => {
    setSelectedStreets((prev) =>
      prev.includes(street) ? prev.filter((s) => s !== street) : [...prev, street]
    );
  };

  const applyPreset = (preset) => {
    setDrillName(preset.name);
    setFormat(preset.config.format);
    setSelectedPositions(preset.config.positions);
    setSelectedStreets(preset.config.streets);
    setStackMin(preset.config.stackMin);
    setStackMax(preset.config.stackMax);
  };

  const saveDrill = async () => {
    if (!drillName.trim()) return;
    setSaving(true);
    try {
      const { data: userData } = await getSupabase().auth.getUser();
      if (!userData?.user) return;

      const config = {
        format,
        positions: selectedPositions,
        streets: selectedStreets,
        stackMin,
        stackMax,
      };

      const { error } = await getSupabase().from('training_custom_drills').insert({
        user_id: userData.user.id,
        name: drillName.trim(),
        config,
      });

      if (!error) {
        setSavedDrills((prev) => [
          { name: drillName, config, created_at: new Date().toISOString() },
          ...prev,
        ]);
        setDrillName('');
        // Bus Event — notify other pages
        eventBus?.emit?.(
          'training:drill-saved',
          { name: drillName.trim(), config },
          'DrillBuilder'
        );
      }
    } catch (e) {
      console.warn('[DrillBuilder] Save error:', e);
    }
    setSaving(false);
  };

  const startDrill = (config) => {
    // Navigate to arena with drill config as query params
    const params = new URLSearchParams({
      format: config.format || 'cash',
      positions: (config.positions || []).join(','),
      streets: (config.streets || []).join(','),
      stackMin: config.stackMin || 80,
      stackMax: config.stackMax || 200,
    });
    router.push(`/hub/training/arena/spot-trainer?${params.toString()}`);
  };

  return (
    <>
      <Head>
        <title>Drill Builder | Smarter.Poker GTO Training</title>
      </Head>
      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <button
            onClick={() => router.push('/hub/training')}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: 'none',
              color: 'var(--sp-fg-muted)',
              fontSize: 18,
              cursor: 'pointer',
              width: 36,
              height: 36,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            \u2190
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--sp-fg)' }}>
              Custom Drill Builder
            </div>
            <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>Create focused practice sessions</div>
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
          {/* Quick Presets */}
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--sp-fg-dim)',
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 10,
              }}
            >
              Quick Presets
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {PRESETS.map((preset) => (
                <motion.button
                  key={preset.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => applyPreset(preset)}
                  style={{
                    padding: '14px 12px',
                    borderRadius: 10,
                    textAlign: 'left',
                    background: 'rgba(0,0,0,0.2)',
                    border: `1px solid ${preset.color}22`,
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{ fontSize: 13, fontWeight: 700, color: preset.color, marginBottom: 2 }}
                  >
                    {preset.name}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--sp-fg-dim)' }}>{preset.desc}</div>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Custom Builder */}
          <div
            style={{
              padding: '20px 16px',
              borderRadius: 12,
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid rgba(255,255,255,0.05)',
              marginBottom: 24,
            }}
          >
            {/* Drill Name */}
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--sp-fg-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 6,
                }}
              >
                Drill Name
              </div>
              <input
                value={drillName}
                onChange={(e) => setDrillName(e.target.value)}
                placeholder="e.g., SB vs BB 3-Bet Defense"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'var(--sp-fg)',
                  fontSize: 13,
                  outline: 'none',
                  fontFamily: "'Inter', -apple-system, sans-serif",
                }}
              />
            </div>

            {/* Format */}
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--sp-fg-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 6,
                }}
              >
                Format
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {FORMATS.map((f) => (
                  <Chip
                    key={f.id}
                    label={f.label}
                    selected={format === f.id}
                    onClick={() => setFormat(f.id)}
                  />
                ))}
              </div>
            </div>

            {/* Positions */}
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--sp-fg-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 6,
                }}
              >
                Positions (empty = all)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {POSITIONS.map((pos) => (
                  <Chip
                    key={pos}
                    label={pos}
                    selected={selectedPositions.includes(pos)}
                    onClick={() => togglePosition(pos)}
                    color="#a855f7"
                  />
                ))}
              </div>
            </div>

            {/* Streets */}
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--sp-fg-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 6,
                }}
              >
                Streets (empty = all)
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {STREETS.map((s) => (
                  <Chip
                    key={s.id}
                    label={s.label}
                    selected={selectedStreets.includes(s.id)}
                    onClick={() => toggleStreet(s.id)}
                    color="#22c55e"
                  />
                ))}
              </div>
            </div>

            {/* Stack Range */}
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--sp-fg-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 6,
                }}
              >
                Stack Depth (BB)
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="number"
                  value={stackMin}
                  onChange={(e) => setStackMin(Number(e.target.value))}
                  style={{
                    width: 80,
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'var(--sp-fg)',
                    fontSize: 13,
                    textAlign: 'center',
                    outline: 'none',
                  }}
                />
                <span style={{ color: 'var(--sp-fg-faint)' }}>to</span>
                <input
                  type="number"
                  value={stackMax}
                  onChange={(e) => setStackMax(Number(e.target.value))}
                  style={{
                    width: 80,
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'var(--sp-fg)',
                    fontSize: 13,
                    textAlign: 'center',
                    outline: 'none',
                  }}
                />
                <span style={{ fontSize: 11, color: 'var(--sp-fg-faint)' }}>BB</span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={saveDrill}
                disabled={saving || !drillName.trim()}
                style={{
                  flex: 1,
                  padding: '12px 0',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)',
                  color: drillName.trim() ? 'var(--sp-fg)' : 'var(--sp-fg-faint)',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {saving ? 'Saving...' : 'Save Drill'}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() =>
                  startDrill({
                    format,
                    positions: selectedPositions,
                    streets: selectedStreets,
                    stackMin,
                    stackMax,
                  })
                }
                style={{
                  flex: 1,
                  padding: '12px 0',
                  borderRadius: 10,
                  border: '1px solid rgba(0,212,255,0.3)',
                  background:
                    'linear-gradient(180deg, rgba(0,212,255,0.15) 0%, rgba(0,212,255,0.05) 100%)',
                  color: 'var(--sp-accent-cyan)',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Start Drill
              </motion.button>
            </div>
          </div>

          {/* Saved Drills */}
          {savedDrills.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--sp-fg-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  marginBottom: 10,
                }}
              >
                Saved Drills
              </div>
              {savedDrills.map((drill, i) => (
                <motion.button
                  key={drill.id || i}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => startDrill(drill.config)}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: 10,
                    marginBottom: 8,
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sp-fg)' }}>
                      {drill.name}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--sp-fg-dim)', marginTop: 2 }}>
                      {drill.config?.format?.toUpperCase()} |{' '}
                      {(drill.config?.positions || []).join(', ') || 'All Positions'} |{' '}
                      {(drill.config?.streets || []).join(', ') || 'All Streets'}
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '4px 12px',
                      borderRadius: 6,
                      background: 'rgba(0,212,255,0.08)',
                      border: '1px solid rgba(0,212,255,0.15)',
                      color: 'var(--sp-accent-cyan)',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    Play
                  </span>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </div>
      <ConnectionToast />
    </>
  );
}