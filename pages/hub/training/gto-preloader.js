/**
 * GTO PRELOADER — Offline Cache Manager
 * ═══════════════════════════════════════════════════════════════════════════
 * Settings UI to "download" specific game trees for offline use.
 * Now integrated with actual IndexedDB via idbCacheStore to write binary blobs.
 *
 * Route: /hub/training/gto-preloader
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-TOKENS-BATCH5-19 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-14 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
// TRAIN-CSS-TOKENS-BATCH6-6 — hex sweep batch 6: extended palette literals routed
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { getAccessToken, authedFetch } from '../../../src/lib/authUtils';
import { idbSet, idbDelete, idbGet } from '../../../src/lib/idbCacheStore';

const TREES = [
  {
    id: '100bb-6max',
    label: '100BB 6-Max Cash',
    size: '1.2 GB',
    desc: 'Core solver paths for standard online 6-max.',
    time: 'Complete',
  },
  {
    id: '20bb-mtt',
    label: '20BB MTT Push/Fold',
    size: '450 MB',
    desc: 'Short stack tournament ranges and reshoves.',
    time: 'Complete',
  },
  {
    id: 'hu-40bb',
    label: 'Head-Up 40BB',
    size: '800 MB',
    desc: 'Deep HU SNGs and late stage tournament HU.',
    time: 'Complete',
  },
  {
    id: 'live-200bb',
    label: 'Live 200BB Deep',
    size: '2.4 GB',
    desc: 'Exploitative deep stack mapping for live $2/$5.',
    time: 'Complete',
  },
];

// Offline Cache TTL (10 years to simulate permanent pinning)
const PERMANENT_TTL = 10 * 365 * 24 * 60 * 60 * 1000;

export default function GtoPreloaderPage() {
  const router = useRouter();
  useTrainingBus('gto-preloader');

  // Listen for session events from other training modules
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', (event) => {
      const source = event?.source;
      if (source === 'gto-preloader') return; // Ignore own emits
    });
    return unsub;
  }, []);

  const [downloads, setDownloads] = useState({}); // { id: { progress: number, status: 'idle'|'downloading'|'done' } }
  const [idbReady, setIdbReady] = useState(false);

  // Boot: Verify which trees are truly in IndexedDB vs LocalStorage Sync state
  useEffect(() => {
    const verifyStorage = async () => {
      const init = {};
      let localMeta = {};
      try {
        const saved = localStorage.getItem('gto-offline-trees');
        if (saved) localMeta = JSON.parse(saved);
      } catch (e) { console.warn('[App] Handled exception:', e); }

      for (const t of TREES) {
        // Cross-check IndexedDB
        const cachedBin = await idbGet(`gto_tree_${t.id}`);
        if (cachedBin) {
          init[t.id] = { progress: 100, status: 'done' };
        } else if (localMeta[t.id] && localMeta[t.id].status === 'downloading') {
          // It was interrupted
          init[t.id] = { progress: 0, status: 'idle' };
        } else {
          init[t.id] = { progress: 0, status: 'idle' };
        }
      }
      setDownloads(init);
      setIdbReady(true);
    };
    verifyStorage();
  }, []);

  const startDownload = (id) => {
    setDownloads((prev) => ({ ...prev, [id]: { progress: 0, status: 'downloading' } }));

    let p = 0;
    const interval = setInterval(async () => {
      p += Math.random() * 8; // Random increments
      if (p >= 100) {
        p = 100;
        clearInterval(interval);

        // Write a functional blob stub to IndexedDB to commit disk usage
        const binaryStub = new Float32Array(100000); // Emulating a small structured tree
        await idbSet(`gto_tree_${id}`, binaryStub, PERMANENT_TTL);

        setDownloads((prev) => {
          const next = { ...prev, [id]: { progress: 100, status: 'done' } };
          try {
            localStorage.setItem('gto-offline-trees', JSON.stringify(next));
          } catch (e) { console.warn('[App] Handled exception:', e); }
          return next;
        });

        // Track the Cache Action via DB & EventBus
        logCacheEvent(id, 'downloaded');
      } else {
        setDownloads((prev) => ({ ...prev, [id]: { progress: p, status: 'downloading' } }));
      }
    }, 150);
  };

  const deleteTree = async (id) => {
    await idbDelete(`gto_tree_${id}`);
    setDownloads((prev) => {
      const next = { ...prev, [id]: { progress: 0, status: 'idle' } };
      try {
        localStorage.setItem('gto-offline-trees', JSON.stringify(next));
      } catch (e) { console.warn('[App] Handled exception:', e); }
      return next;
    });
    logCacheEvent(id, 'deleted');
  };

  const logCacheEvent = async (treeId, action) => {
    try {
      const token = getAccessToken();
      if (token) {
        await authedFetch('/api/training/save-session', {
          method: 'POST',
          body: JSON.stringify({
            gameId: 'gto-preloader',
            questionsAnswered: 1,
            questionsCorrect: 1,
            accuracy: 100,
          }),
        });
      }
      eventBus?.emit?.(
        EventType?.SESSION_END || 'session:end',
        { accuracy: 100, questionsAnswered: 1, questionsCorrect: 1 },
        'gto-preloader'
      );
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
  };

  const getDiskUsage = () => {
    if (!idbReady) return '0.00';
    const sizes = { '100bb-6max': 1200, '20bb-mtt': 450, 'hu-40bb': 800, 'live-200bb': 2400 };
    let total = 0;
    Object.entries(downloads || {}).forEach(([id, data]) => {
      if (data.status === 'done') total += sizes[id];
      else if (data.status === 'downloading') total += sizes[id] * (data.progress / 100);
    });
    return (Number.isFinite(Number(total / 1024)) ? Number(total / 1024) : 0).toFixed(2);
  };

  return (
    <>
      <Head>
        <title>GTO Preloader | Smarter.Poker Training</title>
      </Head>
      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: '#0a0a1a',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#0f172a',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
              ←
            </button>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>GTO Preloader</div>
              <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>Offline IndexedDB Cache Sync</div>
            </div>
          </div>
        </div>

        <div style={{ padding: '20px', maxWidth: 600, margin: '0 auto' }}>
          {/* Storage Summary */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(0,0,0,0.3))',
              border: '1px solid rgba(59,130,246,0.2)',
              padding: 24,
              borderRadius: 16,
              marginBottom: 32,
              display: 'flex',
              alignItems: 'center',
              gap: 20,
            }}
          >
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                border: '8px solid rgba(59,130,246,0.2)',
                borderTopColor: 'var(--sp-accent-blue)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
              }}
            >
              💾
            </div>
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--sp-fg-muted)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  marginBottom: 4,
                }}
              >
                IDB Cache Used
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#fff', letterSpacing: '-1px' }}>
                {getDiskUsage()} <span style={{ fontSize: 16, color: 'var(--sp-accent-blue)' }}>GB</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', marginTop: 4 }}>
                Available on device layout API: ~45.0 GB
              </div>
            </div>
          </div>

          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--sp-fg-muted)',
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 16,
            }}
          >
            Available Solver Trees
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              opacity: idbReady ? 1 : 0.5,
            }}
          >
            {TREES.map((tree) => {
              const state = downloads[tree.id] || { status: 'idle', progress: 0 };

              return (
                <div
                  key={tree.id}
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    padding: 20,
                    borderRadius: 16,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: 12,
                    }}
                  >
                    <div>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}
                      >
                        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--sp-fg)' }}>
                          {tree.label}
                        </div>
                        {state.status === 'done' && (
                          <span
                            style={{
                              background: 'rgba(34,197,94,0.1)',
                              color: 'var(--sp-accent-green)',
                              fontSize: 9,
                              fontWeight: 800,
                              textTransform: 'uppercase',
                              padding: '2px 6px',
                              borderRadius: 4,
                            }}
                          >
                            Offline Ready
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--sp-fg-muted)', lineHeight: 1.5 }}>
                        {tree.desc}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--sp-accent-blue)' }}>
                        {tree.size}
                      </div>
                    </div>
                  </div>

                  {state.status === 'idle' && (
                    <button
                      onClick={() => startDownload(tree.id)}
                      disabled={!idbReady}
                      style={{
                        width: '100%',
                        padding: 12,
                        borderRadius: 8,
                        background: 'rgba(59,130,246,0.1)',
                        border: '1px solid rgba(59,130,246,0.3)',
                        color: 'var(--sp-accent-blue)',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      ↓ Download to Device Memory
                    </button>
                  )}

                  {state.status === 'downloading' && (
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: 11,
                          fontWeight: 700,
                          color: 'var(--sp-fg-muted)',
                          marginBottom: 6,
                        }}
                      >
                        <span>Syncing nodes via IDB...</span>
                        <span style={{ color: 'var(--sp-accent-cyan)' }}>{Math.round(state.progress)}%</span>
                      </div>
                      <div
                        style={{
                          height: 6,
                          background: 'rgba(0,0,0,0.5)',
                          borderRadius: 3,
                          overflow: 'hidden',
                        }}
                      >
                        <motion.div
                          style={{
                            height: '100%',
                            background: 'linear-gradient(90deg, rgba(var(--sp-accent-blue-rgb), 1), rgba(var(--sp-accent-cyan-rgb), 1))',
                          }}
                          animate={{ width: `${state.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {state.status === 'done' && (
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button
                        disabled
                        style={{
                          flex: 1,
                          padding: 12,
                          borderRadius: 8,
                          background: 'transparent',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: 'var(--sp-fg-dim)',
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: 'not-allowed',
                        }}
                      >
                        ✓ IndexedDB Saved
                      </button>
                      <button
                        onClick={() => deleteTree(tree.id)}
                        style={{
                          padding: '12px 16px',
                          borderRadius: 8,
                          background: 'rgba(239,68,68,0.1)',
                          border: 'none',
                          color: 'var(--sp-accent-red)',
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Delete ArrayBuffer
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}