import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

const PokerBrainHUDv2 = () => {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  
  const [mode, setMode] = useState('hybrid'); // 'manual' | 'auto' | 'hybrid'
  const [detectionActive, setDetectionActive] = useState(false);
  const [confidence, setConfidence] = useState(0);
  const [detectedCards, setDetectedCards] = useState([]);
  const [gameState, setGameState] = useState(null);
  const [decision, setDecision] = useState(null);
  const [fps, setFps] = useState(0);
  const [showRegions, setShowRegions] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState('pokerstars');
  const [manualCards, setManualCards] = useState({ community: [], hero: [] });
  const [manualPlayers, setManualPlayers] = useState(2);
  
  // Detection frame buffer for stability
  const frameBufferRef = useRef([]);
  const fpsCounterRef = useRef({ frameCount: 0, lastTime: Date.now() });
  const canvasRef = useRef(null);
  const videoRef = useRef(null);

  // ============================================================================
  // POKER CLIENT PROFILES (Normalized 0-1 Coordinates)
  // ============================================================================
  
  const pokerClientProfiles = {
    pokerstars: {
      name: 'PokerStars',
      regions: {
        heroCards: { x: 0.05, y: 0.8, w: 0.25, h: 0.18 },
        communityCards: { x: 0.35, y: 0.35, w: 0.3, h: 0.15 },
        opponentStack1: { x: 0.02, y: 0.1, w: 0.12, h: 0.1 },
        opponentStack2: { x: 0.86, y: 0.1, w: 0.12, h: 0.1 },
        potSize: { x: 0.4, y: 0.15, w: 0.2, h: 0.08 },
        heroStack: { x: 0.05, y: 0.68, w: 0.2, h: 0.08 }
      }
    },
    poker888: {
      name: '888poker',
      regions: {
        heroCards: { x: 0.08, y: 0.75, w: 0.22, h: 0.2 },
        communityCards: { x: 0.38, y: 0.38, w: 0.24, h: 0.12 },
        opponentStack1: { x: 0.01, y: 0.08, w: 0.15, h: 0.1 },
        opponentStack2: { x: 0.84, y: 0.08, w: 0.15, h: 0.1 },
        potSize: { x: 0.35, y: 0.2, w: 0.3, h: 0.1 },
        heroStack: { x: 0.08, y: 0.65, w: 0.22, h: 0.08 }
      }
    },
    partypoker: {
      name: 'partypoker',
      regions: {
        heroCards: { x: 0.1, y: 0.78, w: 0.2, h: 0.18 },
        communityCards: { x: 0.4, y: 0.36, w: 0.2, h: 0.14 },
        opponentStack1: { x: 0.03, y: 0.12, w: 0.14, h: 0.09 },
        opponentStack2: { x: 0.83, y: 0.12, w: 0.14, h: 0.09 },
        potSize: { x: 0.38, y: 0.18, w: 0.24, h: 0.09 },
        heroStack: { x: 0.1, y: 0.67, w: 0.2, h: 0.08 }
      }
    },
    gto: {
      name: 'GTO+',
      regions: {
        heroCards: { x: 0.02, y: 0.85, w: 0.15, h: 0.13 },
        communityCards: { x: 0.35, y: 0.4, w: 0.3, h: 0.12 },
        opponentStack1: { x: 0.01, y: 0.05, w: 0.1, h: 0.08 },
        opponentStack2: { x: 0.89, y: 0.05, w: 0.1, h: 0.08 },
        potSize: { x: 0.35, y: 0.25, w: 0.3, h: 0.08 },
        heroStack: { x: 0.02, y: 0.73, w: 0.15, h: 0.08 }
      }
    },
    ignition: {
      name: 'Ignition',
      regions: {
        heroCards: { x: 0.06, y: 0.79, w: 0.24, w: 0.19 },
        communityCards: { x: 0.32, y: 0.33, w: 0.36, h: 0.16 },
        opponentStack1: { x: 0.02, y: 0.09, w: 0.13, h: 0.11 },
        opponentStack2: { x: 0.85, y: 0.09, w: 0.13, h: 0.11 },
        potSize: { x: 0.35, y: 0.14, w: 0.3, h: 0.09 },
        heroStack: { x: 0.06, y: 0.66, w: 0.24, h: 0.08 }
      }
    },
    wcoop: {
      name: 'WCOOP',
      regions: {
        heroCards: { x: 0.04, y: 0.82, w: 0.28, h: 0.16 },
        communityCards: { x: 0.36, y: 0.37, w: 0.28, h: 0.13 },
        opponentStack1: { x: 0.01, y: 0.1, w: 0.12, h: 0.09 },
        opponentStack2: { x: 0.87, y: 0.1, w: 0.12, h: 0.09 },
        potSize: { x: 0.36, y: 0.19, w: 0.28, h: 0.09 },
        heroStack: { x: 0.04, y: 0.7, w: 0.28, h: 0.08 }
      }
    }
  };

  // ============================================================================
  // CARD DETECTION ENGINE (Color-based Pixel Analysis)
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
    
    // Detect two cards side by side
    for (let cardIndex = 0; cardIndex < 2; cardIndex++) {
      const cardStartX = startX + (cardIndex * cardWidth);
      let redSum = 0, greenSum = 0, blueSum = 0, pixelCount = 0;
      let brightnessSum = 0;
      
      // Sample pixels from card region
      for (let y = startY; y < startY + regionHeight; y++) {
        for (let x = cardStartX; x < cardStartX + cardWidth; x++) {
          if (x >= 0 && x < width && y >= 0 && y < height) {
            const idx = (y * width + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const brightness = (r + g + b) / 3;
            
            redSum += r;
            greenSum += g;
            blueSum += b;
            brightnessSum += brightness;
            pixelCount++;
          }
        }
      }
      
      if (pixelCount > 0) {
        const avgRed = Math.round(redSum / pixelCount);
        const avgGreen = Math.round(greenSum / pixelCount);
        const avgBlue = Math.round(blueSum / pixelCount);
        const avgBrightness = brightnessSum / pixelCount;
        
        // Card detected if sufficiently bright and not pure black
        const isCardPresent = avgBrightness > 80 && (avgRed + avgGreen + avgBlue) > 100;
        
        if (isCardPresent) {
          // Estimate rank from brightness pattern
          const rankEstimate = estimateRankFromBrightness(avgBrightness, avgRed, avgGreen, avgBlue);
          
          cards.push({
            position: cardIndex,
            rank: rankEstimate,
            suit: estimateSuitFromColor(avgRed, avgGreen, avgBlue),
            confidence: Math.min(avgBrightness / 255, 1),
            color: `rgb(${avgRed}, ${avgGreen}, ${avgBlue})`
          });
        }
      }
    }
    
    return cards;
  }, []);

  const estimateRankFromBrightness = (brightness, r, g, b) => {
    const ranks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
    const index = Math.floor((255 - brightness) / (255 / 13));
    return ranks[Math.max(0, Math.min(12, index))];
  };

  const estimateSuitFromColor = (r, g, b) => {
    const suits = ['♠', '♥', '♦', '♣'];
    if (r > g && r > b) return '♥'; // Red heavy = hearts
    if (b > r && b > g) return '♠'; // Blue/black = spades
    if (g > r && g > b) return '♣'; // Green = clubs
    return '♦'; // Yellow/gold = diamonds
  };

  // ============================================================================
  // STABILITY BUFFER (Confirm detection across 3+ frames from last 5)
  // ============================================================================
  
  const isDetectionStable = useCallback((newDetection) => {
    frameBufferRef.current.push(newDetection);
    if (frameBufferRef.current.length > 5) {
      frameBufferRef.current.shift();
    }
    
    if (frameBufferRef.current.length < 3) return false;
    
    // Count consistent detections
    const consistent = frameBufferRef.current.filter(frame => {
      if (!frame || !newDetection) return false;
      return frame.every((card, idx) => {
        return newDetection[idx] && 
               card.rank === newDetection[idx].rank && 
               card.suit === newDetection[idx].suit;
      });
    });
    
    return consistent.length >= 3;
  }, []);

  // ============================================================================
  // FRAME CAPTURE & PROCESSING (500ms intervals)
  // ============================================================================
  
  useEffect(() => {
    if (!detectionActive || mode === 'manual') return;
    
    const captureFrame = async () => {
      if (!videoRef.current || !canvasRef.current) return;
      
      try {
        const ctx = canvasRef.current.getContext('2d');
        ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
        
        const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
        const profile = pokerClientProfiles[selectedProfile];
        
        if (profile) {
          const heroCards = detectCardsInRegion(imageData, profile.regions.heroCards);
          const communityCards = detectCardsInRegion(imageData, profile.regions.communityCards);
          
          const allDetections = [...heroCards, ...communityCards];
          
          if (isDetectionStable(allDetections)) {
            setDetectedCards(allDetections);
            const avgConfidence = allDetections.reduce((sum, card) => sum + card.confidence, 0) / (allDetections.length || 1);
            setConfidence(Math.round(avgConfidence * 100));
          }
        }
        
        // FPS counter
        fpsCounterRef.current.frameCount++;
        const now = Date.now();
        if (now - fpsCounterRef.current.lastTime >= 1000) {
          setFps(fpsCounterRef.current.frameCount);
          fpsCounterRef.current.frameCount = 0;
          fpsCounterRef.current.lastTime = now;
        }
      } catch (error) {
        console.error('Frame capture error:', error);
      }
    };
    
    const interval = setInterval(captureFrame, 500);
    return () => clearInterval(interval);
  }, [detectionActive, mode, selectedProfile, detectCardsInRegion, isDetectionStable]);

  // ============================================================================
  // POKER BRAIN ENGINE (Hand Evaluation & Equity Calculation)
  // ============================================================================
  
  const cardToValue = (rank) => {
    const values = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, 'T': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };
    return values[rank] || 0;
  };

  const evaluateHand = useCallback((heroCards, communityCards, numPlayers = 2) => {
    if (!heroCards || heroCards.length < 2) return { strength: 0, description: 'Incomplete hand' };
    
    const cards = [...heroCards, ...communityCards];
    if (cards.length < 5) {
      // Preflop evaluation
      const rank1 = cardToValue(cards[0].rank);
      const rank2 = cardToValue(cards[1].rank);
      const isPair = cards[0].suit === cards[1].suit;
      const highCard = Math.max(rank1, rank2);
      const gap = Math.abs(rank1 - rank2);
      
      let strength = 0;
      let description = '';
      
      if (rank1 === rank2) {
        strength = 0.7 + (highCard - 2) / 12 * 0.2;
        description = `Pair of ${cards[0].rank}s`;
      } else if (highCard >= 12 && gap <= 1) {
        strength = 0.65;
        description = 'Strong broadway';
      } else if (highCard >= 10) {
        strength = 0.5;
        description = 'High cards';
      } else if (gap <= 2) {
        strength = 0.4;
        description = 'Connector';
      } else {
        strength = 0.25;
        description = 'Weak';
      }
      
      // Adjust for player count
      strength *= (1 - (numPlayers - 2) * 0.05);
      
      return { strength: Math.min(strength, 1), description };
    } else {
      // Post-flop: simplified hand ranking
      const values = cards.map(c => cardToValue(c.rank)).sort((a, b) => b - a);
      
      // Pair detection
      if (values[0] === values[1]) {
        return { strength: 0.7, description: `Pair of ${cards[0].rank}s` };
      }
      if (values[1] === values[2]) {
        return { strength: 0.68, description: 'Pair' };
      }
      
      // Straight/Flush approximation (simplified)
      let flush = cards.filter(c => c.suit === cards[0].suit).length >= 5;
      if (flush) return { strength: 0.85, description: 'Flush' };
      
      return { strength: 0.5, description: 'High card' };
    }
  }, []);

  const computeDecision = useCallback(() => {
    const cardsToEval = mode === 'manual' ? manualCards.hero : detectedCards.filter(c => detectedCards.indexOf(c) < 2);
    const community = mode === 'manual' ? manualCards.community : detectedCards.filter(c => detectedCards.indexOf(c) >= 2);
    const playerCount = mode === 'manual' ? manualPlayers : 2;
    
    const evaluation = evaluateHand(cardsToEval, community, playerCount);
    
    let action = 'FOLD';
    let reasoning = '';
    
    if (evaluation.strength > 0.7) {
      action = 'RAISE';
      reasoning = 'Strong hand, apply pressure';
    } else if (evaluation.strength > 0.55) {
      action = 'CALL';
      reasoning = 'Solid hand, continue';
    } else if (evaluation.strength > 0.4) {
      action = 'CHECK/CALL';
      reasoning = 'Marginal, proceed cautiously';
    } else {
      action = 'FOLD';
      reasoning = 'Weak hand, fold';
    }
    
    setDecision({
      action,
      reasoning,
      strength: (evaluation.strength * 100).toFixed(0),
      handType: evaluation.description,
      equity: Math.round(evaluation.strength * 100)
    });
  }, [mode, detectedCards, manualCards, manualPlayers, evaluateHand]);

  // ============================================================================
  // CANVAS OVERLAY RENDERER (Region Visualization)
  // ============================================================================
  
  useEffect(() => {
    if (!showRegions || !canvasRef.current) return;
    
    const ctx = canvasRef.current.getContext('2d');
    const profile = pokerClientProfiles[selectedProfile];
    const width = canvasRef.current.width;
    const height = canvasRef.current.height;
    
    // Draw regions
    Object.entries(profile.regions).forEach(([name, region]) => {
      const x = region.x * width;
      const y = region.y * height;
      const w = region.w * width;
      const h = region.h * height;
      
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      
      ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
      ctx.fillRect(x, y, w, h);
      
      ctx.fillStyle = '#00ff00';
      ctx.font = '12px monospace';
      ctx.fillText(name, x + 5, y + 15);
    });
  }, [showRegions, selectedProfile]);

  // ============================================================================
  // REACT UI COMPONENT
  // ============================================================================
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent mb-2">
            Poker Brain HUD v2
          </h1>
          <p className="text-slate-400">AI-powered poker decision assistant with auto card detection</p>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Detection Panel */}
          <div className="lg:col-span-1 space-y-4">
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="w-3 h-3 bg-blue-400 rounded-full"></span>
                Detection Mode
              </h2>
              
              <div className="space-y-3">
                {['manual', 'auto', 'hybrid'].map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`w-full py-2 px-4 rounded-lg font-medium transition-all ${
                      mode === m
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 shadow-lg shadow-blue-500/50'
                        : 'bg-white/5 hover:bg-white/10 border border-white/10'
                    }`}
                  >
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-white/10">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={detectionActive}
                    onChange={(e) => setDetectionActive(e.target.checked)}
                    className="w-5 h-5 rounded bg-white/10 border border-white/20 cursor-pointer"
                  />
                  <span className="text-sm">Activate Detection</span>
                </label>
              </div>
            </div>

            {/* Confidence Badge */}
            {mode !== 'manual' && (
              <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-slate-400 mb-3">Detection Confidence</h3>
                <div className="relative h-3 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-300"
                    style={{ width: `${confidence}%` }}
                  ></div>
                </div>
                <p className="mt-2 text-2xl font-bold text-emerald-400">{confidence}%</p>
                <p className="text-xs text-slate-500 mt-1">FPS: {fps}</p>
              </div>
            )}

            {/* Client Profile Selector */}
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-slate-400 mb-3">Poker Client</h3>
              <select
                value={selectedProfile}
                onChange={(e) => setSelectedProfile(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
              >
                {Object.entries(pokerClientProfiles).map(([key, profile]) => (
                  <option key={key} value={key}>{profile.name}</option>
                ))}
              </select>
              <label className="flex items-center gap-3 cursor-pointer mt-3">
                <input
                  type="checkbox"
                  checked={showRegions}
                  onChange={(e) => setShowRegions(e.target.checked)}
                  className="w-5 h-5 rounded bg-white/10 border border-white/20 cursor-pointer"
                />
                <span className="text-sm">Show Detection Regions</span>
              </label>
            </div>
          </div>

          {/* Canvas & Cards Display */}
          <div className="lg:col-span-2 space-y-4">
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-4">Detection Preview</h2>
              <canvas
                ref={canvasRef}
                width={640}
                height={360}
                className="w-full bg-black/30 rounded-lg border border-white/10"
              />
              <video
                ref={videoRef}
                style={{ display: 'none' }}
                width={640}
                height={360}
              />
            </div>

            {/* Detected Cards */}
            {detectedCards.length > 0 && (
              <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
                <h3 className="text-lg font-semibold mb-4">Detected Cards</h3>
                <div className="grid grid-cols-2 gap-3">
                  {detectedCards.map((card, idx) => (
                    <div
                      key={idx}
                      className="bg-gradient-to-br from-white/10 to-white/5 border border-white/20 rounded-lg p-4 text-center"
                    >
                      <div className="text-3xl font-bold text-amber-400 mb-1">
                        {card.rank}{card.suit}
                      </div>
                      <div className="text-xs text-slate-400">
                        Conf: {(card.confidence * 100).toFixed(0)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Manual Input & Decision Panel */}
        {mode !== 'auto' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-4">Manual Input</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-slate-400 mb-2 block">Hero Cards</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'].map(rank => (
                      <button
                        key={rank}
                        onClick={() => {
                          if (manualCards.hero.length < 2) {
                            setManualCards(prev => ({
                              ...prev,
                              hero: [...prev.hero, { rank, suit: '♠' }]
                            }));
                          }
                        }}
                        className="py-1 px-2 bg-white/10 hover:bg-white/20 rounded text-sm font-semibold transition-all"
                      >
                        {rank}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    {manualCards.hero.map((card, idx) => (
                      <span key={idx} className="text-lg font-bold text-amber-400">
                        {card.rank}{card.suit}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm text-slate-400 mb-2 block">Players</label>
                  <input
                    type="number"
                    min="2"
                    max="9"
                    value={manualPlayers}
                    onChange={(e) => setManualPlayers(parseInt(e.target.value))}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                  />
                </div>

                <button
                  onClick={computeDecision}
                  className="w-full py-2 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 rounded-lg font-semibold transition-all"
                >
                  Compute Decision
                </button>
              </div>
            </div>

            {/* Decision Output */}
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-4">Decision</h2>
              {decision ? (
                <div className="space-y-4">
                  <div className="p-4 bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-lg border border-orange-400/30">
                    <div className="text-4xl font-bold text-orange-400 mb-2">
                      {decision.action}
                    </div>
                    <div className="text-sm text-slate-300">
                      {decision.reasoning}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                      <div className="text-xs text-slate-400 mb-1">Hand Strength</div>
                      <div className="text-2xl font-bold text-blue-400">{decision.strength}%</div>
                    </div>
                    <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                      <div className="text-xs text-slate-400 mb-1">Equity</div>
                      <div className="text-2xl font-bold text-emerald-400">{decision.equity}%</div>
                    </div>
                  </div>
                  
                  <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                    <div className="text-xs text-slate-400 mb-1">Hand Type</div>
                    <div className="text-lg font-semibold text-white">{decision.handType}</div>
                  </div>
                </div>
              ) : (
                <div className="text-slate-400 text-center py-8">
                  Input cards and compute decision
                </div>
              )}
            </div>
          </div>
        )}

        {/* Auto Mode Decision */}
        {mode !== 'manual' && decision && (
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-4">Auto Decision (if triggered)</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 bg-gradient-to-br from-orange-500/20 to-red-500/20 rounded-lg border border-orange-400/30">
                <div className="text-3xl font-bold text-orange-400">{decision.action}</div>
              </div>
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="text-xs text-slate-400 mb-1">Strength</div>
                <div className="text-2xl font-bold text-blue-400">{decision.strength}%</div>
              </div>
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="text-xs text-slate-400 mb-1">Hand</div>
                <div className="text-lg font-semibold text-white">{decision.handType}</div>
              </div>
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="text-xs text-slate-400 mb-1">Reasoning</div>
                <div className="text-sm text-slate-300">{decision.reasoning}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PokerBrainHUDv2;
