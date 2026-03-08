/* ═══════════════════════════════════════════════════════════════════════════
   GEEVES — Role Personalization
   Maps user roles → category score boosts so Geeves surfaces the most
   relevant answers first without the user needing to specify context.
   
   Examples:
     → A dealer asks "how do I track earnings?" →
       Toke Tracker answers boosted by +20, floats to top
     → A club owner asks "how do I add players?" →
       Club Arena — Admin answers boosted, not generic profile-settings answer
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Role → KB Category boost map ──────────────────────────────────────────
// Each role lists the categories that should get a +20 score boost.
// Categories match the strings used in the KB entry `category` field.
export const ROLE_CATEGORY_BOOSTS = {
    // Dealers: care about tip tracking and live game management
    dealer: ['Toke Tracker', 'Club Commander', 'Club Commander — Tournament'],

    // Tournament directors: care about Commander + Club Arena tournament tools
    tournament_director: ['Club Commander', 'Club Arena — Union', 'Club Arena — Admin'],

    // Club owners/admins: care about Club Arena admin, union management, agents
    club_owner: ['Club Arena — Admin', 'Club Arena — Agent', 'Club Arena — Union', 'Club Arena'],

    // VIP/Diamond members: care about premium features, diamond economy, VIP tiers
    vip: ['Diamond Economy', 'World Hub', 'VIP'],

    // Standard player: care about strategy, bankroll, poker tools
    player: ['Poker Strategy', 'Bankroll Manager', 'Poker Near Me', 'World Hub'],

    // Content admins (Horses page users)
    admin: ['Club Arena — Admin', 'Club Arena — Union'],
    superadmin: ['Club Arena — Admin', 'Club Arena — Union'],

    // Default: no boost
    default: [],
};

/**
 * getRoleBoosts(userRole, isVIP)
 * Returns an array of category strings that should receive a +20 score boost.
 *
 * @param {string|null} userRole — e.g. 'dealer', 'club_owner', 'player', 'admin'
 * @param {boolean}     isVIP   — true if user has active VIP/Diamond status
 * @returns {string[]} — list of category strings to boost
 */
export function getRoleBoosts(userRole, isVIP = false) {
    const boosts = new Set();

    // Add role-based boosts
    const roleKey = (userRole || 'default').toLowerCase();
    const roleBoosts = ROLE_CATEGORY_BOOSTS[roleKey] || ROLE_CATEGORY_BOOSTS.default;
    roleBoosts.forEach(c => boosts.add(c));

    // VIP users also get diamond economy boosts on top of their role boosts
    if (isVIP) {
        (ROLE_CATEGORY_BOOSTS.vip || []).forEach(c => boosts.add(c));
    }

    return Array.from(boosts);
}

/**
 * extractRoleFromToken(authToken)
 * Fast client-side role extraction from a JWT access token stored in localStorage.
 * Does NOT verify the signature — only used for UI bias, not auth decisions.
 *
 * @param {string|null} authToken
 * @returns {{ role: string|null, isVIP: boolean }}
 */
export function extractRoleFromToken(authToken) {
    if (!authToken) return { role: null, isVIP: false };
    try {
        const payload = authToken.split('.')[1];
        if (!payload) return { role: null, isVIP: false };
        const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
        // Supabase stores app_metadata in the token
        const role = decoded?.user_metadata?.role
            || decoded?.app_metadata?.role
            || decoded?.role
            || null;
        const isVIP = Boolean(
            decoded?.user_metadata?.vip_status ||
            decoded?.user_metadata?.isVIP ||
            decoded?.app_metadata?.vip_status
        );
        return { role, isVIP };
    } catch {
        return { role: null, isVIP: false };
    }
}
