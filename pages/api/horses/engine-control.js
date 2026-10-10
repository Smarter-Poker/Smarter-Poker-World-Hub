import { withOperatorRoute } from '../../../src/lib/horses/operatorRoute.js';
import { PERMISSIONS } from '../../../src/lib/horses/permissions.js';
import { engineOperatorControl } from '../../../src/lib/horses/engineOperatorControl.js';
export const spec = {
  name: 'horses.engine-control',
  methods: ['GET', 'POST'],
  permission: { GET: PERMISSIONS.CONSOLE_READ, POST: PERMISSIONS.CONSOLE_READ },
  limit: { GET: 'read', POST: 'write' },
  durable: { POST: { max: 20, windowSeconds: 60 } },
};
export async function handle(context) {
  return engineOperatorControl(context);
}
export default withOperatorRoute(spec, handle);
