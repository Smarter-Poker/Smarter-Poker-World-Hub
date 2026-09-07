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
import {
  buildCustomTrainingArenaHref,
  resolveCustomTrainingLaunch,
} from '../../../src/lib/training/customTrainingLaunchContract.mjs';

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
      stackDepth: 100,
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
      stackDepth: 100,
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
      stackDepth: 100,
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
      stackDepth: 100,
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
      stackDepth: 10,
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
      stackDepth: 100,
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

const STACK_DEPTHS = {
  cash: [20, 40, 60, 100, 200],
  mtt: [10, 20, 40, 60, 100],
  spins: [10, 20, 40, 60],
};

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
  const [stackDepth, setStackDepth] = useState(100);
  const [savedDrills, setSavedDrills] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Load saved drills
  const loadDrills = async () => {
    if (!getSupabase()) return;
    try {
      const { data: userData, error: userError } = await getSupabase().auth.getUser();
      if (userError) throw userError;
      if (!userData?.user) {
        setSaveError('Sign In To Load Saved Drills.');
        return;
      }
      const { data, error: loadError } = await getSupabase()
        .from('training_custom_drills')
        .select('*')
        .eq('user_id', userData.user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (loadError) throw loadError;
      if (data) setSavedDrills(data);
    } catch (e) {
      console.warn('[DrillBuilder] Load error:', e?.message || e);
      setSaveError('Saved Drills Could Not Be Loaded. Retry The Page Before Editing Them.');
    }
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
    setSelectedPositions((prev) => (prev.includes(pos) ? [] : [pos]));
  };

  const toggleStreet = (street) => {
    setSelectedStreets((prev) => (prev.includes(street) ? [] : [street]));
  };

  const selectFormat = (nextFormat) => {
    setFormat(nextFormat);
    if (!STACK_DEPTHS[nextFormat].includes(stackDepth)) {
      setStackDepth(nextFormat === 'cash' ? 100 : nextFormat === 'mtt' ? 40 : 20);
    }
  };

  const applyPreset = (preset) => {
    setDrillName(preset.name);
    setFormat(preset.config.format);
    setSelectedPositions(preset.config.positions);
    setSelectedStreets(preset.config.streets);
    setStackDepth(preset.config.stackDepth);
  };

  const saveDrill = async () => {
    if (!drillName.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const client = getSupabase();
      if (!client) throw new Error('Training Storage Is Unavailable.');
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError) throw userError;
      if (!userData?.user) throw new Error('Sign In To Save A Drill.');

      const config = {
        format,
        positions: selectedPositions,
        streets: selectedStreets,
        stackDepth,
      };
      const launch = resolveCustomTrainingLaunch(config);

      const { data: saved, error } = await client.from('training_custom_drills').insert({
        user_id: userData.user.id,
        title: drillName.trim(),
        description: `Focused ${format.toUpperCase()} solver training`,
        drill_type: 'focused_solver',
        config: { ...config, canonicalGameId: launch.gameId },
      }).select('*').single();
      if (error) throw error;

      setSavedDrills((prev) => [saved, ...prev]);
      setDrillName('');
      eventBus?.emit?.(
        'training:drill-saved',
        { title: saved.title, config: saved.config },
        'DrillBuilder'
      );
    } catch (e) {
      console.warn('[DrillBuilder] Save error:', e?.message || e);
      setSaveError(e?.message || 'The Drill Could Not Be Saved.');
    } finally {
      setSaving(false);
    }
  };

  const startDrill = (config) => {
    router.push(buildCustomTrainingArenaHref(config, 'drill-builder'));
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
            \U2190
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--sp-fg)' }}>
              Custom Drill Builder
            </div>
            <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>Create Focused Practice Sessions</div>
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
          {saveError && (
            <div role="alert" style={{
              marginBottom: 14, padding: '10px 12px', borderRadius: 8,
              border: '1px solid rgba(248,113,113,0.35)',
              background: 'rgba(127,29,29,0.14)', color: '#fca5a5', fontSize: 12,
            }}>
              {saveError}
            </div>
          )}
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
                    onClick={() => selectFormat(f.id)}
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
                Position (Choose One Or Leave Empty For Any)
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
                Street (Choose One Or Leave Empty For All)
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

            {/* Exact supported stack */}
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
                Stack Depth (Big Blinds)
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {STACK_DEPTHS[format].map((depth) => (
                  <Chip
                    key={depth}
                    label={`${depth}BB`}
                    selected={stackDepth === depth}
                    onClick={() => setStackDepth(depth)}
                    color="var(--sp-accent-amber)"
                  />
                ))}
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
                    stackDepth,
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
                      {drill.title || drill.name}
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
