/**
 * PRINTFUL STATUS (read only)
 *   GET - the store's v2 webhook configuration (no secret is ever returned;
 *         the public key Printful sends in every delivery is) and its sync
 *         products and variants, for mapping the merch catalog.
 *
 * Built on withOperatorRoute like merch-catalog-admin, with the same read
 * permission. It never writes to Printful and never touches an order.
 */
import { withOperatorRoute } from '../../../src/lib/horses/operatorRoute.js';
import { PERMISSIONS } from '../../../src/lib/horses/permissions.js';
const { readPrintfulStatus } = require('../../../src/lib/store/printfulStatus');

export const spec = {
  name: 'horses.printful-status',
  methods: ['GET'],
  permission: { GET: PERMISSIONS.CONSOLE_READ },
  limit: { GET: 'read' },
};

export async function handle({ res }) {
  res.setHeader('Cache-Control', 'no-store');
  return readPrintfulStatus();
}

export default withOperatorRoute(spec, handle);
