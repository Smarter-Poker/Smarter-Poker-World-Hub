import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Poker Brain HUD v2
 * -------------------
 * Props:
 *   preAcquiredStream  — MediaStream already obtained by the launcher (camera or screen)
 *   initialMode        — 'camera' | 'screen' (source) — defaults to 'camera'
 *   onClose            — () => void, closes the HUD and stops the stream
 *   userId             — optional, for future Supabase logging
 */
const PokerBrainHUDv2 = ({ preAcquiredStream = null, initialMode = 'camera', onClose, userId } = {}) => {
  // ============================================================================
  // STATE
  // ============================================================================
  const [source, setSource] = useState(preAcquiredStream ? initialMode : null); // 'camera' | 'screen' | null
  const [streamReady, setStreamReady] = useState(!!preAcquiredStream);
  const [streamError, setStreamError] = useState(null);
  const [detectionMode, setDetectionMode] = useState('hybrid'); // 'manual' | 'auto' | 'hybrid'
  const [detectionActive, setDetectionActive] = useState(false);
  const [confidence, setConfidence] = useState(0);
  const [detectedCards, setDetectedCards] = useState([]);
  const [decision, setDecision] = useState(null);
  const [fps, setFps] = useState(0);
  const [showRegions, setShowRegions] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState('pokerstars');
  const [manualCards, setManualCards] = useState({ community: [], hero: [] });
  const [manualPlayers, setManualPlayers] = useState(6);
  const [gameType, setGameType] = useState('nlhe');

  const frameBufferRef = useRef([]);
  const fpsCounterRef = useRef({ frameCount: 0, lastTime: Date.now() });
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(preAcquiredStream);

  // ============================================================================
  // POKER CLIENT PROFILES (Normalized 0-1 Coordinates)
  // ============================================================================
  const pokerClientProfiles = {
    pokerstars: {
      name: 'PokerStars',
      regions: {
        heroCards:      { x: 0.05, y: 0.8,  w: 0.25, h: 0.18 },
        communityCards: { x: 0.35, y: 0.35, w: 0.30, h: 0.15 },
        potSize:        { x: 0.40, y: 0.15, w: 0.20, h: 0.08 },
        heroStack:      { x: 0.05, y: 0.68, w: 0.20, h: 0.08 },
      },
    },
    ggpoker: {
      name: 'GGPoker',
      regions: {
        heroCards:      { x: 0.08, y: 0.75, w: 0.22, h: 0.20 },
        communityCards: { x: 0.38, y: 0.38, w: 0.24, h: 0.12 },
        potSize:        { x: 0.35, y: 0.20, w: 0.30, h: 0.10 },
        heroStack:      { x: 0.08, y: 0.65, w: 0.22, h: 0.08 },
      },
    },
    wptonline: {
      name: 'WPT Global',
      regions: {
        heroCards:      { x: 0.10, y: 0.78, w: 0.20, h: 0.18 },
        communityCards: { x: 0.40, y: 0.36, w: 0.20, h: 0.14 },
        potSize:        { x: 0.38, y: 0.18, w: 0.24, h: 0.09 },
        heroStack:      { x: 0.10, y: 0.67, w: 0.20, h: 0.08 },
      },
    },
    partypoker: {
      name: 'partypoker',
      regions: {
        heroCards:      { x: 0.10, y: 0.78, w: 0.20, h: 0.18 },
        communityCards: { x: 0.40, y: 0.36, w: 0.20, h: 0.14 },
        potSize:        { x: 0.38, y: 0.18, w: 0.24, h: 0.09 },
        heroStack:      { x: 0.10, y: 0.67, w: 0.20, h: 0.08 },
      },
    },
    ignition: {
      name: 'Ignition / Bovada',
      regions: {
        heroCards:      { x: 0.06, y: 0.79, w: 0.24, h: 0.19 },
        communityCards: { x: 0.32, y: 0.33, w: 0.36, h: 0.16 },
        potSize:        { x: 0.35, y: 0.14, w: 0.30, h: 0.09 },
        heroStack:      { x: 0.06, y: 0.66, w: 0.24, h: 0.08 },
      },
    },
    generic: {
      name: 'Generic / Camera',
      regions: {
        heroCards:      { x: 0.25, y: 0.70, w: 0.50, h: 0.25 },
        communityCards: { x: 0.20, y: 0.35, w: 0.60, h: 0.20 },
        potSize:        { x: 0.35, y: 0.15, w: 0.30, h: 0.12 },
        heroStack:      { x: 0.05, y: 0.85, w: 0.20, h: 0.10 },
      },
    },
  };

  // ============================================================================
  // STREAM MANAGEMENT
  // ============================================================================

  // Attach pre-acquired stream on first mount
  useEffect(() => {
    if (preAcquiredStream && videoRef.current) {
      videoRef.current.srcObject = preAcquiredStream;
      videoRef.current.play().catch(() => {});
      streamRef.current = preAcquiredStream;
      setStreamReady(true);
    }
    // Cleanup on unmount
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCamera = useCallback(async () => {
    setStreamError(null);
    try {
      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setSource('camera');
      setStreamReady(true);
    } catch (err) {
      console.error(err);
      setStreamError(err.message || 'Camera not available');
    }
  }, []);

  const startScreenCapture = useCallback(async () => {
    setStreamError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      // Browser stop (user clicks "Stop sharing")
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        setSource(null);
        setStreamReady(false);
        setDetectionActive(false);
      });
      setSource('screen');
      setStreamReady(true);
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        console.error(err);
        setStreamError(err.message || 'Screen capture failed');
      }
    }
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setSource(null);
    setStreamReady(false);
    setDetectionActive(false);
  }, []);

  // ============================================================================
  // CARD DETECTION (color-based fallback)
  // ============================================================================
  const detectCardsInRegion = useCallback((imageData, region) => {
    if (!imageData || !region) return [];
    const { data, width, height } = imageData;
    const regionWidth = Math.floor(width * region.w);
    const regionHeight = Math.floor(height * region.h);
    const startX = Math.floor(width * region.x);
    const startY = Math.floor(height * region.y);
    const cards = [];
    const cardWidth = Math.floor(regionWidth / 2);

    for (let cardIndex = 0; cardIndex < 2; cardIndex++) {
      const cardStartX = startX + cardIndex * cardWidth;
      let redSum = 0, greenSum = 0, blueSum = 0, pixelCount = 0, brightnessSum = 0;
      for (let y = startY; y < startY + regionHeight; y += 2) {
        for (let x = cardStartX; x < cardStartX + cardWidth; x += 2) {
          if (x >= 0 && x < width && y >= 0 && y < height) {
            const idx = (y * width + x) * 4;
            const r = data[idx], g = data[idx + 1], b = data[idx + 2];
            redSum += r; greenSum += g; blueSum += b;
            brightnessSum += (r + g + b) / 3;
            pixelCount++;
          }
        }
      }
      if (pixelCount > 0) {
        const avgRed = Math.round(redSum / pixelCount);
        const avgGreen = Math.round(greenSum / pixelCount);
        const avgBlue = Math.round(blueSum / pixelCount);
        const avgBrightness = brightnessSum / pixelCount;
        const isCardPresent = avgBrightness > 80 && (avgRed + avgGreen + avgBlue) > 100;
        if (isCardPresent) {
          cards.push({
            position: cardIndex,
            rank: estimateRankFromBrightness(avgBrightness),
            suit: estimateSuitFromColor(avgRed, avgGreen, avgBlue),
            confidence: Math.min(avgBrightness / 255, 1),
          });
        }
      }
    }
    return cards;
  }, []);

  const estimateRankFromBrightness = (brightness) => {
    const ranks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
    const index = Math.floor((255 - brightness) / (255 / 13));
    return ranks[Math.max(0, Math.min(12, index))];
  };

  const estimateSuitFromColor = (r, g, b) => {
    if (r > g + 30 && r > b + 30) return '♥';
    if (g > r && g > b) return '♣';
    if (b > r && b > g) return '♠';
    return '♦';
  };

  const isDetectionStable = useCallback((newDetection) => {
    frameBufferRef.current.push(newDetection);
    if (frameBufferRef.current.length > 5) frameBufferRef.current.shift();
    if (frameBufferRef.current.length < 3) return false;
    const consistent = frameBufferRef.current.filter((frame) =>
      frame && newDetection && frame.length === newDetection.length &&
      frame.every((c, i) => newDetection[i] && c.rank === newDetection[i].rank && c.suit === newDetection[i].suit)
    );
    return consistent.length >= 3;
  }, []);

  // ============================================================================
  // FRAME CAPTURE LOOP (500ms)
  // ============================================================================
  useEffect(() => {
    if (!detectionActive || detectionMode === 'manual' || !streamReady) return;
    const captureFrame = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;
      try {
        if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth || 640;
        if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const profile = pokerClientProfiles[selectedProfile];
        if (profile) {
          const heroCards = detectCardsInRegion(imageData, profile.regions.heroCards);
          const communityCards = detectCardsInRegion(imageData, profile.regions.communityCards);
          const allDetections = [...heroCards, ...communityCards];
          if (allDetections.length && isDetectionStable(allDetections)) {
            setDetectedCards(allDetections);
            const avgConfidence =
              allDetections.reduce((s, c) => s + c.confidence, 0) / allDetections.length;
            setConfidence(Math.round(avgConfidence * 100));
          }
        }
        // Draw region overlays
        if (showRegions && profile) {
          Object.entries(profile.regions).forEach(([name, region]) => {
            const x = region.x * canvas.width;
            const y = region.y * canvas.height;
            const w = region.w * canvas.width;
            const h = region.h * canvas.height;
            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = 'rgba(0, 255, 136, 0.1)';
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = '#00ff88';
            ctx.font = 'bold 14px monospace';
            ctx.fillText(name, x + 6, y + 18);
          });
        }
        fpsCounterRef.current.frameCount++;
        const now = Date.now();
        if (now - fpsCounterRef.current.lastTime >= 1000) {
          setFps(fpsCounterRef.current.frameCount);
          fpsCounterRef.current.frameCount = 0;
          fpsCounterRef.current.lastTime = now;
        }
      } catch (err) {
        console.error('Frame capture error', err);
      }
    };
    const interval = setInterval(captureFrame, 500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectionActive, detectionMode, selectedProfile, streamReady, showRegions]);

  // ============================================================================
  // DECISION ENGINE (simplified)
  // ============================================================================
  const cardToValue = (rank) => (
    { A: 14, K: 13, Q: 12, J: 11, T: 10, 9: 9, 8: 8, 7: 7, 6: 6, 5: 5, 4: 4, 3: 3, 2: 2 }[rank] || 0
  );

  const computeDecision = useCallback(() => {
    const heroSource = detectionMode === 'manual' ? manualCards.hero : detectedCards.slice(0, 2);
    const boardSource = detectionMode === 'manual' ? manualCards.community : detectedCards.slice(2);
    const playerCount = manualPlayers;

    if (!heroSource || heroSource.length < 2) {
      setDecision({ action: 'WAIT', reasoning: 'Need at least 2 hole cards' });
      return;
    }

    const cards = [...heroSource, ...boardSource];
    let strength = 0;
    let description = '';

    if (cards.length < 5) {
      const r1 = cardToValue(heroSource[0].rank);
      const r2 = cardToValue(heroSource[1].rank);
      const high = Math.max(r1, r2);
      const gap = Math.abs(r1 - r2);
      if (r1 === r2) {
        strength = 0.7 + ((high - 2) / 12) * 0.2;
        description = `Pair of ${heroSource[0].rank}s`;
      } else if (high >= 12 && gap <= 1) {
        strength = 0.65;
        description = 'Broadway';
      } else if (high >= 10) {
        strength = 0.5;
        description = 'High cards';
      } else if (gap <= 2) {
        strength = 0.4;
        description = 'Connector';
      } else {
        strength = 0.25;
        description = 'Weak';
      }
      strength *= 1 - (playerCount - 2) * 0.05;
    } else {
      const values = cards.map((c) => cardToValue(c.rank)).sort((a, b) => b - a);
      if (values[0] === values[1]) { strength = 0.72; description = 'Pair'; }
      else if (values[1] === values[2]) { strength = 0.6; description = 'Pair'; }
      else if (cards.filter((c) => c.suit === cards[0].suit).length >= 5) { strength = 0.85; description = 'Flush'; }
      else { strength = 0.45; description = 'High card'; }
    }

    let action, reasoning;
    if (strength > 0.7) { action = 'RAISE'; reasoning = 'Strong hand, bet for value'; }
    else if (strength > 0.55) { action = 'CALL'; reasoning = 'Solid hand, continue'; }
    else if (strength > 0.4) { action = 'CHECK/CALL'; reasoning = 'Marginal, proceed cautiously'; }
    else { action = 'FOLD'; reasoning = 'Weak hand, fold'; }

    setDecision({
      action,
      reasoning,
      strength: Math.round(strength * 100),
      handType: description,
      equity: Math.round(strength * 100),
    });
  }, [detectionMode, manualCards, detectedCards, manualPlayers]);

  // Auto-compute in auto/hybrid mode when detections change
  useEffect(() => {
    if (detectionMode !== 'manual' && detectedCards.length >= 2) {
      computeDecision();
    }
  }, [detectedCards, detectionMode, computeDecision]);

  // ============================================================================
  // UI
  // ============================================================================
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 pb-24">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-4xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
              Poker Brain HUD v2
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm">Real-time AI poker coach — camera or screen capture</p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="shrink-0 w-10 h-10 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center text-lg font-bold border border-red-400"
              title="Close"
            >
              ✕
            </button>
          )}
        </div>

        {/* LIVE VIDEO VIEWPORT — always visible, top of page on mobile */}
        <div className="relative mb-4 rounded-2xl overflow-hidden border-2 border-white/10 bg-black aspect-video">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-contain bg-black"
            playsInline
            muted
            autoPlay
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />

          {/* No-stream overlay */}
          {!streamReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-6 text-center">
              <div className="text-5xl mb-3">📷</div>
              <p className="text-lg font-semibold mb-1">No video source</p>
              <p className="text-sm text-slate-400 mb-5">
                Start a live camera feed (mobile) or screen capture (desktop online play)
              </p>
              <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
                <button
                  onClick={startCamera}
                  className="flex-1 px-5 py-3 rounded-lg font-semibold bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 shadow-lg shadow-green-500/30"
                >
                  Start Camera
                </button>
                <button
                  onClick={startScreenCapture}
                  className="flex-1 px-5 py-3 rounded-lg font-semibold bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 shadow-lg shadow-blue-500/30"
                >
                  Share Screen
                </button>
              </div>
              {streamError && (
                <p className="mt-4 text-red-400 text-sm">{streamError}</p>
              )}
            </div>
          )}

          {/* Live status badge */}
          {streamReady && (
            <div className="absolute top-2 left-2 flex items-center gap-2 bg-black/70 backdrop-blur px-3 py-1.5 rounded-full border border-white/20">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-xs font-semibold">
                LIVE · {source === 'camera' ? 'Camera' : 'Screen'}
              </span>
              {detectionActive && <span className="text-xs text-emerald-400">· {fps} fps</span>}
            </div>
          )}

          {/* Source switcher when stream is live */}
          {streamReady && (
            <div className="absolute top-2 right-2 flex gap-2">
              <button
                onClick={source === 'camera' ? startScreenCapture : startCamera}
                className="bg-black/70 hover:bg-black/90 backdrop-blur text-white text-xs px-3 py-1.5 rounded-full border border-white/20"
              >
                {source === 'camera' ? 'Switch to Screen' : 'Switch to Camera'}
              </button>
              <button
                onClick={stopStream}
                className="bg-red-600/80 hover:bg-red-600 backdrop-blur text-white text-xs px-3 py-1.5 rounded-full border border-red-400"
              >
                Stop
              </button>
            </div>
          )}
        </div>

        {/* Action Banner — Fold/Call/Raise */}
        {decision && (
          <div className="mb-4 p-5 rounded-2xl border border-orange-400/40 bg-gradient-to-r from-orange-500/20 via-red-500/20 to-orange-500/20">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-xs text-slate-300 uppercase tracking-wider">Poker Brain says</div>
                <div className="text-4xl sm:text-5xl font-black text-orange-400 leading-tight">{decision.action}</div>
                <div className="text-sm text-slate-200 mt-1">{decision.reasoning}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="px-3 py-2 bg-black/30 rounded-lg">
                  <div className="text-[10px] text-slate-400 uppercase">Strength</div>
                  <div className="text-xl font-bold text-blue-300">{decision.strength}%</div>
                </div>
                <div className="px-3 py-2 bg-black/30 rounded-lg">
                  <div className="text-[10px] text-slate-400 uppercase">Hand</div>
                  <div className="text-sm font-bold text-emerald-300">{decision.handType}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Detection Mode */}
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5">
            <h2 className="text-sm font-semibold mb-3 text-slate-300 uppercase tracking-wider">Detection Mode</h2>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {['manual', 'auto', 'hybrid'].map((m) => (
                <button
                  key={m}
                  onClick={() => setDetectionMode(m)}
                  className={`py-2 rounded-lg text-sm font-medium transition ${
                    detectionMode === m
                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 shadow shadow-blue-500/40'
                      : 'bg-white/5 hover:bg-white/10 border border-white/10'
                  }`}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={detectionActive}
                onChange={(e) => setDetectionActive(e.target.checked)}
                disabled={!streamReady && detectionMode !== 'manual'}
                className="w-5 h-5 rounded"
              />
              <span className="text-sm">Activate detection</span>
            </label>
            <div className="mt-3">
              <div className="text-[10px] text-slate-400 uppercase mb-1">Confidence</div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all"
                  style={{ width: `${confidence}%` }}
                />
              </div>
              <div className="text-sm font-bold text-emerald-400 mt-1">{confidence}%</div>
            </div>
          </div>

          {/* Game Setup */}
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5">
            <h2 className="text-sm font-semibold mb-3 text-slate-300 uppercase tracking-wider">Game Setup</h2>
            <label className="block text-xs text-slate-400 mb-1">Game Type</label>
            <select
              value={gameType}
              onChange={(e) => setGameType(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white mb-3 text-sm"
            >
              <option value="nlhe">No-Limit Hold&apos;em</option>
              <option value="plo">Pot-Limit Omaha</option>
              <option value="plo_hilo">PLO Hi-Lo</option>
              <option value="plo5">PLO5</option>
              <option value="plo6">PLO6</option>
              <option value="tournament">Tournament</option>
            </select>
            <label className="block text-xs text-slate-400 mb-1">Players at table</label>
            <input
              type="number"
              min="2"
              max="10"
              value={manualPlayers}
              onChange={(e) => setManualPlayers(parseInt(e.target.value) || 2)}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>

          {/* Client Profile */}
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5">
            <h2 className="text-sm font-semibold mb-3 text-slate-300 uppercase tracking-wider">Poker Client</h2>
            <select
              value={selectedProfile}
              onChange={(e) => setSelectedProfile(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white mb-3 text-sm"
            >
              {Object.entries(pokerClientProfiles).map(([key, profile]) => (
                <option key={key} value={key}>{profile.name}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showRegions}
                onChange={(e) => setShowRegions(e.target.checked)}
                className="w-5 h-5 rounded"
              />
              <span className="text-sm">Show detection regions</span>
            </label>
          </div>
        </div>

        {/* Manual Card Entry (visible in manual + hybrid) */}
        {detectionMode !== 'auto' && (
          <div className="mt-4 backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5">
            <h2 className="text-sm font-semibold mb-3 text-slate-300 uppercase tracking-wider">Manual Card Entry</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-slate-400 mb-2">Hero Cards ({manualCards.hero.length}/4)</div>
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'].map((rank) => (
                    ['♠', '♥', '♦', '♣'].map((suit) => (
                      <button
                        key={`${rank}${suit}`}
                        onClick={() => {
                          if (manualCards.hero.length < 4) {
                            setManualCards((p) => ({ ...p, hero: [...p.hero, { rank, suit }] }));
                          }
                        }}
                        className={`aspect-square rounded text-[10px] font-bold ${
                          suit === '♥' || suit === '♦' ? 'bg-red-500/20 hover:bg-red-500/40' : 'bg-white/10 hover:bg-white/20'
                        }`}
                      >
                        {rank}{suit}
                      </button>
                    ))
                  )).flat()}
                </div>
                <div className="flex gap-1 flex-wrap">
                  {manualCards.hero.map((c, i) => (
                    <span key={i} className={`px-2 py-1 rounded bg-black/40 text-sm font-bold ${c.suit === '♥' || c.suit === '♦' ? 'text-red-400' : 'text-white'}`}>
                      {c.rank}{c.suit}
                    </span>
                  ))}
                  {manualCards.hero.length > 0 && (
                    <button
                      onClick={() => setManualCards((p) => ({ ...p, hero: [] }))}
                      className="text-xs text-red-400 hover:text-red-300 px-2"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-col justify-between">
                <button
                  onClick={computeDecision}
                  className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 rounded-lg font-semibold transition"
                >
                  Compute Decision
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Detected Cards display */}
        {detectedCards.length > 0 && (
          <div className="mt-4 backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5">
            <h2 className="text-sm font-semibold mb-3 text-slate-300 uppercase tracking-wider">Detected Cards</h2>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {detectedCards.map((card, idx) => (
                <div
                  key={idx}
                  className="aspect-[2/3] bg-gradient-to-br from-white/10 to-white/5 border border-white/20 rounded-lg p-2 text-center flex flex-col justify-between"
                >
                  <div className={`text-2xl font-bold ${card.suit === '♥' || card.suit === '♦' ? 'text-red-400' : 'text-white'}`}>
                    {card.rank}
                    <div>{card.suit}</div>
                  </div>
                  <div className="text-[9px] text-slate-400">{Math.round(card.confidence * 100)}%</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PokerBrainHUDv2;
