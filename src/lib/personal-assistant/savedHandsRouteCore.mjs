import { toCardCodes } from './leakRecord.js';
import { checkSandboxAccess } from './contextAuthority.js';
import { attachPersonalAssistantTiming } from './serverTiming.mjs';
import {
  SAVED_HAND_TABLE_ID,
  CLUB_ARENA_SOURCE,
  SAVED_HAND_LIST_COLUMNS,
  CLUB_ARENA_SOURCE_HAND_SELECT,
  MAX_BATCH_HAND_IDS,
  DEFAULT_SAVED_HANDS_LIMIT,
  MAX_SAVED_HANDS_LIMIT,
  MAX_PAYLOAD_BYTES,
  isValidUuid,
  clubArenaSavedHandKey,
  clubArenaLookupKeys,
  extractSourceHandIdFromKey,
  validateSavedHand,
  savedHandRow,
  callerParticipatedInClubArenaHand,
  buildClubArenaSavedHandRow,
  normalizeSavedHandReviewMeta,
  validateSavedHandPatch,
  isUniqueViolationError,
  encodeSavedHandsCursor,
  decodeSavedHandsCursor,
  rowEffectiveTimestamp,
  compareSavedHandRowsDesc,
  isSavedHandUnreviewed,
  inferSavedHandFormat,
  matchesSavedHandFilters,
  rankSuggestedHands,
  formatSavedHandForExport,
  formatSavedHandsAsText,
} from './savedHands.mjs';

const DEFAULT_PROBE_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_PROBE_BLOCK_THRESHOLD = 5;
const MAX_PROBE_TRACKER_KEYS = 5000;
const SAVED_HANDS_BATCH_SIZE = 200;
const MAX_SAVED_HANDS_SCAN_ROWS = 1000;
const EXPORT_CHUNK_SIZE = 100;
const MAX_SAVED_HANDS_RESPONSE_BYTES = 2 * 1024 * 1024;
const SAVED_HANDS_DATA_BYTES = MAX_SAVED_HANDS_RESPONSE_BYTES - 32 * 1024;

// Read the coalesced saved timestamp without a database migration. Each legacy
// stream is owner-scoped and keyset-paginated before data leaves PostgREST.
// The merge preserves nullable created_at records and deterministic ID ties.
async function readSavedHandsBatch(supabase, userId, cursor, limit) {
  const columns = ['created_at', 'completed_at', 'started_at'];
  const results = await Promise.all(columns.map(async (column, index) => {
    let query = supabase.from('hand_histories').select(SAVED_HAND_LIST_COLUMNS).eq('user_id', userId);
    for (const earlier of columns.slice(0, index)) query = query.is(earlier, null);
    query = query.not(column, 'is', null);
    if (cursor) {
      if (cursor.id) {
        const timestamp = JSON.stringify(cursor.createdAt);
        const id = JSON.stringify(cursor.id);
        query = query.or(`${column}.lt.${timestamp},and(${column}.eq.${timestamp},id.lt.${id})`);
      } else {
        query = query.lte(column, cursor.createdAt);
      }
    }
    return query.order(column, { ascending: false }).order('id', { ascending: false }).limit(limit + 1);
  }));
  const failure = results.find((result) => result.error);
  if (failure) return { rows: [], hasMore: false, error: failure.error };
  if (results.some((result) => !Array.isArray(result.data))) {
    return { rows: [], hasMore: false, error: new Error('Saved Hand Query Returned Incomplete Data') };
  }
  const merged = results.flatMap((result) => result.data).sort(compareSavedHandRowsDesc);
  return { rows: merged.slice(0, limit), hasMore: merged.length > limit, error: null };
}

function savedRowCursor(row) {
  return row ? encodeSavedHandsCursor({ createdAt: rowEffectiveTimestamp(row), id: row.id }) : null;
}

async function readSavedHandsPage(supabase, userId, cursor, limit, filters) {
  let scanCursor = cursor;
  let scanned = 0;
  let reachedEnd = false;
  let lastScanned = null;
  let totalCount = 0;
  let unreviewedCount = 0;
  const matches = [];
  let responseBytes = 0;
  let byteLimited = false;

  while (scanned < MAX_SAVED_HANDS_SCAN_ROWS && matches.length <= limit && !reachedEnd && !byteLimited) {
    const batch = await readSavedHandsBatch(supabase, userId, scanCursor, SAVED_HANDS_BATCH_SIZE);
    if (batch.error) return { error: batch.error };
    for (const rawRow of batch.rows) {
      const row = decorateSavedRow(rawRow);
      if (matchesSavedHandFilters(row, filters)) {
        totalCount += 1;
        if (matches.length <= limit) {
          const bytes = Buffer.byteLength(JSON.stringify(row), 'utf8');
          if (responseBytes + bytes > SAVED_HANDS_DATA_BYTES) {
            if (matches.length === 0) return { error: new Error('Saved Hand Exceeds Response Size Budget') };
            byteLimited = true;
            break;
          }
          responseBytes += bytes;
          matches.push(row);
        }
      }
      if (isSavedHandUnreviewed(row)) unreviewedCount += 1;
      lastScanned = rawRow;
      scanned += 1;
    }
    reachedEnd = !batch.hasMore && !byteLimited;
    if (!reachedEnd && lastScanned) {
      const next = decodeSavedHandsCursor(savedRowCursor(lastScanned));
      if (scanCursor && next.createdAt === scanCursor.createdAt && next.id === scanCursor.id) {
        return { error: new Error('Saved Hand Cursor Did Not Advance') };
      }
      scanCursor = next;
    }
    if (batch.rows.length === 0) break;
  }

  const hands = matches.slice(0, limit);
  const hasExtraMatch = matches.length > limit;
  const nextCursor = hasExtraMatch
    ? savedRowCursor(hands[hands.length - 1])
    : !reachedEnd
      ? savedRowCursor(lastScanned)
      : null;
  const countsComplete = !cursor && reachedEnd;
  return {
    hands,
    nextCursor,
    countsComplete,
    totalCount: countsComplete ? totalCount : null,
    unreviewedCount: countsComplete ? unreviewedCount : null,
  };
}

// Verified against supabase/migrations/20260831094000_version_private_club_arena_hand_facts.sql
const HERO_HAND_FACT_SELECT = [
  'hole_cards',
  'position',
  'invested',
  'returned',
  'net',
  'net_bb',
  'went_to_showdown',
  'won_at_showdown',
].join(', ');

const SUGGESTED_FACTS_SELECT = [
  'hand_id',
  'table_id',
  'tournament_id',
  'played_at',
  'game_variant',
  'big_blind',
  'position',
  'players_dealt',
  'hole_cards',
  'hand_class',
  'invested',
  'returned',
  'net',
  'net_bb',
  'three_bet',
  'four_bet',
  'faced_three_bet',
  'folded_to_three_bet',
  'saw_flop',
  'went_to_showdown',
  'won_at_showdown',
  'was_all_in',
  'all_in_street',
  'all_in_at_risk',
  'aggressive_actions',
  'passive_actions',
  'ev_net_bb',
].join(', ');

// Privacy-safe select for enriching suggested hands: intentionally omits hole_cards and players.
const SUGGESTED_HISTORY_ENRICH_SELECT = [
  'id',
  'table_id',
  'tournament_id',
  'game_variant',
  'small_blind',
  'big_blind',
  'pot_size',
  'board',
  'community_cards',
  'summary',
  'created_at',
].join(', ');

const ACTIVE_PLAY_ANALYSIS_LOCK_MESSAGE =
  'Solver Analysis Is Locked While Seated At An Active Table. Your Hand Remains Saved For Post-Session Review.';
const ACTIVE_PLAY_SUGGESTED_MESSAGE =
  'Suggested Hands Appear After You Leave Your Active Table.';

const defaultProbeStore = new Map();

export function resetNonParticipantProbeTracker() {
  defaultProbeStore.clear();
}

function getClientIp(req) {
  const realIp = req?.headers?.['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const parts = forwarded.split(',');
    return parts[parts.length - 1].trim();
  }
  return String(req?.socket?.remoteAddress || 'unknown');
}

function pruneProbeTimestamps(list, nowMs, windowMs) {
  const cutoff = nowMs - windowMs;
  let firstValid = 0;
  while (firstValid < list.length && list[firstValid] <= cutoff) {
    firstValid++;
  }
  return firstValid > 0 ? list.slice(firstValid) : list;
}

function getProbeBucketKey(req, userId) {
  return `${String(userId || 'anon')}::${getClientIp(req)}`;
}

function isProbeBucketThrottled(store, key, nowMs, windowMs, blockThreshold) {
  const existing = store.get(key);
  if (!existing || existing.length === 0) return { throttled: false, count: 0, retryAfterSeconds: 0 };
  const pruned = pruneProbeTimestamps(existing, nowMs, windowMs);
  if (pruned.length === 0) {
    store.delete(key);
    return { throttled: false, count: 0, retryAfterSeconds: 0 };
  }
  if (pruned.length !== existing.length) store.set(key, pruned);
  const throttled = pruned.length >= blockThreshold;
  const oldestMs = pruned[0] || nowMs;
  const retryAfterSeconds = throttled ? Math.max(1, Math.ceil((oldestMs + windowMs - nowMs) / 1000)) : 0;
  return { throttled, count: pruned.length, retryAfterSeconds };
}

function recordNonParticipantProbe({
  store,
  req,
  userId,
  targetId,
  reason = 'non_participant_or_missing',
  nowMs = Date.now(),
  windowMs = DEFAULT_PROBE_WINDOW_MS,
  blockThreshold = DEFAULT_PROBE_BLOCK_THRESHOLD,
  logger = console.warn,
}) {
  const key = getProbeBucketKey(req, userId);
  if (store.size >= MAX_PROBE_TRACKER_KEYS && !store.has(key)) {
    const firstKey = store.keys().next().value;
    if (firstKey !== undefined) store.delete(firstKey);
  }
  const existing = store.get(key) || [];
  const pruned = pruneProbeTimestamps(existing, nowMs, windowMs);
  pruned.push(nowMs);
  store.set(key, pruned);

  const count = pruned.length;
  const throttled = count >= blockThreshold;
  const oldestMs = pruned[0] || nowMs;
  const retryAfterSeconds = throttled ? Math.max(1, Math.ceil((oldestMs + windowMs - nowMs) / 1000)) : 0;

  try {
    logger(
      '[saved-hands] non_participant_probe',
      JSON.stringify({
        event: 'non_participant_probe',
        reason,
        userId: String(userId || ''),
        handId: String(targetId || '').slice(0, 128),
        method: req?.method || 'UNKNOWN',
        probeCount: count,
        windowMs,
        throttled,
        status: throttled ? 429 : 404,
        ts: new Date(nowMs).toISOString(),
      }),
    );
  } catch (_) {
    // Logging must never crash request handling.
  }

  return { count, throttled, retryAfterSeconds };
}

function enforceProbePreCheck(req, res, userId, targetId, reason, probeConfig) {
  const bucketKey = getProbeBucketKey(req, userId);
  const preThrottle = isProbeBucketThrottled(
    probeConfig.store,
    bucketKey,
    probeConfig.nowMs,
    probeConfig.windowMs,
    probeConfig.blockThreshold,
  );
  if (!preThrottle.throttled) return false;
  recordNonParticipantProbe({
    ...probeConfig,
    req,
    userId,
    targetId,
    reason,
  });
  res.setHeader('Retry-After', String(preThrottle.retryAfterSeconds));
  res.status(429).json({
    success: false,
    code: 'PROBE_RATE_LIMITED',
    error: 'Too Many Invalid Hand Lookups. Please Wait Before Trying Again.',
  });
  return true;
}

function queryParam(req, key) {
  const raw = req?.query?.[key];
  const val = Array.isArray(raw) ? raw[0] : raw;
  return typeof val === 'string' ? val.trim() : '';
}

function hasQueryParam(req, key) {
  return Boolean(req?.query && Object.prototype.hasOwnProperty.call(req.query, key));
}

function isTruthyFlag(value) {
  const clean = String(value || '').trim().toLowerCase();
  return clean === '1' || clean === 'true' || clean === 'yes';
}

function resolveOperationName(req) {
  const method = String(req?.method || '').toUpperCase();
  if (method === 'GET') {
    if (isTruthyFlag(queryParam(req, 'suggested'))) return 'pa_saved_hands_suggested';
    if (queryParam(req, 'export')) return 'pa_saved_hands_export';
    if (hasQueryParam(req, 'handIds')) return 'pa_saved_hands_batch';
    if (isTruthyFlag(queryParam(req, 'analysisGate'))) return 'pa_saved_hands_analysis_gate';
    return 'pa_saved_hands_list';
  }
  if (method === 'POST') {
    const action = typeof req?.body?.action === 'string' ? req.body.action.trim().toLowerCase() : '';
    if (action === 'import_club_arena') {
      return 'pa_saved_hands_import_club_arena';
    }
    if (action === 'check_analysis_gate' || action === 'request_analysis') {
      return 'pa_saved_hands_analysis_gate';
    }
    return 'pa_saved_hands_create';
  }
  if (method === 'PATCH') return 'pa_saved_hands_patch';
  if (method === 'DELETE') return 'pa_saved_hands_delete';
  return 'pa_saved_hands_list';
}

function checkPayloadSize(body) {
  if (body === undefined || body === null) return { ok: true };
  try {
    const serialized = typeof body === 'string' ? body : JSON.stringify(body);
    const bytes = Buffer.byteLength(serialized, 'utf8');
    if (bytes > MAX_PAYLOAD_BYTES) {
      return { ok: false, status: 413, error: 'Request Payload Too Large' };
    }
    return { ok: true, bytes };
  } catch (_) {
    return { ok: false, status: 400, error: 'Request Payload Must Be Valid JSON' };
  }
}

async function evaluateActivePlayGate(checkAccess, supabase, userId, { requireFullAccess = false } = {}) {
  try {
    const result = await checkAccess(supabase, userId);
    const hasAccess = requireFullAccess
      ? Boolean(result && result.allowed === true && result.accessLevel === 'full_access')
      : Boolean(result && result.allowed === true);
    if (!hasAccess) {
      return {
        allowed: false,
        activePlayRestricted: true,
        contextState: result?.contextState || 'session_active_unknown',
        accessLevel: result?.accessLevel || 'hard_block',
        message: result?.message || null,
      };
    }
    return {
      allowed: true,
      activePlayRestricted: false,
      contextState: result.contextState || 'training_mode',
      accessLevel: result.accessLevel || 'full_access',
      message: null,
    };
  } catch (err) {
    console.warn('[saved-hands] active-play gate failed closed:', err?.message || err);
    return {
      allowed: false,
      activePlayRestricted: true,
      contextState: 'session_active_unknown',
      accessLevel: 'hard_block',
      message: null,
    };
  }
}

export function decorateSavedRow(row) {
  if (!row || typeof row !== 'object') return null;
  const handData = row.hand_data && typeof row.hand_data === 'object' ? row.hand_data : {};
  const review = normalizeSavedHandReviewMeta(row);
  const source = handData.source || (row.table_id === SAVED_HAND_TABLE_ID ? 'ai-scan' : CLUB_ARENA_SOURCE);
  const sourceHandId = handData.sourceHandId || extractSourceHandIdFromKey(row.hand_id) || null;
  const format = inferSavedHandFormat(row);
  return {
    ...row,
    hand_data: {
      ...handData,
      review,
    },
    review,
    source,
    sourceHandId,
    format,
  };
}

async function readExistingClubArenaSave(supabase, userId, sourceHandId) {
  const keys = clubArenaLookupKeys(sourceHandId);
  const primaryKey = clubArenaSavedHandKey(sourceHandId);
  let query = supabase
    .from('hand_histories')
    .select(SAVED_HAND_LIST_COLUMNS)
    .eq('user_id', userId);
  if (typeof query.in === 'function' && keys.length > 1) {
    // in-list: bounded single hand lookup (<= 2 canonical/legacy keys)
    query = query.in('hand_id', keys.slice(0, 2));
  } else {
    query = query.eq('hand_id', primaryKey);
  }
  const { data, error } = await query.maybeSingle();
  return { data: data ? decorateSavedRow(data) : null, error };
}

async function handleBatchLookup(req, res, supabase, user) {
  const rawCsv = queryParam(req, 'handIds');
  if (!rawCsv) {
    return res.status(200).json({ success: true, savedByHandId: {} });
  }

  const tokens = rawCsv
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return res.status(200).json({ success: true, savedByHandId: {} });
  }

  const validIds = [];
  const seen = new Set();
  for (const token of tokens) {
    if (!isValidUuid(token)) continue;
    const normalized = token.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    validIds.push(normalized);
    if (validIds.length >= MAX_BATCH_HAND_IDS) break;
  }

  if (validIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'At Least One Valid Club Arena Hand Identifier Is Required',
    });
  }

  const lookupKeys = [];
  for (const id of validIds) {
    for (const k of clubArenaLookupKeys(id)) lookupKeys.push(k);
  }

  let query = supabase
    .from('hand_histories')
    .select(SAVED_HAND_LIST_COLUMNS)
    .eq('user_id', user.id);

  if (typeof query.in === 'function') {
    // in-list: bounded by MAX_BATCH_HAND_IDS (<= 50 UUIDs / 100 lookup keys)
    query = query.in('hand_id', lookupKeys.slice(0, MAX_BATCH_HAND_IDS * 2));
  }

  const { data, error } = await query;
  if (error) {
    console.warn('[saved-hands] batch lookup failed:', error.message);
    return res.status(500).json({ success: false, error: 'Could Not Verify Saved Hands Status' });
  }

  const validSet = new Set(validIds);
  const savedByHandId = {};
  for (const rawRow of Array.isArray(data) ? data : []) {
    const row = decorateSavedRow(rawRow);
    if (!row) continue;
    const sourceId = String(row.sourceHandId || extractSourceHandIdFromKey(row.hand_id) || '').trim().toLowerCase();
    if (!sourceId || !validSet.has(sourceId)) continue;
    savedByHandId[sourceId] = {
      id: row.id,
      savedAt: row.created_at || row.completed_at || row.started_at || null,
      status: row.review.status,
      analysisState: row.review.analysisState,
      reviewUrl: `/hub/personal-assistant/review?hand=${encodeURIComponent(row.id)}`,
    };
  }

  return res.status(200).json({
    success: true,
    savedByHandId,
  });
}

async function loadSavedSourceHandIdsForFacts(supabase, userId, factRows, logLabel = 'suggested') {
  // Check only the bounded candidate set, so an older saved copy cannot fall
  // outside an arbitrary first-1000 account index and reappear as unsaved.
  const recentIds = [...new Set((Array.isArray(factRows) ? factRows : [])
    .map((row) => String(row?.hand_id || '').trim().toLowerCase())
    .filter(isValidUuid))];
  const savedSourceHandIds = new Set();
  for (let offset = 0; offset < recentIds.length; offset += MAX_BATCH_HAND_IDS) {
    let pendingIds = recentIds.slice(offset, offset + MAX_BATCH_HAND_IDS);
    while (pendingIds.length) {
      // Only validated UUIDs enter these anchored expressions. imatch retains
      // the trim/case behavior of legacy keys and JSON-only source identities.
      const ids = pendingIds.join('|');
      const keyPattern = JSON.stringify(String.raw`^\s*(club-arena:|ca:)?(${ids})\s*$`);
      const sourcePattern = JSON.stringify(String.raw`^\s*(${ids})\s*$`);
      const { data: savedRows, error: savedError } = await supabase
        .from('hand_histories')
        .select('hand_id,source_hand_id:hand_data->>sourceHandId')
        .eq('user_id', userId)
        .or(`hand_id.imatch.${keyPattern},hand_data->>sourceHandId.imatch.${sourcePattern}`)
        .order('id', { ascending: true })
        .limit(MAX_BATCH_HAND_IDS);
      if (savedError || !Array.isArray(savedRows)) {
        console.warn(`[saved-hands] ${logLabel} saved-index lookup failed:`, savedError?.message || 'Incomplete Data');
        return { savedSourceHandIds: null, error: savedError || new Error('Incomplete Data') };
      }
      if (savedRows.length === 0) break;
      for (const row of savedRows) {
        const fromData = row?.source_hand_id;
        if (isValidUuid(fromData)) savedSourceHandIds.add(String(fromData).trim().toLowerCase());
        const fromKey = extractSourceHandIdFromKey(row?.hand_id);
        if (fromKey) savedSourceHandIds.add(fromKey);
      }
      // A legacy source may have many copies. Remove each confirmed candidate
      // before querying again so those copies cannot hide another saved hand.
      // Every nonempty read must resolve at least one of at most 50 candidates.
      const remaining = pendingIds.filter(id => !savedSourceHandIds.has(id));
      if (remaining.length === pendingIds.length) {
        console.warn(`[saved-hands] ${logLabel} saved-index lookup made no progress`);
        return { savedSourceHandIds: null, error: new Error('Saved-Index Lookup Made No Progress') };
      }
      pendingIds = remaining;
    }
  }
  return { savedSourceHandIds, error: null };
}

async function handleSuggestedHands(req, res, supabase, user, { checkAccess }) {
  const gate = await evaluateActivePlayGate(checkAccess, supabase, user.id);
  if (!gate.allowed) {
    return res.status(200).json({
      success: true,
      activePlayRestricted: true,
      suggested: [],
      totalUnsavedCount: 0,
      message: ACTIVE_PLAY_SUGGESTED_MESSAGE,
    });
  }

  let factsQuery = supabase
    .from('ca_hand_facts')
    .select(SUGGESTED_FACTS_SELECT)
    .eq('user_id', user.id);
  if (typeof factsQuery.order === 'function') {
    factsQuery = factsQuery.order('played_at', { ascending: false });
  }
  if (typeof factsQuery.limit === 'function') {
    factsQuery = factsQuery.limit(100);
  }

  const { data: factRows, error: factsError } = await factsQuery;
  if (factsError) {
    console.warn('[saved-hands] suggested facts lookup failed:', factsError.message);
    return res.status(500).json({ success: false, error: 'Could Not Load Suggested Hands' });
  }

  const { savedSourceHandIds, error: savedLookupError } = await loadSavedSourceHandIdsForFacts(
    supabase,
    user.id,
    factRows,
    'suggested',
  );
  if (savedLookupError || !savedSourceHandIds) {
    return res.status(500).json({ success: false, error: 'Could Not Load Suggested Hands' });
  }

  const candidateFacts = (Array.isArray(factRows) ? factRows : []).filter((row) => {
    const hid = String(row?.hand_id || '').trim().toLowerCase();
    return isValidUuid(hid) && !savedSourceHandIds.has(hid);
  });

  if (candidateFacts.length === 0) {
    return res.status(200).json({
      success: true,
      activePlayRestricted: false,
      suggested: [],
      totalUnsavedCount: 0,
    });
  }

  // Enrich top candidates with board cards, pot size, and table names (never selecting opponent hole cards).
  const preRanked = rankSuggestedHands(candidateFacts, { savedSourceHandIds, limit: 15 });
  const candidateHandIds = preRanked.map((item) => item.handId);
  const handHistoryById = new Map();
  const tableIds = new Set();

  for (const fact of candidateFacts) {
    if (fact?.table_id && candidateHandIds.includes(String(fact.hand_id || '').toLowerCase())) {
      tableIds.add(String(fact.table_id));
    }
  }

  try {
    let historyQuery = supabase
      .from('hand_history')
      .select(SUGGESTED_HISTORY_ENRICH_SELECT);
    if (typeof historyQuery.in === 'function') {
      // in-list: bounded to <= 50 recent completed Club Arena fact IDs
      historyQuery = historyQuery.in('id', candidateHandIds.slice(0, 50));
      const { data: historyRows, error: histErr } = await historyQuery;
      if (histErr) {
        console.warn('[saved-hands] suggested hand_history enrichment failed:', histErr.message || histErr);
      } else if (Array.isArray(historyRows)) {
        for (const hr of historyRows) {
          const hid = String(hr?.id || '').trim().toLowerCase();
          if (hid) {
            handHistoryById.set(hid, hr);
            if (hr.table_id) tableIds.add(String(hr.table_id));
          }
        }
      }
    }
  } catch (err) {
    console.warn('[saved-hands] suggested hand_history enrichment threw:', err?.message || err);
  }

  const tableNameById = new Map();
  if (tableIds.size > 0) {
    try {
      let tableQuery = supabase.from('tables').select('id, name');
      if (typeof tableQuery.in === 'function') {
        // in-list: bounded table IDs from <= 50 recent Club Arena facts
        tableQuery = tableQuery.in('id', [...tableIds].slice(0, 50));
        const { data: tableRows, error: tblErr } = await tableQuery;
        if (tblErr) {
          console.warn('[saved-hands] suggested tables enrichment failed:', tblErr.message || tblErr);
        } else if (Array.isArray(tableRows)) {
          for (const tr of tableRows) {
            if (tr?.id && tr?.name) tableNameById.set(String(tr.id), String(tr.name).trim());
          }
        }
      }
    } catch (err) {
      console.warn('[saved-hands] suggested tables enrichment threw:', err?.message || err);
    }
  }

  const suggested = rankSuggestedHands(candidateFacts, {
    savedSourceHandIds,
    handHistoryById,
    tableNameById,
    limit: 5,
  });

  return res.status(200).json({
    success: true,
    activePlayRestricted: false,
    suggested,
    totalUnsavedCount: candidateFacts.length,
  });
}

async function handleImportClubArenaHands(req, res, supabase, user) {
  const rawLimit = req.body && typeof req.body === 'object' ? Number(req.body.limit) : NaN;
  const limit = Number.isFinite(rawLimit) && rawLimit >= 1
    ? Math.min(Math.trunc(rawLimit), MAX_BATCH_HAND_IDS)
    : DEFAULT_SAVED_HANDS_LIMIT;

  let factsQuery = supabase
    .from('ca_hand_facts')
    .select(SUGGESTED_FACTS_SELECT)
    .eq('user_id', user.id);
  if (typeof factsQuery.order === 'function') {
    factsQuery = factsQuery.order('played_at', { ascending: false });
  }
  if (typeof factsQuery.limit === 'function') {
    factsQuery = factsQuery.limit(100);
  }

  const { data: factRows, error: factsError } = await factsQuery;
  if (factsError) {
    console.warn('[saved-hands] import_club_arena facts lookup failed:', factsError.message);
    return res.status(500).json({ success: false, error: 'Could Not Load Your Club Arena Hand History' });
  }

  const uniqueFacts = [];
  const seenFactIds = new Set();
  for (const row of Array.isArray(factRows) ? factRows : []) {
    const hid = String(row?.hand_id || '').trim().toLowerCase();
    if (!isValidUuid(hid) || seenFactIds.has(hid)) continue;
    seenFactIds.add(hid);
    uniqueFacts.push(row);
  }

  if (uniqueFacts.length === 0) {
    return res.status(200).json({
      success: true,
      importedCount: 0,
      alreadySavedCount: 0,
      remainingCount: 0,
      hands: [],
    });
  }

  const { savedSourceHandIds, error: savedLookupError } = await loadSavedSourceHandIdsForFacts(
    supabase,
    user.id,
    uniqueFacts,
    'import_club_arena',
  );
  if (savedLookupError || !savedSourceHandIds) {
    return res.status(500).json({ success: false, error: 'Could Not Verify Saved Hand Status' });
  }

  const candidateFacts = [];
  let alreadySavedCount = 0;
  for (const row of uniqueFacts) {
    const hid = String(row.hand_id).trim().toLowerCase();
    if (savedSourceHandIds.has(hid)) {
      alreadySavedCount += 1;
    } else {
      candidateFacts.push(row);
    }
  }

  if (candidateFacts.length === 0) {
    return res.status(200).json({
      success: true,
      importedCount: 0,
      alreadySavedCount,
      remainingCount: 0,
      hands: [],
    });
  }

  const batchFacts = candidateFacts.slice(0, limit);
  const batchHandIds = batchFacts.map((row) => String(row.hand_id).trim().toLowerCase());

  let historyQuery = supabase
    .from('hand_history')
    .select(CLUB_ARENA_SOURCE_HAND_SELECT);
  if (typeof historyQuery.in === 'function') {
    // in-list: bounded by MAX_BATCH_HAND_IDS (<= 50 recent completed Club Arena hand IDs)
    historyQuery = historyQuery.in('id', batchHandIds.slice(0, MAX_BATCH_HAND_IDS));
  }
  const { data: historyRows, error: historyError } = await historyQuery;
  if (historyError) {
    console.warn('[saved-hands] import_club_arena hand_history batch lookup failed:', historyError.message);
    return res.status(500).json({ success: false, error: 'Could Not Read Completed Hand History' });
  }

  const handHistoryById = new Map();
  const tableIds = new Set();
  for (const hr of Array.isArray(historyRows) ? historyRows : []) {
    const hid = String(hr?.id || '').trim().toLowerCase();
    if (!hid) continue;
    handHistoryById.set(hid, hr);
    if (hr.table_id) tableIds.add(String(hr.table_id));
  }
  for (const fact of batchFacts) {
    if (fact?.table_id) tableIds.add(String(fact.table_id));
  }

  const tableMetaById = new Map();
  if (tableIds.size > 0) {
    try {
      let tableQuery = supabase.from('tables').select('id, name, club_id');
      if (typeof tableQuery.in === 'function') {
        // in-list: bounded table IDs from <= 50 recent Club Arena hands
        tableQuery = tableQuery.in('id', [...tableIds].slice(0, MAX_BATCH_HAND_IDS));
        const { data: tableRows, error: tableErr } = await tableQuery;
        if (tableErr) {
          console.warn('[saved-hands] import_club_arena tables lookup failed:', tableErr.message || tableErr);
        } else if (Array.isArray(tableRows)) {
          for (const tr of tableRows) {
            if (tr?.id) {
              tableMetaById.set(String(tr.id), {
                name: tr.name ? String(tr.name).trim() : null,
                clubId: tr.club_id || null,
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn('[saved-hands] import_club_arena tables lookup threw:', err?.message || err);
    }
  }

  const rowsToInsert = [];
  for (const fact of batchFacts) {
    const hid = String(fact.hand_id).trim().toLowerCase();
    const handRow = handHistoryById.get(hid);
    if (!handRow) continue;
    if (!callerParticipatedInClubArenaHand(handRow, user.id)) continue;
    const hasPlayers = Array.isArray(handRow.players) && handRow.players.length > 0;
    const hasRecordedResult = Boolean(handRow.created_at) && (hasPlayers || handRow.summary !== null);
    if (!hasRecordedResult) continue;

    const heroPrivateCards = fact.hole_cards ? (toCardCodes(fact.hole_cards) || []) : [];
    const tableKey = handRow.table_id ? String(handRow.table_id) : (fact.table_id ? String(fact.table_id) : '');
    const tableMeta = tableKey ? tableMetaById.get(tableKey) : null;

    // Privacy invariant: buildClubArenaSavedHandRow always sets club_id: null,
    // strips non-showdown opponent hole cards, and scopes the row to user.id.
    const rowToInsert = buildClubArenaSavedHandRow({
      userId: user.id,
      handRow,
      heroPrivateCards,
      heroFactRow: fact,
      tableName: tableMeta?.name || null,
      clubId: tableMeta?.clubId || null,
    });
    rowsToInsert.push({ sourceHandId: hid, rowToInsert });
  }

  const decoratedRows = [];
  let racedDuplicates = 0;
  let insertFailures = 0;

  const INSERT_CONCURRENCY = 5;
  for (let offset = 0; offset < rowsToInsert.length; offset += INSERT_CONCURRENCY) {
    const chunk = rowsToInsert.slice(offset, offset + INSERT_CONCURRENCY);
    const results = await Promise.all(chunk.map(async ({ sourceHandId, rowToInsert }) => {
      const { data: inserted, error: insertError } = await supabase
        .from('hand_histories')
        .insert(rowToInsert)
        .select(SAVED_HAND_LIST_COLUMNS)
        .maybeSingle();

      if (insertError) {
        if (isUniqueViolationError(insertError)) {
          return { status: 'duplicate' };
        }
        console.warn('[saved-hands] import_club_arena insert failed:', insertError.message);
        return { status: 'error' };
      }

      if (inserted) {
        return { status: 'inserted', hand: decorateSavedRow(inserted) };
      }

      const reconciled = await readExistingClubArenaSave(supabase, user.id, sourceHandId);
      if (!reconciled.error && reconciled.data) {
        return { status: 'inserted', hand: reconciled.data };
      }
      return { status: 'error' };
    }));

    for (const outcome of results) {
      if (outcome.status === 'inserted' && outcome.hand) {
        decoratedRows.push(outcome.hand);
      } else if (outcome.status === 'duplicate') {
        racedDuplicates += 1;
      } else {
        insertFailures += 1;
      }
    }
  }

  if (rowsToInsert.length > 0 && decoratedRows.length === 0 && racedDuplicates === 0 && insertFailures > 0) {
    return res.status(500).json({ success: false, error: 'Could Not Import Club Arena Hands' });
  }

  return res.status(200).json({
    success: true,
    importedCount: decoratedRows.length,
    alreadySavedCount: alreadySavedCount + racedDuplicates,
    remainingCount: Math.max(0, candidateFacts.length - batchFacts.length),
    hands: decoratedRows,
  });
}

async function handleExport(req, res, supabase, user, { startedAt }) {
  const rawFormat = queryParam(req, 'export').toLowerCase();
  const format = rawFormat === 'txt' ? 'text' : rawFormat;
  if (format !== 'json' && format !== 'text') {
    return res.status(400).json({
      success: false,
      error: 'Export Format Must Be Json Or Text',
    });
  }

  const rawCursor = queryParam(req, 'cursor');
  const cursor = rawCursor ? decodeSavedHandsCursor(rawCursor) : null;
  if (cursor?.error) return res.status(400).json({ success: false, error: cursor.error });
  const chunked = isTruthyFlag(queryParam(req, 'chunk'));
  if (cursor && !chunked) {
    return res.status(400).json({ success: false, error: 'Export Continuation Requires Chunk Mode' });
  }
  const batch = await readSavedHandsBatch(supabase, user.id, cursor, EXPORT_CHUNK_SIZE);
  if (batch.error) {
    console.warn('[saved-hands] export failed:', batch.error.message);
    return res.status(500).json({ success: false, error: 'Could Not Export Your Saved Hands' });
  }
  const decorated = [];
  let bytes = 0;
  for (const rawRow of batch.rows) {
    const row = decorateSavedRow(rawRow);
    const encoded = format === 'json'
      ? JSON.stringify(formatSavedHandForExport(row))
      : JSON.stringify(formatSavedHandsAsText([row]));
    const rowBytes = Buffer.byteLength(encoded, 'utf8');
    if (bytes + rowBytes > SAVED_HANDS_DATA_BYTES) break;
    decorated.push(row);
    bytes += rowBytes;
  }
  if (batch.rows.length && !decorated.length) {
    return res.status(413).json({ success: false, error: 'A Saved Hand Is Too Large To Export Safely' });
  }
  const hasMore = batch.hasMore || decorated.length < batch.rows.length;
  const nextCursor = hasMore ? savedRowCursor(decorated[decorated.length - 1]) : null;
  if (chunked) {
    return res.status(200).json({
      success: true,
      schemaVersion: 1,
      source: 'smarter.poker',
      exportedAt: new Date().toISOString(),
      format,
      count: decorated.length,
      ids: decorated.map((row) => row.id),
      nextCursor,
      complete: !nextCursor,
      ...(format === 'json'
        ? { hands: decorated.map(formatSavedHandForExport) }
        : { text: formatSavedHandsAsText(decorated) }),
    });
  }
  // Existing direct downloads remain compatible for a complete small export.
  // Never label a truncated server batch as an export of the entire account.
  if (hasMore) {
    return res.status(409).json({
      success: false,
      code: 'EXPORT_REQUIRES_PAGINATION',
      error: 'Open Review My Play To Download Your Complete Saved Hand Export',
    });
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="smarter-poker-saved-hands.json"');
    return res.status(200).json({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      source: 'smarter.poker',
      count: decorated.length,
      hands: decorated.map(formatSavedHandForExport),
    });
  }

  const textPayload = formatSavedHandsAsText(decorated);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="smarter-poker-saved-hands.txt"');
  if (!res.headersSent) {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    res.setHeader('Server-Timing', `pa_saved_hands_export;dur=${durationMs.toFixed(1)}`);
  }
  if (typeof res.send === 'function') {
    return res.status(200).send(textPayload);
  }
  res.status(200);
  if (typeof res.end === 'function') {
    return res.end(textPayload);
  }
  return res.json({ success: true, text: textPayload });
}

async function handleAnalysisGateRequest(req, res, supabase, user, { checkAccess, probeConfig }) {
  const action = req.method === 'POST'
    ? String(req.body?.action || '').trim().toLowerCase()
    : 'check_analysis_gate';

  if (action === 'request_analysis') {
    const id = String(req.body?.id || '').trim();
    if (!id || id.length > 128) {
      return res.status(400).json({ success: false, error: 'A Valid Saved Hand Identifier Is Required' });
    }
    if (enforceProbePreCheck(req, res, user.id, id, 'request_analysis_probe_throttled', probeConfig)) {
      return;
    }
  }

  const gate = await evaluateActivePlayGate(checkAccess, supabase, user.id, { requireFullAccess: true });
  if (!gate.allowed) {
    return res.status(423).json({
      success: false,
      activePlayRestricted: true,
      allowed: false,
      code: 'ACTIVE_PLAY_RESTRICTED',
      contextState: gate.contextState,
      accessLevel: gate.accessLevel,
      error: ACTIVE_PLAY_ANALYSIS_LOCK_MESSAGE,
    });
  }

  if (action === 'request_analysis') {
    const id = String(req.body?.id || '').trim();
    const { data, error } = await supabase
      .from('hand_histories')
      .select(SAVED_HAND_LIST_COLUMNS)
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      console.warn('[saved-hands] request_analysis read failed:', error.message);
      return res.status(500).json({ success: false, error: 'Could Not Load Saved Hand For Analysis' });
    }
    if (!data) {
      const probe = recordNonParticipantProbe({
        ...probeConfig,
        req,
        userId: user.id,
        targetId: id,
        reason: 'request_analysis_missing_hand',
      });
      if (probe.throttled) {
        res.setHeader('Retry-After', String(probe.retryAfterSeconds));
        return res.status(429).json({
          success: false,
          code: 'PROBE_RATE_LIMITED',
          error: 'Too Many Invalid Hand Lookups. Please Wait Before Trying Again.',
        });
      }
      return res.status(404).json({ success: false, error: 'Saved Hand Not Found' });
    }
    return res.status(200).json({
      success: true,
      activePlayRestricted: false,
      allowed: true,
      contextState: gate.contextState,
      hand: decorateSavedRow(data),
    });
  }

  return res.status(200).json({
    success: true,
    activePlayRestricted: false,
    allowed: true,
    contextState: gate.contextState,
  });
}

async function handleClubArenaSave(req, res, supabase, user, { probeConfig }) {
  const handId = String(req.body?.handId || '').trim();
  if (!isValidUuid(handId)) {
    return res.status(400).json({
      success: false,
      error: 'A Valid Club Arena Hand Identifier Is Required',
    });
  }

  if (enforceProbePreCheck(req, res, user.id, handId, 'club_arena_probe_throttled', probeConfig)) {
    return;
  }

  const existingCheck = await readExistingClubArenaSave(supabase, user.id, handId);
  if (existingCheck.error) {
    console.warn('[saved-hands] existing lookup failed:', existingCheck.error.message);
    return res.status(500).json({ success: false, error: 'Could Not Verify Saved Hand Status' });
  }
  if (existingCheck.data) {
    return res.status(200).json({
      success: true,
      alreadySaved: true,
      hand: existingCheck.data,
    });
  }

  const { data: handRow, error: handError } = await supabase
    .from('hand_history')
    .select(CLUB_ARENA_SOURCE_HAND_SELECT)
    .eq('id', handId)
    .maybeSingle();

  if (handError) {
    console.warn('[saved-hands] authoritative hand lookup failed:', handError.message);
    return res.status(500).json({ success: false, error: 'Could Not Read Completed Hand History' });
  }
  if (!handRow || !callerParticipatedInClubArenaHand(handRow, user.id)) {
    const probe = recordNonParticipantProbe({
      ...probeConfig,
      req,
      userId: user.id,
      targetId: handId,
      reason: handRow ? 'non_participant_club_arena_hand' : 'missing_club_arena_hand',
    });
    if (probe.throttled) {
      res.setHeader('Retry-After', String(probe.retryAfterSeconds));
      return res.status(429).json({
        success: false,
        code: 'PROBE_RATE_LIMITED',
        error: 'Too Many Invalid Hand Lookups. Please Wait Before Trying Again.',
      });
    }
    return res.status(404).json({
      success: false,
      error: 'Completed Hand Not Found In Your Club Arena History',
    });
  }

  const hasPlayers = Array.isArray(handRow.players) && handRow.players.length > 0;
  const hasRecordedResult = Boolean(handRow.created_at) && (hasPlayers || handRow.summary !== null);
  if (!hasRecordedResult) {
    return res.status(409).json({
      success: false,
      error: 'Only Completed Hands Can Be Saved For Review',
    });
  }

  let heroFactRow = null;
  let heroPrivateCards = [];
  try {
    const { data: factRow, error: factErr } = await supabase
      .from('ca_hand_facts')
      .select(HERO_HAND_FACT_SELECT)
      .eq('user_id', user.id)
      .eq('hand_id', handId)
      .maybeSingle();
    if (factErr) {
      console.warn('[saved-hands] ca_hand_facts lookup failed:', factErr.message || factErr);
    } else if (factRow) {
      heroFactRow = factRow;
      if (factRow.hole_cards) {
        heroPrivateCards = toCardCodes(factRow.hole_cards) || [];
      }
    }
  } catch (err) {
    console.warn('[saved-hands] ca_hand_facts lookup threw:', err?.message || err);
    heroFactRow = null;
    heroPrivateCards = [];
  }

  let tableName = null;
  let clubId = null;
  if (handRow.table_id) {
    try {
      const { data: tableRow, error: tableErr } = await supabase
        .from('tables')
        .select('id, name, club_id')
        .eq('id', handRow.table_id)
        .maybeSingle();
      if (tableErr) {
        console.warn('[saved-hands] tables lookup failed:', tableErr.message || tableErr);
      } else if (tableRow) {
        tableName = tableRow.name || null;
        clubId = tableRow.club_id || null;
      }
    } catch (err) {
      console.warn('[saved-hands] tables lookup threw:', err?.message || err);
      tableName = null;
    }
  }

  const rowToInsert = buildClubArenaSavedHandRow({
    userId: user.id,
    handRow,
    heroPrivateCards,
    heroFactRow,
    tableName,
    clubId,
  });

  const { data: inserted, error: insertError } = await supabase
    .from('hand_histories')
    .insert(rowToInsert)
    .select(SAVED_HAND_LIST_COLUMNS)
    .maybeSingle();

  if (insertError) {
    if (isUniqueViolationError(insertError)) {
      const reconciled = await readExistingClubArenaSave(supabase, user.id, handId);
      if (!reconciled.error && reconciled.data) {
        return res.status(200).json({
          success: true,
          alreadySaved: true,
          hand: reconciled.data,
        });
      }
    }
    console.warn('[saved-hands] club-arena insert failed:', insertError.message);
    return res.status(500).json({ success: false, error: 'Could Not Save This Hand' });
  }

  if (!inserted) {
    const reconciled = await readExistingClubArenaSave(supabase, user.id, handId);
    if (!reconciled.error && reconciled.data) {
      return res.status(201).json({
        success: true,
        alreadySaved: false,
        hand: reconciled.data,
      });
    }
    return res.status(500).json({ success: false, error: 'Could Not Save This Hand' });
  }

  return res.status(201).json({
    success: true,
    alreadySaved: false,
    hand: decorateSavedRow(inserted),
  });
}

async function handlePatch(req, res, supabase, user, { checkAccess, probeConfig }) {
  const validated = validateSavedHandPatch(req.body);
  if (validated.error) {
    return res.status(400).json({ success: false, error: validated.error });
  }
  const { id, expectedRevision, patch } = validated;

  if (enforceProbePreCheck(req, res, user.id, id, 'patch_probe_throttled', probeConfig)) {
    return;
  }

  // Enforce active-play RTA gate (including 5-min post-session cooldown) when
  // transitioning/requesting verified analysis.
  if (patch.analysisState === 'analyzed') {
    const gate = await evaluateActivePlayGate(checkAccess, supabase, user.id, { requireFullAccess: true });
    if (!gate.allowed) {
      return res.status(423).json({
        success: false,
        activePlayRestricted: true,
        allowed: false,
        code: 'ACTIVE_PLAY_RESTRICTED',
        contextState: gate.contextState,
        accessLevel: gate.accessLevel,
        error: ACTIVE_PLAY_ANALYSIS_LOCK_MESSAGE,
      });
    }
  }

  const { data: existing, error: readError } = await supabase
    .from('hand_histories')
    .select(SAVED_HAND_LIST_COLUMNS)
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (readError) {
    console.warn('[saved-hands] patch read failed:', readError.message);
    return res.status(500).json({ success: false, error: 'Could Not Load Saved Hand For Update' });
  }
  if (!existing) {
    const probe = recordNonParticipantProbe({
      ...probeConfig,
      req,
      userId: user.id,
      targetId: id,
      reason: 'patch_missing_or_unowned_hand',
    });
    if (probe.throttled) {
      res.setHeader('Retry-After', String(probe.retryAfterSeconds));
      return res.status(429).json({
        success: false,
        code: 'PROBE_RATE_LIMITED',
        error: 'Too Many Invalid Hand Lookups. Please Wait Before Trying Again.',
      });
    }
    return res.status(404).json({ success: false, error: 'Saved Hand Not Found' });
  }

  const currentHandData = existing.hand_data && typeof existing.hand_data === 'object' ? existing.hand_data : {};
  const rawRev = currentHandData.review ? currentHandData.review.revision : undefined;
  const parsedRawRev = rawRev === '' || rawRev === null || rawRev === undefined ? NaN : Number(rawRev);
  const hadExplicitRevision = Number.isFinite(parsedRawRev) && Number.isInteger(parsedRawRev) && parsedRawRev >= 1;
  const currentReview = normalizeSavedHandReviewMeta(existing);

  if (expectedRevision !== null && expectedRevision !== currentReview.revision) {
    return res.status(409).json({
      success: false,
      code: 'REVISION_CONFLICT',
      error: 'This Hand Was Updated Elsewhere. Reload The Latest Version Before Saving.',
      currentRevision: currentReview.revision,
      hand: decorateSavedRow(existing),
    });
  }

  const nowIso = new Date().toISOString();
  const nextReview = {
    ...currentReview,
    ...patch,
    revision: currentReview.revision + 1,
    updatedAt: nowIso,
  };
  const nextHandData = {
    ...currentHandData,
    review: nextReview,
  };

  let updateQuery = supabase
    .from('hand_histories')
    .update({ hand_data: nextHandData })
    .eq('id', id)
    .eq('user_id', user.id);

  if (typeof updateQuery.filter === 'function') {
    if (hadExplicitRevision) {
      updateQuery = updateQuery.filter('hand_data->review->>revision', 'eq', String(currentReview.revision));
    } else if (rawRev === undefined || rawRev === null) {
      updateQuery = updateQuery.filter('hand_data->review->>revision', 'is', null);
    } else if (typeof rawRev === 'number' || typeof rawRev === 'string' || typeof rawRev === 'boolean') {
      // Legacy/corrupt scalar revision (e.g. revision: 0) - match stored value so
      // the row heals cleanly to revision >= 2 instead of 409-deadlocking forever.
      updateQuery = updateQuery.filter('hand_data->review->>revision', 'eq', String(rawRev));
    }
  }

  const { data: updated, error: updateError } = await updateQuery
    .select(SAVED_HAND_LIST_COLUMNS)
    .maybeSingle();

  if (updateError) {
    console.warn('[saved-hands] patch update failed:', updateError.message);
    return res.status(500).json({ success: false, error: 'Could Not Update Saved Hand' });
  }

  if (!updated) {
    const { data: latest } = await supabase
      .from('hand_histories')
      .select(SAVED_HAND_LIST_COLUMNS)
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!latest) {
      return res.status(404).json({ success: false, error: 'Saved Hand Not Found' });
    }
    const latestReview = normalizeSavedHandReviewMeta(latest);
    return res.status(409).json({
      success: false,
      code: 'REVISION_CONFLICT',
      error: 'This Hand Was Updated Elsewhere. Reload The Latest Version Before Saving.',
      currentRevision: latestReview.revision,
      hand: decorateSavedRow(latest),
    });
  }

  return res.status(200).json({
    success: true,
    hand: decorateSavedRow(updated),
  });
}

/**
 * Pure dependency-injected route core for `/api/poker/saved-hands`.
 */
export async function executeSavedHandsRequest(req, res, {
  getDb,
  getUser,
  applyRateLimit,
  limits,
  reportError,
  checkAccess = checkSandboxAccess,
  attachTiming = attachPersonalAssistantTiming,
  probeStore = defaultProbeStore,
  probeWindowMs = DEFAULT_PROBE_WINDOW_MS,
  probeBlockThreshold = DEFAULT_PROBE_BLOCK_THRESHOLD,
  probeLogger = console.warn,
  nowMs = Date.now(),
} = {}) {
  const startedAt = process.hrtime.bigint();
  const operationName = resolveOperationName(req);

  try {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Vary', 'Authorization');

    if (typeof attachTiming === 'function' && typeof res?.json === 'function') {
      attachTiming(res, operationName);
    }

    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
      return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }
    if (typeof applyRateLimit === 'function') {
      const limit = req.method === 'GET' ? limits?.read : limits?.write;
      if (!applyRateLimit(req, res, limit)) return;
    }

    if (req.method === 'POST' || req.method === 'PATCH') {
      const sizeCheck = checkPayloadSize(req.body);
      if (!sizeCheck.ok) {
        return res.status(sizeCheck.status).json({ success: false, error: sizeCheck.error });
      }
    }

    const supabase = getDb();
    const { user, error: authError, status: authStatus } = await getUser(req, supabase);
    if (authError || !user?.id) {
      return res.status(authStatus || 401).json({ success: false, error: 'Sign In To Use Your Hand History' });
    }

    const probeConfig = {
      store: probeStore,
      windowMs: probeWindowMs,
      blockThreshold: probeBlockThreshold,
      logger: probeLogger,
      nowMs,
    };

    if (req.method === 'GET') {
      if (isTruthyFlag(queryParam(req, 'analysisGate'))) {
        return await handleAnalysisGateRequest(req, res, supabase, user, { checkAccess, probeConfig });
      }

      if (isTruthyFlag(queryParam(req, 'suggested'))) {
        return await handleSuggestedHands(req, res, supabase, user, { checkAccess });
      }

      if (queryParam(req, 'export')) {
        return await handleExport(req, res, supabase, user, { startedAt });
      }

      if (hasQueryParam(req, 'handIds')) {
        return await handleBatchLookup(req, res, supabase, user);
      }

      const singleId = queryParam(req, 'id');
      if (singleId) {
        if (enforceProbePreCheck(req, res, user.id, singleId, 'single_read_probe_throttled', probeConfig)) {
          return;
        }
        const { data, error } = await supabase
          .from('hand_histories')
          .select(SAVED_HAND_LIST_COLUMNS)
          .eq('id', singleId)
          .eq('user_id', user.id)
          .maybeSingle();
        if (error) {
          console.warn('[saved-hands] single read failed:', error.message);
          return res.status(500).json({ success: false, error: 'Could Not Load This Saved Hand' });
        }
        if (!data) {
          const probe = recordNonParticipantProbe({
            ...probeConfig,
            req,
            userId: user.id,
            targetId: singleId,
            reason: 'single_read_missing_or_unowned_hand',
          });
          if (probe.throttled) {
            res.setHeader('Retry-After', String(probe.retryAfterSeconds));
            return res.status(429).json({
              success: false,
              code: 'PROBE_RATE_LIMITED',
              error: 'Too Many Invalid Hand Lookups. Please Wait Before Trying Again.',
            });
          }
          return res.status(404).json({ success: false, error: 'Saved Hand Not Found' });
        }
        return res.status(200).json({ success: true, hand: decorateSavedRow(data) });
      }

      const sourceHandId = queryParam(req, 'sourceHandId');
      if (sourceHandId) {
        if (!isValidUuid(sourceHandId)) {
          return res.status(400).json({ success: false, error: 'A Valid Club Arena Hand Identifier Is Required' });
        }
        const { data, error } = await readExistingClubArenaSave(supabase, user.id, sourceHandId);
        if (error) {
          console.warn('[saved-hands] sourceHandId readback failed:', error.message);
          return res.status(500).json({ success: false, error: 'Could Not Verify Saved Hand Status' });
        }
        return res.status(200).json({
          success: true,
          found: Boolean(data),
          hand: data || null,
        });
      }

      const rawLimit = queryParam(req, 'limit');
      const parsedLimit = rawLimit ? parseInt(rawLimit, 10) : DEFAULT_SAVED_HANDS_LIMIT;
      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, MAX_SAVED_HANDS_LIMIT)
        : DEFAULT_SAVED_HANDS_LIMIT;

      const rawCursor = queryParam(req, 'cursor');
      const cursor = rawCursor ? decodeSavedHandsCursor(rawCursor) : null;
      if (cursor && cursor.error) {
        return res.status(400).json({ success: false, error: cursor.error });
      }

      const filters = {
        status: queryParam(req, 'status'),
        source: queryParam(req, 'source'),
        format: queryParam(req, 'format'),
        position: queryParam(req, 'position'),
        tag: queryParam(req, 'tag'),
        q: queryParam(req, 'q'),
      };

      const page = await readSavedHandsPage(supabase, user.id, cursor, limit, filters);
      if (page.error) {
        console.warn('[saved-hands] list failed:', page.error.message);
        return res.status(500).json({ success: false, error: 'Could Not Load Your Saved Hands' });
      }
      return res.status(200).json({ success: true, ...page });
    }

    if (req.method === 'PATCH') {
      return await handlePatch(req, res, supabase, user, { checkAccess, probeConfig });
    }

    if (req.method === 'DELETE') {
      const id = queryParam(req, 'id') || String(req.body?.id || '').trim();
      if (!id) {
        return res.status(400).json({ success: false, error: 'A Valid Saved Hand Identifier Is Required' });
      }
      if (enforceProbePreCheck(req, res, user.id, id, 'delete_probe_throttled', probeConfig)) {
        return;
      }
      const { data, error } = await supabase
        .from('hand_histories')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
        .select('id')
        .maybeSingle();
      if (error) {
        console.warn('[saved-hands] delete failed:', error.message);
        return res.status(500).json({ success: false, error: 'Could Not Delete This Saved Hand' });
      }
      if (!data) {
        const probe = recordNonParticipantProbe({
          ...probeConfig,
          req,
          userId: user.id,
          targetId: id,
          reason: 'delete_missing_or_unowned_hand',
        });
        if (probe.throttled) {
          res.setHeader('Retry-After', String(probe.retryAfterSeconds));
          return res.status(429).json({
            success: false,
            code: 'PROBE_RATE_LIMITED',
            error: 'Too Many Invalid Hand Lookups. Please Wait Before Trying Again.',
          });
        }
        return res.status(404).json({ success: false, error: 'Saved Hand Not Found' });
      }
      return res.status(200).json({ success: true, deletedId: data.id });
    }

    const postAction = req.body && typeof req.body === 'object' && typeof req.body.action === 'string'
      ? req.body.action.trim().toLowerCase()
      : '';
    if (postAction === 'import_club_arena') {
      return await handleImportClubArenaHands(req, res, supabase, user);
    }
    if (postAction === 'check_analysis_gate' || postAction === 'request_analysis') {
      return await handleAnalysisGateRequest(req, res, supabase, user, { checkAccess, probeConfig });
    }

    if (req.body && typeof req.body === 'object' && req.body.source === CLUB_ARENA_SOURCE) {
      return await handleClubArenaSave(req, res, supabase, user, { probeConfig });
    }

    const { hand, error: invalid } = validateSavedHand(req.body);
    if (invalid) return res.status(400).json({ success: false, error: invalid });

    const row = savedHandRow(user.id, hand);
    const { data, error } = await supabase
      .from('hand_histories')
      .insert(row)
      .select(SAVED_HAND_LIST_COLUMNS)
      .maybeSingle();
    if (error || !data) {
      console.warn('[saved-hands] insert failed:', error?.message || 'no row returned');
      return res.status(500).json({ success: false, error: 'Could Not Save This Hand' });
    }
    return res.status(201).json({ success: true, alreadySaved: false, hand: decorateSavedRow(data) });
  } catch (err) {
    if (typeof reportError === 'function') {
      try { reportError(err, req); } catch (_) {}
    }
    console.warn('[saved-hands] error:', err?.message || err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}

export default {
  executeSavedHandsRequest,
  decorateSavedRow,
  resetNonParticipantProbeTracker,
};
