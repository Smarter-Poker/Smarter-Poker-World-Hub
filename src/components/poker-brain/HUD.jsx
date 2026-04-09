import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getMatcher } from '../../lib/poker-brain/matcher';
import layoutData from '../../lib/poker-brain/layout.json';

/**
 * Poker Brain HUD v3 -- AUTO-DETECTION EDITION
 * -----------------------------------------------
 * Replaces the manual tap-to-pick card entry with real-time template-matching
 * card detection from a screen-capture feed of PokerBros.
 *
 * How it works:
 *   1. User starts screen capture of their PokerBros emulator window
 *   2. Every 250ms (4 Hz), the HUD grabs a frame from the video
 *   3. The matcher crops each card region, computes a dHash, and compares
 *      against preloaded 64-bit template hashes
 *   4. Detected cards feed into the decision engine (evaluatePreflopNLHE /
 *      evaluateHoldemMade) for Fold / Call / Raise recommendations
 *
 * Props:
 *   preAcquiredStream  -- MediaStream already obtained by the launcher
 *   initialMode        -- 'camera' | 'screen'
 *   onClose            -- () => void
 */

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = ['s', 'h', 'd', 'c'];

// PokerBros 4-color deck styling
const SUIT_DISPLAY = {
  s: { glyph: '\u2660', label: 'Spades',   color: '#1a1a2e' },
  h: { glyph: '\u2665', label: 'Hearts',   color: '#dc2626' },
  d: { glyph: '\u2666', label: 'Diamonds', color: '#2563eb' },
  c: { glyph: '\u2663', label: 'Clubs',    color: '#16a34a' },
};

const GAME_TYPES = [
  { key: 'nlhe', label: "No-Limit Hold'em", holeCount: 2, hiLo: false },
];

const cardToValue = (r) => ({
  A: 14, K: 13, Q: 12, J: 11, T: 10,
  9: 9, 8: 8, 7: 7, 6: 6, 5: 5, 4: 4, 3: 3, 2: 2,
}[r] || 0);

// ---------------------------------------------------------------------------
// Hand evaluation (honest, well-known poker heuristics)
// ---------------------------------------------------------------------------
function evaluatePreflopNLHE(hole) {
  if (hole.length < 2) return null;
  const [a, b] = hole;
  const va = cardToValue(a.rank);
  const vb = cardToValue(b.rank);
  const high = Math.max(va, vb);
  const low = Math.min(va, vb);
  const suited = a.suit === b.suit;
  const gap = high - low;

  let tier, label;
  if (va === vb && va >= 10)          { tier = 0.95; label = 'Pocket ' + a.rank + a.rank; }
  else if (va === vb && va >= 7)      { tier = 0.82; label = 'Pocket ' + a.rank + a.rank; }
  else if (va === vb)                 { tier = 0.68; label = 'Pocket ' + a.rank + a.rank; }
  else if (high === 14 && low >= 10)  { tier = suited ? 0.85 : 0.78; label = 'AK-AT' + (suited ? ' suited' : ''); }
  else if (high === 14)              { tier = suited ? 0.60 : 0.42; label = 'Ace-' + (a.rank === 'A' ? b.rank : a.rank) + (suited ? ' suited' : ''); }
  else if (high >= 12 && low >= 10)  { tier = suited ? 0.72 : 0.62; label = 'Broadway' + (suited ? ' suited' : ''); }
  else if (suited && gap <= 2 && low >= 5) { tier = 0.55; label = 'Suited connector'; }
  else if (gap === 1 && low >= 5)    { tier = 0.42; label = 'Connector'; }
  else if (suited)                   { tier = 0.38; label = 'Suited rags'; }
  else                               { tier = 0.22; label = 'Weak offsuit'; }
  return { strength: tier, label, preflop: true };
}

function evaluateHoldemMade(hole, board) {
  const all = [...hole, ...board];
  const ranks = all.map((c) => cardToValue(c.rank)).sort((a, b) => b - a);
  const suits = all.map((c) => c.suit);
  const rankCounts = {};
  for (const v of ranks) rankCounts[v] = (rankCounts[v] || 0) + 1;
  const counts = Object.values(rankCounts).sort((a, b) => b - a);
  const suitCounts = {};
  for (const s of suits) suitCounts[s] = (suitCounts[s] || 0) + 1;
  const flushSuit = Object.entries(suitCounts).find(([, n]) => n >= 5);
  const hasStraight = (arr) => {
    const sorted = Array.from(new Set(arr)).sort((a, b) => a - b);
    if (sorted.includes(14)) sorted.unshift(1);
    let run = 1;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i - 1] + 1) { run++; if (run >= 5) return true; }
      else run = 1;
    }
    return false;
  };

  if (flushSuit) {
    const flushRanks = all.filter((c) => c.suit === flushSuit[0]).map((c) => cardToValue(c.rank));
    if (hasStraight(flushRanks)) return { strength: 0.99, label: 'Straight flush' };
    return { strength: 0.93, label: 'Flush' };
  }
  if (counts[0] === 4) return { strength: 0.97, label: 'Four of a kind' };
  if (counts[0] === 3 && counts[1] >= 2) return { strength: 0.9, label: 'Full house' };
  if (hasStraight(ranks)) return { strength: 0.85, label: 'Straight' };
  if (counts[0] === 3) return { strength: 0.74, label: 'Three of a kind' };
  if (counts[0] === 2 && counts[1] === 2) return { strength: 0.62, label: 'Two pair' };
  if (counts[0] === 2) {
    const pairRank = Object.entries(rankCounts).find(([, n]) => n === 2)[0];
    const usesHole = hole.some((c) => cardToValue(c.rank) === Number(pairRank));
    if (!usesHole) return { strength: 0.35, label: 'Board pair' };
    const boardMax = board.length ? Math.max(...board.map((c) => cardToValue(c.rank))) : 0;
    if (Number(pairRank) > boardMax) return { strength: 0.56, label: 'Overpair / top pair' };
    return { strength: 0.46, label: 'Middle / bottom pair' };
  }
  const holeMax = Math.max(...hole.map((c) => cardToValue(c.rank)));
  return { strength: holeMax >= 13 ? 0.32 : 0.18, label: 'High card' };
}

function decide(holeCards, boardCards, players) {
  if (holeCards.length < 2) {
    return { action: 'SCANNING', reasoning: 'Waiting for hole cards to be detected', strength: null, handType: null };
  }

  let evalResult;
  if (boardCards.length < 3) {
    evalResult = evaluatePreflopNLHE(holeCards);
  } else {
    evalResult = evaluateHoldemMade(holeCards, boardCards);
  }
  if (!evalResult) return { action: 'WAIT', reasoning: 'Not enough data', strength: null, handType: null };

  const adjusted = evalResult.strength * (1 - Math.max(0, players - 2) * 0.04);
  let action, reasoning;
  if (adjusted > 0.78)      { action = 'RAISE';      reasoning = 'Premium -- bet for value'; }
  else if (adjusted > 0.60) { action = 'RAISE/CALL'; reasoning = 'Strong -- raise or call'; }
  else if (adjusted > 0.45) { action = 'CALL';       reasoning = 'Playable -- continue carefully'; }
  else if (adjusted > 0.30) { action = 'CHECK/FOLD'; reasoning = 'Marginal -- fold vs aggression'; }
  else                      { action = 'FOLD';       reasoning = 'Weak -- fold and wait'; }
  return {
    action,
    reasoning,
    strength: Math.round(adjusted * 100),
    handType: evalResult.label,
  };
}

// ---------------------------------------------------------------------------
// Detection state debouncer
// ---------------------------------------------------------------------------
function useStableDetection(rawHole, rawBoard, requiredFrames = 2) {
  const [stableHole, setStableHole] = useState([]);
  const [stableBoard, setStableBoard] = useState([]);
  const prevHoleRef = useRef('');
  const prevBoardRef = useRef('');
  const frameCountRef = useRef(0);

  useEffect(() => {
    const holeKey = rawHole.map((c) => c.rank + c.suit).join(',');
    const boardKey = rawBoard.map((c) => c.rank + c.suit).join(',');
    const combined = holeKey + '|' + boardKey;

    if (combined === prevHoleRef.current + '|' + prevBoardRef.current) {
      // Same as last detection -- increment stability counter
      frameCountRef.current++;
      if (frameCountRef.current >= requiredFrames) {
        setStableHole(rawHole);
        setStableBoard(rawBoard);
      }
    } else {
      // Changed -- reset counter
      prevHoleRef.current = holeKey;
      prevBoardRef.current = boardKey;
      frameCountRef.current = 1;
    }
  }, [rawHole, rawBoard, requiredFrames]);

  return { stableHole, stableBoard };
}

// ---------------------------------------------------------------------------
// Card display component
// ---------------------------------------------------------------------------
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
      <span
        className="text-2xl font-black leading-none"
        style={{ color: suit.color }}
      >
        {card.rank}
      </span>
      <span
        className="text-lg leading-none"
        style={{ color: suit.color }}
      >
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
// Main HUD
// ---------------------------------------------------------------------------
const PokerBrainHUD = ({ preAcquiredStream = null, initialMode = 'screen', onClose } = {}) => {
  const [source, setSource] = useState(preAcquiredStream ? initialMode : null);
  const [streamReady, setStreamReady] = useState(!!preAcquiredStream);
  const [streamError, setStreamError] = useState(null);
  const [players, setPlayers] = useState(6);
  const [matcherReady, setMatcherReady] = useState(false);
  const [templateCount, setTemplateCount] = useState(0);
  const [detecting, setDetecting] = useState(false);
  const [lastTimingMs, setLastTimingMs] = useState(0);
  const [frameCount, setFrameCount] = useState(0);

  // Raw detection (before debounce)
  const [rawHole, setRawHole] = useState([]);
  const [rawBoard, setRawBoard] = useState([]);

  const videoRef = useRef(null);
  const streamRef = useRef(preAcquiredStream);
  const matcherRef = useRef(null);
  const rafRef = useRef(null);
  const lastDetectTimeRef = useRef(0);

  // Debounced stable detection (2 consecutive matching frames)
  const { stableHole, stableBoard } = useStableDetection(rawHole, rawBoard, 2);

  // ============================================================================
  // MATCHER INITIALIZATION
  // ============================================================================
  useEffect(() => {
    const matcher = getMatcher();
    matcherRef.current = matcher;

    matcher.loadTemplates('/hub/poker-brain/templates').then(() => {
      setMatcherReady(true);
      setTemplateCount(matcher.getTemplateCount());
      console.log('[HUD] Matcher loaded with', matcher.getTemplateCount(), 'templates');
    }).catch((err) => {
      console.error('[HUD] Failed to load templates:', err);
    });
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
  // DETECTION LOOP (4 Hz = every 250ms)
  // ============================================================================
  useEffect(() => {
    if (!streamReady || !matcherReady || !detecting) return;

    const DETECT_INTERVAL_MS = 250; // 4 Hz

    const detectLoop = () => {
      const now = performance.now();

      if (now - lastDetectTimeRef.current >= DETECT_INTERVAL_MS) {
        lastDetectTimeRef.current = now;

        if (videoRef.current && matcherRef.current && matcherRef.current.isReady()) {
          const result = matcherRef.current.matchAllRegions(videoRef.current, layoutData);
          setRawHole(result.holeCards);
          setRawBoard(result.boardCards);
          setLastTimingMs(Math.round(result.timingMs * 10) / 10);
          setFrameCount((c) => c + 1);
        }
      }

      rafRef.current = requestAnimationFrame(detectLoop);
    };

    rafRef.current = requestAnimationFrame(detectLoop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [streamReady, matcherReady, detecting]);

  // ============================================================================
  // DECISION
  // ============================================================================
  const decision = useMemo(
    () => decide(stableHole, stableBoard, players),
    [stableHole, stableBoard, players],
  );

  const decisionColor =
    decision.action === 'RAISE' ? 'from-emerald-500 to-green-600'
    : decision.action === 'RAISE/CALL' ? 'from-green-500 to-teal-600'
    : decision.action === 'CALL' ? 'from-sky-500 to-blue-600'
    : decision.action === 'CHECK/FOLD' ? 'from-amber-500 to-orange-600'
    : decision.action === 'FOLD' ? 'from-rose-500 to-red-600'
    : 'from-slate-600 to-slate-700';

  const newHand = () => {
    setRawHole([]);
    setRawBoard([]);
  };

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
              Auto-detection via template matching | PokerBros NLH
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
          {detecting && (
            <>
              <span className="bg-slate-800 rounded px-2 py-1">
                {lastTimingMs}ms/frame
              </span>
              <span className="bg-slate-800 rounded px-2 py-1">
                Frames: {frameCount}
              </span>
            </>
          )}
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
          <div className="text-4xl sm:text-5xl font-black text-white leading-none mt-1">{decision.action}</div>
          <div className="text-sm text-white/90 mt-1">{decision.reasoning}</div>
          {decision.strength !== null && (
            <div className="mt-3 flex items-center gap-3 text-xs">
              <div className="bg-black/30 rounded-lg px-2.5 py-1.5">
                <div className="text-[9px] text-white/60 uppercase">Strength</div>
                <div className="text-sm font-bold">{decision.strength}%</div>
              </div>
              {decision.handType && (
                <div className="bg-black/30 rounded-lg px-2.5 py-1.5">
                  <div className="text-[9px] text-white/60 uppercase">Hand</div>
                  <div className="text-sm font-bold">{decision.handType}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* DETECTED CARDS */}
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Hole Cards */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border-2 border-amber-400/40">
            <h2 className="text-sm font-bold text-amber-300 uppercase tracking-wider mb-3">
              Hole Cards
            </h2>
            <div className="flex gap-2">
              {stableHole.length > 0 ? (
                stableHole.map((card, i) => <DetectedCard key={'hole-' + i} card={card} />)
              ) : (
                <>
                  <EmptyCardSlot label="?" />
                  <EmptyCardSlot label="?" />
                </>
              )}
            </div>
          </div>

          {/* Board Cards */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/15 to-teal-500/10 border-2 border-emerald-400/30">
            <h2 className="text-sm font-bold text-emerald-300 uppercase tracking-wider mb-3">
              Board
            </h2>
            <div className="flex gap-1.5 flex-wrap">
              {stableBoard.length > 0 ? (
                stableBoard.map((card, i) => <DetectedCard key={'board-' + i} card={card} />)
              ) : (
                [0, 1, 2, 3, 4].map((i) => <EmptyCardSlot key={'empty-' + i} label={i < 3 ? 'Flop' : i === 3 ? 'Turn' : 'River'} />)
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
          </div>

          {!matcherReady && (
            <p className="mt-2 text-[11px] text-amber-400 leading-snug">
              Loading templates... Detection will start automatically once templates are ready.
            </p>
          )}
          {matcherReady && templateCount < 10 && (
            <p className="mt-2 text-[11px] text-amber-400 leading-snug">
              Only {templateCount} templates loaded. Detection accuracy will improve as more card
              templates are added. Play more hands to build the full library.
            </p>
          )}
          {matcherReady && templateCount >= 10 && (
            <p className="mt-2 text-[11px] text-slate-500 leading-snug">
              {templateCount} templates loaded. Share your PokerBros emulator screen,
              then click Start Detection. Cards are recognized via perceptual hashing at 4 Hz.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default PokerBrainHUD;
