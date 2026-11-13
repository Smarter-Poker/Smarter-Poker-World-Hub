// Operator-only aggregates. No account IDs or ledger amounts leave this module.
import { loadVenueInquiryReceipts, VENUE_INQUIRY_DEFINITION } from './venueInquiryReceipts.mjs';
import { loadQualifiedGuideVisits } from './qualifiedGuideVisits.mjs';
const PAGE = 1000;
const MAX_ROWS = 10000;
const ATTEMPT = 'training_attempts!training_sessions_attempt_fk!inner(user_id,status,practice_only)';

async function rows(client, table, end) {
  let result = [];
  let expected;
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    let query = client.from(table).select(table === 'training_sessions'
      ? `id,user_id,created_at,attempt_id,${ATTEMPT}` : 'id,user_id,created_at', { count: 'exact' })
      .lt('created_at', end).order('id').range(offset, offset + PAGE - 1);
    if (table === 'training_sessions') query = query.not('attempt_id', 'is', null)
      .eq('training_attempts.status', 'completed').eq('training_attempts.practice_only', false);
    const response = await query;
    if (response.error || !Array.isArray(response.data) || !Number.isSafeInteger(response.count) || response.count > MAX_ROWS) throw new Error('Unavailable');
    if (expected !== undefined && expected !== response.count) throw new Error('Snapshot Changed');
    expected = response.count;
    result.push(...response.data);
    if (result.length === expected) return result;
    if (response.data.length !== PAGE) throw new Error('Incomplete Data');
  }
  throw new Error('Incomplete Data');
}

function activity(rows, table) {
  return rows.filter(row => {
    if (!row.user_id || !Number.isFinite(Date.parse(row.created_at))) return false;
    if (table !== 'training_sessions') return true;
    const attempt = Array.isArray(row.training_attempts) ? row.training_attempts[0] : row.training_attempts;
    return row.attempt_id && attempt?.user_id === row.user_id && attempt.status === 'completed' && attempt.practice_only === false;
  });
}

export function summarizeFirstActions(training, ledger, start, end) {
  const all = [...activity(training, 'training_sessions'), ...activity(ledger, 'bankroll_ledger')];
  const first = new Map();
  for (const row of all) {
    const time = Date.parse(row.created_at);
    if (!first.has(row.user_id) || time < first.get(row.user_id)) first.set(row.user_id, time);
  }
  return [...first.values()].filter(time => time >= Date.parse(start) && time < Date.parse(end)).length;
}

export async function loadGrowthScorecard(client, now = new Date(), providers = {}) {
  const end = now.toISOString();
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const metrics = [];
  const add = (id, label, value, definition) => metrics.push({ id, label, value, definition, status: value === null ? 'unavailable' : 'measured' });
  async function countProfiles(existing = false) {
    try {
      let q = client.from('profiles').select('id', { count: 'exact', head: true });
      q = existing ? q.lt('created_at', start).gte('last_active', start).lt('last_active', end) : q.gte('created_at', start).lt('created_at', end);
      const r = await q;
      return !r.error && Number.isSafeInteger(r.count) && r.count >= 0 ? r.count : null;
    } catch { return null; }
  }
  const [newAccounts, existingActive, trainingResult, ledgerResult, venueInquiries, qualifiedVisits] = await Promise.all([
    countProfiles(), countProfiles(true),
    rows(client, 'training_sessions', end).then(data => activity(data, 'training_sessions')).catch(() => null),
    rows(client, 'bankroll_ledger', end).then(data => activity(data, 'bankroll_ledger')).catch(() => null),
    Promise.resolve().then(() => (providers.venueInquiries || loadVenueInquiryReceipts)({ start, end })).catch(() => null),
    Promise.resolve().then(() => (providers.qualifiedVisits || loadQualifiedGuideVisits)(start, end)).catch(() => null),
  ]);
  const inWindow = data => data === null ? null : data.filter(row => Date.parse(row.created_at) >= Date.parse(start) && Date.parse(row.created_at) < Date.parse(end)).length;
  add('qualified_visits', 'Qualified Guide Visits', Number.isSafeInteger(qualifiedVisits) && qualifiedVisits >= 0 ? qualifiedVisits : null, 'Distinct Consented PostHog Sessions With A Guide Goal Selection Or Destination Click In This Window. Deduplicated Across Both Events. Starts With This Release; Prior Traffic Is Not Backfilled. Not People, Customers Or Agent Conversations.');
  add('accounts', 'Accounts Created', newAccounts, 'Profile Records Created In This Window, Including All Account Types. Not An Attributed Customer Conversion Count.');
  add('first_action', 'First Recorded Product Actions', trainingResult && ledgerResult ? summarizeFirstActions(trainingResult, ledgerResult, start, end) : null, 'Distinct Accounts Whose Earliest Saved Verified Training Session Or Ledger Record Falls In This Window. Other Product Actions Are Not Included.');
  add('existing_active', 'Existing Accounts Active', existingActive, 'Accounts Created Before This Window With Their Latest Profile Activity Inside It. A Current Activity Snapshot, Not A Retention Cohort.');
  add('training', 'Verified Training Sessions Saved', inWindow(trainingResult), 'Persisted Sessions Linked To Completed, Non-Practice Attempts Owned By The Same Account. Counts Sessions, Not People.');
  add('ledger', 'Ledger Records Saved', inWindow(ledgerResult), 'User-Entered Ledger Records Created In This Window. Counts Records, Not Money Or Confirmed Financial Transactions.');
  add('venue_inquiries', 'Venue Inquiries In Inbox', Number.isSafeInteger(venueInquiries) && venueInquiries >= 0 ? venueInquiries : null, VENUE_INQUIRY_DEFINITION);
  return { start, end, metrics, attribution: 'All Sources. These Database Counts Do Not Establish Business Hub Attribution.', completeness: 'Activity Metrics Are Unavailable If Either History Exceeds 10,000 Rows, Changes During Reading Or Cannot Be Read Completely.' };
}
