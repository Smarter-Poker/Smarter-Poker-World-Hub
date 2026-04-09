import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getMatcher } from '../../lib/poker-brain/matcher';
import layoutData from '../../lib/poker-brain/layout.json';
import PokerBrainEngine from '../../lib/poker-brain/engine';
import { getBridgedDecision } from '../../lib/poker-brain/decision-bridge';
import { HandStateMachine, STREETS } from '../../lib/poker-brain/state';
import { detectDealer, heroPositionFromDealer } from '../../lib/poker-brain/dealer-detect';
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
// Main HUD
// ---------------------------------------------------------------------------
const PokerBrainHUD = ({ preAcquiredStream = null, initialMode = 'screen', onClose } = {}) => {
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

  // Game state inputs
  const [players, setPlayers] = useState(6);
  const [potSize, setPotSize] = useState(0);
  const [heroStack, setHeroStack] = useState(0);
  const [bigBlind, setBigBlind] = useState(0);
  const [position, setPosition] = useState('middle');
  const [dealerSeat, setDealerSeat] = useState(null);

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
  const [layoutOverrides, setLayoutOverrides] = useState(null);

  // Hand strength OCR label (from PokerBros UI)
  const [pokerBrosHandLabel, setPokerBrosHandLabel] = useState('');

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

  // Storage (Supabase + IndexedDB queue)
  const storage = usePokerBrainStorage(supabase);

  // ============================================================================
  // STATE MACHINE (created once)
  // ============================================================================
  useEffect(() => {
    stateMachineRef.current = new HandStateMachine({
      requiredFrames: 2,
      onHandStart: (hand) => {
        // Nothing - state is captured in onStateChange
      },
      onHandEnd: (hand) => {
        if (!hand) return;
        setRecentHands((prev) => [hand, ...prev].slice(0, 20));
        if (storage.ready && sessionIdRef.current) {
          storage.logHand({
            sessionId: sessionIdRef.current,
            handId: hand.handId,
            startedAt: hand.startedAt,
            endedAt: hand.endedAt,
            holeCards: hand.holeCards,
            flop: hand.flop,
            turn: hand.turn,
            river: hand.river,
            finalBoard: hand.finalBoard,
            decisions: hand.streetDecisions,
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
  }, [storage]);

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
  useEffect(() => {
    if (!storage.ready || !detecting || sessionIdRef.current) return;
    storage.startSession({
      client: 'pokerbros',
      gameType: 'nlhe',
      startedAt: Date.now(),
    }).then((res) => {
      if (res && res.sessionId) sessionIdRef.current = res.sessionId;
    }).catch((err) => console.warn('[HUD] startSession failed', err));
  }, [storage, detecting]);

  useEffect(() => {
    return () => {
      if (storage.ready && sessionIdRef.current) {
        storage.endSession({
          sessionId: sessionIdRef.current,
          endedAt: Date.now(),
        }).catch(() => {});
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
      });
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

    const loop = async () => {
      const now = performance.now();

      // ---- Card + dealer detection (4 Hz) ----
      if (now - lastDetectTimeRef.current >= DETECT_INTERVAL_MS) {
        lastDetectTimeRef.current = now;
        const video = videoRef.current;
        const matcher = matcherRef.current;
        if (video && matcher && matcher.isReady()) {
          try {
            const result = matcher.matchAllRegions(video, effectiveLayout);
            setLastTimingMs(Math.round(result.timingMs * 10) / 10);
            setFrameCount((c) => c + 1);

            // Suit-color verification pass (PokerBros 4-color deck sanity check)
            const srcW = video.videoWidth || video.width;
            const srcH = video.videoHeight || video.height;
            const refW = effectiveLayout.referenceSize?.w || 480;
            const refH = effectiveLayout.referenceSize?.h || 1054;
            const csx = srcW / refW;
            const csy = srcH / refH;
            const verifiedHole = (result.holeCards || []).map((card, i) => {
              const r = effectiveLayout.holeCards?.[i];
              if (!r || !card || !card.suit) return card;
              return verifyCardSuit(card, video, scaleRect(r, csx, csy));
            });
            const verifiedBoard = (result.boardCards || []).map((card, i) => {
              const r = effectiveLayout.boardCards?.[i];
              if (!r || !card || !card.suit) return card;
              return verifyCardSuit(card, video, scaleRect(r, csx, csy));
            });

            // Feed the state machine with color-verified cards
            if (stateMachineRef.current) {
              stateMachineRef.current.observe(verifiedHole, verifiedBoard);
            }

            // Dealer button detection (piggybacks on the same frame)
            try {
              const dealer = detectDealer(video, effectiveLayout);
              if (dealer.seatId) {
                setDealerSeat(dealer.seatId);
                setPosition(heroPositionFromDealer(dealer.seatId, players));
              }
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

            const run = async (name, method) => {
              const raw = effectiveLayout.ocrRegions[name];
              if (!raw) return null;
              const rect = scaleRect(raw, sx, sy);
              const crop = cropToCanvas(full, rect);
              try {
                return await ocr[method](crop);
              } catch (err) {
                return null;
              }
            };

            // Fire and forget (they debounce internally)
            run('pot', 'readPotSize').then((r) => {
              if (r && typeof r.value === 'number') setPotSize(r.value);
            }).catch(() => {});
            run('heroStack', 'readStackSizes').then((r) => {
              if (r && typeof r.value === 'number') setHeroStack(r.value);
            }).catch(() => {});
            run('blindLevel', 'readBlindLevel').then((r) => {
              if (r && r.bigBlind) setBigBlind(r.bigBlind);
            }).catch(() => {});

            // Hand strength label (plain readRegion, then stored for validator)
            const hsRaw = effectiveLayout.ocrRegions.handStrength;
            if (hsRaw && typeof ocr.readRegion === 'function') {
              const rect = scaleRect(hsRaw, sx, sy);
              const crop = cropToCanvas(full, rect);
              ocr.readRegion(crop).then((r) => {
                if (r && r.text) setPokerBrosHandLabel(r.text);
              }).catch(() => {});
            }
          }
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [streamReady, matcherReady, detecting, players]);

  // ============================================================================
  // DECISION COMPUTATION (reruns when state or game inputs change)
  // ============================================================================
  useEffect(() => {
    if (handState.holeCards.length < 2) {
      setDecision(null);
      setValidator(null);
      return;
    }
    const bridged = getBridgedDecision({
      rawHoleCards: handState.holeCards,
      rawBoardCards: handState.boardCards,
      gameType: 'nlhe',
      potSize,
      betToCall: bigBlind,
      stackSize: heroStack,
      position,
      numPlayers: players,
      blindLevel: bigBlind || 1,
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
  }, [handState, potSize, heroStack, bigBlind, position, players, pokerBrosHandLabel]);

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
    if (stateMachineRef.current) stateMachineRef.current.reset();
  };

  const equityPct = decision && decision.ready && typeof decision.equity === 'number'
    ? Math.round(decision.equity * 100)
    : null;
  const potOddsPct = decision && decision.ready && typeof decision.potOdds === 'number'
    ? Math.round(decision.potOdds * 100)
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
            Position: <span className="font-bold text-white">{position}</span>
          </span>
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
          {bigBlind > 0 && (
            <span className="bg-slate-800 rounded px-2 py-1">
              BB: <span className="font-bold text-white">{bigBlind}</span>
            </span>
          )}
          {detecting && (
            <>
              <span className="bg-slate-800 rounded px-2 py-1">{lastTimingMs}ms/frame</span>
              <span className="bg-slate-800 rounded px-2 py-1">Frames: {frameCount}</span>
            </>
          )}
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
                  <div className="text-sm font-bold">{Math.round(decision.confidence * 100)}%</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* VALIDATOR WARNING */}
        {validator && validator.severity === 'critical' && (
          <div className="mb-3 p-3 rounded-xl bg-rose-900/60 border-2 border-rose-500/60 text-rose-100">
            <div className="text-xs font-bold uppercase tracking-wider">Detection warning</div>
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

          <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black aspect-video">
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-contain bg-black"
              playsInline
              muted
              autoPlay
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
              />
            )}
          </div>

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
