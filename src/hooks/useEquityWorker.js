/**
 * useEquityWorker - Progressive Worker Equity Hook + Instant Cancellation
 *
 * Runs a fast ~500-trial preview first (<30ms) followed by full 10,000-trial
 * convergence in the background across bounded worker batches, guarded by a
 * monotonic calculation request token + AbortController so rapid card or
 * range edits cancel in-flight work immediately with zero stale equity flash.
 */
import { useEffect, useRef, useState } from 'react';
import {
  calculateEquityAsync,
  isEquityWorkerAvailable,
  terminateEquityWorker,
} from '../lib/sandbox/EquityEngine.js';

export const DEFAULT_PREVIEW_TRIALS = 500;
export const DEFAULT_FULL_TRIALS = 10000;
export const DEFAULT_BATCH_SIZE = 2500;

function round1(val) {
  return Math.round(val * 10) / 10;
}

/**
 * Sample-size-weighted combination of independent Monte Carlo equity batches.
 */
export function combineEquitySamples(batches = []) {
  const valid = (Array.isArray(batches) ? batches : []).filter(
    (b) => b && Number.isFinite(Number(b.heroEquity)) && Number(b.sampleSize) > 0,
  );
  if (valid.length === 0) return null;

  let totalSamples = 0;
  let heroWeighted = 0;
  let tiesWeighted = 0;
  let last = valid[valid.length - 1];

  for (const b of valid) {
    const n = Number(b.sampleSize);
    totalSamples += n;
    heroWeighted += Number(b.heroEquity) * n;
    tiesWeighted += (Number(b.ties) || 0) * n;
  }

  if (totalSamples <= 0) return null;
  const heroEquity = round1(heroWeighted / totalSamples);
  const villainEquity = round1(Math.max(0, 100 - heroEquity));
  const ties = round1(tiesWeighted / totalSamples);

  return {
    ...last,
    heroEquity,
    villainEquity,
    ties,
    sampleSize: totalSamples,
  };
}

function yieldFrame() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Execute progressive two-stage Monte Carlo equity calculation with monotonic
 * request token + AbortSignal cancellation.
 */
export async function runProgressiveEquity({
  heroCards,
  boardCards = [],
  rangeArg = null,
  previewTrials = DEFAULT_PREVIEW_TRIALS,
  fullTrials = DEFAULT_FULL_TRIALS,
  batchSize = DEFAULT_BATCH_SIZE,
  signal,
  tokenRef,
  requestId,
  calculateFn = calculateEquityAsync,
  onProgress,
}) {
  const isCancelled = () => Boolean(
    signal?.aborted || (tokenRef && requestId != null && tokenRef.current !== requestId),
  );

  if (isCancelled()) return null;
  if (!Array.isArray(heroCards) || heroCards.length < 2) return null;

  const targetFull = Math.max(previewTrials, Number(fullTrials) || DEFAULT_FULL_TRIALS);
  const firstBatchSize = Math.max(1, Math.min(Number(previewTrials) || DEFAULT_PREVIEW_TRIALS, targetFull));

  // Stage 1: Fast preview (<30ms)
  const preview = await calculateFn(heroCards, boardCards, firstBatchSize, rangeArg, { signal });
  if (isCancelled() || !preview) return null;

  if (preview.blocked || preview.invalid || !Number.isFinite(Number(preview.heroEquity))) {
    const terminalResult = {
      ...preview,
      isPreview: false,
      converged: true,
      targetTrials: targetFull,
    };
    onProgress?.(terminalResult);
    return terminalResult;
  }

  const samples = [preview];
  const initialCombined = {
    ...combineEquitySamples(samples),
    isPreview: (Number(preview.sampleSize) || 0) < targetFull,
    converged: (Number(preview.sampleSize) || 0) >= targetFull,
    targetTrials: targetFull,
  };
  onProgress?.(initialCombined);

  if (initialCombined.converged) return initialCombined;

  // Stage 2: Background convergence to 10,000 trials in cancellable batches
  let completedTrials = Number(preview.sampleSize) || firstBatchSize;
  const maxBatch = Math.max(100, Math.min(Number(batchSize) || DEFAULT_BATCH_SIZE, 3000));

  while (completedTrials < targetFull) {
    if (isCancelled()) return null;
    await yieldFrame();
    if (isCancelled()) return null;

    const remaining = targetFull - completedTrials;
    const nextSize = Math.min(maxBatch, remaining);
    const batch = await calculateFn(heroCards, boardCards, nextSize, rangeArg, { signal });
    if (isCancelled() || !batch) return null;
    if (batch.blocked || batch.invalid || !Number.isFinite(Number(batch.heroEquity))) {
      break;
    }

    samples.push(batch);
    completedTrials += Number(batch.sampleSize) || nextSize;
    const merged = combineEquitySamples(samples);
    if (!merged) break;

    const converged = completedTrials >= targetFull;
    const snapshot = {
      ...merged,
      isPreview: !converged,
      converged,
      targetTrials: targetFull,
    };
    onProgress?.(snapshot);
    if (converged) return snapshot;
  }

  if (isCancelled()) return null;
  const finalMerged = combineEquitySamples(samples);
  if (!finalMerged) return null;
  const finalResult = {
    ...finalMerged,
    isPreview: false,
    converged: true,
    targetTrials: targetFull,
  };
  onProgress?.(finalResult);
  return finalResult;
}

/**
 * React hook wrapper for progressive worker equity with instant cancellation.
 */
export function useEquityWorker({
  heroCards,
  boardCards = [],
  rangeArg = null,
  enabled = true,
  previewTrials = DEFAULT_PREVIEW_TRIALS,
  fullTrials = DEFAULT_FULL_TRIALS,
  tokenRef: externalTokenRef = null,
  calculateFn = calculateEquityAsync,
} = {}) {
  const internalTokenRef = useRef(0);
  const reqIdRef = externalTokenRef || internalTokenRef;
  const [equity, setEquity] = useState(null);
  const [computing, setComputing] = useState(false);
  const [refining, setRefining] = useState(false);
  const [workerReady, setWorkerReady] = useState(false);

  useEffect(() => {
    setWorkerReady(Boolean(isEquityWorkerAvailable()));
    return () => {
      try { terminateEquityWorker(); } catch (_e) { /* noop */ }
    };
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    if (!Array.isArray(heroCards) || heroCards.length < 2) {
      reqIdRef.current += 1;
      setEquity(null);
      setComputing(false);
      setRefining(false);
      return undefined;
    }

    const reqId = ++reqIdRef.current;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    setComputing(true);
    setRefining(false);

    runProgressiveEquity({
      heroCards,
      boardCards,
      rangeArg,
      previewTrials,
      fullTrials,
      signal: controller?.signal,
      tokenRef: reqIdRef,
      requestId: reqId,
      calculateFn,
      onProgress: (result) => {
        if (reqId !== reqIdRef.current) return;
        setEquity(result && Number.isFinite(Number(result.heroEquity)) ? result : null);
        setComputing(false);
        setRefining(Boolean(result?.isPreview && !result?.converged));
      },
    })
      .catch(() => {
        if (reqId !== reqIdRef.current) return;
        setEquity(null);
      })
      .finally(() => {
        if (reqId === reqIdRef.current) {
          setComputing(false);
          setRefining(false);
        }
      });

    return () => {
      reqIdRef.current += 1;
      try { controller?.abort(); } catch (_e) { /* already aborted */ }
    };
  }, [heroCards, boardCards, rangeArg, enabled, previewTrials, fullTrials, reqIdRef, calculateFn]);

  return {
    equity,
    computing,
    refining,
    workerReady,
    requestTokenRef: reqIdRef,
  };
}

export default useEquityWorker;
