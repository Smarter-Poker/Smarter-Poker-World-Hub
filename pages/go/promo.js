/**
 * Short Promotional Landing Redirect — /go/promo
 *
 * Gives SMS and marketing links a clean, single-segment URL
 * (`https://smarter.poker/go/promo`) that mints a fresh HMAC-SHA256 signed
 * promotional token (`pt`) and redirects straight to `/auth/signup` with
 * KINGS CLUB (`25450`) pre-queued for `/hub/verify-phone`.
 */
import { buildPromoSignupUrl } from '../../src/lib/promoCampaigns/promoSignupToken.mjs';
import { appendNewsletterUtm } from '../../src/lib/newsletter/utmAttribution.mjs';

export async function getServerSideProps({ res, query }) {
    res.setHeader('Cache-Control', 'private, no-store');
    const destination = buildPromoSignupUrl('https://smarter.poker/auth/signup', {
        siteUrl: 'https://smarter.poker',
    });
    const tagged = appendNewsletterUtm(destination, {
        source: query?.utm_source || 'promo_sms',
        medium: query?.utm_medium || 'sms',
        campaign: query?.utm_campaign || 'kings_club_25_chips',
    });
    const parsed = new URL(tagged);
    return {
        redirect: {
            destination: `${parsed.pathname}${parsed.search}`,
            permanent: false,
        },
    };
}

export default function GoPromoPage() {
    return null;
}
