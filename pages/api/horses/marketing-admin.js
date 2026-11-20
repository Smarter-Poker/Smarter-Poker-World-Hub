import { withOperatorRoute } from '../../../src/lib/horses/operatorRoute.js';
import { makeMarketingAdminHandler } from '../../../src/lib/horses/marketingAdmin.js';

// Reading the tab is console.read. Every write - importing contacts, drafting,
// test-sending, approving a send to a whole audience, settings - is
// content.write, the permission that already gates platform messaging, and
// each one files an admin_audit_log row.
export const spec = {
  name: 'horses.marketing-admin',
  methods: ['GET', 'POST'],
  permission: { GET: 'console.read', POST: 'content.write' },
  limit: { GET: 'read', POST: 'write' },
  durable: { POST: { max: 30, windowSeconds: 60 } },
};

const handler = makeMarketingAdminHandler();
export async function handle(context) { return handler(context); }
export default withOperatorRoute(spec, handle);
