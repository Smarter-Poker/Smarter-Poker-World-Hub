/**
 * The phone verification welcome offer, as every upgrade prompt shows it.
 * Pure: shared by the status route, the client hook, the prompt step and
 * the tests. The reward is paid by pages/api/sms/verify-otp.js; these
 * figures must match what that route pays (pinned by
 * __tests__/vip-phone-offer-first.test.mjs).
 */

export const PHONE_WELCOME_VIP_DAYS = 30;
export const PHONE_WELCOME_DIAMONDS = 500;
export const PHONE_VERIFY_PATH = '/hub/verify-phone';

/** Session key: the member tapped Skip on the phone step this session. */
export const PHONE_OFFER_SKIP_KEY = 'sp_phone_offer_skipped';

const NOT_ELIGIBLE = Object.freeze({ eligible: false, reason: null, vipDays: 0, diamonds: 0 });

/**
 * Read `phoneOffer` from the membership status route. Only an explicit
 * `eligible: true` from a successful response is eligible; anything else
 * (an error, an older route without the field, a malformed body) is not,
 * so the existing prompt shows and nothing stands in front of a purchase.
 */
export function parsePhoneWelcomeOffer(ok, body) {
  const offer = body?.phoneOffer;
  if (ok !== true || body?.success !== true || !offer || offer.eligible !== true) {
    const reason = typeof offer?.reason === 'string' ? offer.reason : null;
    return { ...NOT_ELIGIBLE, reason };
  }
  const vipDays = Number.isInteger(offer.vipDays) && offer.vipDays > 0 ? offer.vipDays : PHONE_WELCOME_VIP_DAYS;
  const diamonds = Number.isInteger(offer.diamonds) && offer.diamonds > 0 ? offer.diamonds : 0;
  return { eligible: true, reason: null, vipDays, diamonds };
}

/**
 * A safe same-origin hub path to come back to after verifying, or null.
 * Never an absolute URL, never a protocol-relative one, no dot segments.
 */
export function safeHubReturnPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/hub') || path.startsWith('//')) return null;
  if (path !== '/hub' && !/^\/hub[/?#]/.test(path)) return null;
  if (/[\u0000- \u007f\\]/.test(path)) return null;
  if (/(^|\/)(\.|%2e){2}(\/|\?|#|$)/i.test(path)) return null;
  if (path.startsWith(PHONE_VERIFY_PATH)) return null;
  try {
    const url = new URL(path, 'https://same.origin.invalid');
    if (url.origin !== 'https://same.origin.invalid') return null;
  } catch {
    return null;
  }
  return path;
}

/** Where "Verify Phone Number" goes: the verification page, then back here. */
export function phoneVerifyHref(returnPath) {
  const back = safeHubReturnPath(returnPath);
  return back ? `${PHONE_VERIFY_PATH}?next=${encodeURIComponent(back)}` : PHONE_VERIFY_PATH;
}

/** The prompt step's words for one eligible answer. */
export function phoneOfferCopy({ vipDays = PHONE_WELCOME_VIP_DAYS, diamonds = 0 } = {}) {
  const month = vipDays === 30 ? 'First Month' : `${vipDays} Days`;
  const bonus = diamonds > 0 ? `+${diamonds.toLocaleString('en-US')} Diamonds` : null;
  return {
    tag: 'Phone Verification Reward',
    title: 'Claim Your Free VIP Month',
    copy: bonus
      ? `Verify Your Phone Number To Unlock VIP Free For Your ${month} And Get ${diamonds.toLocaleString('en-US')} Diamonds.`
      : `Verify Your Phone Number To Unlock VIP Free For Your ${month}.`,
    amount: 'Free',
    unit: month,
    bonus,
    note: 'No Card Needed. Takes Under A Minute.',
    cta: 'Verify Phone Number',
    skip: 'Skip',
    skipSub: 'See VIP Plans',
  };
}

export function readPhoneOfferSkipped(storage, accountId) {
  if (!storage || !accountId) return false;
  try { return storage.getItem(`${PHONE_OFFER_SKIP_KEY}:${accountId}`) === '1'; } catch { return false; }
}

export function rememberPhoneOfferSkipped(storage, accountId) {
  if (!storage || !accountId) return;
  try { storage.setItem(`${PHONE_OFFER_SKIP_KEY}:${accountId}`, '1'); } catch { /* storage unavailable */ }
}

/**
 * The decision, pure. Mirrors pages/api/sms/verify-otp.js exactly:
 *   - the reward is paid on the FIRST verification only (phone_verified false)
 *   - never to a lifetime card, never while a VIP term is still running
 *     (verify-otp would not extend a longer term; an active VIP meets no gate)
 *   - never to a temporary email domain (verify-otp withholds the package)
 *   - the 500 welcome diamonds only when the account was not already paid
 * `paid` is welcomePackageAlreadyPaid's answer; reason 'unknown' fails closed.
 */
export function decidePhoneWelcomeOffer({ profile, email, disposable, paid, now = new Date() } = {}) {
  if (!profile || typeof profile !== 'object') return { eligible: false, reason: 'unknown' };
  if (profile.phone_verified === true) return { eligible: false, reason: 'already_verified' };
  if (profile.phone_verified !== false) return { eligible: false, reason: 'unknown' };
  if (profile.vip_tier === 'lifetime') return { eligible: false, reason: 'lifetime' };
  const expires = profile.vip_expires_at ? Date.parse(profile.vip_expires_at) : NaN;
  if (profile.is_vip === true && Number.isFinite(expires) && expires > now.getTime()) {
    return { eligible: false, reason: 'vip_active' };
  }
  if (typeof email !== 'string' || !email) return { eligible: false, reason: 'unknown' };
  if (disposable === true) return { eligible: false, reason: 'disposable_email' };
  if (disposable !== false) return { eligible: false, reason: 'unknown' };
  if (!paid || typeof paid !== 'object' || paid.reason === 'unknown') return { eligible: false, reason: 'unknown' };
  return {
    eligible: true,
    reason: null,
    vipDays: PHONE_WELCOME_VIP_DAYS,
    diamonds: paid.paid ? 0 : PHONE_WELCOME_DIAMONDS,
  };
}
