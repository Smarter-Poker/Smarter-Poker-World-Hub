/** Authenticated, report-only Vercel deployment intake. */
import crypto from 'crypto';
import { alertEventKey, openFiringAlertIds, recordOperationalAlerts } from '../../src/lib/operationalAlerts.mjs';

export const config = { api: { bodyParser: false }, maxDuration: 15 };
const PROJECT_ID = 'prj_op66GkZyZcygXQKm76iyycfVFAQx';
const MAX_RAW_BODY_BYTES = 2 * 1024 * 1024;

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let complete = false;
    req.on('data', (chunk) => {
      if (complete) return;
      total += chunk.length;
      if (total > MAX_RAW_BODY_BYTES) {
        complete = true;
        const error = new Error('Request body too large');
        error.statusCode = 413;
        reject(error);
        try { req.destroy(); } catch { /* no-op */ }
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!complete) resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

function constantTimeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8')); }
  catch { return false; }
}

function verifyVercelSignature(rawBody, signature, secret) {
  if (typeof signature !== 'string') return false;
  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
  return constantTimeEqual(signature, expected);
}

async function recordDeploymentEvidence(evidence, status) {
  return recordOperationalAlerts([{
    source: 'worldhub.deploy-monitor',
    event_key: alertEventKey({ deploymentId: evidence.deploymentId, alertname: 'VercelDeploymentFailed', status, stage: 'deployment-state' }),
    alertname: 'VercelDeploymentFailed',
    status,
    severity: status === 'resolved' ? 'info' : 'critical',
    payload: {
      ...evidence,
      summary: status === 'resolved' ? 'Vercel reports this deployment is ready' : 'Vercel reports this deployment failed',
      resolutionScope: 'deployment_only',
    },
  }]);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Allow', 'POST');
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, code: 'method_not_allowed', error: 'Method Not Allowed' });
  }

  let rawBody;
  try { rawBody = await readRawBody(req); }
  catch (error) {
    const status = error?.statusCode === 413 ? 413 : 400;
    return res.status(status).json({ ok: false, error: status === 413 ? 'Request Body Too Large' : 'Invalid Request Body' });
  }

  const secret = process.env.DEPLOY_WEBHOOK_SECRET;
  if (typeof secret !== 'string' || secret.length === 0) {
    return res.status(500).json({ ok: false, error: 'Service Unavailable' });
  }
  const signature = req.headers?.['x-vercel-signature'];
  const hmacValid = verifyVercelSignature(rawBody, signature, secret);
  // A query-string secret is intentionally unsupported: URLs are routinely
  // copied into access logs, analytics and proxy histories. Keep the legacy
  // header fallback during provider migration without putting credentials in
  // the request target.
  const sharedSecretValid = constantTimeEqual(req.headers?.['x-webhook-secret'], secret);
  if (!hmacValid && !sharedSecretValid) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  const authMethod = hmacValid ? 'hmac' : 'shared_secret';

  let payload;
  try { payload = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : null; }
  catch { return res.status(400).json({ ok: false, error: 'Invalid Webhook Payload' }); }
  if (!payload || typeof payload.type !== 'string') {
    return res.status(400).json({ ok: false, error: 'Invalid Webhook Payload' });
  }

  const deployment = payload.payload?.deployment || payload.payload || {};
  const deploymentId = deployment.id || deployment.uid;
  const projectIds = [deployment.projectId, payload.payload?.projectId, payload.payload?.project?.id].filter(Boolean);
  if (!projectIds.length || projectIds.some((id) => id !== PROJECT_ID)) {
    return res.status(200).json({ ok: true, action: 'ignored', reason: 'Unrelated Project' });
  }
  if (typeof deploymentId !== 'string' || !deploymentId.trim()) {
    return res.status(400).json({ ok: false, error: 'Missing Deployment Identity' });
  }

  const eventType = payload.type;
  const deployState = String(deployment.state || deployment.readyState || '').toUpperCase();
  const isFailure = ['deployment.error', 'deployment.failed'].includes(eventType) || ['ERROR', 'FAILED'].includes(deployState);
  const isRecovery = !isFailure && (['deployment.ready', 'deployment.succeeded'].includes(eventType) || deployState === 'READY');
  if (!isFailure && !isRecovery) {
    return res.status(200).json({ ok: true, action: 'ignored', reason: 'No Failure Or Recovery Evidence' });
  }

  const evidence = {
    deploymentId,
    projectId: PROJECT_ID,
    commitSha: deployment.meta?.githubCommitSha || null,
    eventType,
    state: deployState || eventType,
    target: payload.payload?.target || deployment.target || null,
    webhook: payload,
  };
  try {
    if (isRecovery) {
      const openFailures = await openFiringAlertIds({ source: 'worldhub.deploy-monitor', alertname: 'VercelDeploymentFailed', field: 'deploymentId', value: deploymentId });
      if (!openFailures.length) {
        return res.status(200).json({ ok: true, action: 'no_open_failure', receipts: [], sent: false });
      }
    }
    const receipts = await recordDeploymentEvidence(evidence, isRecovery ? 'resolved' : 'firing');
    return res.status(200).json({ ok: true, action: 'recorded', status: isRecovery ? 'resolved' : 'firing', receipts, sent: false, authMethod });
  } catch {
    return res.status(503).json({ ok: false, action: 'alert_delivery_failed', retryable: true, sent: false });
  }
}
