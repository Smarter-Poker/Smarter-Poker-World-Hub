import { isDisposableEmail } from '../antiAbuse';
import { welcomePackageAlreadyPaid } from '../welcomePackage';
import { decidePhoneWelcomeOffer } from './phoneWelcomeOfferTerms.mjs';

/**
 * THE PHONE WELCOME OFFER, AS AN UPGRADE PROMPT SEES IT (Dan, 2026-11-27).
 *
 * "If a user hasn't already verified their phone number and received their
 * 1st month free and 500 diamonds, they should do that now ... they should be
 * prompted to do that first, or skip and sign up."
 *
 * The reward itself is paid by pages/api/sms/verify-otp.js on the first
 * verification of an account. decidePhoneWelcomeOffer mirrors exactly what
 * that route pays, so a prompt never promises something it will not pay.
 *
 *   { eligible: true,  reason: null, vipDays: 30, diamonds: 500 | 0 }
 *   { eligible: false, reason: 'already_verified' | 'vip_active' | 'lifetime'
 *                             | 'disposable_email' | 'unknown' }
 *
 * FAIL CLOSED. Anything that cannot be read answers `eligible: false` with
 * reason 'unknown': the member then sees the existing prompt, so an error
 * never stands between a member and a purchase.
 */
export async function resolvePhoneWelcomeOffer(supabase, user, profile, { now = new Date() } = {}) {
  try {
    if (!supabase || !user?.id) return { eligible: false, reason: 'unknown' };
    const facts = { profile, email: user.email, disposable: isDisposableEmail(user.email || ''), now };
    // Read the welcome ledger only for an account that could still be eligible.
    const withoutLedger = decidePhoneWelcomeOffer({ ...facts, paid: { paid: true } });
    if (!withoutLedger.eligible) return withoutLedger;
    const paid = await welcomePackageAlreadyPaid(supabase, user.id, profile.created_at);
    return decidePhoneWelcomeOffer({ ...facts, paid });
  } catch (_error) {
    return { eligible: false, reason: 'unknown' };
  }
}
