// Directory stop summaries are not event-level evidence. In particular, older
// research rows called a whole stop "Main Event" with a guessed buy-in.
const QUALITIES = ['scraped_verified', 'manual_research', 'scraped_inferred'];
const day = (value) => {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
};
const text = (value) => String(value || '').trim();
// Punctuation/spacing are presentation, not a new physical stop. Keep dates,
// complete ranges and places in the identity so repeat visits remain distinct.
const identityText = value => text(value).normalize('NFKC').toLowerCase()
  .replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\s*-\s*/g, '-')
  .replace(/\s+/g, ' ');
export function tourStopIdentityKey({ name, start, end, venue, city, state }) {
  return JSON.stringify([identityText(name), start || '', end || start || '',
    identityText(venue), identityText(city), identityText(state)]);
}
const host = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.hostname.toLowerCase().replace(/^www\./, '') : null;
  } catch { return null; }
};
const dateLabel = (value) => new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
}).replace(',', '');

/** Stable, complete pages; a failed/oversized read never certifies a partial set. */
export async function readTourScheduleRows(client) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 20000; offset += pageSize) {
    const { data, error } = await client.from('tour_stop_events')
      .select('id,tour_code,stop_name,stop_venue,stop_city,stop_state,stop_start_date,stop_end_date,start_date,source_url,scrape_url,scrape_timestamp,scrape_html_hash,scrape_script,data_quality')
      .in('data_quality', QUALITIES)
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error || !Array.isArray(data)) throw new Error('Tour schedule database read failed');
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
  throw new Error('Tour schedule database exceeds bounded complete read');
}

/** Only dated, source-attributed stops on the tour's configured primary domain. */
export function databaseTourStops(rows, tours) {
  const tourByCode = new Map(tours.map(tour => [tour.tour_code, tour]));
  const groups = new Map();
  for (const row of rows) {
    const tour = tourByCode.get(row.tour_code);
    if (!tour || !QUALITIES.includes(row.data_quality)) continue;
    // The collector can prove a dated STOP without an event-level structure.
    // Legacy inferred rows without the owning collector's evidence stay out.
    if (row.data_quality === 'scraped_inferred'
      && (!/^[a-f0-9]{64}$/i.test(String(row.scrape_html_hash || ''))
        || row.scrape_script !== 'tour_stealth_scraper.py')) continue;
    const source = row.source_url || row.scrape_url;
    const sourceHost = host(source);
    const primaryHosts = [tour.official_website, tour.schedule_url, ...(tour.alternate_urls || [])]
      .map(host).filter(Boolean);
    if (!sourceHost || !primaryHosts.some(primary => sourceHost === primary || sourceHost.endsWith(`.${primary}`))) continue;
    const observed = Date.parse(row.scrape_timestamp || '');
    if (!Number.isFinite(observed)) continue;
    const start = day(row.stop_start_date || row.start_date);
    const end = day(row.stop_end_date || row.stop_start_date || row.start_date);
    const name = text(row.stop_name);
    const venue = text(row.stop_venue);
    const city = text(row.stop_city);
    const state = text(row.stop_state);
    if (!start || !end || end < start || !name) continue;
    const key = `${row.tour_code}|${tourStopIdentityKey({ name, start, end, venue, city, state })}`;
    const previous = groups.get(key);
    if (previous && Date.parse(previous.scrape_timestamp) >= observed) continue;
    groups.set(key, {
      tour: row.tour_code, name, short_name: name, venue: venue || null,
      city: city || null, state: state || null,
      location: [city, state].filter(Boolean).join(', ') || venue || null,
      dates: start === end ? dateLabel(start) : `${dateLabel(start)} - ${dateLabel(end)}`,
      start_date: start, end_date: end,
      source_url: source, scrape_timestamp: new Date(observed).toISOString(),
      data_quality: row.data_quality, schedule_source: 'database_recorded',
      // No buy-in, event name/count, game or live-activity claim is inferred.
    });
  }
  return [...groups.values()].sort((a, b) => a.start_date.localeCompare(b.start_date) || a.name.localeCompare(b.name));
}

export function attachDatabaseTourSchedules(tours, rows) {
  const stops = databaseTourStops(rows, tours);
  return tours.map(tour => {
    const schedule = stops.filter(stop => stop.tour === tour.tour_code);
    if (!schedule.length) return { ...tour, schedule_source: 'bundled_registry', schedule_last_updated: null };
    return {
      ...tour, stops_2026: schedule, series_2026: [],
      schedule_source: 'database_recorded',
      schedule_last_updated: schedule.map(stop => stop.scrape_timestamp).sort().at(-1),
    };
  });
}
