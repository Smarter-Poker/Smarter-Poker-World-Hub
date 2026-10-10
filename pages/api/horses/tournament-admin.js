import { withOperatorRoute } from '../../../src/lib/horses/operatorRoute.js';
import { tournamentOperationsHandler } from '../../../src/lib/horses/tournamentOperations.js';
export const spec = { name: 'horses.tournament-admin', methods: ['GET', 'POST'], permission: 'clubs.read', limit: { GET: 'read', POST: 'write' }, durable: { POST: { max: 10, windowSeconds: 60 } } };
export async function handle(context) { return tournamentOperationsHandler(context); }
export default withOperatorRoute(spec, handle);
