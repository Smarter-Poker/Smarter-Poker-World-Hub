const SETTINGS_KEYS = ['schedule_summary', 'schedule_description', 'end_time', 'tables_count', 'schedules_tournaments'];
const TABLE_KEYS = ['game_type', 'stakes'];
const TOURNAMENT_KEYS = ['name', 'tournament_name', 'buy_in', 'starting_stack', 'structure', 'scheduled_date', 'scheduled_time', 'time', 'entries_cap', 'recurring', 'recurring_days', 'day', 'days', 'typical_day'];
const pick = (value, keys) => Object.fromEntries(keys
  .filter(key => Object.hasOwn(value || {}, key))
  .filter(key => value[key] === null || ['string', 'number', 'boolean'].includes(typeof value[key])
    || (key === 'recurring_days' && Array.isArray(value[key])))
  .map(key => [key, key === 'recurring_days' && Array.isArray(value[key])
    ? value[key].filter(day => typeof day === 'string') : value[key]]));

// Settings are host-editable JSON, not a public schema. Never leak invite
// credentials, exact addresses or future private keys through venue adapters.
export function publicHomeGameSettings(settings) {
  const result = pick(settings, SETTINGS_KEYS);
  if (Array.isArray(settings?.tables)) result.tables = settings.tables.map(row => pick(row, TABLE_KEYS));
  if (Array.isArray(settings?.tournaments)) result.tournaments = settings.tournaments.map(row => pick(row, TOURNAMENT_KEYS));
  return result;
}

export function publicHomeGroupsByLinkedPages(groups, pages) {
  const hiddenIds = new Set((pages || []).filter(page => page.is_public === false).map(page => String(page.linked_entity_id)));
  return (groups || []).filter(group => !hiddenIds.has(String(group.id)));
}
