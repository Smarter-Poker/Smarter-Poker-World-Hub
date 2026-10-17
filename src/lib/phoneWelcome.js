/** Only a confirmed unverified account without a VIP card needs onboarding. */
export function shouldOfferPhoneWelcome(profile) {
    if (!profile || profile.phone_verified !== false) return false;
    if (profile.is_vip === true) return false;
    const tier = String(profile.vip_tier || '').trim().toLowerCase();
    return !tier || ['none', 'free'].includes(tier);
}
