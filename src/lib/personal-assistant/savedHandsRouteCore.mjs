import { toCardCodes } from './leakRecord.js';
import {
  SAVED_HAND_TABLE_ID,
  CLUB_ARENA_SOURCE,
  SAVED_HAND_LIST_COLUMNS,
  CLUB_ARENA_SOURCE_HAND_SELECT,
  isValidUuid,
  clubArenaSavedHandKey,
  validateSavedHand,
  savedHandRow,
  callerParticipatedInClubArenaHand,
  buildClubArenaSavedHandRow,
  normalizeSavedHandReviewMeta,
  validateSavedHandPatch,
  isUniqueViolationError,
} from './savedHands.mjs';

function queryParam(req, key) {
  const raw = req.query?.[key];
  const val = Array.isArray(raw) ? raw[0] : raw;
  return typeof val === 'string' ? val.trim() : '';
}

export function decorateSavedRow(row) {
  if (!row || typeof row !== 'object') return null;
  const handData = row.hand_data && typeof row.hand_data === 'object' ? row.hand_data : {};
  const review = normalizeSavedHandReviewMeta(row);
  return {
    ...row,
    hand_data: {
      ...handData,
      review,
    },
    review,
    source: handData.source || (row.table_id === SAVED_HAND_TABLE_ID ? 'ai-scan' : CLUB_ARENA_SOURCE),
    sourceHandId: handData.sourceHandId || null,
  };
}

async function readExistingClubArenaSave(supabase, userId, sourceHandId) {
  const key = clubArenaSavedHandKey(sourceHandId);
  const { data, error } = await supabase
    .from('hand_histories')
    .select(SAVED_HAND_LIST_COLUMNS)
    .eq('user_id', userId)
    .eq('hand_id', key)
    .maybeSingle();
  return { data: data ? decorateSavedRow(data) : null, error };
}

async function handleClubArenaSave(req, res, supabase, user) {
  const handId = String(req.body?.handId || '').trim();
  if (!isValidUuid(handId)) {
    return res.status(400).json({
      success: false,
      error: 'A Valid Club Arena Hand Identifier Is Required',
    });
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

  let heroPrivateCards = [];
  try {
    const { data: factRow, error: factErr } = await supabase
      .from('ca_hand_facts')
      .select('hole_cards')
      .eq('user_id', user.id)
      .eq('hand_id', handId)
      .maybeSingle();
    if (!factErr && factRow?.hole_cards) {
      heroPrivateCards = toCardCodes(factRow.hole_cards) || [];
    }
  } catch (_) {
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
      if (!tableErr && tableRow) {
        tableName = tableRow.name || null;
        clubId = tableRow.club_id || null;
      }
    } catch (_) {
      tableName = null;
    }
  }

  const rowToInsert = buildClubArenaSavedHandRow({
    userId: user.id,
    handRow,
    heroPrivateCards,
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

async function handlePatch(req, res, supabase, user) {
  const validated = validateSavedHandPatch(req.body);
  if (validated.error) {
    return res.status(400).json({ success: false, error: validated.error });
  }
  const { id, expectedRevision, patch } = validated;

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
    return res.status(404).json({ success: false, error: 'Saved Hand Not Found' });
  }

  const currentHandData = existing.hand_data && typeof existing.hand_data === 'object' ? existing.hand_data : {};
  const hadExplicitRevision = currentHandData.review && currentHandData.review.revision !== undefined && currentHandData.review.revision !== null;
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
    } else {
      updateQuery = updateQuery.filter('hand_data->review->>revision', 'is', null);
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
} = {}) {
  try {
    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
      return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }
    if (typeof applyRateLimit === 'function') {
      const limit = req.method === 'GET' ? limits?.read : limits?.write;
      if (!applyRateLimit(req, res, limit)) return;
    }
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Vary', 'Authorization');

    const supabase = getDb();
    const { user, error: authError, status: authStatus } = await getUser(req, supabase);
    if (authError || !user?.id) {
      return res.status(authStatus || 401).json({ success: false, error: 'Sign In To Use Your Hand History' });
    }

    if (req.method === 'GET') {
      const singleId = queryParam(req, 'id');
      if (singleId) {
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

      const limit = Math.min(Math.max(parseInt(String(req.query?.limit || '200'), 10) || 200, 1), 1000);
      const sourceFilter = queryParam(req, 'source');
      const { data, error } = await supabase
        .from('hand_histories')
        .select(SAVED_HAND_LIST_COLUMNS)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) {
        console.warn('[saved-hands] list failed:', error.message);
        return res.status(500).json({ success: false, error: 'Could Not Load Your Saved Hands' });
      }
      const decorated = (data || []).map(decorateSavedRow).filter(Boolean);
      const hands = sourceFilter
        ? decorated.filter((row) => row.source === sourceFilter)
        : decorated;
      return res.status(200).json({ success: true, hands });
    }

    if (req.method === 'PATCH') {
      return await handlePatch(req, res, supabase, user);
    }

    if (req.method === 'DELETE') {
      const id = queryParam(req, 'id') || String(req.body?.id || '').trim();
      if (!id) {
        return res.status(400).json({ success: false, error: 'A Valid Saved Hand Identifier Is Required' });
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
        return res.status(404).json({ success: false, error: 'Saved Hand Not Found' });
      }
      return res.status(200).json({ success: true, deletedId: data.id });
    }

    if (req.body && typeof req.body === 'object' && req.body.source === CLUB_ARENA_SOURCE) {
      return await handleClubArenaSave(req, res, supabase, user);
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

export default { executeSavedHandsRequest, decorateSavedRow };
