/**
 * GET /api/horses/roster?limit=&offset=  ->  { rows, total, limit, offset, hasMore }
 *
 * The Social Horses roster for the /horses console, one page at a time.
 *
 * The console used to read content_authors straight from the browser with the
 * anon client, which only worked because the table was readable by anybody
 * with the public key - and anybody could therefore read the whole roster
 * (Dan, 2026-09-02: "NOBODY SHOULD EVER EVER EVER BE ABLE TO LOOK AT OUR CODE
 * OR USE A DEVELOPER TOOL AND FIND THIS OUT."). The read lives here now,
 * behind operator auth and the service role, so the table can be closed to
 * anon and authenticated.
 *
 * Same columns, same order (name, then id) and the same paging contract as
 * every other operator list. Permission: fleet.read, as the other fleet reads.
 */
import { withOperatorRoute } from '../../../src/lib/horses/operatorRoute.js';
import { PERMISSIONS } from '../../../src/lib/horses/permissions.js';
import { paging, runPaged, pagedResult } from '../../../src/lib/horses/paged.js';

/**
 * Exactly the columns the roster renders, edits or exports (cards, edit form,
 * CSV export and the horse-versus-social-only split on profile_id). Moved here
 * unchanged from pages/horses/index.js.
 */
export const ROSTER_COLUMNS =
  'id, name, alias, gender, location, specialty, stakes, bio, voice, is_active, avatar_url, profile_id';

/**
 * 1,000 is PostgREST's own response ceiling, so a page never asks for more
 * than one response can carry; the console reads ~1,040 rows in two calls.
 */
export const ROSTER_PAGE = Object.freeze({ defaultLimit: 1000, max: 1000 });

export const spec = {
  name: 'horses.roster',
  methods: ['GET'],
  permission: PERMISSIONS.FLEET_READ,
  limit: 'read',
};

export async function handle({ db, query }) {
  const page = paging(query, ROSTER_PAGE);
  const result = await runPaged(
    db
      .from('content_authors')
      .select(ROSTER_COLUMNS, { count: 'exact' })
      .order('name')
      .order('id'),
    page
  );
  // A failed page is not an empty roster. The wrapper turns this into a 500
  // with a request id and never echoes the database text.
  if (result.error) throw new Error('content_authors roster read failed: ' + (result.error.message || 'unknown'));
  return pagedResult(result, page);
}

export default withOperatorRoute(spec, handle);
