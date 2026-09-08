/**
 * BBJTicker — Bad Beat Jackpot display on the poker table
 * ═══════════════════════════════════════════════════════════
 * 
 * Shows current BBJ pool amount with smooth tick-up animation.
 * When BBJ is won, shows celebration overlay.
 * 
 * Props:
 *   clubId     — Club UUID (fetches pool from /api/club-arena/bbj)
 *   variant    — 'table' (compact mode on poker table)
 *   bbjWonEvent — Event data when BBJ triggers (from engine)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const GOLD = '#FFD700';
const GOLD_DARK = '#B8860B';
const POLL_INTERVAL_MS = 30000; // Refresh from API every 30s

export default function BBJTicker({ clubId, variant = 'table', bbjWonEvent = null, supabase = null }) {
  const [poolAmount, setPoolAmount] = useState(0);
  const [hourlyRate, setHourlyRate] = useState(0);
  const [displayAmount, setDisplayAmount] = useState(0);
  const [showWin, setShowWin] = useState(false);
  const [winData, setWinData] = useState(null);
  const frameRef = useRef(null);
  const targetRef = useRef(0);

  // ── Fetch BBJ pool from API ──
  const fetchPool = useCallback(async () => {
    if (!clubId) return;
    try {
      const res = await fetch(`/api/club-arena/bbj?clubId=${clubId}`);
      if (!res.ok) return;
      const data = await res.json();
      const amt = data.pool?.amount || 0;
      setPoolAmount(amt);
      setHourlyRate(data.hourlyRate || 0);
      targetRef.current = amt;
    } catch { /* silent */ }
  }, [clubId]);

  // Initial fetch + polling (30s fallback)
  useEffect(() => {
    fetchPool();
    const interval = setInterval(fetchPool, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchPool]);

  /* THE REALTIME SUBSCRIPTION IS GONE, AND IT WAS DOING HARM
     (BBJ build plan phase 3.5, 2026-09-06).

     It bound to `bbj_pools` UPDATE and then read `payload.new.pool_amount` and
     `payload.new.hourly_rate`. `pool_amount` is a legacy column nothing has
     written since the triple-bank rework - measured on production, it read
     0.00 while the pool held 107,092.27 - and `hourly_rate` is not a column at
     all, so `Number(undefined || 0)` set the rate to 0 and disabled the
     tick-up animation this component exists for.

     So on every raked hand - one every 2.1 seconds - this OVERWROTE the
     correct figure the 30-second poll had just fetched with a stale one or a
     zero. The subscription was not merely useless; it was the reason the
     ticker was wrong.

     The poll above is now the only source, and it reads the API, which reads
     `fn_bbj_pool_for_club`. Phase 3.2 took every Club Arena surface off the
     same firehose for the same reason. */

  // ── Smooth tick-up animation ──
  useEffect(() => {
    if (hourlyRate <= 0) { setDisplayAmount(poolAmount); return; }
    const perSecond = hourlyRate / 3600;
    let current = poolAmount;

    const tick = () => {
      current += perSecond / 30; // ~30fps
      // Don't overshoot too far past actual
      if (current > targetRef.current + hourlyRate * 0.5) {
        current = targetRef.current;
      }
      setDisplayAmount(current);
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [poolAmount, hourlyRate]);

  // ── BBJ Won Event ──
  useEffect(() => {
    if (!bbjWonEvent?.triggered) return;
    setWinData(bbjWonEvent);
    setShowWin(true);
    const timer = setTimeout(() => setShowWin(false), 8000);
    return () => clearTimeout(timer);
  }, [bbjWonEvent]);

  if (!clubId || poolAmount <= 0) return null;

  const formattedAmount = displayAmount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  return (
    <>
      {/* ── Compact BBJ Ticker on Table ── */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 14px',
          background: 'linear-gradient(135deg, rgba(26,10,0,0.85) 0%, rgba(61,24,0,0.85) 100%)',
          border: `1px solid ${GOLD_DARK}`,
          borderRadius: 20,
          boxShadow: '0 2px 8px rgba(255,215,0,0.15)',
          cursor: 'default',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 14 }}></span>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: GOLD_DARK, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            BBJ
          </span>
          <span
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: GOLD,
              fontVariantNumeric: 'tabular-nums',
              textShadow: '0 0 6px rgba(255,215,0,0.4)',
              lineHeight: 1,
            }}
          >
            {formattedAmount}
          </span>
        </div>
      </div>

      {/* ── BBJ Won Celebration Overlay ── */}
      <AnimatePresence>
        {showWin && winData && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', damping: 15, stiffness: 200 }}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 9998,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'radial-gradient(ellipse at center, rgba(255,215,0,0.15) 0%, rgba(0,0,0,0.8) 70%)',
              pointerEvents: 'none',
            }}
          >
            <motion.div
              initial={{ y: 30 }}
              animate={{ y: 0 }}
              style={{
                background: 'linear-gradient(145deg, #1a0a00, #3d1800)',
                border: `2px solid ${GOLD}`,
                borderRadius: 16,
                padding: '24px 40px',
                textAlign: 'center',
                boxShadow: `0 0 40px rgba(255,215,0,0.3), 0 0 80px rgba(255,215,0,0.1)`,
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 8 }}></div>
              <div style={{ fontSize: 22, fontWeight: 900, color: GOLD, textShadow: '0 0 12px rgba(255,215,0,0.5)' }}>
                BAD BEAT JACKPOT!
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#fff', margin: '8px 0' }}>
                {(winData.totalPayout || 0).toLocaleString()}
              </div>
              <div style={{ fontSize: 13, color: GOLD_DARK }}>
                {winData.loserName || 'Player'} Lost With {winData.loserHand || 'a monster'}
              </div>
              {winData.winnerName && (
                <div style={{ fontSize: 12, color: '#B0B3B8', marginTop: 4 }}>
                  {winData.winnerName} Won The Hand
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
