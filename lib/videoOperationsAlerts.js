'use strict';

const MIN_PLAYBACK_SAMPLES = 5;
const STARTUP_P95_WARNING_MS = 3000;
const DROPPED_FRAME_WARNING_RATE = 0.08;
const QUOTA_WARNING_FRACTION = 0.1;

function rowsByStatus(rows, status) {
  return (rows || []).filter((row) => row.status === status);
}

function buildAlerts(snapshot) {
  const alerts = [];
  const overdueSources = (snapshot.sources || []).reduce((sum, row) => sum + Number(row.overdue || 0), 0);
  if (overdueSources) alerts.push({ key: 'source_freshness', severity: 'warning', count: overdueSources, message: `${overdueSources} active source${overdueSources === 1 ? ' is' : 's are'} overdue for a successful check.` });

  const failedRuns = (snapshot.ingestion || []).filter((row) => row.status === 'failed' || row.status === 'quota_stopped')
    .reduce((sum, row) => sum + Number(row.runs || 0), 0);
  if (failedRuns) alerts.push({ key: 'ingestion_failures', severity: 'warning', count: failedRuns, message: `${failedRuns} ingestion run${failedRuns === 1 ? '' : 's'} failed in this window.` });

  const duplicateRows = Number(snapshot.duplicates?.duplicateRows || 0);
  if (duplicateRows) alerts.push({ key: 'duplicate_publication', severity: 'critical', count: duplicateRows, message: `${duplicateRows} extra public Reel row${duplicateRows === 1 ? '' : 's'} share a canonical asset key.` });

  const topicLeakCount = Number(snapshot.topicLeakCount || 0);
  if (topicLeakCount) alerts.push({ key: 'topic_leakage', severity: 'critical', count: topicLeakCount, message: `${topicLeakCount} Reel candidate${topicLeakCount === 1 ? '' : 's'} disagree with the source video topic.` });

  const staleCandidates = (snapshot.candidates || []).reduce((sum, row) => sum + Number(row.stale || 0), 0);
  if (staleCandidates) alerts.push({ key: 'stale_candidates', severity: 'warning', count: staleCandidates, message: `${staleCandidates} proposed or rate-limited candidates have waited beyond this window.` });

  const expiredRights = (snapshot.rightsEvidence || []).reduce((sum, row) => sum + Number(row.expired || 0), 0);
  if (expiredRights) alerts.push({ key: 'rights_expired', severity: 'critical', count: expiredRights, message: `${expiredRights} rights records have passed their validity date.` });
  const openCases = (snapshot.moderationCases || []).filter((row) => ['submitted', 'triaged'].includes(row.status))
    .reduce((sum, row) => sum + Number(row.count || 0), 0);
  if (openCases) alerts.push({ key: 'moderation_queue', severity: 'warning', count: openCases, message: `${openCases} rights or moderation case${openCases === 1 ? ' is' : 's are'} awaiting review.` });

  const controls = new Map((snapshot.controls || []).map((control) => [control.control_key, control]));
  const requiredControls = ['video_library_discovery', 'video_library_enrichment', 'video_library_reel_creation', 'video_library_reel_publication', 'video_library_editorial_gate'];
  for (const key of requiredControls) {
    if (!controls.has(key)) alerts.push({ key: `missing_${key}`, severity: 'critical', count: 1, message: `Required pipeline control ${key} is missing.` });
  }
  const missingControls = requiredControls.filter((key) => key !== 'video_library_editorial_gate' && !controls.get(key)?.enabled);
  if (missingControls.length) alerts.push({ key: 'pipeline_circuit_breaker', severity: 'warning', count: missingControls.length, message: `${missingControls.length} pipeline stage${missingControls.length === 1 ? ' is' : 's are'} disabled.` });
  const approvedCandidates = (snapshot.candidates || []).filter((row) => row.status === 'approved')
    .reduce((sum, row) => sum + Number(row.count || 0), 0);
  const publishedThisWindow = (snapshot.candidates || []).reduce((sum, row) => sum + Number(row.published_in_window || 0), 0);
  if (controls.get('video_library_reel_publication')?.enabled === true && approvedCandidates > 0 && publishedThisWindow === 0) {
    alerts.push({ key: 'publication_stall', severity: 'warning', count: approvedCandidates, message: `${approvedCandidates} approved Reel candidate${approvedCandidates === 1 ? '' : 's'} remain while no candidate was published in this window.` });
  }

  const deadLetters = rowsByStatus(snapshot.jobs, 'dead_letter').reduce((sum, row) => sum + Number(row.count || 0), 0);
  if (deadLetters) alerts.push({ key: 'dead_letter_jobs', severity: 'critical', count: deadLetters, message: `${deadLetters} enrichment job${deadLetters === 1 ? '' : 's'} reached the dead-letter queue.` });

  for (const row of snapshot.delivery || []) {
    if (Number(row.samples || 0) >= MIN_PLAYBACK_SAMPLES && Number(row.startup_ms_p95 || 0) > STARTUP_P95_WARNING_MS) {
      alerts.push({ key: 'playback_startup', severity: 'warning', count: Number(row.samples), message: `${row.surface} ${row.feed_mode} playback startup p95 is above 3 seconds.` });
    }
    const decoded = Number(row.decoded_frames || 0);
    const dropped = Number(row.dropped_frames || 0);
    if (decoded >= 100 && dropped / decoded > DROPPED_FRAME_WARNING_RATE) {
      alerts.push({ key: 'dropped_frames', severity: 'warning', count: Number(row.samples), message: `${row.surface} ${row.feed_mode} dropped-frame rate is above 8%.` });
    }
  }
  const playbackSamples = (snapshot.delivery || []).reduce((sum, row) => sum + Number(row.samples || 0), 0);
  if (playbackSamples < MIN_PLAYBACK_SAMPLES) alerts.push({ key: 'playback_metrics_coverage', severity: 'warning', count: playbackSamples, message: `Only ${playbackSamples} playback quality sample${playbackSamples === 1 ? '' : 's'} were recorded in this window; quality thresholds need at least ${MIN_PLAYBACK_SAMPLES}.` });

  for (const quota of snapshot.quota || []) {
    if (Number(quota.daily_budget) > 0 && Number(quota.remaining) <= Number(quota.daily_budget) * QUOTA_WARNING_FRACTION) {
      alerts.push({ key: 'provider_quota', severity: 'warning', count: Number(quota.remaining), message: `Video discovery quota is at or below 10% for ${quota.usage_date}.` });
    }
  }

  return alerts.sort((a, b) => a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1);
}

module.exports = { buildAlerts };
