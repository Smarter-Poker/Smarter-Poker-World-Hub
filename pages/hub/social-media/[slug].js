/**
 * Social Media Slug Redirect
 * Handles: /hub/social-media/[slug] → /hub/social-pages/[slug]
 * Allows users to use the shorter smarter.poker/hub/social-media/CLUBJAQK format
 */
import { useRouter } from 'next/router';
import { useEffect } from 'react';

import SEOHead from '../../../src/components/seo/SEOHead';
/**
 * AEO phase 3 (2026-09-18): this redirect runs in the browser, so a crawler
 * that does not execute JavaScript is served a 200 with an empty body, no
 * title and no robots directive. Measured as OAI-SearchBot it returned zero
 * words. The redirect itself is staying as it is, for the reason given
 * above; what changes is that the page now names itself and asks not to be
 * indexed, so the empty response is not mistaken for the site's idea of a
 * page.
 */
function SocialMediaSlugRedirectBody() {
    const router = useRouter();
    const { slug } = router.query;

    useEffect(() => {
        if (!router.isReady || !slug) return;
        // Redirect to the canonical social-pages route
        router.replace(`/hub/social-pages/${slug}`);
    }, [router.isReady, slug, router]);

    return (
        <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#F0F2F5', fontFamily: "var(--font-inter), -apple-system, sans-serif",
        }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{
                    width: 32, height: 32, border: '3px solid #E4E6EB',
                    borderTopColor: '#1877F2', borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
                }} />
                <p style={{ color: '#65676B', fontSize: 14 }}>Redirecting...</p>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

export default function SocialMediaSlugRedirect() {
    return (
        <>
            <SEOHead
                title="Opening This Page"
                description="This Route Sends You To The Same Page Under Community Pages."
                canonical="/hub/social-media"
                noindex
            />
            <SocialMediaSlugRedirectBody />
        </>
    );
}
