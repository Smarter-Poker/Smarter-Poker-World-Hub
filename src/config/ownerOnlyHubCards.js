/* ═══════════════════════════════════════════════════════════════════════════
   OWNER-ONLY WORLD HUB CARDS (Dan, 2026-10-11; Training unhidden 2026-11-09)

   Club Commander, Personal Assistant, and Trivia remain hidden from the
   World Hub carousel and the Customize My Hub list for every account except
   Dan's. Training Games are public for all accounts.
   This hides the CARDS only; it does not lock the pages behind them.

   To bring a card back for everyone, delete its id from
   OWNER_ONLY_HUB_CARD_IDS. To lift the whole restriction, empty the list.
   ═══════════════════════════════════════════════════════════════════════════ */

export const OWNER_ONLY_HUB_CARD_IDS = Object.freeze([
    'club-commander',
    'personal-assistant',
    'trivia',
]);

// Dan's accounts. daniel@bekavactrading.com is the platform owner id used
// elsewhere (OWNER_OPERATIONAL_ID); danbek4545@gmail.com is his other login.
export const HUB_CARD_OWNER_USER_IDS = Object.freeze([
    '47965354-0e56-43ef-931c-ddaab82af765',
    '3bb71bfe-f723-427c-aac7-a853ba04a014',
]);

export function isHubCardOwner(userId) {
    return typeof userId === 'string' && HUB_CARD_OWNER_USER_IDS.includes(userId);
}

/** Card ids this user must not see. Empty for the owner. */
export function getOwnerOnlyHiddenCardIds(userId) {
    return isHubCardOwner(userId) ? [] : [...OWNER_ONLY_HUB_CARD_IDS];
}
