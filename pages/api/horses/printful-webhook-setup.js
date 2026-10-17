/**
 * POST /api/horses/printful-webhook-setup — register the store's Printful
 * webhook once and return its signing keys sealed to the operator's RSA key.
 * See src/lib/store/printfulWebhookSetup.js. Never returns a key in the clear,
 * never replaces an existing webhook, never touches an order.
 */
import { withOperatorRoute } from '../../../src/lib/horses/operatorRoute.js';
import { PERMISSIONS } from '../../../src/lib/horses/permissions.js';
import { ApiError } from '../../../src/lib/horses/apiEnvelope.js';

const { registerPrintfulWebhook, SetupError } = require('../../../src/lib/store/printfulWebhookSetup');

export const spec = {
  name: 'horses.printful-webhook-setup',
  methods: ['POST'],
  permission: { POST: PERMISSIONS.SETTINGS_WRITE },
  limit: { POST: 'write' },
};

export async function handle({ res, body }) {
  res.setHeader('Cache-Control', 'no-store');
  if (body.confirm !== 'register-printful-webhook') {
    throw new ApiError(400, 'confirm must be "register-printful-webhook"');
  }
  try {
    return await registerPrintfulWebhook({ recipientPublicKeyPem: body.recipientPublicKeyPem });
  } catch (err) {
    if (err instanceof SetupError) throw new ApiError(err.status, err.message);
    throw err;
  }
}

export default withOperatorRoute(spec, handle);
