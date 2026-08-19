/**
 * OneSignalContext -- DEPRECATED ALIAS. Do not add code here.
 *
 * OneSignal was removed from smarter.poker on 2026-08-19 and replaced by
 * self-hosted VAPID Web Push. This file survives only as a re-export so that
 * any import path missed during the migration keeps resolving. The repo mount
 * cannot delete files; once the working tree is on a machine that can, delete
 * this file and src/lib/onesignal-server.js together.
 *
 * Import from src/contexts/PushContext.jsx instead:
 *   import { PushProvider, usePush } from '../contexts/PushContext';
 */
import { PushProvider, usePush } from './PushContext';

export const OneSignalProvider = PushProvider;
export const useOneSignal = usePush;
export { PushProvider, usePush };
export default PushProvider;
