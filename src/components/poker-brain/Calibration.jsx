/**
 * Poker Brain — Region Calibration Tool
 * ---------------------------------------
 * Drag rectangles on a live video/screen-capture feed to mark
 * where cards, pot, bets, and stacks appear for ANY poker client.
 * Saves the result as a custom profile (normalized 0..1 coords)
 * that can be fed into poker-vision-engine.js.
 *
 * Usage:
 *   import PokerBrainCalibration from './poker-brain-calibration';
 *   <PokerBrainCalibration onSave={(profile) => ...} />
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';

const REGION_TYPES = [
  { id: 'hole1',  label: 'Hole Card 1',  color: '#00ff88' },
  { id: 'hole2',  label: 'Hole Card 2',  color: '#00ff88' },
  { id: 'hole3',  label: 'Hole Card 3',  color: '#00ff88' },
  { id: 'hole4',  label: 'Hole Card 4',  color: '#00ff88' },
  { id: 'hole5',  label: 'Hole Card 5',  color: '#00ff88' },
  { id: 'hole6',  label: 'Hole Card 6',  color: '#00ff88' },
  { id: 'flop1',  label: 'Flop 1',       color: '#00ccff' },
  { id: 'flop2',  label: 'Flop 2',       color: '#00ccff' },
  { id: 'flop3',  label: 'Flop 3',       color: '#00ccff' },
  { id: 'turn',   label: 'Turn',         color: '#ffcc00' },
  { id: 'river',  label: 'River',        color: '#ff6600' },
  { id: 'pot',    label: 'Pot Size',     color: '#ff00ff' },
  { id: 'bet',    label: 'Bet to Call',  color: '#ff0066' },
  { id: 'stack',  label: 'Your Stack',   color: '#ffffff' },
  { id: 'blinds', label: 'Blind Level',  color: '#aaaaff' },
];

export default function PokerBrainCalibration({ onSave, initialProfile = null }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const streamRef = useRef(null);

  const [captureMode, setCaptureMode] = useState('screen'); // 'screen' | 'camera'
  const [streaming, setStreaming] = useState(false);
  const [selectedType, setSelectedType] = useState('hole1');
  const [regions, setRegions] = useState(initialProfile?.regions || {});
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState(null);
  const [currentRect, setCurrentRect] = useState(null);
  const [profileName, setProfileName] = useState(initialProfile?.name || 'My Custom Profile');
  const [videoSize, setVideoSize] = useState({ w: 0, h: 0 });

  // ---------- Stream control ----------
  const startCapture = useCallback(async () => {
    try {
      const stream = captureMode === 'screen'
        ? await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false })
        : await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setVideoSize({
          w: videoRef.current.videoWidth,
          h: videoRef.current.videoHeight,
        });
      }
      setStreaming(true);
    } catch (err) {
      console.error('Capture failed:', err);
      alert('Could not start capture: ' + err.message);
    }
  }, [captureMode]);

  const stopCapture = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStreaming(false);
  }, []);

  useEffect(() => () => stopCapture(), [stopCapture]);

  // ---------- Drawing ----------
  const getRelativePos = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  };

  const handleMouseDown = (e) => {
    if (!streaming) return;
    const pos = getRelativePos(e);
    setDrawing(true);
    setStartPos(pos);
    setCurrentRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
  };

  const handleMouseMove = (e) => {
    if (!drawing || !startPos) return;
    const pos = getRelativePos(e);
    setCurrentRect({
      x: Math.min(startPos.x, pos.x),
      y: Math.min(startPos.y, pos.y),
      w: Math.abs(pos.x - startPos.x),
      h: Math.abs(pos.y - startPos.y),
    });
  };

  const handleMouseUp = () => {
    if (!drawing || !currentRect) return;
    if (currentRect.w > 0.005 && currentRect.h > 0.005) {
      setRegions((prev) => ({ ...prev, [selectedType]: { ...currentRect } }));
      // Auto-advance to next unset region
      const idx = REGION_TYPES.findIndex((r) => r.id === selectedType);
      const next = REGION_TYPES.slice(idx + 1).find((r) => !regions[r.id]);
      if (next) setSelectedType(next.id);
    }
    setDrawing(false);
    setStartPos(null);
    setCurrentRect(null);
  };

  const clearRegion = (id) => {
    setRegions((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const clearAll = () => setRegions({});

  // ---------- Save ----------
  const handleSave = () => {
    const profile = {
      id: profileName.toLowerCase().replace(/\s+/g, '_'),
      name: profileName,
      custom: true,
      createdAt: new Date().toISOString(),
      videoSize,
      regions,
    };
    if (onSave) onSave(profile);
    // Also copy to clipboard for easy paste
    try {
      navigator.clipboard.writeText(JSON.stringify(profile, null, 2));
    } catch (_) {}
  };

  const exportJSON = () => {
    const profile = { id: profileName.toLowerCase().replace(/\s+/g, '_'), name: profileName, regions };
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${profile.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const completedCount = Object.keys(regions).length;
  const selectedColor = REGION_TYPES.find((r) => r.id === selectedType)?.color || '#00ff88';

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-1 bg-gradient-to-r from-green-400 to-blue-400 bg-clip-text text-transparent">
          Poker Brain — Region Calibration
        </h1>
        <p className="text-gray-400 mb-4 text-sm">
          Drag rectangles on the feed to mark where cards, pot, and bets appear. Works with any poker client.
        </p>

        {/* Controls */}
        <div className="flex flex-wrap gap-2 mb-4">
          <select
            className="bg-gray-800 rounded px-3 py-2 text-sm"
            value={captureMode}
            onChange={(e) => setCaptureMode(e.target.value)}
            disabled={streaming}
          >
            <option value="screen">Screen Capture (Desktop)</option>
            <option value="camera">Camera (Phone at screen)</option>
          </select>
          {!streaming ? (
            <button onClick={startCapture} className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded font-semibold">
              Start Capture
            </button>
          ) : (
            <button onClick={stopCapture} className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded font-semibold">
              Stop
            </button>
          )}
          <input
            type="text"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder="Profile name"
            className="bg-gray-800 rounded px-3 py-2 text-sm flex-1 min-w-[200px]"
          />
          <button
            onClick={handleSave}
            disabled={completedCount === 0}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 px-4 py-2 rounded font-semibold"
          >
            Save Profile ({completedCount})
          </button>
          <button
            onClick={exportJSON}
            disabled={completedCount === 0}
            className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 px-4 py-2 rounded font-semibold"
          >
            Export JSON
          </button>
          <button onClick={clearAll} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded font-semibold">
            Clear All
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Video + overlay */}
          <div className="lg:col-span-3">
            <div
              ref={containerRef}
              className="relative bg-black rounded-lg overflow-hidden border-2 border-gray-800 select-none"
              style={{ aspectRatio: videoSize.w && videoSize.h ? `${videoSize.w} / ${videoSize.h}` : '16 / 9' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleMouseDown}
              onTouchMove={handleMouseMove}
              onTouchEnd={handleMouseUp}
            >
              <video
                ref={videoRef}
                className="w-full h-full object-contain pointer-events-none"
                playsInline
                muted
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Saved regions */}
              {Object.entries(regions).map(([id, r]) => {
                const type = REGION_TYPES.find((t) => t.id === id);
                return (
                  <div
                    key={id}
                    className="absolute border-2 pointer-events-none"
                    style={{
                      left: `${r.x * 100}%`,
                      top: `${r.y * 100}%`,
                      width: `${r.w * 100}%`,
                      height: `${r.h * 100}%`,
                      borderColor: type?.color || '#fff',
                      boxShadow: `0 0 8px ${type?.color || '#fff'}`,
                    }}
                  >
                    <div
                      className="absolute -top-5 left-0 text-xs px-1 rounded"
                      style={{ backgroundColor: type?.color, color: '#000' }}
                    >
                      {type?.label}
                    </div>
                  </div>
                );
              })}

              {/* Current drawing rect */}
              {currentRect && (
                <div
                  className="absolute border-2 border-dashed pointer-events-none"
                  style={{
                    left: `${currentRect.x * 100}%`,
                    top: `${currentRect.y * 100}%`,
                    width: `${currentRect.w * 100}%`,
                    height: `${currentRect.h * 100}%`,
                    borderColor: selectedColor,
                    backgroundColor: `${selectedColor}22`,
                  }}
                />
              )}

              {!streaming && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                  Start capture to begin calibrating
                </div>
              )}
            </div>
          </div>

          {/* Region list */}
          <div className="bg-gray-900 rounded-lg p-3 border border-gray-800 max-h-[600px] overflow-y-auto">
            <h3 className="font-semibold mb-2 text-sm">Regions</h3>
            <div className="space-y-1">
              {REGION_TYPES.map((t) => {
                const set = !!regions[t.id];
                const active = selectedType === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedType(t.id)}
                    className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer text-xs ${
                      active ? 'bg-gray-700 ring-1 ring-white' : 'hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: t.color }} />
                      <span>{t.label}</span>
                    </div>
                    {set ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); clearRegion(t.id); }}
                        className="text-red-400 hover:text-red-300"
                      >
                        ✕
                      </button>
                    ) : (
                      <span className="text-gray-600">·</span>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Click a row to select, then drag on the feed to mark that region.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
