import { withOperatorRoute } from '../../../src/lib/horses/operatorRoute.js';
import { emergencyStopsHandler } from '../../../src/lib/horses/emergencyStops.js';
export const spec = { name: 'horses.emergency-stops', methods: ['GET', 'POST'], permission: 'console.read', limit: { GET: 'read', POST: 'write' }, durable: { POST: { max: 10, windowSeconds: 60 } } };
export async function handle(context) { return emergencyStopsHandler(context); }
export default withOperatorRoute(spec, handle);
