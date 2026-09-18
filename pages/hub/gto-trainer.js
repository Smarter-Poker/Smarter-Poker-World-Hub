// Client-side permanent redirect — avoids getStaticProps prerender error on Vercel
import { useEffect } from 'react';
import { useRouter } from 'next/router';

import SEOHead from '../../src/components/seo/SEOHead';
/**
 * AEO phase 3 (2026-09-18): this redirect runs in the browser, so a crawler
 * that does not execute JavaScript is served a 200 with an empty body, no
 * title and no robots directive. Measured as OAI-SearchBot it returned zero
 * words. The redirect itself is staying as it is, for the reason given
 * above; what changes is that the page now names itself and asks not to be
 * indexed, so the empty response is not mistaken for the site's idea of a
 * page.
 */
function RedirectPageBody() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/hub/training');
    }, [router]);
    return null;
}

export default function RedirectPage() {
    return (
        <>
            <SEOHead
                title="GTO Trainer Has Moved"
                description="This Route Now Sends You To Smarter Poker GTO Training."
                canonical="/hub/gto-trainer"
                noindex
            />
            <RedirectPageBody />
        </>
    );
}
