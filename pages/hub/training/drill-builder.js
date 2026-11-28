/**
 * CUSTOM DRILL BUILDER — GTO Wizard-Style Practice Drills
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Create focused practice drills targeting specific weaknesses.
 * Select format, positions, streets, stack depths, hand categories.
 * Quick presets for common study scenarios.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-10 — hex sweep batch 5: literals routed to --sp-* tokens
import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType, busEmit } from '../../../src/engine/EventBus';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import {
  buildCustomTrainingArenaHref,
  resolveCustomTrainingLaunch,
} from '../../../src/lib/training/customTrainingLaunchContract.mjs';
import { encodeSharedDrillPack } from '../../../src/lib/training/trainingPresets.mjs';




import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import st from '../../../src/styles/training/study-tools.module.css';
import { createResilientWebSocketTransport, hardenSupabaseRealtime } from '../../../src/lib/realtimeTransportGuard';

let _supabase = null;
function getSupabase() {
  if (typeof window === 'undefined') return null;
  if (!_supabase) {
    const { createClient } = require('@supabase/supabase-js');
    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
    _supabase = typeof window !== 'undefined' ? hardenSupabaseRealtime(createClient(url, key, { realtime: { transport: createResilientWebSocketTransport() } })) : null;
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
    color: '#86daff',
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
    color: '#86daff',
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
      variant: 'nlh',
      positions: [],
      streets: ['river'],
      stackMin: 50,
      stackMax: 200,
      stackDepth: 100,
      scenarios: ['river'],
    },
    color: '#86daff',
  },
  {
    id: 'plo4-pot-limit',
    name: 'PLO4 Pot-Limit Lab',
    desc: '4-Card Omaha nut-draw, wrap, and pot-sizing mastery',
    config: {
      format: 'cash',
      variant: 'plo4',
      positions: ['BTN'],
      streets: ['flop'],
      stackMin: 100,
      stackMax: 100,
      stackDepth: 100,
      scenarios: ['cbet'],
    },
    color: 'var(--sp-accent-cyan)',
  },
  {
    id: 'plo5-wrap-lab',
    name: 'PLO5 5-Card Action',
    desc: '5-Card PLO redraw equity and pot-limit pressure',
    config: {
      format: 'cash',
      variant: 'plo5',
      positions: ['BTN'],
      streets: ['flop'],
      stackMin: 100,
      stackMax: 100,
      stackDepth: 100,
      scenarios: ['cbet'],
    },
    color: '#86daff',
  },
  {
    id: 'plo6-double-board-prep',
    name: 'PLO6 Double-Board Prep',
    desc: '6-Card PLO nut-exclusivity, blocker pressure, and pot-limit math',
    config: {
      format: 'cash',
      variant: 'plo6',
      positions: ['BTN'],
      streets: ['flop'],
      stackMin: 100,
      stackMax: 100,
      stackDepth: 100,
      scenarios: ['cbet'],
    },
    color: '#86daff',
  },
  {
    id: 'plo8_scoop_quartering_defense',
    name: 'PLO8 Scoop & Quartering Defense',
    desc: '4-Card Omaha Hi-Lo 8-or-Better two-way scoop and nut-low protection',
    config: {
      format: 'cash',
      variant: 'plo8',
      positions: ['BTN'],
      streets: ['flop'],
      stackMin: 100,
      stackMax: 100,
      stackDepth: 100,
      scenarios: ['plo8_scoop'],
    },
    color: 'var(--sp-accent-green)',
  },
  {
    id: 'fixed_limit_cap_geometry',
    name: 'Fixed-Limit Cap & Turn Geometry',
    desc: 'Fixed-Limit 1 BB small-bet / 2 BB big-bet transitions and 4-raise caps',
    config: {
      format: 'cash',
      variant: 'nlh',
      bettingStructure: 'fixed_limit',
      positions: ['BTN'],
      streets: ['turn'],
      stackMin: 60,
      stackMax: 60,
      stackDepth: 60,
      scenarios: ['fixed_limit_cap'],
    },
    color: 'var(--sp-accent-blue)',
  },
];

const FORMATS = [
  { id: 'cash', label: 'Cash Game' },
  { id: 'mtt', label: 'Tournament' },
  { id: 'spins', label: 'Spins' },
];

const DRILL_VARIANTS = [
  { id: 'nlh', label: "Hold'em" },
  { id: 'plo4', label: 'PLO4' },
  { id: 'plo5', label: 'PLO5' },
  { id: 'plo6', label: 'PLO6' },
  { id: 'plo8', label: 'PLO8' },
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

function Chip({ label, selected, onClick, color: _color, ...rest }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      aria-pressed={!!selected}
      className="sd-button"
      {...rest}
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
  const [variant, setVariant] = useState('nlh');
  const [selectedPositions, setSelectedPositions] = useState([]);
  const [selectedStreets, setSelectedStreets] = useState([]);
  const [stackDepth, setStackDepth] = useState(100);
  const [savedDrills, setSavedDrills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [sharedPackCopied, setSharedPackCopied] = useState(false);

  const sharedDrillPackToken = useMemo(
    () =>
      encodeSharedDrillPack({
        title: drillName.trim() || `${variant.toUpperCase()} ${format.toUpperCase()} Study Pack`,
        format,
        variant,
        heroPosition: selectedPositions[0] || 'BTN',
        targetStreet: selectedStreets[0] || 'flop',
        stackDepthBb: stackDepth,
        questionsCount: 10,
      }),
    [drillName, format, variant, selectedPositions, selectedStreets, stackDepth],
  );

  const copySharedDrillPackLink = async () => {
    const baseHref = buildCustomTrainingArenaHref(
      {
        format,
        variant,
        positions: selectedPositions,
        streets: selectedStreets,
        stackDepth,
      },
      'shared-drill-pack',
    );
    const sep = baseHref.includes('?') ? '&' : '?';
    const relativeUrl = `${baseHref}${sep}pack=${encodeURIComponent(sharedDrillPackToken)}`;
    const fullUrl = typeof window !== 'undefined' ? `${window.location.origin}${relativeUrl}` : relativeUrl;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(fullUrl);
      }
    } catch (_) {
      /* ignore clipboard restrictions */
    }
    setSharedPackCopied(true);
    setTimeout(() => setSharedPackCopied(false), 2600);
  };




  // Load saved drills
  const loadDrills = async () => {
    setLoading(true);
    if (!getSupabase()) {
      setLoading(false);
      return;
    }
    try {
      const { data: sessionData } = await getSupabase().auth.getSession();
      if (!sessionData?.session?.user) {
        return;
      }
      const { data: userData, error: userError } = await getSupabase().auth.getUser();
      if (userError) {
        if (/session missing/i.test(userError?.message || '')) return;
        throw userError;
      }
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
    } finally {
      setLoading(false);
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
    setVariant(preset.config.variant || 'nlh');
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
        variant,
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
      }).select('*').maybeSingle();
      if (error) throw error;
      if (!saved?.id || saved.user_id !== userData.user.id) {
        throw new Error('The Saved Drill Could Not Be Confirmed.');
      }

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
      <SEOHead
        title="Custom Poker Drill Builder"
        description="Build Custom GTO Poker Practice Drills Filtered By Table Position, Street Focus, Stack Depth, And Pot Type To Target Specific Game Leaks On Smarter.Poker."
        canonical="/hub/training/drill-builder"
      />
      <div className={st.shell}>
        <TrainingPageHead slug="training-drill-builder" note="Create Focused Practice Sessions" />

        <div className={st.page}>
          {saveError && (
            <div role="alert" className={st.error}>
              {saveError}
            </div>
          )}
          {/* Quick Presets */}
          <section className={`sd-panel ${st.panel}`} aria-labelledby="drill-presets-title">
            <h2 id="drill-presets-title" className={st.title}>Quick Presets</h2>
            <div className={st.presetGrid}>
              {PRESETS.map((preset) => (
                <motion.button
                  key={preset.id}
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => applyPreset(preset)}
                  aria-pressed={drillName === preset.name}
                  className={`sd-button ${st.presetButton}`}
                >
                  <span className={st.presetName}>{preset.name}</span>
                  <span className={st.presetDesc}>{preset.desc}</span>
                </motion.button>
              ))}
            </div>
          </section>

          {/* Custom Builder */}
          <section className={`sd-panel ${st.panel}`} aria-labelledby="drill-custom-title">
            <h2 id="drill-custom-title" className={st.title}>Custom Drill</h2>
            {/* Drill Name */}
            <label className={st.field}>
              <span className={st.label}>Drill Name</span>
              <input
                value={drillName}
                onChange={(e) => setDrillName(e.target.value)}
                placeholder="Example: SB Vs BB 3-Bet Defense"
                className={st.input}
              />
            </label>

            {/* Format */}
            <fieldset className={st.fieldset}>
              <legend className={st.label}>Format</legend>
              <div className={st.chips}>
                {FORMATS.map((f) => (
                  <Chip
                    key={f.id}
                    label={f.label}
                    selected={format === f.id}
                    onClick={() => selectFormat(f.id)}
                  />
                ))}
              </div>
            </fieldset>

            {/* Game Variant */}
            <fieldset className={st.fieldset} data-drill-variant-selector="true">
              <legend className={st.label}>Variant</legend>
              <div className={st.chips}>
                {DRILL_VARIANTS.map((v) => (
                  <Chip
                    key={v.id}
                    data-drill-variant={v.id}
                    label={v.label}
                    selected={variant === v.id}
                    onClick={() => setVariant(v.id)}
                  />
                ))}
              </div>
            </fieldset>

            {/* Positions */}
            <fieldset className={st.fieldset}>
              <legend className={st.label}>Position (Choose One Or Leave Empty For Any)</legend>
              <div className={st.chips}>
                {POSITIONS.map((pos) => (
                  <Chip
                    key={pos}
                    label={pos}
                    selected={selectedPositions.includes(pos)}
                    onClick={() => togglePosition(pos)}
                  />
                ))}
              </div>
            </fieldset>

            {/* Streets */}
            <fieldset className={st.fieldset}>
              <legend className={st.label}>Street (Choose One Or Leave Empty For All)</legend>
              <div className={st.chips}>
                {STREETS.map((s) => (
                  <Chip
                    key={s.id}
                    label={s.label}
                    selected={selectedStreets.includes(s.id)}
                    onClick={() => toggleStreet(s.id)}
                  />
                ))}
              </div>
            </fieldset>

            {/* Exact supported stack */}
            <fieldset className={st.fieldset}>
              <legend className={st.label}>Stack Depth (Big Blinds)</legend>
              <div className={st.chips}>
                {STACK_DEPTHS[format].map((depth) => (
                  <Chip
                    key={depth}
                    label={`${depth}BB`}
                    selected={stackDepth === depth}
                    onClick={() => setStackDepth(depth)}
                  />
                ))}
              </div>
            </fieldset>

            <hr className={st.divider} />
            {/* Actions */}
            <div className={st.actions}>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={saveDrill}
                disabled={saving || !drillName.trim()}
                className="sd-button"
              >
                {saving ? 'Saving...' : 'Save Drill'}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="button"
                data-copy-shared-drill-pack="true"
                data-shared-pack-token={sharedDrillPackToken}
                onClick={copySharedDrillPackLink}
                className="sd-button"
              >
                {sharedPackCopied ? 'Shared Pack Link Copied!' : 'Copy Shared Drill Pack Link'}
              </motion.button>
            </div>
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              data-launch-club-arena-cta="true"
              onClick={() =>
                startDrill({
                  format,
                  variant,
                  positions: selectedPositions,
                  streets: selectedStreets,
                  stackDepth,
                })
              }
              className={`sd-button sd-primary ${st.block}`}
            >
              Start Drill
            </motion.button>
          </section>

          {loading && (
            <div role="status" className={st.small}>
              Loading Saved Drills...
            </div>
          )}

          {/* Saved Drills */}
          {savedDrills.length > 0 && (
            <section className={`sd-panel ${st.panel}`} aria-labelledby="drill-saved-title">
              <h2 id="drill-saved-title" className={st.title}>Saved Drills</h2>
              <div className={st.list}>
              {savedDrills.map((drill, i) => (
                <motion.button
                  key={drill.id || i}
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => startDrill(drill.config)}
                  className={`sd-button ${st.savedRow}`}
                >
                  <span className={st.savedText}>
                    <span className={st.presetName}>
                      {drill.title || drill.name}
                    </span>
                    <span className={st.presetDesc}>
                      {drill.config?.format?.toUpperCase()} |{' '}
                      {drill.config?.variant?.toUpperCase() || 'NLH'} |{' '}
                      {(drill.config?.positions || []).join(', ') || 'All Positions'} |{' '}
                      {(drill.config?.streets || []).join(', ') || 'All Streets'}
                    </span>
                  </span>
                  <span className={st.tag}>Play</span>
                </motion.button>
              ))}
              </div>
            </section>
          )}
        </div>
      </div>
      <ConnectionToast />
      <HubPageSummary page="training-drill-builder" />
    </>
  );
}
