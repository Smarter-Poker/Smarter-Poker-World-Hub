/**
 * Map a Supabase/PostgREST error onto an operator-safe ApiError.
 *
 *   const { data, error } = await db.from('content_authors').insert([horse]).select().maybeSingle();
 *   if (error) throw mapDbError(error, 'That Horse');
 *
 * PHASE 1 REVIEW ADDENDUM ITEM 17. Routes used to `throw error` straight from a
 * Supabase result. The wrapper's scrubError then saw a message like
 * `duplicate key value violates unique constraint "content_authors_alias_key"`,
 * recognised it as database text, and replaced the WHOLE thing with a 500
 * "Request failed". A caller who picked a name that already exists was told the
 * server broke. Worse, the 500 branch of operatorRoute logs a stack and fires
 *
 * Here every failure a caller can actually cause becomes the status that
 * describes it - 409 for a duplicate, 400 for bad input, 403 for a denied
 * grant, 404 for a missing row - with a Title Case sentence built from the
 * caller-supplied `context` ("That Horse" -> "That Horse Already Exists").
 * Anything unrecognised becomes a 503 saying the thing is unavailable, which is
 * both honest and not a server fault the operator can act on.
 *
 * The raw database sentence is LOGGED (with the request id when one is passed)
 * and never returned. That is PHASE1-CONTRACTS.md line 5.
 *
 * Pure except for console; unit tested under node --test.
 */
import { ApiError, badRequest, conflict, forbidden, notFound } from './apiEnvelope.js';

/** SQLSTATE classes this console can explain to a human. */
export const DB_ERROR_CODES = Object.freeze({
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  CHECK_VIOLATION: '23514',
  EXCLUSION_VIOLATION: '23P01',
  INVALID_TEXT_REPRESENTATION: '22P02',
  NUMERIC_OUT_OF_RANGE: '22003',
  STRING_TOO_LONG: '22001',
  INSUFFICIENT_PRIVILEGE: '42501',
});

const BAD_INPUT_CODES = [
  DB_ERROR_CODES.FOREIGN_KEY_VIOLATION,
  DB_ERROR_CODES.NOT_NULL_VIOLATION,
  DB_ERROR_CODES.CHECK_VIOLATION,
  DB_ERROR_CODES.EXCLUSION_VIOLATION,
  DB_ERROR_CODES.INVALID_TEXT_REPRESENTATION,
  DB_ERROR_CODES.NUMERIC_OUT_OF_RANGE,
  DB_ERROR_CODES.STRING_TOO_LONG,
];

function messageOf(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  return [error.message, error.details, error.hint].filter(Boolean).join(' | ');
}

/**
 * Classify without deciding the wording, so a test can assert the class and a
 * caller can ask "was this the operator's fault" without re-parsing strings.
 */
export function classifyDbError(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  const text = messageOf(error);

  if (code === DB_ERROR_CODES.UNIQUE_VIOLATION || /duplicate key value/i.test(text)) return 'duplicate';
  if (BAD_INPUT_CODES.includes(code)) return 'bad_input';
  if (/violates (foreign key|check|not-null|not null) constraint/i.test(text)) return 'bad_input';
  if (/invalid input syntax/i.test(text)) return 'bad_input';
  if (code === DB_ERROR_CODES.INSUFFICIENT_PRIVILEGE || code === 'PGRST301') return 'denied';
  if (/permission denied|row-level security/i.test(text)) return 'denied';
  if (code === 'PGRST116' || /no rows returned|results contain 0 rows/i.test(text)) return 'missing';
  return 'unavailable';
}

/**
 * `context` names the THING, in Title Case, with no trailing verb:
 * 'That Horse', 'The Settings Row', 'The Audit Log'. The sentence is completed
 * here so every route says it the same way.
 */
export function mapDbError(error, context = 'The Request', { requestId, route } = {}) {
  const kind = classifyDbError(error);
  const raw = messageOf(error);
  const tag = ['[dbError]', route, requestId, context].filter(Boolean).join(' ');
  console.error(`${tag}: ${kind}: ${raw}`);

  if (kind === 'duplicate') return conflict(`${context} Already Exists`, 'duplicate');
  if (kind === 'bad_input') return badRequest(`${context} Was Rejected: Check The Values And Try Again`, 'invalid_input');
  if (kind === 'denied') return forbidden(`${context} Is Not Writable By This Operator`, 'db_permission_denied');
  if (kind === 'missing') return notFound(`${context} Was Not Found`, 'not_found');
  return new ApiError(503, `${context} Is Unavailable`, 'database_unavailable');
}
