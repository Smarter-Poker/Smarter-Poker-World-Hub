/**
 * GTO PRELOADER — Offline Cache Manager
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Downloads signed training question packs for short-lived connection-loss
 * recovery. The arena reads the same IndexedDB entries whenever a network
 * request cannot complete, but Next still waits for authoritative persistence.
 *
 * Route: /hub/training/gto-preloader
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-19 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-14 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
// TRAIN-CSS-TOKENS-BATCH6-6 — hex sweep batch 6: extended palette literals routed
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { authedFetch, getAuthUser } from '../../../src/lib/authUtils';
import { idbSet, idbDelete, idbGet } from '../../../src/lib/idbCacheStore';
import {
  createOfflineQuestionCacheContract,
  deleteOfflineQuestions,
  estimateQuestionBytes,
  getOfflineQuestionCacheTtl,
  getOfflineQuestions,
  setOfflineQuestions,
} from '../../../src/lib/training/offlineQuestionCache';

import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import s from '../../../src/styles/training/sessions-coaching.module.css';
const OFFLINE_PACK_DELIVERY_CONTRACT = createOfflineQuestionCacheContract({
  difficulty: 'standard',
  gameMode: 'full',
  handSelection: 'all',
  targetStreet: null,
});

const TREES = [
  {
    id: '100bb-6max',
    gameId: 'cash-001',
    label: '100BB 6-Max Cash',
    desc: 'Your unlocked Preflop Blueprint levels for standard 100BB cash play.',
  },
  {
    id: '20bb-mtt',
    gameId: 'mtt-001',
    label: '20BB MTT Push/Fold',
    desc: 'Your unlocked Push/Fold levels for short-stack tournament decisions.',
  },
  {
    id: 'hu-40bb',
    gameId: 'cash-010',
    label: 'Head-Up 40BB',
    desc: 'Your unlocked Short Stack levels backed by the 40BB heads-up corpus.',
  },
  {
    id: 'live-200bb',
    gameId: 'cash-009',
    label: 'Live 200BB Deep',
    desc: 'Your unlocked Deep Stack levels for 200BB postflop study.',
  },
];

const LEVELS = Array.from({ length: 12 }, (_, index) => index + 1);

function normalizePackLevels(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map(Number)
    .filter((level) => Number.isInteger(level) && level >= 1 && level <= 12))]
    .sort((a, b) => a - b);
}

async function fetchUnlockedLevels(gameId) {
  const response = await authedFetch(
    `/api/training/progress?gameId=${encodeURIComponent(gameId)}`,
  );
  const payload = await response.json().catch(() => null);
  const highest = Number(payload?.highest_level_unlocked);
  if (!response.ok || !Number.isInteger(highest) || highest < 1 || highest > 12) {
    throw new Error(payload?.error || 'Unlocked Training levels could not be verified');
  }
  return LEVELS.slice(0, highest);
}

function createOfflinePackSessionId(gameId) {
  const randomUUID = globalThis?.crypto?.randomUUID;
  const suffix = typeof randomUUID === 'function'
    ? randomUUID.call(globalThis.crypto)
    : `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
  return `offline-${gameId}-${suffix}`;
}

function offlinePackManifestKey(id, userId) {
  return `training_pack:${encodeURIComponent(String(userId || ''))}:${id}`;
}

function assertSignedPackPayload(payload, expectedSessionId) {
  if (String(payload?.sessionId || '') !== String(expectedSessionId || '')) {
    throw new Error('Downloaded questions belong to a different session');
  }
  if (!payload?.attemptId) {
    throw new Error('Downloaded questions do not have an attempt identity');
  }
  const ttlMs = getOfflineQuestionCacheTtl(payload?.questions);
  if (ttlMs <= 0) throw new Error('Downloaded questions do not have valid grading receipts');
  for (const question of payload.questions) {
    const context = question?._gradingContext;
    if (
      !context?.receipt
      || !context?.submissionId
      || !context?.attemptId
      || !context?.snapshotKey
      || !context?.sessionKind
      || !Number.isInteger(Number(context?.sessionTargetHands))
      || !Number.isInteger(Number(context?.handOrdinal))
      || !Number.isInteger(Number(context?.decisionOrdinal))
      || typeof context?.countsTowardCompletion !== 'boolean'
      || typeof context?.practiceOnly !== 'boolean'
      || String(context.sessionId || '') !== String(expectedSessionId || '')
      || String(context.attemptId) !== String(payload.attemptId)
    ) {
      throw new Error('Downloaded questions do not have valid grading receipts');
    }
  }
  return Math.min(
    ...payload.questions.map((question) => Date.parse(question._gradingContext.expiresAt)),
  ) - 60 * 1000;
}

export default function GtoPreloaderPage() {
  const router = useRouter();
  useTrainingBus('gto-preloader');
  const userId = getAuthUser()?.id || null;

  const [downloads, setDownloads] = useState({});
  const [idbReady, setIdbReady] = useState(false);

  // Boot: verify every level, rather than trusting a display-only local flag.
  useEffect(() => {
    const verifyStorage = async () => {
      const init = {};
      for (const t of TREES) {
        const manifest = userId ? await idbGet(offlinePackManifestKey(t.id, userId)) : null;
        const manifestLevels = manifest?.version === 3
          ? normalizePackLevels(manifest.levels)
          : [];
        let cachedLevels = 0;
        let questionCount = 0;
        let bytes = 0;
        for (const level of manifestLevels) {
          const questions = await getOfflineQuestions(
            t.gameId,
            level,
            userId,
            OFFLINE_PACK_DELIVERY_CONTRACT,
          );
          if (questions.length > 0) {
            cachedLevels += 1;
            questionCount += questions.length;
            bytes += estimateQuestionBytes(questions);
          }
        }
        const complete = manifestLevels.length > 0 && cachedLevels === manifestLevels.length;
        init[t.id] = {
          progress: complete ? 100 : Math.round((cachedLevels / LEVELS.length) * 100),
          status: complete ? 'done' : 'idle',
          cachedLevels,
          questionCount,
          bytes,
          error: null,
          eligibleLevels: manifestLevels.length,
        };
      }
      setDownloads(init);
      setIdbReady(true);
    };
    verifyStorage();
  }, [userId]);

  const startDownload = async (id) => {
    const tree = TREES.find((entry) => entry.id === id);
    if (!tree) return;
    if (!userId) {
      setDownloads((prev) => ({
        ...prev,
        [id]: { ...prev[id], status: 'error', error: 'Sign in before downloading a signed cache.' },
      }));
      return;
    }
    setDownloads((prev) => ({
      ...prev,
      [id]: { progress: 0, status: 'downloading', cachedLevels: 0, questionCount: 0, bytes: 0, error: null },
    }));

    try {
      const eligibleLevels = await fetchUnlockedLevels(tree.gameId);
      setDownloads((prev) => ({
        ...prev,
        [id]: { ...prev[id], eligibleLevels: eligibleLevels.length },
      }));
      let questionCount = 0;
      let bytes = 0;
      let packExpiresAt = Number.POSITIVE_INFINITY;
      const packSessionId = createOfflinePackSessionId(tree.gameId);
      const levelSessionIds = {};
      for (const [index, level] of eligibleLevels.entries()) {
        // One server-owned attempt maps to exactly one game/level/config.
        // Keep a stable pack root for the manifest, but never reuse an attempt
        // nonce across twelve different level contracts.
        const levelSessionId = `${packSessionId}-level-${level}`;
        levelSessionIds[level] = levelSessionId;
        const params = new URLSearchParams({
          gameId: tree.gameId,
          level: level.toString(),
          count: '20',
          difficulty: 'standard',
          sessionId: levelSessionId,
          gameMode: 'full',
          handSelection: 'all',
        });
        const response = await authedFetch(`/api/training/batch-preload?${params}`);
        let payload = null;
        try { payload = await response.json(); } catch { /* handled below */ }
        if (!response.ok || !Array.isArray(payload?.questions) || payload.questions.length === 0) {
          throw new Error(payload?.error || `Level ${level} could not be downloaded`);
        }
        packExpiresAt = Math.min(packExpiresAt, assertSignedPackPayload(payload, levelSessionId));
        const cached = await setOfflineQuestions(
          tree.gameId,
          level,
          payload.questions,
          userId,
          OFFLINE_PACK_DELIVERY_CONTRACT,
        );
        if (!cached) throw new Error(`Level ${level} grading receipts expire too soon to cache`);
        questionCount += payload.questions.length;
        bytes += estimateQuestionBytes(payload.questions);
        setDownloads((prev) => ({
          ...prev,
          [id]: {
            progress: Math.round(((index + 1) / eligibleLevels.length) * 100),
            status: 'downloading',
            cachedLevels: index + 1,
            questionCount,
            bytes,
            error: null,
            eligibleLevels: eligibleLevels.length,
          },
        }));
      }

      const packTtlMs = packExpiresAt - Date.now();
      if (!Number.isFinite(packTtlMs) || packTtlMs <= 0) {
        throw new Error('The signed cache expired before the download completed');
      }
      await idbSet(
        offlinePackManifestKey(id, userId),
        {
          version: 3,
          gameId: tree.gameId,
          levels: eligibleLevels,
          questionCount,
          bytes,
          sessionId: packSessionId,
          levelSessionIds,
          savedAt: new Date().toISOString(),
          expiresAt: new Date(packExpiresAt).toISOString(),
        },
        packTtlMs,
      );
      setDownloads((prev) => ({
        ...prev,
        [id]: {
          progress: 100,
          status: 'done',
          cachedLevels: eligibleLevels.length,
          eligibleLevels: eligibleLevels.length,
          questionCount,
          bytes,
          error: null,
        },
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
    await Promise.all(LEVELS.map((level) => deleteOfflineQuestions(
      tree.gameId,
      level,
      userId,
      OFFLINE_PACK_DELIVERY_CONTRACT,
    )));
    if (userId) await idbDelete(offlinePackManifestKey(id, userId));
    setDownloads((prev) => ({
      ...prev,
      [id]: { progress: 0, status: 'idle', cachedLevels: 0, eligibleLevels: 0, questionCount: 0, bytes: 0, error: null },
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
      <SEOHead
        title="Offline GTO Training Pack Preloader"
        description="Download And Cache Solved GTO Poker Scenario Packs And Preflop Range Matrices Into Browser Storage For Offline And Airplane Study On Smarter.Poker."
        canonical="/hub/training/gto-preloader"
      />
      <div className={s.shell}>
        <TrainingPageHead slug="training-gto-preloader" note="Signed Question Cache Sync" />

        <div className={s.page}>
          {/* Storage Summary */}
          <section className={`sd-panel ${s.panel}`} aria-labelledby="preloader-storage-title">
            <div className={s.panelHead}>
              <div>
                <p id="preloader-storage-title" className={s.eyebrow}>IDB Cache Used</p>
                <p className={s.copy}>Verified Question Payloads Currently Stored On This Device</p>
              </div>
              <div className={`sd-metric ${s.metric}`}>
                <strong className={s.metricValue} data-tone="ice">{getDiskUsage()}</strong>
                <span className={s.metricLabel}>On Device</span>
              </div>
            </div>
          </section>

          <h2 className={s.sectionTitle}>Available Training Packs</h2>

          <div style={{ display: 'grid', gap: 12, opacity: idbReady ? 1 : 0.6 }}>
            {TREES.map((tree) => {
              const state = downloads[tree.id] || { status: 'idle', progress: 0 };

              return (
                <article key={tree.id} className={`sd-panel ${s.panel}`} aria-labelledby={`pack-${tree.id}-title`}>
                  <div className={s.panelHead} style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                    <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                      <h3 id={`pack-${tree.id}-title`} className={s.subTitle}>{tree.label}</h3>
                      {state.status === 'done' && (
                        <span className={s.tag} style={{ color: '#5ee08a' }}>Signed Cache Ready</span>
                      )}
                      <p className={s.copy}>{tree.desc}</p>
                    </div>
                    <div className={`sd-metric ${s.metric}`} style={{ flex: 'none', minWidth: 104 }}>
                      <strong className={s.metricValue} data-tone="ice">{state.cachedLevels || 0}/{state.eligibleLevels || '-'}</strong>
                      <span className={s.metricLabel}>Unlocked Levels</span>
                      <span className={s.metricLabel}>{state.questionCount || 0} Questions</span>
                    </div>
                  </div>

                  {state.status === 'idle' && (
                    <button
                      type="button"
                      className={`sd-button ${idbReady ? 'sd-primary' : ''} ${s.button} ${s.full}`}
                      onClick={() => startDownload(tree.id)}
                      disabled={!idbReady}
                    >
                      ↓ Cache Unlocked Levels
                    </button>
                  )}

                  {state.status === 'downloading' && (
                    <div style={{ display: 'grid', gap: 6 }} role="status" aria-live="polite">
                      <div className={s.panelHead}>
                        <span className={s.metricLabel}>Downloading Verified Questions...</span>
                        <span className={s.ice} style={{ fontWeight: 800 }}>{Math.round(state.progress)}%</span>
                      </div>
                      <div className={s.track}>
                        <motion.div className={s.fill} animate={{ width: `${state.progress}%` }} />
                      </div>
                    </div>
                  )}

                  {state.status === 'done' && (
                    <div className={s.actions}>
                      <button type="button" disabled className={`sd-button ${s.button}`}>
                        ✓ Offline Pack Ready
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTree(tree.id)}
                        className={`sd-button ${s.button}`}
                      >
                        Delete Pack
                      </button>
                    </div>
                  )}

                  {state.status === 'error' && (
                    <div role="alert" style={{ display: 'grid', gap: 8 }}>
                      <p className={s.error}>
                        {state.error || 'The Pack Could Not Be Downloaded.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => startDownload(tree.id)}
                        className={`sd-button ${s.button} ${s.full}`}
                      >
                        Retry Download
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </div>
      <HubPageSummary page="training-gto-preloader" />
    </>
  );
}
