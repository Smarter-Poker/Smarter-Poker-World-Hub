/**
 * POST /api/cron/video-library-scraper?report=1
 * Status/reporting webhook for scripts/video_library_scraper.py.
 *
 * Ingestion is an Open Claw SCRIPT_JOB (scripts/openclaw-cron-dispatcher.py
 * SCRIPT_JOBS): the dispatcher runs the Python scraper directly via
 * subprocess on its own host, not an HTTP hit on this route - yt-dlp cannot
 * run serverless (see the script's own header). This route never triggers a
 * scrape; it only receives the run summary the script POSTs back afterward.
 *
 * WHY THIS FILE EXISTS (Production Alerts Fleet, 2026-09-22/23).
 * video_library_scraper.py's report_to_api() has always POSTed here so this
 * job's health is visible the same way every other Open Claw cron's is
 * (withCronHealth -> cron_health_log). The route never existed - documented
 * and left unfixed in .agent/audits/2026-08-15-video-library-deep-dive.md
 * (finding F8: "Scraper health reporting 404s ... a route that does not
 * exist"), and again in this file's former neighbour
 * pages/api/cron/yt-pipeline-recovery.js, whose own comment repeats the same
 * finding verbatim while building an INDEPENDENT staleness check against
 * public.video_library_health instead of closing the gap. report_to_api()
 * catches its own request failure as non-fatal (`log.warning(...)`), so
 * every one of those 404s has been silent from the script's side too - this
 * job has never once produced a cron_health_log row under the writer every
 * sibling cron in this directory already has.
 */
import { validateCronAuth } from '../../../src/utils/cron-auth';
import { withCronHealth } from '../../../src/lib/cronHealth';

async function handler(req, res) {
  if (!validateCronAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'POST' && req.query?.report === '1') {
    // The script's own run summary (run_scraper()'s `summary` dict). A few
    // creators failing is normal and does not fail the job - the script
    // itself only alerts Slack at failed >= 3 and always exits 0 on a
    // completed run, so this route mirrors that tolerance rather than
    // turning a partial result into an http_5xx that would falsely mark the
    // whole job 'error' in cron_health_log.
    const summary = req.body && typeof req.body === 'object' ? req.body : {};
    return res.status(200).json({
      status: 'ok',
      received: true,
      processed: summary.processed ?? null,
      failed: summary.failed ?? null,
      total_new: summary.total_new ?? null,
      total_found: summary.total_found ?? null,
    });
  }

  // A bare authenticated hit with no report body is a health probe, not a
  // trigger - this route never runs the scraper itself. See
  // openclaw-cron-dispatcher.py SCRIPT_JOBS for the actual dispatch path.
  return res.status(200).json({
    status: 'ok',
    note: 'reporting webhook only; ingestion runs as an Open Claw SCRIPT_JOB',
  });
}

export default withCronHealth('video-library-scraper', handler);
