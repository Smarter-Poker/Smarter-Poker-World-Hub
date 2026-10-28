/**
 * FREEROLLS CALENDAR (.ics) EXPORT ENDPOINT
 * Serves standards-compliant iCalendar (.ics) feed for Daily $2,000 Freerolls & Diamond events.
 * Compatible with Apple Calendar, Google Calendar, Outlook, and mobile calendar apps.
 */
import { buildFreerollsIcs } from '../../../src/lib/poker-near-me/calendarExport.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const icsContent = buildFreerollsIcs();
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="smarter-poker-freerolls.ics"');
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
    return res.status(200).send(icsContent);
  } catch (error) {
    console.error('[freerolls-calendar] export error:', error?.message || error);
    return res.status(500).json({ success: false, error: 'Internal calendar export error' });
  }
}
