/**
 * Short Welcome-Back Redirect - /go/welcome-back
 *
 * Gives 3-week inactive reactivation SMS links a compact 1-segment URL
 * (`https://smarter.poker/go/welcome-back`) that mints a fresh HMAC-SHA256
 * signed Welcome-Back token (`wb`) and redirects straight to
 * `/promo/welcome-back?wb=...` where the player accepts the offer.
 */
import { buildWelcomeBackOfferUrl } from '../../src/lib/promoCampaigns/welcomeBackOffer.mjs';
import { appendNewsletterUtm } from '../../src/lib/newsletter/utmAttribution.mjs';

export async function getServerSideProps({ res, query }) {
    res.setHeader('Cache-Control', 'private, no-store');
    const destination = buildWelcomeBackOfferUrl('https://smarter.poker/promo/welcome-back', {
        siteUrl: 'https://smarter.poker',
    });
    const tagged = appendNewsletterUtm(destination, {
        source: query?.utm_source || 'welcome_back_sms',
        medium: query?.utm_medium || 'sms',
        campaign: query?.utm_campaign || 'welcome_back_21d',
    });
    const parsed = new URL(tagged);
    return {
        redirect: {
            destination: `${parsed.pathname}${parsed.search}`,
            permanent: false,
        },
    };
}

export default function GoWelcomeBackPage() {
    return null;
}
