/**
 * POST /api/club-arena/shared-hand-view  { token }  ->  { counted: boolean }
 *
 * Counts one signed-out open of a shared Club Arena hand with the service
 * role. Everything about what is and is not counted lives in
 * src/lib/sharedHandView.js. Under /api/club-arena/ so the Club Arena native
 * app's origin gets CORS from middleware.ts like every other arena route.
 */
import { rateLimit } from '../../../src/lib/apiRateLimit';
import { createSharedHandViewHandler } from '../../../src/lib/sharedHandView';

export const config = { api: { bodyParser: { sizeLimit: '1kb' } } };

export default createSharedHandViewHandler({ rateLimit });
