/**
 * ADMIN REVIEWS API
 *   GET    /api/horses/admin-reviews  - list venue reviews with filters + search
 *   DELETE /api/horses/admin-reviews  - admin-delete a review by id
 *   PATCH  /api/horses/admin-reviews  - flag / unflag a review, or restore a
 *                                       reviewer's ability to post
 *
 * Built on withOperatorRoute: method allowlist, rate limit, local JWT verify,
 * service-role client that refuses to exist without SUPABASE_SERVICE_ROLE_KEY
 * (the old anon-key fallback here answered every query with zero rows and
 * reported success while doing it), and one response envelope.
 *
 * PAGING (GET) is ?offset=&limit=. The response carries the shared paged shape
 * { rows, total, limit, offset, hasMore } AND the legacy `reviews` / `page` /
 * `stats` fields the console already reads. `total` is the count under the
 * CURRENT filters, which is what the pager must divide by; stats.total is the
 * whole table, which is what the header tile shows.
 *
 * SEARCH (Phase 1 contract item 3): ?q= searches SERVER-SIDE with ilike over
 * review_text, the denormalised reviewer_name, and profiles.username (resolved
 * to user ids first). It used to filter only the current 100-row page in the
 * browser, which is a search that lies.
 */
import { withOperatorRoute } from '../../../src/lib/horses/operatorRoute.js';
import { PERMISSIONS } from '../../../src/lib/horses/permissions.js';
import { ApiError, badRequest, notFound } from '../../../src/lib/horses/apiEnvelope.js';
import { auditOperatorAction } from '../../../src/lib/horses/operatorAudit.js';
import { enumOf, int, paging, searchTerm, uuid } from '../../../src/lib/horses/validate.js';

const SORTS = ['newest', 'oldest', 'highest', 'lowest', 'flagged'];
const PATCH_ACTIONS = ['flag', 'unflag', 'restore_reviewer'];

/** The average is sampled, not aggregated: PostgREST aggregate functions are
 *  DISABLED on this project (rating.avg() returns PGRST123, verified against
 *  production 2026-08-26) and there is no review-stats RPC to call instead. */
const AVG_SAMPLE_CAP = 10000;

/** Deleting this many of a reviewer's reviews suspends their posting rights. */
const DELETED_REVIEWS_BAN_THRESHOLD = 3;

const REVIEW_COLUMNS = [
  'id',
  'venue_id',
  'user_id',
  'reviewer_name',
  'rating',
  'review_text',
  'helpful_count',
  'unhelpful_count',
  'is_flagged',
  'flag_reason',
  'created_at',
  'metadata',
].join(', ');

export const spec = {
  name: 'horses.admin-reviews',
  methods: ['GET', 'DELETE', 'PATCH'],
  permission: {
    GET: PERMISSIONS.PLAYERS_READ,
    DELETE: PERMISSIONS.MODERATION_WRITE,
    PATCH: PERMISSIONS.MODERATION_WRITE,
  },
  limit: { GET: 'read', DELETE: 'write', PATCH: 'write' },
};

/** rating is validated rather than parseInt'ed: ?rating=abc used to become NaN
 *  and a PostgREST 400 the operator could not read. */
function ratingOf(query) {
  if (query.rating === undefined || query.rating === '') return null;
  const rating = int(query.rating, { min: 1, max: 5 });
  if (rating === null) throw badRequest('Rating Must Be A Whole Number From 1 To 5', 'invalid_rating');
  return rating;
}

/** How many matching usernames a single search resolves to ids. Beyond this the
 *  term is too broad to be a username search and the text columns carry it. */
const USERNAME_MATCH_CAP = 200;

/**
 * Contract item 3 says the search covers review_text AND THE REVIEWER USERNAME,
 * and the console's own help text tells the operator so. venue_reviews only
 * carries the denormalised `reviewer_name`, which is whatever was stamped on
 * the row when it was written, so searching it alone missed every reviewer
 * whose profiles.username differs from it. Usernames are resolved to user ids
 * first and folded into the same .or() as `user_id.in.(...)`.
 *
 * Best effort: a failure here narrows the search back to the two text columns
 * and is logged, rather than failing a list the operator can still use.
 */
async function reviewerIdsForTerm(db, term) {
  if (!term) return [];
  const { data, error } = await db
    .from('profiles')
    .select('id')
    .ilike('username', `%${term}%`)
    .limit(USERNAME_MATCH_CAP);
  if (error) {
    console.warn('[admin-reviews GET] username lookup failed, searching text only:', error.message || error);
    return [];
  }
  return (data || []).map((r) => uuid(r.id)).filter(Boolean);
}

/** The ilike pattern for a free-text search, with PostgREST grammar stripped. */
function searchFilter(term, reviewerIds = []) {
  const clauses = [`review_text.ilike.%${term}%`, `reviewer_name.ilike.%${term}%`];
  // Every id came back through uuid(), so nothing in this list can carry the
  // filter grammar the term itself was stripped of.
  if (reviewerIds.length > 0) clauses.push(`user_id.in.(${reviewerIds.join(',')})`);
  return clauses.join(',');
}

function applyFilters(query, { venueId, rating, flaggedOnly, term, reviewerIds }) {
  let q = query;
  if (venueId) q = q.eq('venue_id', venueId);
  if (rating !== null) q = q.eq('rating', rating);
  if (flaggedOnly) q = q.eq('is_flagged', true);
  if (term) q = q.or(searchFilter(term, reviewerIds));
  return q;
}

function applySort(query, sort) {
  switch (sort) {
    case 'oldest':
      return query.order('created_at', { ascending: true });
    case 'highest':
      return query.order('rating', { ascending: false });
    case 'lowest':
      return query.order('rating', { ascending: true });
    case 'flagged':
      return query.order('is_flagged', { ascending: false }).order('created_at', { ascending: false });
    default:
      return query.order('created_at', { ascending: false });
  }
}

async function handleGet({ db, query }) {
  const venueId = query.venue_id ? String(query.venue_id) : null;
  const rating = ratingOf(query);
  const flaggedOnly = query.flagged === 'true';
  const term = searchTerm(query.q);
  const sort = enumOf(query.sort, SORTS, { fallback: 'newest' });
  const page = paging(query, { defaultLimit: 100, max: 500 });
  const reviewerIds = await reviewerIdsForTerm(db, term);
  const filters = { venueId, rating, flaggedOnly, term, reviewerIds };

  let listQuery = db.from('venue_reviews').select(REVIEW_COLUMNS, { count: 'exact' });
  listQuery = applyFilters(listQuery, filters);
  listQuery = applySort(listQuery, sort);

  const {
    data: reviews,
    count: filteredCount,
    error,
  } = await listQuery.range(page.offset, page.rangeEnd);
  if (error) {
    console.warn('[admin-reviews GET] list failed:', error.message || error);
    throw new ApiError(500, 'Reviews Could Not Be Loaded', 'reviews_read_failed');
  }
  const rows = reviews || [];

  // Venue names, best effort. A failure here downgrades the label, never the
  // response.
  const venueNames = {};
  const venueIds = [...new Set(rows.map((r) => r.venue_id).filter(Boolean))];
  if (venueIds.length > 0) {
    const { data: venues, error: venueErr } = await db
      .from('venues')
      .select('id, name, city, state')
      .in('id', venueIds.map(String));
    if (venueErr) {
      console.warn('[admin-reviews GET] venue name lookup failed:', venueErr.message || venueErr);
    }
    for (const v of venues || []) {
      venueNames[String(v.id)] = `${v.name}${v.city ? ` - ${v.city}` : ''}${v.state ? `, ${v.state}` : ''}`;
    }
  }

  const [totalRes, flaggedRes, ratingsRes] = await Promise.all([
    db.from('venue_reviews').select('id', { count: 'exact', head: true }),
    db.from('venue_reviews').select('id', { count: 'exact', head: true }).eq('is_flagged', true),
    db.from('venue_reviews').select('rating').not('rating', 'is', null).limit(AVG_SAMPLE_CAP),
  ]);
  if (totalRes.error) console.warn('[admin-reviews GET] total count failed:', totalRes.error.message);
  if (flaggedRes.error) console.warn('[admin-reviews GET] flagged count failed:', flaggedRes.error.message);
  if (ratingsRes.error) console.warn('[admin-reviews GET] rating sample failed:', ratingsRes.error.message);

  const ratingRows = ratingsRes.data || [];
  const avgRating =
    ratingRows.length > 0
      ? parseFloat((ratingRows.reduce((sum, r) => sum + (r.rating || 0), 0) / ratingRows.length).toFixed(2))
      : null;

  const shaped = rows.map((r) => ({
    ...r,
    venue_name: venueNames[String(r.venue_id)] || `Venue ${r.venue_id}`,
  }));
  const total = typeof filteredCount === 'number' ? filteredCount : page.offset + shaped.length;

  return {
    // Paged shape (Phase 1 contract).
    rows: shaped,
    total,
    limit: page.limit,
    offset: page.offset,
    hasMore: page.offset + shaped.length < total,
    // Legacy field names the console already reads. Kept until Phase 9.
    reviews: shaped,
    page: { offset: page.offset, limit: page.limit, returned: shaped.length },
    query: { q: term, rating, flagged: flaggedOnly, venue_id: venueId, sort },
    stats: {
      total: totalRes.count ?? null,
      flagged: flaggedRes.count ?? null,
      filtered_total: total,
      avg_rating: avgRating,
      avg_rating_sampled: ratingRows.length >= AVG_SAMPLE_CAP,
      avg_rating_sample_size: ratingRows.length,
      avg_rating_sample_cap: AVG_SAMPLE_CAP,
    },
  };
}

/**
 * Tell a reviewer their review was removed. This is an internal HTTP hop and it
 * can hang, so it gets a 5 second abort and its failure is logged and swallowed:
 * the delete already happened and the operator must not be told it did not.
 */
async function sendModerationNotice(userId, message) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker';
  // Without the secret the hop authenticates with an empty header, 401s, and
  // the only trace is a console.warn: an operator reads that as "the reviewer
  // was told" when nobody was. Do not make the call, and report it.
  if (!process.env.ADMIN_ROUTE_SECRET) {
    console.warn('[admin-reviews] ADMIN_ROUTE_SECRET is not set; the reviewer was NOT notified');
    return false;
  }
  try {
    const notifyRes = await fetch(`${base}/api/notifications/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': process.env.ADMIN_ROUTE_SECRET,
      },
      body: JSON.stringify({
        externalUserIds: [userId],
        title: 'Community Guidelines Update',
        message,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!notifyRes.ok) {
      const detail = await notifyRes.text().catch(() => '');
      console.warn(
        '[admin-reviews] moderation notice not delivered:',
        notifyRes.status,
        detail.slice(0, 300)
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[admin-reviews] moderation notice dispatch failed:', err?.message || err);
    return false;
  }
}

async function handleDelete({ req, op, db, query }) {
  const reviewId = uuid(query.review_id);
  if (!reviewId) throw badRequest('A Valid Review Id Is Required', 'invalid_review_id');

  const { data: existing } = await db
    .from('venue_reviews')
    .select('id, venue_id, user_id, reviewer_name, rating, is_flagged')
    .eq('id', reviewId)
    .maybeSingle();

  // .select() so the affected row count is knowable. Without it a stale id came
  // back { error: null }, the UI removed the row, and the audit log recorded a
  // deletion that never happened.
  const { data: deletedRows, error } = await db
    .from('venue_reviews')
    .delete()
    .eq('id', reviewId)
    .select('id');
  if (error) {
    console.warn('[admin-reviews DELETE] failed:', error.message || error);
    throw new ApiError(500, 'The Review Could Not Be Deleted', 'review_delete_failed');
  }
  // Everything below is a consequence of a deletion that did not occur.
  if (!deletedRows || deletedRows.length === 0) {
    throw notFound('That Review No Longer Exists', 'review_not_found');
  }

  if (existing?.venue_id) {
    const { error: trustErr } = await db.rpc('recalculate_venue_trust_score', {
      p_venue_id: String(existing.venue_id),
    });
    if (trustErr) {
      console.warn(
        '[admin-reviews DELETE] trust score recalc failed (score is stale):',
        trustErr.message || trustErr
      );
    }
  }

  let reviewerSuspended = false;
  let deletedReviewsCount = null;
  let noticeDelivered = null;
  if (existing?.user_id) {
    const { data: prof } = await db
      .from('profiles')
      .select('deleted_reviews_count, can_review')
      .eq('id', existing.user_id)
      .maybeSingle();
    if (prof) {
      deletedReviewsCount = (prof.deleted_reviews_count || 0) + 1;
      const updateObj = { deleted_reviews_count: deletedReviewsCount };
      if (deletedReviewsCount >= DELETED_REVIEWS_BAN_THRESHOLD) {
        updateObj.can_review = false;
        reviewerSuspended = true;
      }
      const { error: profErr } = await db.from('profiles').update(updateObj).eq('id', existing.user_id);
      if (profErr) console.warn('[admin-reviews DELETE] reviewer update failed:', profErr.message);

      noticeDelivered = await sendModerationNotice(
        existing.user_id,
        reviewerSuspended
          ? 'Your review was removed. Due to repeated violations of Community Guidelines, ' +
            'you can no longer leave reviews.'
          : 'Your recent poker venue review was removed for violating Community Guidelines.'
      );
    }
  }

  await auditOperatorAction(op, req, {
    action: 'review.delete',
    targetType: 'venue_review',
    targetId: reviewId,
    details: {
      // reviewer_user_id is deliberately NOT repeated here: `before` already
      // carries the row, and an audit row should hold each identifier once.
      reviewer_name: existing?.reviewer_name ?? null,
      venue_id: existing?.venue_id ?? null,
      deleted_reviews_count: deletedReviewsCount,
      reviewer_suspended: reviewerSuspended,
      notice_delivered: noticeDelivered,
    },
    before: existing || null,
    after: null,
  });

  return {
    deleted_id: reviewId,
    reviewer_suspended: reviewerSuspended,
    deleted_reviews_count: deletedReviewsCount,
    notice_delivered: noticeDelivered,
  };
}

/** Give a reviewer their posting rights back. The 3-deleted-reviews suspension
 *  is permanent without this, and there was no unban path in the console. */
async function restoreReviewer({ req, op, db, body }) {
  const userId = uuid(body.user_id);
  if (!userId) throw badRequest('A Valid Reviewer Id Is Required', 'invalid_user_id');

  const { data: prof } = await db
    .from('profiles')
    .select('id, can_review, deleted_reviews_count')
    .eq('id', userId)
    .maybeSingle();

  const { data: updatedRows, error } = await db
    .from('profiles')
    .update({ can_review: true })
    .eq('id', userId)
    .select('id');
  if (error) {
    console.warn('[admin-reviews PATCH restore_reviewer] failed:', error.message || error);
    throw new ApiError(500, 'The Reviewer Could Not Be Restored', 'reviewer_restore_failed');
  }
  if (!updatedRows || updatedRows.length === 0) {
    throw notFound('That Reviewer No Longer Exists', 'reviewer_not_found');
  }

  await auditOperatorAction(op, req, {
    action: 'review.restore_reviewer',
    targetType: 'profile',
    targetId: userId,
    details: { deleted_reviews_count: prof?.deleted_reviews_count ?? null },
    before: prof ? { can_review: prof.can_review } : null,
    after: { can_review: true },
  });

  return { action: 'restore_reviewer', user_id: userId, can_review: true };
}

async function handlePatch(ctx) {
  const { req, op, db, body } = ctx;
  const action = enumOf(body.action, PATCH_ACTIONS);
  if (!action) throw badRequest('Action Must Be Flag, Unflag Or Restore Reviewer', 'invalid_action');
  if (action === 'restore_reviewer') return restoreReviewer(ctx);

  const reviewId = uuid(body.review_id);
  if (!reviewId) throw badRequest('A Valid Review Id Is Required', 'invalid_review_id');
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

  const { data: prior } = await db
    .from('venue_reviews')
    .select('id, venue_id, user_id, reviewer_name, is_flagged, flag_reason')
    .eq('id', reviewId)
    .maybeSingle();

  // NOTE: venue_reviews has NO updated_at column in production. Sending one
  // made PostgREST reject every flag/unflag with PGRST204.
  const updatePayload =
    action === 'flag'
      ? { is_flagged: true, flag_reason: reason || 'Admin flagged' }
      : { is_flagged: false, flag_reason: null };

  // Flagging suppresses a business's public review; reporting success without
  // having written one is not a cosmetic bug.
  const { data: updatedRows, error } = await db
    .from('venue_reviews')
    .update(updatePayload)
    .eq('id', reviewId)
    .select('id');
  if (error) {
    console.warn('[admin-reviews PATCH] failed:', error.message || error);
    throw new ApiError(500, 'The Review Could Not Be Updated', 'review_update_failed');
  }
  if (!updatedRows || updatedRows.length === 0) {
    throw notFound('That Review No Longer Exists', 'review_not_found');
  }

  await auditOperatorAction(op, req, {
    action: action === 'flag' ? 'review.flag' : 'review.unflag',
    targetType: 'venue_review',
    targetId: reviewId,
    details: {
      reviewer_name: prior?.reviewer_name ?? null,
      venue_id: prior?.venue_id ?? null,
      reason: action === 'flag' ? reason || 'Admin flagged' : null,
    },
    before: prior ? { is_flagged: prior.is_flagged, flag_reason: prior.flag_reason } : null,
    after: updatePayload,
  });

  return { action, review_id: reviewId };
}

export async function handle(ctx) {
  if (ctx.method === 'GET') return handleGet(ctx);
  if (ctx.method === 'DELETE') return handleDelete(ctx);
  return handlePatch(ctx);
}

export default withOperatorRoute(spec, handle);
