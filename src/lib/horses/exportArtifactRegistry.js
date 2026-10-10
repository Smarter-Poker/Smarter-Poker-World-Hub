import { PERMISSIONS } from './permissions.js';
import { uuid, int, text, enumOf, isoDate } from './validate.js';
import { APPROVAL_KINDS } from './approvals.js';
import { FLEET_STATES } from '../../../pages/api/horses/fleet-admin.js';
import { APPROVAL_STATUSES } from '../../../pages/api/horses/operator-admin.js';
import { MINT_REGISTER_FILTER_VALUES } from '../../../pages/api/horses/mint.js';
import { RAKE_REPORT_DIMENSIONS, QUEUE_AGES } from '../../../pages/api/horses/floor-admin.js';
import { MAX_ACTION_PREFIXES, cleanPrefixes } from '../../../pages/api/horses/stable-admin.js';

// Each descriptor names an existing read owner. No caller-supplied route,
// table, SQL, columns, or permission can reach the service-role worker.
const descriptor = (owner, section, key, permission, filters = []) => ({ owner, section, key, permission, filters });
const economy = (section, key = 'rows') => descriptor('economy', section, key, PERMISSIONS.MONEY_READ, []);
export const EXPORT_ARTIFACT_REGISTRY = Object.freeze({
  'stable-live-floor': descriptor('floor', 'floor', 'tables', PERMISSIONS.CLUBS_READ),
  'stable-tournaments': descriptor('floor', 'tournaments', 'tournaments', PERMISSIONS.CLUBS_READ),
  'stable-cashouts': descriptor('floor', 'cashouts', 'queue', PERMISSIONS.MONEY_READ, ['status', 'age']),
  'stable-chip_requests': descriptor('floor', 'chip_requests', 'queue', PERMISSIONS.MONEY_READ, ['status', 'age']),
  'stable-rake': descriptor('floor', 'rake', 'rake', PERMISSIONS.MONEY_READ, ['days', 'dimension']),
  'fleet-roster': descriptor('fleet', 'roster', 'rows', PERMISSIONS.FLEET_READ, ['state', 'clubId', 'band', 'lane']),
  'operator-approvals': descriptor('operator', 'approvals', 'approvals', PERMISSIONS.CONSOLE_READ, ['status', 'kind', 'from', 'to']),
  'admin-audit-log': descriptor('audit', 'audit_log', 'rows', PERMISSIONS.AUDIT_READ, ['actionPrefix', 'actionPrefixes', 'adminId', 'days', 'targetType', 'targetId', 'from', 'to']),
  'mint-register': descriptor('mint', 'ledger', 'rows', PERMISSIONS.MONEY_READ, ['asset', 'action', 'origin', 'holderId']),
  'economy-supply': economy('supply', 'snapshot'),
  'economy-drift-incidents': economy('drift', 'incidents'),
  'economy-chip-composition': economy('drift', 'reconciliation'),
  'economy-rakeback-periods': economy('rakeback', 'periods'),
  'rakeback-periods': economy('rakeback', 'periods'),
  'economy-leaderboard-payouts': economy('leaderboard', 'payouts'),
  'leaderboard-payouts': economy('leaderboard', 'payouts'),
  'economy-bbj-payouts': economy('bbj', 'payouts'),
  'bbj-payouts': economy('bbj', 'payouts'),
  'economy-promotion-awards': economy('promotions'),
  'promotion-awards': economy('promotions'),
  'rake-law-findings': economy('rakelaw', 'findings'),
  'economy-manifests': economy('close', 'manifests'),
  'economy-manifest-restatements': economy('close', 'restatements'),
  'economy-digest-evidence': economy('digest'),
  'economy-invoices': economy('invoices'),
  'economy-job-evidence': economy('jobs'),
});
export const EXPORT_ARTIFACT_LIMITS = Object.freeze({ rows: 20000, bytes: 16 * 1024 * 1024, page: 200, durationMs: 180000, expiresDays: 7 });
export const EXPORT_ARTIFACT_BUCKET = 'operator-export-artifacts';


function filterValue(entry, key, value) {
  const reject = () => { throw new Error('export_filter_invalid'); };
  if (['clubId','holderId','adminId'].includes(key)) return uuid(value) || reject();
  if (['from','to'].includes(key)) {
    const date = isoDate(value);
    if (!date) return reject();
    const raw = value.trim();
    const [year,month,day] = raw.slice(0,10).split('-').map(Number);
    const calendar = new Date(0); calendar.setUTCFullYear(year,month-1,day);calendar.setUTCHours(0,0,0,0);
    if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month-1 || calendar.getUTCDate() !== day) return reject();
    // Preserve date-only shape: canonical read owners expand `to` to end of day.
    return raw;
  }
  if (key === 'days') { const days = int(value,{min:1,max:entry.owner==='floor'?90:365});return days === null ? reject() : String(days); }
  const vocabulary = key==='state' ? FLEET_STATES : key==='dimension' ? RAKE_REPORT_DIMENSIONS
    : key==='age' ? QUEUE_AGES : key==='kind' ? APPROVAL_KINDS
    : key==='status' && entry.owner==='operator' ? APPROVAL_STATUSES
    : entry.owner==='mint' ? MINT_REGISTER_FILTER_VALUES[key] : null;
  if (vocabulary) return enumOf(value,vocabulary) || reject();
  if (key === 'actionPrefix') return cleanPrefixes([],value)[0] || reject();
  if (key === 'actionPrefixes') {
    const raw = Array.isArray(value) ? value : typeof value==='string' ? [value] : reject();
    if (!raw.length || raw.length>MAX_ACTION_PREFIXES) return reject();
    const normalized = raw.map(item => { if(typeof item!=='string')return reject();return cleanPrefixes([],item)[0] || reject(); });
    return [...new Set(normalized)];
  }
  const max = ['band','lane'].includes(key)?60:key==='status'?40:key==='targetType'?80:200;
  return text(typeof value==='string'?value:String(value),{min:1,max}) || reject();
}
export function exportDescriptor(surface, filters = {}) {
  if (!Object.hasOwn(EXPORT_ARTIFACT_REGISTRY,surface)) throw new Error('export_surface_invalid');
  const entry = EXPORT_ARTIFACT_REGISTRY[surface];
  if (!filters || Array.isArray(filters) || typeof filters !== 'object') throw new Error('export_filters_invalid');
  const clean = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    if (!entry.filters.includes(key) || (Array.isArray(value) ? key !== 'actionPrefixes' : !['string','number','boolean'].includes(typeof value))) throw new Error('export_filter_invalid');
    clean[key] = filterValue(entry,key,value);
  }
  if (entry.owner==='audit') {
    const prefixes = [...new Set([...(clean.actionPrefixes || []),...(clean.actionPrefix ? [clean.actionPrefix] : [])])];
    if (prefixes.length>MAX_ACTION_PREFIXES) throw new Error('export_filter_invalid');
  }
  return { ...entry, surface, filters: clean };
}
