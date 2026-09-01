const DEFAULT_BUDGETS_MS = Object.freeze({
  sandbox_analysis: 25_000,
  leak_detection: 60_000,
});

/**
 * Adds a truthful end-to-end duration to every response from a long-running
 * Personal Assistant endpoint. It never changes the response status or body.
 */
export function attachPersonalAssistantTiming(res, operation, budgetMs = DEFAULT_BUDGETS_MS[operation]) {
  const startedAt = process.hrtime.bigint();
  const originalJson = res.json.bind(res);
  let emitted = false;

  res.json = (body) => {
    if (!emitted && !res.headersSent) {
      emitted = true;
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const safeOperation = String(operation || 'request').replace(/[^a-zA-Z0-9_-]/g, '_');
      res.setHeader('Server-Timing', `${safeOperation};dur=${durationMs.toFixed(1)}`);
      if (Number.isFinite(budgetMs)) {
        res.setHeader('X-PA-Latency-Budget', `${Math.round(budgetMs)}ms`);
        res.setHeader('X-PA-Latency-State', durationMs <= budgetMs ? 'within-budget' : 'over-budget');
      }
    }
    return originalJson(body);
  };

  return { operation, budgetMs };
}

export { DEFAULT_BUDGETS_MS };
