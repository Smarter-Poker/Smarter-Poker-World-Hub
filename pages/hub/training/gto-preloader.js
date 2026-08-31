/**
 * GTO PRELOADER — Offline Cache Manager
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Downloads real training question packs for offline use. The arena reads
 * the same IndexedDB entries whenever a network request cannot complete.
 *
 * Route: /hub/training/gto-preloader
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-19 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-14 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
// TRAIN-CSS-TOKENS-BATCH6-6 — hex sweep batch 6: extended palette literals routed
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { authedFetch } from '../../../src/lib/authUtils';
import { idbSet, idbDelete, idbGet } from '../../../src/lib/idbCacheStore';
import {
  deleteOfflineQuestions,
  estimateQuestionBytes,
  getOfflineQuestions,
  setOfflineQuestions,
} from '../../../src/lib/training/offlineQuestionCache';

const TREES = [
  {
    id: '100bb-6max',
    gameId: 'cash-001',
    label: '100BB 6-Max Cash',
    desc: 'All 12 Preflop Blueprint levels for standard 100BB cash play.',
  },
  {
    id: '20bb-mtt',
    gameId: 'mtt-001',
    label: '20BB MTT Push/Fold',
    desc: 'All 12 Push/Fold levels for short-stack tournament decisions.',
  },
  {
    id: 'hu-40bb',
    gameId: 'cash-010',
    label: 'Head-Up 40BB',
    desc: 'All 12 Short Stack levels backed by the 40BB heads-up corpus.',
  },
  {
    id: 'live-200bb',
    gameId: 'cash-009',
    label: 'Live 200BB Deep',
    desc: 'All 12 Deep Stack levels for 200BB postflop study.',
  },
];

const LEVELS = Array.from({ length: 12 }, (_, index) => index + 1);
const PACK_TTL = 30 * 24 * 60 * 60 * 1000;

export default function GtoPreloaderPage() {
  const router = useRouter();
  useTrainingBus('gto-preloader');

  const [downloads, setDownloads] = useState({});
  const [idbReady, setIdbReady] = useState(false);

  // Boot: verify every level, rather than trusting a display-only local flag.
  useEffect(() => {
    const verifyStorage = async () => {
      const init = {};
      for (const t of TREES) {
        const manifest = await idbGet(`training_pack:${t.id}`);
        let cachedLevels = 0;
        let questionCount = 0;
        let bytes = 0;
        for (const level of LEVELS) {
          const questions = await getOfflineQuestions(t.gameId, level);
          if (questions.length > 0) {
            cachedLevels += 1;
            questionCount += questions.length;
            bytes += estimateQuestionBytes(questions);
          }
        }
        const complete = cachedLevels === LEVELS.length && manifest?.version === 1;
        init[t.id] = {
          progress: complete ? 100 : Math.round((cachedLevels / LEVELS.length) * 100),
          status: complete ? 'done' : 'idle',
          cachedLevels,
          questionCount,
          bytes,
          error: null,
        };
      }
      setDownloads(init);
      setIdbReady(true);
    };
    verifyStorage();
  }, []);

  const startDownload = async (id) => {
    const tree = TREES.find((entry) => entry.id === id);
    if (!tree) return;
    setDownloads((prev) => ({
      ...prev,
      [id]: { progress: 0, status: 'downloading', cachedLevels: 0, questionCount: 0, bytes: 0, error: null },
    }));

    let questionCount = 0;
    let bytes = 0;
    try {
      for (const level of LEVELS) {
        const response = await authedFetch(
          `/api/training/batch-preload?gameId=${encodeURIComponent(tree.gameId)}&level=${level}&count=20`,
        );
        let payload = null;
        try { payload = await response.json(); } catch { /* handled below */ }
        if (!response.ok || !Array.isArray(payload?.questions) || payload.questions.length === 0) {
          throw new Error(payload?.error || `Level ${level} could not be downloaded`);
        }
        await setOfflineQuestions(tree.gameId, level, payload.questions);
        questionCount += payload.questions.length;
        bytes += estimateQuestionBytes(payload.questions);
        setDownloads((prev) => ({
          ...prev,
          [id]: {
            progress: Math.round((level / LEVELS.length) * 100),
            status: 'downloading',
            cachedLevels: level,
            questionCount,
            bytes,
            error: null,
          },
        }));
      }

      await idbSet(
        `training_pack:${id}`,
        { version: 1, gameId: tree.gameId, levels: LEVELS, questionCount, bytes, savedAt: new Date().toISOString() },
        PACK_TTL,
      );
      setDownloads((prev) => ({
        ...prev,
        [id]: { progress: 100, status: 'done', cachedLevels: 12, questionCount, bytes, error: null },
      }));
    } catch (error) {
      setDownloads((prev) => ({
        ...prev,
        [id]: { ...prev[id], status: 'error', error: error?.message || 'Download failed' },
      }));
    }
  };

  const deleteTree = async (id) => {
    const tree = TREES.find((entry) => entry.id === id);
    if (!tree) return;
    await Promise.all(LEVELS.map((level) => deleteOfflineQuestions(tree.gameId, level)));
    await idbDelete(`training_pack:${id}`);
    setDownloads((prev) => ({
      ...prev,
      [id]: { progress: 0, status: 'idle', cachedLevels: 0, questionCount: 0, bytes: 0, error: null },
    }));
  };

  const getDiskUsage = () => {
    const bytes = Object.values(downloads || {}).reduce(
      (total, data) => total + (Number(data?.bytes) || 0),
      0,
    );
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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
              <div style={{ fontSize: 11, color: '#b9cbd4' }}>Real Offline Question Pack Sync</div>
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
                {getDiskUsage()}
              </div>
              <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', marginTop: 4 }}>
                Verified Question Payloads Currently Stored On This Device
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
            Available Training Packs
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
                        {state.cachedLevels || 0}/12 Levels
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--sp-fg-dim)', marginTop: 2 }}>
                        {state.questionCount || 0} Questions
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
                      ↓ Cache All 12 Levels
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
                        <span>Downloading Verified Questions...</span>
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
                        ✓ Offline Pack Ready
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
                        Delete Pack
                      </button>
                    </div>
                  )}

                  {state.status === 'error' && (
                    <div role="alert" style={{ marginTop: 10 }}>
                      <div style={{ color: 'var(--sp-accent-red)', fontSize: 11, marginBottom: 8 }}>
                        {state.error || 'The pack could not be downloaded.'}
                      </div>
                      <button
                        type="button"
                        onClick={() => startDownload(tree.id)}
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
                        Retry Download
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
