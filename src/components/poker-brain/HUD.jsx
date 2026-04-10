import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getMatcher } from '../../lib/poker-brain/matcher';
import layoutData from '../../lib/poker-brain/layout.json';
import PokerBrainEngine from '../../lib/poker-brain/engine';
import { getBridgedDecision } from '../../lib/poker-brain/decision-bridge';
import { HandStateMachine, STREETS } from '../../lib/poker-brain/state';
import {
  detectDealer,
  heroPositionFromDealer,
  detectDealerAuto,
  findDealerButtonGlobal,
} from '../../lib/poker-brain/dealer-detect';
import { detectAvailableActions, validateAction } from '../../lib/poker-brain/action-detect';
// Auto-localizer disabled — static layout.json regions are more reliable.
// import { localizeCards } from '../../lib/poker-brain/card-localizer';
import { findTableBounds } from '../../lib/poker-brain/table-finder';
import {
  detectPlayerCountByStacks,
  canonicalPosition,
} from '../../lib/poker-brain/auto-table-state';
import TableStateTracker from '../../lib/poker-brain/table-state-tracker';
import { compareHandStrength } from '../../lib/poker-brain/hand-strength-validator';
import { usePokerBrainStorage } from '../../lib/poker-brain/storage';
import { verifyCardSuit } from '../../lib/poker-brain/suit-color';
import { supabase } from '../../lib/supabase';
import HandHistory from './HandHistory';
import CalibrationOverlay, {
  loadLayoutOverrides,
  saveLayoutOverrides,
  mergeLayoutWithOverrides,
} from './CalibrationOverlay';

/**
 * Poker Brain HUD v4 -- FULL ENGINE WIRING
 * -----------------------------------------
 * Wires every subsystem together:
 *   matcher.js          (dHash template matching)          --> raw cards
 *   state.js            (HandStateMachine)                 --> street transitions
 *   decision-bridge.js  (extractCards + getBridgedDecision)--> engine input
 *   engine.js           (Monte Carlo equity + decision)    --> action + equity
 *   dealer-detect.js    (red-pixel cluster scan)           --> hero position
 *   ocr.js              (Tesseract preprocess + parse)     --> pot / stack / blinds
 *   hand-strength-validator.js                             --> sanity warning
 *   storage.js          (Supabase + IndexedDB queue)       --> session + hand log
 *
 * Frame loop:
 *   Detection tick   = 250 ms (4 Hz)   -- cards, dealer
 *   OCR tick         = 1000 ms (1 Hz)  -- pot / stack / blinds
 *
 * Props:
 *   preAcquiredStream  -- MediaStream from launcher
 *   initialMode        -- 'camera' | 'screen'
 *   onClose            -- () => void
 */

const SUIT_DISPLAY = {
  s: { glyph: '\u2660', label: 'Spades',   color: '#1a1a2e' },
  h: { glyph: '\u2665', label: 'Hearts',   color: '#dc2626' },
  d: { glyph: '\u2666', label: 'Diamonds', color: '#2563eb' },
  c: { glyph: '\u2663', label: 'Clubs',    color: '#16a34a' },
};

const DetectedCard = ({ card }) => {
  const suit = SUIT_DISPLAY[card.suit] || SUIT_DISPLAY.s;
  const confidence = Math.round((card.confidence || 0) * 100);
  return (
    <div
      className="relative flex flex-col items-center justify-center rounded-xl border-2 shadow-lg"
      style={{
        width: '52px',
        height: '72px',
        backgroundColor: '#ffffff',
        borderColor: suit.color,
        boxShadow: '0 2px 8px ' + suit.color + '40',
      }}
    >
      <span className="text-2xl font-black leading-none" style={{ color: suit.color }}>
        {card.rank}
      </span>
      <span className="text-lg leading-none" style={{ color: suit.color }}>
        {suit.glyph}
      </span>
      {confidence > 0 && (
        <span className="absolute -bottom-5 text-[9px] text-slate-400 font-mono">
          {confidence}%
        </span>
      )}
    </div>
  );
};

const EmptyCardSlot = ({ label }) => (
  <div
    className="flex items-center justify-center rounded-xl border-2 border-dashed border-white/20"
    style={{ width: '52px', height: '72px', backgroundColor: 'rgba(255,255,255,0.05)' }}
  >
    <span className="text-[10px] text-slate-500 font-semibold">{label}</span>
  </div>
);

// ---------------------------------------------------------------------------
// Helpers for cropping OCR regions out of the full video frame
// ---------------------------------------------------------------------------
function cropToCanvas(sourceCanvas, rect) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.floor(rect.w));
  c.height = Math.max(1, Math.floor(rect.h));
  const ctx = c.getContext('2d');
  ctx.drawImage(
    sourceCanvas,
    Math.max(0, Math.floor(rect.x)), Math.max(0, Math.floor(rect.y)),
    Math.max(1, Math.floor(rect.w)), Math.max(1, Math.floor(rect.h)),
    0, 0,
    c.width, c.height,
  );
  return c;
}

function scaleRect(rect, sx, sy) {
  return { x: rect.x * sx, y: rect.y * sy, w: rect.w * sx, h: rect.h * sy };
}

// ---------------------------------------------------------------------------
// AutoDetectOverlay
// ---------------------------------------------------------------------------
// Draws a translucent debug layer over the captured video showing every
// auto-detected region: table bbox, hole-card strip, board-card strip,
// stack clusters, and dealer point. Reads from snapshotRef which is
// updated in place by the detection loop so the overlay can redraw at
// ~30fps independently of the 4Hz detection cadence.
//
// The video element uses `object-contain`, so we compute the visible
// letterbox rect for the source-pixel → display-pixel mapping.
const AutoDetectOverlay = ({ videoRef, snapshotRef, visible }) => {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!visible) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let stopped = false;

    const draw = () => {
      if (stopped) return;
      const video = videoRef.current;
      const snap = snapshotRef.current;
      if (!video || !snap) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      const srcW = video.videoWidth || 0;
      const srcH = video.videoHeight || 0;
      const rect = video.getBoundingClientRect();
      if (!srcW || !srcH || !rect.width || !rect.height) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      // Sync canvas size to displayed video rect
      if (canvas.width !== Math.round(rect.width) || canvas.height !== Math.round(rect.height)) {
        canvas.width = Math.round(rect.width);
        canvas.height = Math.round(rect.height);
      }
      // object-contain letterbox math
      const srcAR = srcW / srcH;
      const dstAR = rect.width / rect.height;
      let vw, vh, vx, vy;
      if (srcAR > dstAR) {
        vw = rect.width;
        vh = rect.width / srcAR;
        vx = 0;
        vy = (rect.height - vh) / 2;
      } else {
        vh = rect.height;
        vw = rect.height * srcAR;
        vx = (rect.width - vw) / 2;
        vy = 0;
      }
      const sx = vw / srcW;
      const sy = vh / srcH;
      const mapX = (x) => vx + x * sx;
      const mapY = (y) => vy + y * sy;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2;
      ctx.font = '11px ui-monospace, monospace';
      ctx.textBaseline = 'top';

      // Table bounds
      if (snap.tableBounds) {
        const b = snap.tableBounds;
        ctx.strokeStyle = 'rgba(34,211,238,0.95)';
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(mapX(b.x), mapY(b.y), b.w * sx, b.h * sy);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(34,211,238,0.95)';
        ctx.fillText('table', mapX(b.x) + 4, mapY(b.y) + 4);
      }

      // Hole cards
      if (snap.holeRegions && snap.holeRegions.length) {
        ctx.strokeStyle = 'rgba(250,204,21,0.95)';
        ctx.fillStyle = 'rgba(250,204,21,0.15)';
        for (let i = 0; i < snap.holeRegions.length; i++) {
          const r = snap.holeRegions[i];
          const rx = mapX(r.x), ry = mapY(r.y);
          ctx.fillRect(rx, ry, r.w * sx, r.h * sy);
          ctx.strokeRect(rx, ry, r.w * sx, r.h * sy);
        }
        ctx.fillStyle = 'rgba(250,204,21,0.95)';
        ctx.fillText(
          'hole x' + snap.holeRegions.length,
          mapX(snap.holeRegions[0].x),
          mapY(snap.holeRegions[0].y) - 14,
        );
      }

      // Board cards
      if (snap.boardRegions && snap.boardRegions.length) {
        ctx.strokeStyle = 'rgba(236,72,153,0.95)';
        ctx.fillStyle = 'rgba(236,72,153,0.15)';
        for (let i = 0; i < snap.boardRegions.length; i++) {
          const r = snap.boardRegions[i];
          const rx = mapX(r.x), ry = mapY(r.y);
          ctx.fillRect(rx, ry, r.w * sx, r.h * sy);
          ctx.strokeRect(rx, ry, r.w * sx, r.h * sy);
        }
        ctx.fillStyle = 'rgba(236,72,153,0.95)';
        ctx.fillText(
          'board x' + snap.boardRegions.length,
          mapX(snap.boardRegions[0].x),
          mapY(snap.boardRegions[0].y) - 14,
        );
      }

      // Stack clusters
      if (snap.stackClusters && snap.stackClusters.length) {
        ctx.strokeStyle = 'rgba(34,197,94,0.95)';
        ctx.fillStyle = 'rgba(34,197,94,0.35)';
        for (const c of snap.stackClusters) {
          const cx = mapX(c.cx);
          const cy = mapY(c.cy);
          ctx.beginPath();
          ctx.arc(cx, cy, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(34,197,94,0.95)';
        ctx.fillText('players ' + snap.stackClusters.length, 8, 8);
      }

      // Dealer button
      if (snap.dealerPoint) {
        const dx = mapX(snap.dealerPoint.x);
        const dy = mapY(snap.dealerPoint.y);
        ctx.strokeStyle = 'rgba(239,68,68,1)';
        ctx.fillStyle = 'rgba(239,68,68,0.7)';
        ctx.beginPath();
        ctx.arc(dx, dy, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.fillText('D', dx - 3, dy - 6);
      }

      // Position label (bottom-left of canvas)
      if (snap.position) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(6, canvas.height - 22, 90, 16);
        ctx.fillStyle = 'rgba(250,204,21,1)';
        ctx.fillText('pos ' + snap.position, 10, canvas.height - 20);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      stopped = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [visible, videoRef, snapshotRef]);

  if (!visible) return null;
  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
};

// ---------------------------------------------------------------------------
// Main HUD
// ---------------------------------------------------------------------------
const PokerBrainHUD = ({ preAcquiredStream = null, initialMode = 'screen', initialGameType = 'nlhe', onClose } = {}) => {
  // Stream state
  const [source, setSource] = useState(preAcquiredStream ? initialMode : null);
  const [streamReady, setStreamReady] = useState(!!preAcquiredStream);
  const [streamError, setStreamError] = useState(null);

  // Matcher state
  const [matcherReady, setMatcherReady] = useState(false);
  const [templateCount, setTemplateCount] = useState(0);
  const [detecting, setDetecting] = useState(false);

  // Detection metrics
  const [lastTimingMs, setLastTimingMs] = useState(0);
  const [frameCount, setFrameCount] = useState(0);

  // Debug overlay: when true, matcher emits top-3 candidates per region
  // so we can diagnose template mismatches vs region offsets vs thresholds.
  const [debugMode, setDebugMode] = useState(false);
  const [debugProbe, setDebugProbe] = useState(null);
  const debugModeRef = useRef(false);
  useEffect(() => { debugModeRef.current = debugMode; }, [debugMode]);

  // Game state inputs
  const [players, setPlayers] = useState(6);
  const [potSize, setPotSize] = useState(0);
  const [heroStack, setHeroStack] = useState(0);
  const [bigBlind, setBigBlind] = useState(0);
  const [betToCall, setBetToCall] = useState(0);
  const [position, setPosition] = useState('middle');
  const [dealerSeat, setDealerSeat] = useState(null);
  const [gameType, setGameType] = useState(initialGameType || 'nlhe');
  const [heroName, setHeroName] = useState('');
  const [villainStacks, setVillainStacks] = useState({});
  // Tournament / ICM context (user-set, not OCR'd)
  const [isTournament, setIsTournament] = useState(false);
  const [tournamentStage, setTournamentStage] = useState('early');

  // Hand state (committed, debounced)
  const [handState, setHandState] = useState({
    street: STREETS.WAITING,
    holeCards: [],
    boardCards: [],
    handId: null,
  });

  // Current bridged decision
  const [decision, setDecision] = useState(null);

  // Hand strength validator warning
  const [validator, setValidator] = useState(null);

  // Live hand history for this session
  const [recentHands, setRecentHands] = useState([]);

  // Calibration overlay state
  const [calibrationVisible, setCalibrationVisible] = useState(false);
  const [calibrationEditable, setCalibrationEditable] = useState(false);
  const [calibrationFullScreen, setCalibrationFullScreen] = useState(false);
  const [layoutOverrides, setLayoutOverrides] = useState(null);
  // Native video dims — captured after loadedmetadata fires. Used to
  // size the capture feed container to the real emulator aspect ratio
  // instead of a fixed 16:9 box that letterboxes the portrait stream
  // into a sliver.
  const [videoNativeDims, setVideoNativeDims] = useState(null);

  // Hand strength OCR label (from PokerBros UI)
  const [pokerBrosHandLabel, setPokerBrosHandLabel] = useState('');

  // Detected action button availability (hero-turn sanity check)
  const [availableActions, setAvailableActions] = useState(null);

  // Engine-vs-button consistency gate
  const [actionValidation, setActionValidation] = useState(null);

  // Load layout overrides from localStorage on mount
  useEffect(() => {
    const ov = loadLayoutOverrides();
    if (ov) setLayoutOverrides(ov);
  }, []);

  // Merge overrides into base layout
  const effectiveLayout = useMemo(
    () => mergeLayoutWithOverrides(layoutData, layoutOverrides),
    [layoutOverrides],
  );

  const handleOverridesChange = useCallback((next) => {
    setLayoutOverrides(next);
    saveLayoutOverrides(next);
  }, []);

  const resetCalibration = useCallback(() => {
    setLayoutOverrides(null);
    saveLayoutOverrides(null);
  }, []);

  // Refs
  const videoRef = useRef(null);
  const streamRef = useRef(preAcquiredStream);
  const matcherRef = useRef(null);
  const ocrRef = useRef(null);
  const rafRef = useRef(null);
  const lastDetectTimeRef = useRef(0);
  const lastOcrTimeRef = useRef(0);
  const stateMachineRef = useRef(null);
  const sessionIdRef = useRef(null);
  // Temporal stabilizer for auto-detected table state (bounds, player
  // count, position, dealer). Smooths frame-to-frame noise so HUD
  // indicators don't flicker while the underlying detection is sound.
  //
  // Lazy-init: `useRef(new Foo())` would allocate a fresh instance on
  // every render and throw it away — this pattern allocates exactly once.
  const tableStateRef = useRef(null);
  if (tableStateRef.current === null) {
    tableStateRef.current = new TableStateTracker();
  }
  // Latest frame's auto-detection snapshot, consumed by AutoDetectOverlay.
  // Written directly by the detection loop (no setState → no re-render
  // storm), read by an rAF-driven canvas draw.
  const detectionSnapshotRef = useRef(null);

  // Refs that mirror game-state so stale closures inside long-lived callbacks
  // (state machine, detection loop) can read fresh values without being
  // torn down and re-created on every input change.
  const positionRef = useRef(position);
  const potSizeRef = useRef(potSize);
  const heroStackRef = useRef(heroStack);
  const bigBlindRef = useRef(bigBlind);
  const betToCallRef = useRef(betToCall);
  const gameTypeRef = useRef(gameType);
  const playersRef = useRef(players);
  const isTournamentRef = useRef(isTournament);
  const tournamentStageRef = useRef(tournamentStage);
  useEffect(() => { positionRef.current = position; }, [position]);
  useEffect(() => { potSizeRef.current = potSize; }, [potSize]);
  useEffect(() => { heroStackRef.current = heroStack; }, [heroStack]);
  useEffect(() => { bigBlindRef.current = bigBlind; }, [bigBlind]);
  useEffect(() => { betToCallRef.current = betToCall; }, [betToCall]);
  useEffect(() => { gameTypeRef.current = gameType; }, [gameType]);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { isTournamentRef.current = isTournament; }, [isTournament]);
  useEffect(() => { tournamentStageRef.current = tournamentStage; }, [tournamentStage]);

  // Effective stack = min(hero, max villain with non-zero stack). Used as
  // the stack fed to the engine so SPR and commitment math reflect the
  // actual money that can move in the pot, not just hero's chip count.
  const effectiveStack = useMemo(() => {
    const villainVals = Object.values(villainStacks || {}).filter(
      (v) => typeof v === 'number' && v > 0,
    );
    if (villainVals.length === 0 || heroStack <= 0) return heroStack;
    const maxVillain = Math.max(...villainVals);
    return Math.min(heroStack, maxVillain);
  }, [heroStack, villainStacks]);
  const effectiveStackRef = useRef(effectiveStack);
  useEffect(() => { effectiveStackRef.current = effectiveStack; }, [effectiveStack]);

  // Storage (Supabase + IndexedDB queue)
  const storage = usePokerBrainStorage(supabase);
  // Live ref so stable callbacks (stopStream, unmount cleanup) that don't
  // list `storage` as a dep can still reach the latest methods. The
  // individual hook methods (endSession, logHand, …) are already stable
  // useCallback refs, but `storage.ready` is captured at closure time and
  // goes stale in empty-dep effects — this ref bypasses that.
  const storageLiveRef = useRef(storage);
  useEffect(() => { storageLiveRef.current = storage; }, [storage]);

  // ============================================================================
  // STATE MACHINE (created once)
  // ============================================================================
  useEffect(() => {
    stateMachineRef.current = new HandStateMachine({
      requiredFrames: 2,
      onHandStart: (hand) => {
        // Hydrate the hand with the game-state snapshot at the moment cards
        // appeared. These refs always hold the freshest value because they're
        // synced via useEffect above.
        if (stateMachineRef.current && stateMachineRef.current.setHandContext) {
          stateMachineRef.current.setHandContext({
            position: positionRef.current,
            potAtStart: potSizeRef.current,
            stackAtStart: effectiveStackRef.current || heroStackRef.current,
            gameType: gameTypeRef.current,
            bigBlind: bigBlindRef.current,
          });
        }
      },
      onStreetChange: (hand, prevStreet, nextStreet) => {
        // Hook present so the state machine's street-change path fires
        // callbacks; downstream consumers can key off street transitions
        // via onStateChange. Reserved for future per-street side effects
        // (sound cues, analytics events, etc.).
      },
      onHandEnd: (hand) => {
        if (!hand) return;
        setRecentHands((prev) => [hand, ...prev].slice(0, 20));
        if (storage.ready && sessionIdRef.current) {
          // Pick the most recent street decision as the canonical action
          // logged against the hand (river > turn > flop > preflop).
          const streetOrder = ['river', 'turn', 'flop', 'preflop'];
          let lastDecision = null;
          for (const s of streetOrder) {
            if (hand.streetDecisions && hand.streetDecisions[s]) {
              lastDecision = hand.streetDecisions[s];
              break;
            }
          }
          storage.logHand({
            // Prefer the snapshot captured at hand start; fall back to the
            // current ref value if the hand-start hydration was missed.
            position: hand.position || positionRef.current,
            holeCards: hand.holeCards || [],
            board: hand.finalBoard || [],
            gameType: hand.gameType || gameTypeRef.current,
            potSize: hand.potAtStart != null ? hand.potAtStart : potSizeRef.current,
            betToCall: betToCallRef.current > 0 ? betToCallRef.current : bigBlindRef.current,
            stackSize: hand.stackAtStart != null
              ? hand.stackAtStart
              : (effectiveStackRef.current || heroStackRef.current),
            equity: lastDecision ? lastDecision.equity : null,
            potOdds: lastDecision ? lastDecision.potOdds : null,
            decision: lastDecision ? lastDecision.action : null,
            raiseAmount: lastDecision ? lastDecision.raiseAmount : null,
            confidence: lastDecision ? lastDecision.confidence : null,
            reasoning: lastDecision ? lastDecision.reasoning : null,
            detectedAuto: true,
          }).catch((err) => console.warn('[HUD] logHand failed', err));
        }
      },
      onStateChange: (state) => {
        setHandState({
          street: state.street,
          holeCards: state.holeCards,
          boardCards: state.boardCards,
          handId: state.handId,
        });
      },
    });
    return () => {
      stateMachineRef.current = null;
    };
    // Only rebuild the state machine when storage readiness flips — the
    // callbacks (storage.logHand, etc.) are stable useCallback refs and
    // safely read the latest storageRef.current at call time. Depending
    // on the whole `storage` object here would re-run the effect any
    // time stats refresh and silently destroy the in-progress hand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage.ready]);

  // ============================================================================
  // MATCHER INITIALIZATION
  // ============================================================================
  useEffect(() => {
    const matcher = getMatcher();
    matcherRef.current = matcher;
    matcher.loadTemplates('/hub/poker-brain/templates').then(() => {
      setMatcherReady(true);
      setTemplateCount(matcher.getTemplateCount());
    }).catch((err) => {
      console.error('[HUD] Failed to load templates:', err);
    });
  }, []);

  // ============================================================================
  // OCR INITIALIZATION (lazy)
  // ============================================================================
  useEffect(() => {
    let cancelled = false;
    import('../../lib/poker-brain/ocr').then(({ default: PokerOCR }) => {
      if (cancelled) return;
      const ocr = new PokerOCR();
      ocrRef.current = ocr;
      // Do not block: ocr.initialize() runs on first read.
    }).catch((err) => {
      console.warn('[HUD] OCR module load failed:', err);
    });
    return () => { cancelled = true; };
  }, []);

  // ============================================================================
  // SESSION START / END
  // ============================================================================
  const startingSessionRef = useRef(false);
  useEffect(() => {
    if (!storage.ready || !detecting) return;
    if (sessionIdRef.current || startingSessionRef.current) return;
    startingSessionRef.current = true;
    storage.startSession({
      gameType: gameTypeRef.current,
      playerCount: playersRef.current,
      captureMode: source || 'screen',
      clientProfile: 'pokerbros',
      startingStack: heroStackRef.current || null,
    }).then((id) => {
      // storage.startSession returns the session id directly (string),
      // or null when offline and queued.
      if (id) sessionIdRef.current = id;
    }).catch((err) => console.warn('[HUD] startSession failed', err))
      .finally(() => { startingSessionRef.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage.ready, detecting, source]);

  useEffect(() => {
    return () => {
      // Read the LATEST storage from the live ref — the `storage` we'd
      // close over here is whatever was returned on the first render
      // (ready: false, all methods as no-ops), so gating on
      // `storage.ready` would always be false and this cleanup would
      // silently leak every session. storageLiveRef always points at
      // the current memoized storage object from the hook.
      if (sessionIdRef.current) {
        const live = storageLiveRef.current;
        if (live && live.endSession) {
          live.endSession({
            finalStack: heroStackRef.current || null,
            notes: null,
          }).catch(() => {});
        }
        sessionIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================================================
  // STREAM MANAGEMENT
  // ============================================================================
  useEffect(() => {
    if (preAcquiredStream && videoRef.current) {
      videoRef.current.srcObject = preAcquiredStream;
      videoRef.current.play().catch(() => {});
      streamRef.current = preAcquiredStream;
      setStreamReady(true);
    }
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startScreenCapture = useCallback(async () => {
    setStreamError(null);
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        setSource(null);
        setStreamReady(false);
        setDetecting(false);
        // Clear all auto-detection state so the next capture starts
        // fresh — prevents stale debug overlay and tracker bleed.
        detectionSnapshotRef.current = null;
        if (tableStateRef.current) tableStateRef.current.reset();
      });
      // New stream = new table. Wipe any stabilized state from a
      // previous capture so nothing carries over.
      detectionSnapshotRef.current = null;
      if (tableStateRef.current) tableStateRef.current.reset();
      setSource('screen');
      setStreamReady(true);
    } catch (err) {
      if (err.name !== 'NotAllowedError') setStreamError(err.message || 'Screen capture failed');
    }
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    // End the Supabase session cleanly so the DB row is closed AND so
    // the next capture gets a fresh sessionId. Without this, stop→start
    // leaves sessionIdRef populated with a stale id and the session-
    // start effect bails out, causing every future hand to log against
    // a zombie session.
    if (sessionIdRef.current) {
      const live = storageLiveRef.current;
      if (live && live.endSession) {
        live.endSession({
          finalStack: heroStackRef.current || null,
          notes: null,
        }).catch(() => {});
      }
      sessionIdRef.current = null;
    }
    detectionSnapshotRef.current = null;
    if (tableStateRef.current) tableStateRef.current.reset();
    // Also wipe the hand state machine so a leftover in-progress hand
    // from the previous capture can't bleed into a new session.
    // `silent: true` so the in-progress hand is NOT logged to Supabase —
    // if detection was mid-hand when the user stopped, that hand is
    // almost certainly incomplete or misdetected and should be
    // abandoned, not persisted.
    if (stateMachineRef.current && stateMachineRef.current.reset) {
      stateMachineRef.current.reset({ silent: true });
    }
    setSource(null);
    setStreamReady(false);
    setDetecting(false);
  }, []);

  // ============================================================================
  // DETECTION + OCR LOOP
  // ============================================================================
  useEffect(() => {
    if (!streamReady || !matcherReady || !detecting) return;

    const DETECT_INTERVAL_MS = 250;   // 4 Hz cards
    const OCR_INTERVAL_MS    = 1000;  // 1 Hz pot/stack/blinds

    // Arm the matcher's one-shot diagnostic dump whenever detection
    // (re)starts. For the first few frames the matcher will print a
    // full per-region breakdown to the console — best match, distance,
    // top-3 candidates, and scaled region coords. This turns "nothing
    // is detected" into an actionable signal: we can see immediately
    // whether the matcher is reading cards and rejecting them (bump
    // MATCH_THRESHOLD) or whether the regions are landing in empty
    // space (auto-localizer or reference-size issue).
    if (matcherRef.current && typeof matcherRef.current.armDiagnostics === 'function') {
      matcherRef.current.armDiagnostics(5);
    }

    // Teardown flag. The loop is async, so the effect cleanup may fire
    // while a `loop` invocation is mid-await. cancelAnimationFrame only
    // kills the CURRENTLY scheduled rAF id — if the running loop
    // schedules a new rAF after cleanup, nothing cancels it and we
    // leak a zombie loop that keeps firing setState into an unmounted
    // (or re-initialized) component. The flag guards the re-schedule.
    let stopped = false;

    const loop = async () => {
      if (stopped) return;
      const now = performance.now();

      // ---- Card + dealer detection (4 Hz) ----
      if (now - lastDetectTimeRef.current >= DETECT_INTERVAL_MS) {
        lastDetectTimeRef.current = now;
        const video = videoRef.current;
        const matcher = matcherRef.current;
        if (video && matcher && matcher.isReady()) {
           try {
            // Use per-variant hole card regions (v3 layout) so the matcher
            // polls the correct pixel positions for the active game type.
            // Falls back to legacy maxHoleCards slicing if the layout doesn't
            // have holeCardsByVariant.
            const currentVariant = gameTypeRef.current;
            const expectedHole = PokerBrainEngine.expectedHoleCount(currentVariant);

            // ── AUTO TABLE BOUNDS ──────────────────────────────────────
            // Find the PokerBros felt oval inside the capture frame via
            // its gold border. Everything downstream — cards, player
            // count, dealer, position — runs in TABLE coordinates, not
            // full-frame coordinates. This lets the HUD work when the
            // user screen-shares a whole browser window containing an
            // emulator (the common real-world case).
            // Collect raw auto-detection observations for this frame and
            // feed them through the temporal tracker at the end of the
            // block. The tracker smooths frame-to-frame jitter so the HUD
            // doesn't flicker on one-frame misdetections.
            const obs = {
              tableBounds: null,
              playerCount: null,
              position: null,
              dealerPoint: null,
              variant: currentVariant,
            };
            let tableBounds = null;
            try {
              const prevStable = tableStateRef.current.snapshot().bounds;
              tableBounds = findTableBounds(video, { previous: prevStable });
              if (tableBounds) {
                obs.tableBounds = tableBounds;
                // Use the smoothed bounds for downstream detection so
                // per-frame wobble doesn't propagate into stacks/cards.
                // We still pass the RAW bounds to the tracker below.
                const smoothed = tableStateRef.current.snapshot().bounds;
                if (smoothed) tableBounds = smoothed;
              }
            } catch (tbErr) { /* swallow */ }

            // ── CARD REGIONS ──────────────────────────────────────────
            // Use the STATIC layout.json regions (effectiveLayout) for card
            // matching. The auto-localizer (card-localizer.js) was returning
            // incorrect source-pixel regions that landed on the hero's
            // name/stack area and the pot instead of actual card faces,
            // making detection completely non-functional. The static regions
            // are correctly calibrated (confirmed visually via the
            // calibration overlay) and need only reference → source scaling
            // which the matcher handles internally.
            //
            // Table bounds, player count, and dealer detection still run
            // above — those work correctly. Only card localization is
            // bypassed here until the auto-localizer is rewritten.
            const matcherLayout = effectiveLayout;
            const usedAutoLayout = false;

            const result = matcher.matchAllRegions(video, matcherLayout, {
              variant: currentVariant,
              maxHoleCards: expectedHole,
              debug: debugModeRef.current,
              topN: 3,
            });
            if (usedAutoLayout && debugModeRef.current) {
              result.probeLog = [
                { note: 'using auto-localized regions', variant: currentVariant },
                ...(result.probeLog || []),
              ];
            }
            setLastTimingMs(Math.round(result.timingMs * 10) / 10);
            setFrameCount((c) => c + 1);

            if (debugModeRef.current && result.probeLog) {
              setDebugProbe({
                ts: Date.now(),
                variant: currentVariant,
                videoW: video.videoWidth || video.width,
                videoH: video.videoHeight || video.height,
                templates: matcher.getTemplateCount ? matcher.getTemplateCount() : null,
                log: result.probeLog,
              });
            }

            // Suit-color verification pass (PokerBros 4-color deck sanity check)
            const srcW = video.videoWidth || video.width;
            const srcH = video.videoHeight || video.height;
            const refW = matcherLayout.referenceSize?.w || 480;
            const refH = matcherLayout.referenceSize?.h || 1054;
            const csx = srcW / refW;
            const csy = srcH / refH;
            // Resolve the same region array the matcher used for suit verification
            const variantRegions =
              matcherLayout.holeCardsByVariant?.[currentVariant]
              || matcherLayout.holeCards
              || [];
            const verifiedHole = (result.holeCards || []).map((card, i) => {
              const r = variantRegions[i];
              if (!r || !card || !card.suit) return card;
              return verifyCardSuit(card, video, scaleRect(r, csx, csy));
            });
            const verifiedBoard = (result.boardCards || []).map((card, i) => {
              const r = matcherLayout.boardCards?.[i];
              if (!r || !card || !card.suit) return card;
              return verifyCardSuit(card, video, scaleRect(r, csx, csy));
            });

            // Feed the state machine with color-verified cards
            if (stateMachineRef.current) {
              stateMachineRef.current.observe(verifiedHole, verifiedBoard);
            }

            // --- Auto player count via yellow stack-number clusters ---
            // Count bright-yellow text clusters inside the table bbox.
            // Each occupied seat has a yellow stack number under its
            // avatar (EMPTY seats don't), so cluster count == players.
            let stackClusters = [];
            try {
              const pc = detectPlayerCountByStacks(video, tableBounds);
              stackClusters = pc.clusters || [];
              const livePlayerCount = Math.max(2, pc.playerCount || 0);
              if (livePlayerCount >= 2) obs.playerCount = livePlayerCount;
            } catch (err) { /* swallow */ }

            // --- Auto dealer button: global red-cluster scan ---------
            // Scans the whole table bbox for the dealer red chip, then
            // maps the cluster centroid to the nearest occupied stack
            // cluster (= nearest player). That pair of positions drives
            // the canonical position label (BTN/SB/BB/UTG/MP/CO/HJ).
            try {
              let dealer = detectDealerAuto(video, effectiveLayout);
              if (!dealer || !dealer.seatId) {
                dealer = detectDealer(video, effectiveLayout);
              }
              if (dealer && dealer.seatId) {
                setDealerSeat(dealer.seatId);
              }

              // Canonical position via occupied-seat angular ordering.
              // We get the ACTUAL dealer button pixel centroid from a
              // global red-chip scan (findDealerButtonGlobal), not the
              // seat-id from detectDealerAuto — seat IDs are layout-
              // relative and useless when the table is inside a
              // sub-region of the capture.
              let dealerPoint = null;
              try { dealerPoint = findDealerButtonGlobal(video, tableBounds); }
              catch (dpErr) { /* swallow */ }
              if (dealerPoint && Number.isFinite(dealerPoint.x) && Number.isFinite(dealerPoint.y)) {
                obs.dealerPoint = { x: dealerPoint.x, y: dealerPoint.y };
              }

              if (
                stackClusters.length >= 2 &&
                dealerPoint &&
                Number.isFinite(dealerPoint.x) &&
                Number.isFinite(dealerPoint.y)
              ) {
                // Use the TABLE bbox center as the angular origin, not the
                // centroid of the stack clusters. The stack centroid is
                // biased toward whichever side of the table has more
                // players and shifts whenever a seat opens/closes,
                // rotating the "12 o'clock" reference and mis-labeling
                // positions. The table center is fixed and correct.
                let centerX, centerY;
                if (tableBounds) {
                  centerX = tableBounds.x + tableBounds.w / 2;
                  centerY = tableBounds.y + tableBounds.h / 2;
                } else {
                  let sumX = 0;
                  let sumY = 0;
                  for (const c of stackClusters) { sumX += c.cx; sumY += c.cy; }
                  centerX = sumX / stackClusters.length;
                  centerY = sumY / stackClusters.length;
                }
                const angleOf = (px, py) => {
                  // 0° = top (12 o'clock), increase clockwise
                  const a = Math.atan2(px - centerX, -(py - centerY)) * (180 / Math.PI);
                  return (a + 360) % 360;
                };
                const occupiedAngles = stackClusters
                  .map((c) => angleOf(c.cx, c.cy))
                  .sort((a, b) => a - b);
                // Hero identification: prefer the stack cluster nearest to
                // the hero hole-card strip (when auto-layout resolved one),
                // because the strip is a strong, variant-aware hero anchor.
                // Fall back to the bottom-most cluster if we don't have a
                // strip yet.
                let heroCluster = stackClusters[0];
                if (usedAutoLayout && matcherLayout.holeCards && matcherLayout.holeCards.length > 0) {
                  // Centroid of the hero hole card strip in source pixels
                  let hx = 0, hy = 0;
                  for (const r of matcherLayout.holeCards) {
                    hx += r.x + r.w / 2;
                    hy += r.y + r.h / 2;
                  }
                  hx /= matcherLayout.holeCards.length;
                  hy /= matcherLayout.holeCards.length;
                  let bestD2 = Infinity;
                  for (const c of stackClusters) {
                    const dx = c.cx - hx;
                    const dy = c.cy - hy;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < bestD2) { bestD2 = d2; heroCluster = c; }
                  }
                } else {
                  let bestY = -Infinity;
                  for (const c of stackClusters) {
                    if (c.cy > bestY) { bestY = c.cy; heroCluster = c; }
                  }
                }
                const heroAngle = angleOf(heroCluster.cx, heroCluster.cy);
                const dealerAngle = angleOf(dealerPoint.x, dealerPoint.y);
                const pos = canonicalPosition({
                  dealerAngleDeg: dealerAngle,
                  heroAngleDeg: heroAngle,
                  numPlayers: stackClusters.length,
                  occupiedAngles,
                });
                if (pos && pos !== 'unknown') obs.position = pos;
              } else if (dealer && dealer.seatId) {
                // Fallback to old mapping if stack clusters weren't found
                const fallback = heroPositionFromDealer(
                  dealer.seatId,
                  playersRef.current || players,
                );
                if (fallback && fallback !== 'unknown') obs.position = fallback;
              }
            } catch (err) { /* swallow */ }

            // ── Feed observations into the temporal stabilizer ──────────
            // All auto-detected fields go through the tracker, which
            // applies per-field smoothing (EMA for bounds/dealer, rolling
            // mode for counts, agreement filter for position) and returns
            // the stable snapshot we actually surface to the user.
            let stableSnapshot = null;
            try {
              stableSnapshot = tableStateRef.current.update(obs);
              if (stableSnapshot.playerCount && stableSnapshot.playerCount !== playersRef.current) {
                playersRef.current = stableSnapshot.playerCount;
                setPlayers(stableSnapshot.playerCount);
              }
              if (stableSnapshot.position && stableSnapshot.position !== positionRef.current) {
                setPosition(stableSnapshot.position);
              }
              // Auto-switch variant when the tracker has seen the same
              // strip shape for several frames. We never overwrite
              // plo_hilo → plo (the hi/lo distinction comes from the
              // OCR game-name readout, not the card count; both have
              // 4 hole cards) so the OCR can still refine below.
              if (
                stableSnapshot.variant
                && stableSnapshot.variant !== gameTypeRef.current
                && !(stableSnapshot.variant === 'plo' && gameTypeRef.current === 'plo_hilo')
              ) {
                setGameType(stableSnapshot.variant);
              }
            } catch (trkErr) { /* swallow */ }

            // Publish the debug snapshot for AutoDetectOverlay. Mutating
            // the ref in place avoids re-renders while still giving the
            // overlay fresh data each detection tick.
            detectionSnapshotRef.current = {
              tableBounds: (stableSnapshot && stableSnapshot.bounds) || obs.tableBounds || null,
              holeRegions: usedAutoLayout ? matcherLayout.holeCards : null,
              boardRegions: usedAutoLayout ? matcherLayout.boardCards : null,
              stackClusters,
              dealerPoint: (stableSnapshot && stableSnapshot.dealerPoint) || obs.dealerPoint || null,
              position: (stableSnapshot && stableSnapshot.position) || obs.position || null,
              playerCount: (stableSnapshot && stableSnapshot.playerCount) || obs.playerCount || null,
              ts: now,
            };

            // Available action detection (color-cluster on fold/call/raise
            // button regions). Tells us whether it's actually hero's turn.
            try {
              const actions = detectAvailableActions(video, effectiveLayout);
              setAvailableActions(actions);
            } catch (err) { /* swallow */ }
          } catch (err) {
            console.warn('[HUD] matchAllRegions failed', err);
          }
        }
      }

      // ---- OCR pass (1 Hz) ----
      if (now - lastOcrTimeRef.current >= OCR_INTERVAL_MS) {
        lastOcrTimeRef.current = now;
        const video = videoRef.current;
        const ocr = ocrRef.current;
        if (video && ocr && effectiveLayout.ocrRegions) {
          const srcW = video.videoWidth || video.width;
          const srcH = video.videoHeight || video.height;
          if (srcW && srcH) {
            const refW = effectiveLayout.referenceSize.w;
            const refH = effectiveLayout.referenceSize.h;
            const sx = srcW / refW;
            const sy = srcH / refH;

            // Draw frame once
            const full = document.createElement('canvas');
            full.width = srcW;
            full.height = srcH;
            full.getContext('2d').drawImage(video, 0, 0, srcW, srcH);

            const run = async (name, method, opts = {}) => {
              const raw = effectiveLayout.ocrRegions[name];
              if (!raw) return null;
              const rect = scaleRect(raw, sx, sy);
              const crop = cropToCanvas(full, rect);
              // Give each logical region its own cacheKey so debounce timers
              // and checksum caches don't collide across regions.
              try {
                return await ocr[method](crop, { cacheKey: name, ...opts });
              } catch (err) {
                return null;
              }
            };

            // Fire and forget (they debounce internally per-region)
            run('pot', 'readPotSize').then((r) => {
              if (r && typeof r.value === 'number') setPotSize(r.value);
            }).catch(() => {});
            run('heroStack', 'readStackSizes').then((r) => {
              if (r && typeof r.value === 'number') setHeroStack(r.value);
            }).catch(() => {});
            run('blindLevel', 'readBlindLevel').then((r) => {
              if (r && r.bigBlind) setBigBlind(r.bigBlind);
            }).catch(() => {});

            // Current bet to call (from the betRaise action button label)
            run('currentBet', 'readBetAmounts').then((r) => {
              if (r && typeof r.value === 'number' && r.value >= 0) setBetToCall(r.value);
            }).catch(() => {});

            // Hand strength label (plain readRegion, then stored for validator)
            const hsRaw = effectiveLayout.ocrRegions.handStrength;
            if (hsRaw && typeof ocr.readRegion === 'function') {
              const rect = scaleRect(hsRaw, sx, sy);
              const crop = cropToCanvas(full, rect);
              ocr.readRegion(crop, { cacheKey: 'handStrength' }).then((r) => {
                if (r && r.text) setPokerBrosHandLabel(r.text);
              }).catch(() => {});
            }

            // Game variant detection (NLHE vs PLO vs PLO5)
            const gvRaw = effectiveLayout.ocrRegions.gameVariant;
            if (gvRaw && typeof ocr.readRegion === 'function') {
              const rect = scaleRect(gvRaw, sx, sy);
              const crop = cropToCanvas(full, rect);
              ocr.readRegion(crop, { cacheKey: 'gameVariant' }).then((r) => {
                if (!r || !r.text || !r.meetsThreshold) return;
                const t = String(r.text).toUpperCase();
                if (t.includes('PLO6') || t.includes('PLO 6') || t.includes('6-CARD')) setGameType('plo6');
                else if (t.includes('PLO5') || t.includes('PLO 5') || t.includes('5-CARD')) setGameType('plo5');
                else if (t.includes('HI-LO') || t.includes('HI/LO') || t.includes('HILO') || t.includes('8 OR BETTER') || t.includes('PLO8')) setGameType('plo_hilo');
                else if (t.includes('PLO') || t.includes('OMAHA')) setGameType('plo');
                else if (t.includes('NLH') || t.includes("HOLD'EM") || t.includes('HOLDEM') || t.includes('TEXAS')) setGameType('nlhe');
              }).catch(() => {});
            }

            // Hero name (for display only)
            const hnRaw = effectiveLayout.ocrRegions.heroName;
            if (hnRaw && typeof ocr.readRegion === 'function') {
              const rect = scaleRect(hnRaw, sx, sy);
              const crop = cropToCanvas(full, rect);
              ocr.readRegion(crop, { cacheKey: 'heroName' }).then((r) => {
                if (r && r.text) setHeroName(r.text);
              }).catch(() => {});
            }

            // Villain stacks (for multi-villain SPR awareness / effective stack)
            ['seat1Stack', 'seat2Stack', 'seat3Stack'].forEach((seatKey) => {
              const sr = effectiveLayout.ocrRegions[seatKey];
              if (!sr) return;
              const rect = scaleRect(sr, sx, sy);
              const crop = cropToCanvas(full, rect);
              ocr.readStackSizes(crop, { cacheKey: seatKey }).then((r) => {
                if (r && typeof r.value === 'number') {
                  setVillainStacks((prev) => ({ ...prev, [seatKey]: r.value }));
                }
              }).catch(() => {});
            });
          }
        }
      }

      if (!stopped) rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // `players` is intentionally NOT a dependency: the loop reads it
    // via playersRef.current, and auto-detection updates `players`
    // several times per second — putting it in deps would tear the
    // loop down and rebuild it on every count change, destroying
    // detection stability and causing tracker observations to restart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamReady, matcherReady, detecting]);

  // ============================================================================
  // DECISION COMPUTATION (reruns when state or game inputs change)
  // Rate-limited: min 200ms between recomputes to avoid thrashing Monte Carlo
  // ============================================================================
  const decisionTimerRef = useRef(null);
  const lastDecisionKeyRef = useRef('');
  useEffect(() => {
    if (handState.holeCards.length < 2) {
      setDecision(null);
      setValidator(null);
      return;
    }
    // Build a stable key so we skip redundant recomputes
    const holeKey = handState.holeCards.map(c => `${c.rank}${c.suit}`).sort().join('');
    const boardKey = handState.boardCards.map(c => `${c.rank}${c.suit}`).sort().join('');
    // Effective bet-to-call: if OCR has a non-zero reading, prefer it; else
    // fall back to BB so preflop RFI logic still resolves to a sensible
    // action before OCR converges.
    const effBetToCall = betToCall > 0 ? betToCall : bigBlind;
    const key = `${holeKey}|${boardKey}|${potSize}|${effectiveStack}|${effBetToCall}|${bigBlind}|${position}|${players}|${gameType}|${isTournament}|${tournamentStage}`;
    if (key === lastDecisionKeyRef.current) return;

    if (decisionTimerRef.current) clearTimeout(decisionTimerRef.current);
    decisionTimerRef.current = setTimeout(() => {
      lastDecisionKeyRef.current = key;
      const bridged = getBridgedDecision({
        rawHoleCards: handState.holeCards,
        rawBoardCards: handState.boardCards,
        gameType,
        potSize,
        betToCall: effBetToCall,
        bigBlind,
        stackSize: effectiveStack,
        position,
        numPlayers: players,
        blindLevel: bigBlind || 1,
        isTournament,
        tournamentStage,
      });
      setDecision(bridged);

      // Record the decision on the current street of the current hand
      if (bridged.ready && stateMachineRef.current) {
        stateMachineRef.current.recordDecision({
          action: bridged.action,
          raiseAmount: bridged.raiseAmount,
          equity: bridged.equity,
          potOdds: bridged.potOdds,
          confidence: bridged.confidence,
          reasoning: bridged.reasoning,
        });
      }

      // Validator: compare engine hand name against PokerBros OCR label
      try {
        if (bridged.ready && bridged.handStrength && pokerBrosHandLabel) {
          const v = compareHandStrength(bridged.handStrength, pokerBrosHandLabel);
          setValidator(v);
        } else {
          setValidator(null);
        }
      } catch (err) { /* swallow */ }

      // Action-button consistency: does the recommendation actually
      // correspond to a button that is visible right now?
      if (bridged.ready) {
        try {
          setActionValidation(validateAction(availableActions, bridged.action));
        } catch (err) { setActionValidation(null); }
      } else {
        setActionValidation(null);
      }
    }, 200);
    return () => {
      if (decisionTimerRef.current) clearTimeout(decisionTimerRef.current);
    };
  }, [handState, potSize, heroStack, effectiveStack, bigBlind, betToCall, position, players, gameType, isTournament, tournamentStage, pokerBrosHandLabel, availableActions]);

  // ============================================================================
  // UI HELPERS
  // ============================================================================
  const decisionColor =
    decision && decision.action === 'RAISE'       ? 'from-emerald-500 to-green-600'
    : decision && decision.action === 'BET'       ? 'from-emerald-500 to-green-600'
    : decision && decision.action === 'CALL'      ? 'from-sky-500 to-blue-600'
    : decision && decision.action === 'CHECK'     ? 'from-amber-500 to-orange-600'
    : decision && decision.action === 'FOLD'      ? 'from-rose-500 to-red-600'
    : 'from-slate-600 to-slate-700';

  const displayAction = decision
    ? (decision.ready ? decision.action : 'WAIT')
    : (matcherReady ? (detecting ? 'SCANNING' : 'PAUSED') : 'LOADING');

  const displayReason = decision
    ? (decision.ready ? decision.reasoning : decision.reason)
    : (matcherReady ? 'Share your screen and start detection' : 'Loading card templates...');

  const newHand = () => {
    // Silent reset so the abandoned in-progress hand (often the whole
    // reason the user is hitting "Reset Hand") is NOT written to the
    // Supabase hand log. Real completed hands still flow through
    // observe() → _commit() → onHandEnd normally.
    if (stateMachineRef.current) stateMachineRef.current.reset({ silent: true });
  };

  // Engine returns equity/potOdds already as percentages (0-100), not 0-1.
  const equityPct = decision && decision.ready && typeof decision.equity === 'number'
    ? Math.round(decision.equity)
    : null;
  const potOddsPct = decision && decision.ready && typeof decision.potOdds === 'number'
    ? Math.round(decision.potOdds)
    : null;

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-3 pb-24">
      <div className="max-w-4xl mx-auto">
        {/* HEADER */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
              Poker Brain HUD
            </h1>
            <p className="text-slate-400 text-xs">
              Full engine | Template matching | Monte Carlo equity | PokerBros NLH
              {heroName ? (
                <span className="ml-2 text-amber-300">&middot; {heroName}</span>
              ) : null}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {detecting && (
              <div className="flex items-center gap-1.5 bg-emerald-900/50 border border-emerald-500/30 rounded-full px-3 py-1">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                <span className="text-[10px] font-semibold text-emerald-300">DETECTING</span>
              </div>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="shrink-0 w-10 h-10 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold border border-red-400"
                title="Close"
              >
                X
              </button>
            )}
          </div>
        </div>

        {/* STATUS BAR */}
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
          <span className="bg-slate-800 rounded px-2 py-1">
            Templates: {templateCount}
          </span>
          <span className="bg-slate-800 rounded px-2 py-1">
            Street: <span className="font-bold text-white">{handState.street}</span>
          </span>
          <span className="bg-slate-800 rounded px-2 py-1">
            Game:
            <select
              value={gameType}
              onChange={(e) => setGameType(e.target.value)}
              className="ml-1 bg-transparent font-bold text-white uppercase cursor-pointer"
              title="Game variant"
            >
              <option value="nlhe" className="text-black">NLHE</option>
              <option value="plo" className="text-black">PLO</option>
              <option value="plo_hilo" className="text-black">PLO Hi-Lo</option>
              <option value="plo5" className="text-black">PLO5</option>
              <option value="plo6" className="text-black">PLO6</option>
            </select>
          </span>
          <span className="bg-slate-800 rounded px-2 py-1">
            <label className="cursor-pointer">
              <input
                type="checkbox"
                checked={isTournament}
                onChange={(e) => setIsTournament(e.target.checked)}
                className="mr-1 align-middle"
              />
              <span className={'font-bold ' + (isTournament ? 'text-amber-300' : 'text-slate-500')}>MTT</span>
            </label>
            {isTournament && (
              <select
                value={tournamentStage}
                onChange={(e) => setTournamentStage(e.target.value)}
                className="ml-2 bg-transparent font-bold text-white uppercase cursor-pointer"
                title="Tournament stage"
              >
                <option value="early" className="text-black">EARLY</option>
                <option value="middle" className="text-black">MIDDLE</option>
                <option value="bubble" className="text-black">BUBBLE</option>
                <option value="itm" className="text-black">ITM</option>
                <option value="ft" className="text-black">FT</option>
              </select>
            )}
          </span>
          <span className="bg-slate-800 rounded px-2 py-1">
            Position: <span className="font-bold text-white">{position}</span>
          </span>
          {dealerSeat && (
            <span className="bg-slate-800 rounded px-2 py-1">
              Dealer: <span className="font-bold text-white">{dealerSeat}</span>
            </span>
          )}
          <span className="bg-slate-800 rounded px-2 py-1">
            Players:
            <input
              type="number"
              min="2"
              max="10"
              value={players}
              onChange={(e) => setPlayers(Math.max(2, Math.min(10, parseInt(e.target.value) || 2)))}
              className="w-8 ml-1 bg-transparent text-right font-bold text-white"
            />
          </span>
          {potSize > 0 && (
            <span className="bg-slate-800 rounded px-2 py-1">
              Pot: <span className="font-bold text-white">{potSize}</span>
            </span>
          )}
          {heroStack > 0 && (
            <span className="bg-slate-800 rounded px-2 py-1">
              Stack: <span className="font-bold text-white">{heroStack}</span>
            </span>
          )}
          {effectiveStack > 0 && effectiveStack !== heroStack && (
            <span className="bg-slate-800 rounded px-2 py-1">
              Eff: <span className="font-bold text-white">{effectiveStack}</span>
            </span>
          )}
          {bigBlind > 0 && (
            <span className="bg-slate-800 rounded px-2 py-1">
              BB: <span className="font-bold text-white">{bigBlind}</span>
            </span>
          )}
          {betToCall > 0 && (
            <span className="bg-slate-800 rounded px-2 py-1">
              To call: <span className="font-bold text-white">{betToCall}</span>
            </span>
          )}
          {availableActions && availableActions.any && (
            <span className="bg-slate-800 rounded px-2 py-1">
              Buttons:
              <span className={'ml-1 font-bold ' + (availableActions.fold ? 'text-rose-300' : 'text-slate-600')}>F</span>
              <span className={'ml-1 font-bold ' + (availableActions.checkCall ? 'text-sky-300' : 'text-slate-600')}>C</span>
              <span className={'ml-1 font-bold ' + (availableActions.betRaise ? 'text-emerald-300' : 'text-slate-600')}>R</span>
            </span>
          )}
          {/* Per-frame timing + frame counter removed per UX request.
              State still tracked internally for the debug overlay. */}
          <span className={'rounded px-2 py-1 ' + (storage.online ? 'bg-emerald-900/50 text-emerald-300' : 'bg-amber-900/50 text-amber-300')}>
            {storage.online ? 'Online' : 'Offline (queued)'}
          </span>
          <button
            onClick={newHand}
            className="bg-slate-700 hover:bg-slate-600 rounded px-2 py-1 font-semibold text-white"
          >
            Reset Hand
          </button>
        </div>

        {/* DECISION BANNER */}
        <div className={'mb-4 p-4 rounded-2xl bg-gradient-to-r ' + decisionColor + ' shadow-2xl'}>
          <div className="text-[10px] text-white/70 uppercase tracking-widest font-bold">Poker Brain says</div>
          <div className="text-4xl sm:text-5xl font-black text-white leading-none mt-1">
            {displayAction}
            {decision && decision.ready && decision.raiseAmount > 0 && (
              <span className="text-2xl ml-2">{decision.raiseAmount}</span>
            )}
          </div>
          <div className="text-sm text-white/90 mt-1">{displayReason}</div>
          {decision && decision.ready && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {equityPct !== null && (
                <div className="bg-black/30 rounded-lg px-2.5 py-1.5">
                  <div className="text-[9px] text-white/60 uppercase">Equity</div>
                  <div className="text-sm font-bold">{equityPct}%</div>
                </div>
              )}
              {potOddsPct !== null && potOddsPct > 0 && (
                <div className="bg-black/30 rounded-lg px-2.5 py-1.5">
                  <div className="text-[9px] text-white/60 uppercase">Pot odds</div>
                  <div className="text-sm font-bold">{potOddsPct}%</div>
                </div>
              )}
              {decision.handStrength && (
                <div className="bg-black/30 rounded-lg px-2.5 py-1.5">
                  <div className="text-[9px] text-white/60 uppercase">Hand</div>
                  <div className="text-sm font-bold">{decision.handStrength}</div>
                </div>
              )}
              {typeof decision.confidence === 'number' && (
                <div className="bg-black/30 rounded-lg px-2.5 py-1.5">
                  <div className="text-[9px] text-white/60 uppercase">Confidence</div>
                  <div className="text-sm font-bold">{Math.round(decision.confidence)}%</div>
                </div>
              )}
              {decision.outs > 0 && (
                <div className="bg-black/30 rounded-lg px-2.5 py-1.5">
                  <div className="text-[9px] text-white/60 uppercase">Outs</div>
                  <div className="text-sm font-bold">{decision.outs}</div>
                  {Array.isArray(decision.outsImproves) && decision.outsImproves.length > 0 && (
                    <div className="text-[9px] text-white/60 mt-0.5">
                      {decision.outsImproves.slice(0, 2).join(', ')}
                    </div>
                  )}
                </div>
              )}
              {decision.spr !== null && decision.spr !== undefined && (
                <div className="bg-black/30 rounded-lg px-2.5 py-1.5">
                  <div className="text-[9px] text-white/60 uppercase">SPR</div>
                  <div className="text-sm font-bold">{decision.spr}</div>
                </div>
              )}
              {decision.texture && (
                <div className="bg-black/30 rounded-lg px-2.5 py-1.5">
                  <div className="text-[9px] text-white/60 uppercase">Board</div>
                  <div className="text-sm font-bold">
                    {decision.texture.monotone ? 'monotone'
                      : decision.texture.paired ? 'paired'
                      : decision.texture.flushDraw && decision.texture.straightDraw ? 'wet'
                      : decision.texture.flushDraw ? 'flush-draw'
                      : decision.texture.straightDraw ? 'straight-draw'
                      : decision.texture.rainbow ? 'rainbow'
                      : 'dynamic'}
                  </div>
                </div>
              )}
              {decision.detection && (
                (() => {
                  const hc = decision.detection.holeConfidence;
                  const bc = decision.detection.boardConfidence;
                  const minConf = Math.min(
                    typeof hc === 'number' ? hc : 1,
                    typeof bc === 'number' ? bc : 1,
                  );
                  const pct = Math.round(minConf * 100);
                  const lowColor = pct < 90 ? 'text-amber-300' : 'text-white';
                  return (
                    <div className="bg-black/30 rounded-lg px-2.5 py-1.5">
                      <div className="text-[9px] text-white/60 uppercase">Detection</div>
                      <div className={'text-sm font-bold ' + lowColor}>{pct}%</div>
                      {decision.detection.unknownCount > 0 && (
                        <div className="text-[9px] text-amber-300 mt-0.5">
                          {decision.detection.unknownCount} unknown
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
              {pokerBrosHandLabel && (
                <div className="bg-black/30 rounded-lg px-2.5 py-1.5">
                  <div className="text-[9px] text-white/60 uppercase">OCR Label</div>
                  <div className="text-sm font-bold">{pokerBrosHandLabel}</div>
                </div>
              )}
              {/* Hi-Lo: high/low equity split */}
              {decision.isHiLo && typeof decision.highEquity === 'number' && (
                <div className="bg-black/30 rounded-lg px-2.5 py-1.5">
                  <div className="text-[9px] text-white/60 uppercase">Hi / Lo</div>
                  <div className="text-sm font-bold">
                    {Math.round(decision.highEquity)}% / {Math.round(decision.lowEquity || 0)}%
                  </div>
                </div>
              )}
              {/* Tournament: BB stack + M ratio */}
              {decision.isTournament && typeof decision.bbStack === 'number' && (
                <div className="bg-black/30 rounded-lg px-2.5 py-1.5">
                  <div className="text-[9px] text-white/60 uppercase">BB / M</div>
                  <div className="text-sm font-bold">
                    {decision.bbStack}bb{typeof decision.mRatio === 'number' ? ` / M${decision.mRatio}` : ''}
                  </div>
                </div>
              )}
              {/* Tournament: bubble factor */}
              {decision.isTournament && typeof decision.bubbleFactor === 'number' && decision.bubbleFactor > 1.0 && (
                <div className="bg-black/30 rounded-lg px-2.5 py-1.5">
                  <div className="text-[9px] text-white/60 uppercase">ICM</div>
                  <div className="text-sm font-bold">{decision.bubbleFactor.toFixed(2)}x</div>
                </div>
              )}
              {/* Tournament: push-fold hint */}
              {decision.pushFoldHint && (
                <div className={
                  'rounded-lg px-2.5 py-1.5 ' +
                  (decision.pushFoldHint.inRange ? 'bg-emerald-900/50' : 'bg-rose-900/50')
                }>
                  <div className="text-[9px] text-white/60 uppercase">Push/Fold</div>
                  <div className="text-sm font-bold">
                    {decision.pushFoldHint.handCode} — {decision.pushFoldHint.inRange ? 'SHOVE' : 'FOLD'}
                  </div>
                </div>
              )}
            </div>
          )}
          {actionValidation && !actionValidation.consistent && (
            <div className="mt-2 text-[11px] text-amber-200 bg-amber-900/30 border border-amber-500/40 rounded px-2 py-1">
              Heads up: {actionValidation.reason}
            </div>
          )}
        </div>

        {/* VALIDATOR WARNING */}
        {validator && validator.severity && validator.severity !== 'ok' && (
          <div className={
            'mb-3 p-3 rounded-xl border-2 ' +
            (validator.severity === 'critical'
              ? 'bg-rose-900/60 border-rose-500/60 text-rose-100'
              : 'bg-amber-900/40 border-amber-500/50 text-amber-100')
          }>
            <div className="text-xs font-bold uppercase tracking-wider">
              {validator.severity === 'critical' ? 'Detection error' : 'Detection warning'}
            </div>
            <div className="text-sm mt-1">{validator.reason}</div>
          </div>
        )}

        {/* DETECTED CARDS */}
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border-2 border-amber-400/40">
            <h2 className="text-sm font-bold text-amber-300 uppercase tracking-wider mb-3">
              Hole Cards
            </h2>
            <div className="flex gap-2">
              {handState.holeCards.length > 0 ? (
                handState.holeCards.map((card, i) => <DetectedCard key={'hole-' + i} card={card} />)
              ) : (
                <>
                  <EmptyCardSlot label="?" />
                  <EmptyCardSlot label="?" />
                </>
              )}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/15 to-teal-500/10 border-2 border-emerald-400/30">
            <h2 className="text-sm font-bold text-emerald-300 uppercase tracking-wider mb-3">
              Board
            </h2>
            <div className="flex gap-1.5 flex-wrap">
              {handState.boardCards.length > 0 ? (
                handState.boardCards.map((card, i) => <DetectedCard key={'board-' + i} card={card} />)
              ) : (
                [0, 1, 2, 3, 4].map((i) => (
                  <EmptyCardSlot key={'empty-' + i} label={i < 3 ? 'Flop' : i === 3 ? 'Turn' : 'River'} />
                ))
              )}
            </div>
          </div>
        </div>

        {/* SCREEN CAPTURE */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Screen Capture Feed
            </h2>
            <div className="flex items-center gap-2">
              {streamReady && !detecting && matcherReady && (
                <button
                  onClick={() => setDetecting(true)}
                  className="text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded-full"
                >
                  Start Detection
                </button>
              )}
              {streamReady && detecting && (
                <button
                  onClick={() => setDetecting(false)}
                  className="text-[11px] font-bold bg-amber-600 hover:bg-amber-500 text-white px-3 py-1 rounded-full"
                >
                  Pause Detection
                </button>
              )}
              {streamReady && (
                <button
                  onClick={() => setDebugMode((v) => !v)}
                  className={'text-[11px] font-bold px-3 py-1 rounded-full ' + (debugMode ? 'bg-fuchsia-600 hover:bg-fuchsia-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-white')}
                  title="Toggle auto-detect overlay + matcher probe log"
                >
                  {debugMode ? 'Hide Debug' : 'Debug'}
                </button>
              )}
              {streamReady && (
                <button
                  onClick={() => setCalibrationVisible((v) => !v)}
                  className={'text-[11px] font-bold px-3 py-1 rounded-full ' + (calibrationVisible ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-white')}
                >
                  {calibrationVisible ? 'Hide Calibration' : 'Calibrate'}
                </button>
              )}
              {streamReady && calibrationVisible && (
                <button
                  onClick={() => setCalibrationEditable((v) => !v)}
                  className={'text-[11px] font-bold px-3 py-1 rounded-full ' + (calibrationEditable ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-white')}
                >
                  {calibrationEditable ? 'Lock' : 'Edit Regions'}
                </button>
              )}
              {streamReady && calibrationVisible && (
                <button
                  onClick={() => setCalibrationFullScreen((v) => !v)}
                  className={'text-[11px] font-bold px-3 py-1 rounded-full ' + (calibrationFullScreen ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-white')}
                  title="Expand the capture feed to fill the viewport for precise manual calibration"
                >
                  {calibrationFullScreen ? 'Exit Full Screen' : 'Full Screen'}
                </button>
              )}
              {streamReady && calibrationVisible && layoutOverrides && (
                <button
                  onClick={resetCalibration}
                  className="text-[10px] bg-rose-700 hover:bg-rose-600 text-white px-2 py-1 rounded-full"
                >
                  Reset
                </button>
              )}
              {streamReady && (
                <button
                  onClick={stopStream}
                  className="text-[10px] bg-red-600/80 px-2 py-1 rounded-full border border-red-400 text-white"
                >
                  Stop
                </button>
              )}
            </div>
          </div>

          <div
            className={
              calibrationFullScreen
                ? 'fixed inset-0 z-[9999] bg-black/95 p-4'
                : 'relative rounded-xl overflow-hidden border border-white/10 bg-black mx-auto'
            }
            style={
              calibrationFullScreen
                ? undefined
                : videoNativeDims
                  ? {
                      // Match the real emulator aspect ratio so the preview
                      // isn't squished into a 16:9 box. Cap max-height at
                      // ~80vh so the feed stays on-screen next to the HUD.
                      aspectRatio: `${videoNativeDims.w} / ${videoNativeDims.h}`,
                      maxHeight: '80vh',
                      // Width derived from height*aspect, constrained by
                      // the parent — the mx-auto centers the box inside
                      // the HUD panel.
                      width: 'auto',
                      height: '80vh',
                      maxWidth: '100%',
                    }
                  : { aspectRatio: '16 / 9' }
            }
          >
            {calibrationFullScreen && (
              <button
                onClick={() => setCalibrationFullScreen(false)}
                className="absolute top-4 right-4 z-20 text-xs font-bold px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg"
              >
                Exit Full Screen
              </button>
            )}
            {/* Inner positioning wrapper — video lives absolute inset-0 inside
                this box, so CalibrationOverlay and AutoDetectOverlay can
                continue to use the same letterbox math whether we're in
                the normal aspect-video card or the fullscreen overlay. */}
            <div className={calibrationFullScreen ? 'relative w-full h-full' : 'absolute inset-0'}>
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-contain bg-black"
                playsInline
                muted
                autoPlay
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  if (v.videoWidth && v.videoHeight) {
                    setVideoNativeDims({ w: v.videoWidth, h: v.videoHeight });
                  }
                }}
              />
            {!streamReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-4 text-center">
                <p className="text-sm font-semibold mb-3">
                  Capture your PokerBros emulator window
                </p>
                <button
                  onClick={startScreenCapture}
                  className="px-6 py-3 rounded-lg text-sm font-semibold bg-gradient-to-r from-blue-500 to-indigo-500 text-white"
                >
                  Share Screen
                </button>
                {streamError && <p className="mt-3 text-red-400 text-xs">{streamError}</p>}
                {!matcherReady && (
                  <p className="mt-3 text-amber-400 text-xs">Loading card templates...</p>
                )}
              </div>
            )}
            {streamReady && (
              <div className="absolute top-2 left-2 flex items-center gap-2 bg-black/70 px-2.5 py-1 rounded-full border border-white/20">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-semibold">LIVE</span>
              </div>
            )}
            {streamReady && (
              <CalibrationOverlay
                videoRef={videoRef}
                baseLayout={effectiveLayout}
                overrides={layoutOverrides}
                onOverridesChange={handleOverridesChange}
                visible={calibrationVisible}
                editable={calibrationEditable}
                liveSnapshotRef={detectionSnapshotRef}
                showLiveRegions={calibrationVisible}
                variant={gameType}
              />
            )}
            {streamReady && (
              <AutoDetectOverlay
                videoRef={videoRef}
                snapshotRef={detectionSnapshotRef}
                visible={debugMode}
              />
            )}
            </div>
          </div>

          {/* DEBUG PROBE PANEL
              Consumes debugProbe — set by the detection loop when
              debugMode is on. Shows the matcher's top-3 candidate list
              per region so mismatches can be diagnosed (wrong
              template, wrong region, threshold too tight, etc.). */}
          {debugMode && debugProbe && (
            <div className="mt-2 rounded-lg border border-fuchsia-500/40 bg-fuchsia-950/30 p-2 text-[10px] font-mono text-fuchsia-100 max-h-64 overflow-auto">
              <div className="mb-1 text-fuchsia-300 font-bold">
                Probe {debugProbe.variant} &middot; {debugProbe.videoW}x{debugProbe.videoH} &middot; tpl:{debugProbe.templates ?? '?'} &middot; {new Date(debugProbe.ts).toLocaleTimeString()}
              </div>
              {(debugProbe.log || []).slice(0, 24).map((entry, i) => (
                <div key={'probe-' + i} className="truncate">
                  {entry.kind || entry.note || 'entry'}
                  {entry.slot !== undefined ? ' [' + entry.slot + ']' : ''}
                  {entry.bestKey ? ' picked:' + entry.bestKey + ' d=' + entry.distance : ''}
                  {Array.isArray(entry.candidates) && entry.candidates.length > 0
                    ? ' | ' + entry.candidates.slice(0, 3).map((c) => c.key + ':' + c.distance).join(', ')
                    : ''}
                </div>
              ))}
            </div>
          )}

          {matcherReady && templateCount < 10 && (
            <p className="mt-2 text-[11px] text-amber-400 leading-snug">
              Only {templateCount} templates loaded. Detection accuracy will improve as the full
              52-card library is captured. Play more hands to build the library.
            </p>
          )}
        </div>

        {/* HAND HISTORY */}
        <HandHistory hands={recentHands} />
      </div>
    </div>
  );
};

export default PokerBrainHUD;
