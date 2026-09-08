const DEFAULT_TIMEOUT_MS = 6_000;
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 125;
const DEFAULT_PAGE_SIZE = 250;
const DEFAULT_MAX_ITEMS = 2_500;
const DEFAULT_MAX_VARIANTS = 10_000;
const MARKETPLACE_PHASE7_SCHEMA_MARKER = 'marketplace_phase7_vip_acquisition_mutex:v1';
const { inspectStripeRuntime } = require('./stripeRuntimeMode');

function bool(value) {
  return Boolean(value);
}

function elapsed(startedAt) {
  return Math.max(0, Date.now() - startedAt);
}

async function withTimeout(label, task, timeoutMs = DEFAULT_TIMEOUT_MS) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`${label} timed out`);
          error.code = 'MARKETPLACE_HEALTH_TIMEOUT';
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function withTransientRetry(task, {
  attempts = DEFAULT_MAX_ATTEMPTS,
  delayMs = DEFAULT_RETRY_DELAY_MS,
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      if (error?.code === 'MARKETPLACE_HEALTH_TIMEOUT') throw error;
      if (attempt >= attempts) throw error;
      await wait(delayMs * attempt);
    }
  }
  throw lastError;
}

async function fetchHealth(url, { fetchImpl, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const startedAt = Date.now();
  let lastResult = null;

  for (let attempt = 1; attempt <= DEFAULT_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'error',
        headers,
        signal: controller.signal,
      });
      lastResult = {
        reachable: response.ok,
        status: Number(response.status) || 0,
        latencyMs: elapsed(startedAt),
        reason: response.ok ? null : 'provider_rejected_probe',
      };
      if (response.ok || (response.status < 500 && response.status !== 429)) return lastResult;
    } catch (error) {
      lastResult = {
        reachable: false,
        status: 0,
        latencyMs: elapsed(startedAt),
        reason: error?.name === 'AbortError' ? 'provider_timeout' : 'provider_unreachable',
        error,
      };
    } finally {
      clearTimeout(timer);
    }
    if (attempt < DEFAULT_MAX_ATTEMPTS) await wait(DEFAULT_RETRY_DELAY_MS * attempt);
  }

  return lastResult;
}

async function readAllActive(client, table, columns, maxRows, pageSize) {
  const rows = [];

  // Fetch one bounded sentinel row instead of asking PostgreSQL for an exact
  // count. Exact counts caused cold readiness probes to scan the full table
  // and occasionally time out even though the storefront query was healthy.
  for (let offset = 0; offset <= maxRows; offset += pageSize) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .eq('is_active', true)
      .order('id', { ascending: true })
      .range(offset, Math.min(offset + pageSize - 1, maxRows));
    if (error) throw error;
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (rows.length > maxRows) {
      return { rows: rows.slice(0, maxRows), count: maxRows + 1, complete: false };
    }
    if (page.length < pageSize) break;
  }

  return {
    rows,
    count: rows.length,
    complete: true,
  };
}

async function catalogReadiness(client, {
  resolvePrintfulMapping,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pageSize = DEFAULT_PAGE_SIZE,
  maxItems = DEFAULT_MAX_ITEMS,
  maxVariants = DEFAULT_MAX_VARIANTS,
} = {}) {
  const startedAt = Date.now();
  try {
    const [itemResult, variantResult] = await withTransientRetry(
      () => withTimeout(
        'marketplace catalog',
        () => Promise.all([
          readAllActive(client, 'merchandise_items', 'id, has_variants, metadata', maxItems, pageSize),
          readAllActive(client, 'merchandise_item_variants', 'id, item_id, metadata', maxVariants, pageSize),
        ]),
        timeoutMs
      )
    );

    const variantsByItem = new Map();
    for (const variant of variantResult.rows) {
      const current = variantsByItem.get(variant.item_id) || [];
      current.push(variant);
      variantsByItem.set(variant.item_id, current);
    }

    let printfulItems = 0;
    let manualItems = 0;
    let fulfillmentReady = 0;
    for (const item of itemResult.rows) {
      const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
      if (metadata.fulfillment_provider !== 'printful') {
        manualItems += 1;
        continue;
      }
      printfulItems += 1;
      const variants = variantsByItem.get(item.id) || [];
      const mapped = item.has_variants || variants.length > 0
        ? variants.length > 0
          && variants.every((variant) => bool(resolvePrintfulMapping(null, variant.metadata)))
        : bool(resolvePrintfulMapping(metadata, null));
      if (mapped) fulfillmentReady += 1;
    }

    const complete = itemResult.complete && variantResult.complete;
    return {
      reachable: true,
      complete,
      total: itemResult.count,
      loaded: itemResult.rows.length,
      variantsTotal: variantResult.count,
      variantsLoaded: variantResult.rows.length,
      printfulItems,
      manualItems,
      fulfillmentReady,
      allFulfillmentReady: complete
        && itemResult.rows.length > 0
        && manualItems === 0
        && printfulItems === itemResult.rows.length
        && fulfillmentReady === printfulItems,
      reason: complete ? null : 'catalog_health_limit_exceeded',
      latencyMs: elapsed(startedAt),
    };
  } catch (error) {
    return {
      reachable: false,
      complete: false,
      total: 0,
      loaded: 0,
      variantsTotal: 0,
      variantsLoaded: 0,
      printfulItems: 0,
      manualItems: 0,
      fulfillmentReady: 0,
      allFulfillmentReady: false,
      reason: error?.code === 'MARKETPLACE_HEALTH_TIMEOUT' ? 'catalog_timeout' : 'catalog_unreachable',
      latencyMs: elapsed(startedAt),
      error,
    };
  }
}

async function schemaVersionReadiness(client, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const startedAt = Date.now();
  try {
    const { data } = await withTransientRetry(
      () => withTimeout(
        'Phase 7 marketplace schema marker RPC',
        async () => {
          const result = await client.rpc('marketplace_phase7_vip_acquisition_mutex_version', {});
          if (result.error) throw result.error;
          return result;
        },
        timeoutMs
      )
    );
    const marker = typeof data === 'string' ? data : null;
    const markerReady = marker === MARKETPLACE_PHASE7_SCHEMA_MARKER;
    return {
      reachable: true,
      marker,
      markerReady,
      reason: markerReady ? null : 'schema_marker_mismatch',
      latencyMs: elapsed(startedAt),
    };
  } catch (error) {
    return {
      reachable: false,
      marker: null,
      markerReady: false,
      reason: error?.code === 'MARKETPLACE_HEALTH_TIMEOUT'
        ? 'schema_marker_timeout'
        : 'schema_marker_unavailable',
      latencyMs: elapsed(startedAt),
      error,
    };
  }
}

function publicDependency(result, configured) {
  return {
    configured,
    reachable: configured && result?.reachable === true,
    reason: configured ? result?.reason || null : 'missing_configuration',
    latencyMs: Number.isFinite(result?.latencyMs) ? result.latencyMs : null,
  };
}

async function runMarketplaceReadiness({
  env = process.env,
  createClient,
  fetchImpl = globalThis.fetch,
  resolvePrintfulMapping,
  isPrintfulConfigured = (candidate) => bool(candidate?.PRINTFUL_API_TOKEN),
  isAutoConfirmEnabled = (candidate) => String(candidate?.PRINTFUL_AUTO_CONFIRM || '').trim().toLowerCase() === 'true',
  isPrintfulReady,
  onError = () => {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pageSize = DEFAULT_PAGE_SIZE,
  maxItems = DEFAULT_MAX_ITEMS,
  maxVariants = DEFAULT_MAX_VARIANTS,
} = {}) {
  if (typeof createClient !== 'function') throw new TypeError('createClient is required');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch is required');
  if (typeof resolvePrintfulMapping !== 'function') throw new TypeError('resolvePrintfulMapping is required');
  if (typeof isPrintfulReady !== 'function') throw new TypeError('isPrintfulReady is required');

  const supabaseConfigured = bool(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
  const stripeRuntime = inspectStripeRuntime(env, {
    requirePublishable: true,
    requireWebhook: true,
  });
  const stripeSecretConfigured = stripeRuntime.secretConfigured;
  const stripePublishableConfigured = stripeRuntime.publishableConfigured;
  const stripeWebhookConfigured = stripeRuntime.webhookConfigured;
  const stripeMode = stripeRuntime.keyMode;
  const stripeModeAllowed = stripeRuntime.productionModeAllowed && bool(stripeMode);
  const stripeConfigured = stripeRuntime.ready;
  const printfulTokenConfigured = bool(isPrintfulConfigured(env));
  const printfulAutoConfirmValue = String(env.PRINTFUL_AUTO_CONFIRM || '').trim().toLowerCase();
  const printfulAutoConfirmConfigured = bool(printfulAutoConfirmValue);
  const printfulAutoConfirmEnabled = bool(isAutoConfirmEnabled(env));
  const printfulAutoConfirmValid = !printfulAutoConfirmConfigured
    || ['true', 'false'].includes(printfulAutoConfirmValue);
  const printfulStoreConfigured = bool(env.PRINTFUL_STORE_ID);
  const printfulWebhookConfigured = bool(env.PRINTFUL_WEBHOOK_SECRET);
  // `PRINTFUL_AUTO_CONFIRM=false` by itself is an explicit manual-mode
  // declaration, not an attempted provider connection. Any credential,
  // provider identifier, webhook secret, or enabled auto-confirm flag does
  // constitute an integration attempt and must fail closed when incomplete.
  const printfulConfigurationPresent = printfulTokenConfigured
    || printfulAutoConfirmEnabled
    || !printfulAutoConfirmValid
    || printfulStoreConfigured
    || printfulWebhookConfigured;
  const printfulConfigured = printfulTokenConfigured
    && printfulAutoConfirmEnabled
    && printfulStoreConfigured
    && printfulWebhookConfigured
    && bool(isPrintfulReady(env));

  let catalog = {
    reachable: false,
    complete: false,
    total: 0,
    loaded: 0,
    variantsTotal: 0,
    variantsLoaded: 0,
    printfulItems: 0,
    manualItems: 0,
    fulfillmentReady: 0,
    allFulfillmentReady: false,
    reason: 'missing_configuration',
    latencyMs: null,
  };
  let schemaVersion = {
    reachable: false,
    marker: null,
    markerReady: false,
    reason: 'missing_configuration',
    latencyMs: null,
  };

  if (supabaseConfigured) {
    const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    [catalog, schemaVersion] = await Promise.all([
      catalogReadiness(client, { resolvePrintfulMapping, timeoutMs, pageSize, maxItems, maxVariants }),
      schemaVersionReadiness(client, timeoutMs),
    ]);
  }

  const [stripe, printful] = await Promise.all([
    stripeConfigured
      ? fetchHealth('https://api.stripe.com/v1/balance', {
          fetchImpl,
          timeoutMs,
          headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
        })
      : { reachable: false, reason: 'missing_configuration', latencyMs: null },
    printfulConfigured
      ? fetchHealth('https://api.printful.com/store', {
          fetchImpl,
          timeoutMs,
          headers: {
            Authorization: `Bearer ${env.PRINTFUL_API_TOKEN}`,
            'X-PF-Store-ID': String(env.PRINTFUL_STORE_ID),
          },
        })
      : { reachable: false, reason: 'missing_configuration', latencyMs: null },
  ]);

  for (const [label, result] of Object.entries({ catalog, schemaVersion, stripe, printful })) {
    if (result?.error) onError(label, result.error);
  }

  const supabaseHealthy = supabaseConfigured
    && catalog.reachable === true
    && catalog.complete === true
    && catalog.total > 0
    && schemaVersion.markerReady === true;
  const stripeHealthy = stripeConfigured && stripe.reachable === true;
  const printfulHealthy = printfulConfigured && printful.reachable === true;
  // A completely absent Printful configuration is the owner's deliberate
  // manual-fulfillment mode. Any partial configuration is different: it is an
  // attempted automatic integration that cannot safely be called ready.
  const fulfillmentRequired = printfulConfigurationPresent;
  const configuredPrintfulCatalogReady = printfulConfigured
    && printfulHealthy
    && (
      catalog.printfulItems === 0
      || catalog.fulfillmentReady === catalog.printfulItems
    );
  const checks = {
    supabase: supabaseHealthy,
    stripe: stripeHealthy,
    printful: !fulfillmentRequired || configuredPrintfulCatalogReady,
  };
  const capabilities = {
    cardCheckout: supabaseHealthy && stripeHealthy,
    diamondCheckout: supabaseHealthy,
    manualMerchFulfillment: supabaseHealthy,
    automaticMerchFulfillment:
      supabaseHealthy && printfulHealthy && catalog.allFulfillmentReady === true,
  };
  const fulfillmentMode = capabilities.automaticMerchFulfillment
    ? 'automatic'
    : !printfulConfigurationPresent
      ? 'manual'
      : configuredPrintfulCatalogReady
        ? catalog.printfulItems > 0 && catalog.manualItems > 0 ? 'mixed' : 'manual'
        : 'misconfigured';
  const ready = Object.values(checks).every(Boolean)
    && capabilities.manualMerchFulfillment;

  return {
    success: true,
    ready,
    status: ready ? 'ready' : 'degraded',
    fulfillmentMode,
    checks,
    catalog: {
      reachable: catalog.reachable,
      complete: catalog.complete,
      total: catalog.total,
      loaded: catalog.loaded,
      variantsTotal: catalog.variantsTotal,
      variantsLoaded: catalog.variantsLoaded,
      printfulItems: catalog.printfulItems,
      manualItems: catalog.manualItems,
      fulfillmentReady: catalog.fulfillmentReady,
      allFulfillmentReady: catalog.allFulfillmentReady,
      reason: catalog.reason,
      latencyMs: catalog.latencyMs,
    },
    dependencies: {
      supabase: {
        ...publicDependency(catalog, supabaseConfigured),
        catalogComplete: catalog.complete,
        schemaMarker: schemaVersion.marker,
        schemaMarkerReady: schemaVersion.markerReady,
        schemaMarkerReason: schemaVersion.reason,
        schemaMarkerLatencyMs: schemaVersion.latencyMs,
      },
      stripe: {
        ...publicDependency(stripe, stripeConfigured),
        secretConfigured: stripeSecretConfigured,
        publishableConfigured: stripePublishableConfigured,
        webhookConfigured: stripeWebhookConfigured,
        keyMode: stripeMode || 'invalid',
        modeAllowed: stripeModeAllowed,
      },
      printful: {
        ...publicDependency(printful, printfulConfigured),
        configurationPresent: printfulConfigurationPresent,
        tokenConfigured: printfulTokenConfigured,
        autoConfirmConfigured: printfulAutoConfirmConfigured,
        autoConfirmEnabled: printfulAutoConfirmEnabled,
        autoConfirmValid: printfulAutoConfirmValid,
        storeConfigured: printfulStoreConfigured,
        webhookConfigured: printfulWebhookConfigured,
      },
    },
    capabilities,
  };
}

module.exports = {
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_MAX_ITEMS,
  DEFAULT_RETRY_DELAY_MS,
  DEFAULT_MAX_VARIANTS,
  DEFAULT_PAGE_SIZE,
  DEFAULT_TIMEOUT_MS,
  MARKETPLACE_PHASE7_SCHEMA_MARKER,
  catalogReadiness,
  rpcReadiness: schemaVersionReadiness,
  runMarketplaceReadiness,
  schemaVersionReadiness,
  withTransientRetry,
  withTimeout,
};
