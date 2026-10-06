import { create } from 'zustand';
import {
  patchOperatorContext,
  readyOperatorContext,
  unknownOperatorContext,
} from '../components/horses/stableAdminState.mjs';

/**
 * Cross-panel Stable Admin state only.
 *
 * `currentUser` is the already-verified identity projection the shell shares;
 * tokens and session objects are deliberately absent. Request functions, table
 * rows, filters, forms, selections, loading flags and modal state also stay in
 * the shell or panel that owns their lifetime. This store is not persisted: an
 * operator context must never survive sign-out or hydrate from browser storage.
 */
export const useStableAdminStore = create((set) => ({
  ...unknownOperatorContext(),

  applyOperatorContext: (payload, fallbackOperatorId = null) => {
    set((state) => readyOperatorContext(payload, fallbackOperatorId, state.sessionGeneration));
  },

  // Compatibility name for the bootstrap caller while the shell is extracted.
  hydrateOperatorContext: (payload, fallbackOperatorId = null) => {
    set((state) => readyOperatorContext(payload, fallbackOperatorId, state.sessionGeneration));
  },

  patchOperatorContext: (patch) => {
    set((state) => patchOperatorContext(state, patch));
  },

  resetOperatorContext: (fallbackOperatorId = null) => {
    set((state) => unknownOperatorContext(fallbackOperatorId, state.sessionGeneration + 1));
  },
}));

// Narrow selectors keep an unrelated policy refresh from repainting every
// code-split panel. Select actions too, rather than subscribing to the store.
export const selectContextStatus = (state) => state.contextStatus;
export const selectCurrentUser = (state) => state.currentUser;
export const selectOperatorId = (state) => state.operatorId;
export const selectOperatorRole = (state) => state.operatorRole;
export const selectOperatorPermissions = (state) => state.permissions;
export const selectOperatorPolicy = (state) => state.policy;
export const selectOperatorAloneRule = (state) => state.aloneRule;
export const selectPermissionsDegraded = (state) => state.permissionsDegraded;
export const selectSessionGeneration = (state) => state.sessionGeneration;
export const selectNavigationBadges = (state) => state.navigationBadges;
export const selectSocialSettings = (state) => state.socialSettings;
export const selectApplyOperatorContext = (state) => state.applyOperatorContext;
export const selectHydrateOperatorContext = (state) => state.hydrateOperatorContext;
export const selectPatchOperatorContext = (state) => state.patchOperatorContext;
export const selectResetOperatorContext = (state) => state.resetOperatorContext;

/** Logout/non-React integration seam. */
export function resetStableAdminStore(fallbackOperatorId = null) {
  useStableAdminStore.getState().resetOperatorContext(fallbackOperatorId);
}

export default useStableAdminStore;
