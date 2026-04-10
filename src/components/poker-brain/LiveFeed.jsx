/**
 * Poker Brain -- Live Hand Feed
 * Shows hands in real-time as they're played, using Supabase realtime subscription.
 * Can be embedded in the dashboard or opened in a separate tab for coaching.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';

const SUIT_DISPLAY = {
  s: { glyph: '\u2660', color: '#1a1a2e' },
  h: { glyph: '\u2665', color: '#dc2626' },
  d: { glyph: '\u2666', color: '#2563eb' },
  c: { glyph: '\u2663', color: '#16a34a' },
};

function MiniCard({ rank, suit }) {
  const sd = SUIT_DISPLAY[suit] || SUIT_DISPLAY.s;
  return (
    <span className="inline-flex items-center font-mono font-bold text-sm" style={{ color: sd.color }}>
      {rank}{sd.glyph}
    </span>
  );
}

export default function LiveFeed({ storage, sessionId }) {
  const [hands, setHands] = useState([]);
  const [connected, setConnected] = useState(false);
  const unsubRef = useRef(null);
  const feedEndRef = useRef(null);

  useEffect(() => {
    if (!storage || !sessionId) return;

    setConnected(true);
    const unsub = storage.subscribeToHands(sessionId, (newHand) => {
      setHands(prev => {
        const next = [...prev, newHand];
        // Keep last 100 hands in memory
        if (next.length > 100) next.shift();
        return next;
      });
    });
    unsubRef.current = unsub;

    return () => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
      setConnected(false);
    };
  }, [storage, sessionId]);

  // Auto-scroll to latest hand
  useEffect(() => {
    if (feedEndRef.current) {
      feedEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [hands.length]);

  return (
    <div className="bg-slate-900 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: connected ? '#10b981' : '#ef4444' }}
          />
          <span className="text-xs font-bold text-white">Live Hand Feed</span>
        </div>
        <span className="text-[10px] text-slate-500">{hands.length} hands</span>
      </div>

      {/* Feed */}
      <div className="max-h-80 overflow-y-auto p-2 space-y-1">
        {hands.length === 0 ? (
          <div className="text-center text-slate-500 text-xs py-8">
            {connected ? 'Waiting for hands...' : 'Not connected'}
          </div>
        ) : (
          hands.map((h, i) => (
            <div key={h.id || i} className="flex items-center gap-2 text-xs bg-slate-800 rounded-lg px-3 py-2">
              <span className="text-slate-500 w-6 text-right">#{i + 1}</span>

              {/* Hole cards */}
              <div className="flex gap-0.5">
                {(h.hole_cards || []).map((c, ci) => (
                  <MiniCard key={ci} rank={c.rank || c[0]} suit={c.suit || c[1]} />
                ))}
              </div>

              {/* Board */}
              {h.board && h.board.length > 0 && (
                <>
                  <span className="text-slate-600">|</span>
                  <div className="flex gap-0.5">
                    {h.board.map((c, ci) => (
                      <MiniCard key={ci} rank={c.rank || c[0]} suit={c.suit || c[1]} />
                    ))}
                  </div>
                </>
              )}

              {/* Equity */}
              {h.equity != null && (
                <span className="ml-auto text-emerald-400 font-mono">{Math.round(h.equity)}%</span>
              )}

              {/* Action */}
              {h.action_taken && (
                <span className={
                  'font-bold ' +
                  (h.action_taken === 'FOLD' ? 'text-red-400' :
                   h.action_taken === 'RAISE' ? 'text-amber-400' :
                   'text-blue-400')
                }>{h.action_taken}</span>
              )}

              {/* Engine agreed? */}
              {h.engine_suggestion && h.action_taken && (
                <span className={
                  'text-[10px] ' +
                  (h.action_taken.toUpperCase() === h.engine_suggestion.toUpperCase()
                    ? 'text-emerald-500' : 'text-red-500')
                }>
                  {h.action_taken.toUpperCase() === h.engine_suggestion.toUpperCase() ? 'OK' : 'DIFF'}
                </span>
              )}
            </div>
          ))
        )}
        <div ref={feedEndRef} />
      </div>
    </div>
  );
}
