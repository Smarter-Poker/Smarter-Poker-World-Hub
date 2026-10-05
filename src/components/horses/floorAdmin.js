/** Pure client contract for the Phase 6 floor operations route. */
export const FLOOR_ADMIN = '/api/horses/floor-admin';

function query(params = {}) {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === '' || value === null || value === undefined) continue;
    out.set(key, String(value));
  }
  return out;
}

export function floorAdminUrl(section, params = {}) {
  const search = query({ section, ...params });
  return `${FLOOR_ADMIN}?${search.toString()}`;
}

export const floorUrl = (params) => floorAdminUrl('floor', params);
export const tableUrl = (tableId, params = {}) => floorAdminUrl('table', { tableId, ...params });
export const tournamentsUrl = (params) => floorAdminUrl('tournaments', params);
export const eventUrl = (tournamentId) => floorAdminUrl('event', { tournamentId });
export const cashoutsUrl = (params) => floorAdminUrl('cashouts', params);
export const chipRequestsUrl = (params) => floorAdminUrl('chip_requests', params);
export const rakeUrl = (params) => floorAdminUrl('rake', params);
export const clubsUrl = (params) => floorAdminUrl('clubs', params);
export const clubUrl = (clubId, params = {}) => floorAdminUrl('club', { clubId, ...params });
export const unionsUrl = (params) => floorAdminUrl('unions', params);
export const unionUrl = (unionId, params = {}) => floorAdminUrl('union', { unionId, ...params });
export const announcementsUrl = (params) => floorAdminUrl('announcements', params);

export async function recordExportCompletion(authFetch, { section, filters = {}, rowCount, complete }) {
  const exportId = globalThis.crypto?.randomUUID?.();
  if (!exportId) throw new Error('A Secure Export Identifier Could Not Be Created');
  const receipt = await authFetch(FLOOR_ADMIN, {
    method: 'POST',
    body: JSON.stringify({ action: 'record_export_prepared', exportId, section, filters, rowCount, complete }),
  });
  const payload = receipt?.data ?? receipt;
  if (payload?.recorded !== true) throw new Error('The Export Audit Receipt Could Not Be Recorded');
  return payload;
}

export async function setClubStatus(authFetch, { clubId, status, reason }) {
  return authFetch(FLOOR_ADMIN, { method: 'POST', body: JSON.stringify({ action: 'set_club_status', clubId, status, reason }) });
}

export async function fundClub(authFetch, { clubId, amount, reason, opId }) {
  return authFetch(FLOOR_ADMIN, { method: 'POST', body: JSON.stringify({ action: 'fund_club', clubId, amount, reason, opId }) });
}

export async function decideChipRequest(authFetch, { requestId, decision }) {
  return authFetch(FLOOR_ADMIN, { method: 'POST', body: JSON.stringify({ action: 'decide_chip_request', requestId, decision }) });
}

export function rowsOf(body) {
  if (Array.isArray(body?.rows)) return body.rows;
  if (Array.isArray(body?.data?.rows)) return body.data.rows;
  return [];
}

export function pageOf(body, key) {
  const page = body?.[key] ?? body?.data?.[key] ?? null;
  if (Array.isArray(page)) return { rows: page, total: null, limit: page.length, offset: 0, hasMore: false, truncated: false, complete: true };
  const total = page?.total;
  return {
    rows: Array.isArray(page?.rows) ? page.rows : [],
    total: total !== null && total !== undefined && Number.isFinite(Number(total)) ? Number(total) : null,
    limit: Number.isFinite(Number(page?.limit)) ? Number(page.limit) : null,
    offset: Number.isFinite(Number(page?.offset)) ? Number(page.offset) : 0,
    hasMore: page?.hasMore === true,
    truncated: page?.truncated === true,
    complete: page?.complete === false ? false : page?.hasMore !== true,
  };
}

export function totalOf(body) {
  const value = body?.total ?? body?.meta?.total ?? body?.data?.total ?? body?.data?.meta?.total;
  return value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
}

export function sourceState(body, fallback = 'unknown') {
  return String(body?.state ?? body?.data?.state ?? fallback);
}

export function engineOf(body) {
  return body?.engine ?? body?.data?.engine ?? null;
}

export function databaseOf(body) {
  return body?.database ?? body?.data?.database ?? null;
}

export function compositionOf(row = {}) {
  const count = (value) => value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);
  return {
    occupied: count(row.composition?.occupied ?? row.occupied_seats ?? row.seated_count),
    horses: count(row.composition?.horses ?? row.horse_count ?? row.horses ?? row.horses_seated),
    humans: count(row.composition?.humans ?? row.human_count ?? row.humans ?? row.humans_seated),
  };
}

export function floorDisclosure(body) {
  const state = sourceState(body, 'floor.unknown');
  const database = databaseOf(body);
  const engine = engineOf(body);
  if (state === 'floor.diverged') {
    return {
      tone: 'warn',
      title: 'The Two Floor Views Disagree',
      body: `Database Active Tables: ${database?.activeTables ?? 'Unknown'}. Engine Active Tables: ${engine?.activeTables ?? 'Unknown'}. Both Figures Are Shown Because Neither May Safely Stand In For The Other.`,
    };
  }
  if (state === 'floor.partial') {
    return { tone: 'warn', title: 'One Floor Source Is Unavailable', body: 'The Available Source Is Shown. Missing Figures Stay Unknown, Never Zero.' };
  }
  if (state === 'floor.stale') {
    return { tone: 'warn', title: 'The Engine View Is Stale', body: 'The Database View Is Current, But The Engine Report Is Older Than Its Cache Window.' };
  }
  if (state === 'floor.unknown') {
    return { tone: 'danger', title: 'The Live Floor Could Not Be Read', body: 'Neither The Database Nor The Engine Supplied A Current Floor View.' };
  }
  return { tone: 'info', title: 'Two Live Sources', body: 'Database And Engine Figures Are Labelled Separately.' };
}

export function exportState(result) {
  if (!result) return { state: 'export.idle', message: '' };
  if (result.running) return { state: 'export.running', message: `${result.fetched ?? 0} Of ${result.total ?? 'Unknown'} Rows Collected` };
  if (result.error) return { state: 'export.failed', message: 'The Export Could Not Be Completed.' };
  if (result.complete === false) return { state: 'export.truncated', message: `The Export Hit Its Safety Cap After ${result.exported ?? 0} Rows. The File Is Incomplete.` };
  return { state: 'export.prepared', message: `${result.exported ?? 0} Rows Prepared. The Browser Download Was Requested.` };
}

export function clubArenaLink(kind, row = {}) {
  const clubId = row.club_id ?? row.clubId ?? '';
  const tournamentId = row.tournament_id ?? row.tournamentId ?? row.id ?? '';
  if (kind === 'table') return clubId ? `/hub/club-arena/clubs/${encodeURIComponent(clubId)}/table-management` : '/hub/club-arena';
  if (kind === 'tournament') return tournamentId ? `/hub/club-arena/tournaments/${encodeURIComponent(tournamentId)}` : '/hub/club-arena';
  if (kind === 'cashier') return clubId ? `/hub/club-arena/clubs/${encodeURIComponent(clubId)}/cashier` : '/hub/club-arena/cashier';
  if (kind === 'club') return clubId ? `/hub/club-arena/clubs/${encodeURIComponent(clubId)}/operations` : '/hub/club-arena';
  if (kind === 'club-announcement') return clubId ? `/hub/club-arena/clubs/${encodeURIComponent(clubId)}/announcements` : '/hub/club-arena';
  const unionId = row.union_id ?? row.unionId ?? row.id ?? '';
  if (kind === 'union') return unionId ? `/hub/club-arena/unions/${encodeURIComponent(unionId)}` : '/hub/club-arena';
  if (kind === 'union-announcement') return unionId ? `/hub/club-arena/unions/${encodeURIComponent(unionId)}/operations` : '/hub/club-arena';
  return '/hub/club-arena';
}

export function moneyText(value) {
  if (value === null || value === undefined || value === '') return 'Unknown';
  const raw = String(value).trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return 'Unknown';
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, fraction = ''] = unsigned.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}.${(fraction + '00').slice(0, 2)}`;
}

export function exactDecimalText(value) {
  if (value === null || value === undefined || value === '') return 'Unknown';
  const raw = String(value).trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return 'Unknown';
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, fraction] = unsigned.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${fraction === undefined ? '' : `.${fraction}`}`;
}

export function evidenceEntries(value) {
  if (!value || typeof value !== 'object') return [];
  const source = Array.isArray(value) ? value[0] : value;
  if (!source || typeof source !== 'object') return [];
  return Object.entries(source)
    .filter(([, item]) => ['string', 'number', 'boolean'].includes(typeof item) || item === null)
    .slice(0, 12)
    .map(([key, item]) => ({
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
      value: item === null || item === '' ? 'Not Recorded' : String(item),
    }));
}

export const FLOOR_COLUMNS = Object.freeze([
  ['name', 'Table'], ['club_name', 'Club'], ['stakes', 'Stakes'],
  ['occupied_seats', 'Occupied'], ['capacity', 'Capacity'],
  ['horse_count', 'Horses'], ['human_count', 'Humans'],
]);

export const TOURNAMENT_COLUMNS = Object.freeze([
  ['name', 'Tournament'], ['status', 'State'], ['registered_count', 'Registered'],
  ['guarantee', 'Guarantee'], ['prize_pool', 'Prize Pool'], ['overlay', 'Overlay'],
]);

export const CASHIER_COLUMNS = Object.freeze([
  ['id', 'Request ID'], ['kind', 'Queue'], ['status', 'State'],
  ['player_name', 'Player'], ['amount', 'Amount'], ['created_at', 'Created'],
]);

export const RAKE_COLUMNS = Object.freeze([
  ['dimension_key', 'Dimension Key'], ['label', 'Selected Dimension'],
  ['rake_amount', 'Rake'], ['bbj_contribution', 'BBJ Contribution'],
  ['record_count', 'Records'], ['first_recorded_at', 'First Recorded'],
  ['last_recorded_at', 'Last Recorded'], ['window_start', 'Window Start'],
  ['window_end', 'Window End'], ['as_of', 'As Of'],
]);
