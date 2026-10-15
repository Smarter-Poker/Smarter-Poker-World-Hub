/**
 * SERIES CALENDAR (.ics) EXPORT ENDPOINT
 * Serves standards-compliant iCalendar (.ics) files for tournament series.
 */
import { fetchSeries, originFrom } from '../../../src/lib/poker-near-me/seriesSeo.mjs';
import { buildSeriesIcs } from '../../../src/lib/poker-near-me/calendarExport.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ success: false, error: 'Series ID required' });
  }

  try {
    const origin = originFrom(req);
    const { series, status } = await fetchSeries(id, origin);

    if (status === 'gone') {
      res.setHeader('Cache-Control', 'public, s-maxage=3600');
      return res.status(410).json({ success: false, error: 'Series has been removed' });
    }

    if (!series || status === 'not-found') {
      res.setHeader('Cache-Control', 'public, s-maxage=60');
      return res.status(404).json({ success: false, error: 'Series not found' });
    }

    const icsContent = buildSeriesIcs(series);
    if (!icsContent) {
      return res.status(400).json({ success: false, error: 'Series does not have valid dates for calendar export' });
    }

    const filename = `${String(series.name || 'series').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-schedule.ics`;

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
    return res.status(200).send(icsContent);
  } catch (error) {
    console.error('[series-calendar] export error:', error?.message || error);
    return res.status(500).json({ success: false, error: 'Internal calendar export error' });
  }
}
