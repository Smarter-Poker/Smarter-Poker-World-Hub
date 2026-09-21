/**
 * /hub/social-media/compose — REDIRECT TO INLINE COMPOSER
 *
 * The previous multi-screen FB-style compose flow (AlbumPicker → EditPostScreen
 * → CoverFramePicker, backed by a Zustand composeStore) was retired on
 * 2026-05-03 because its router-handoff + store-sync race introduced upload
 * regressions on iPhone. The proven inline composer in SharedPostCreator on
 * /hub/social-media handles photo + video uploads end-to-end.
 *
 * This page is kept around purely to redirect anyone who bookmarked /compose
 * back to the main feed (where the inline composer lives) instead of 404'ing.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/router';

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
function ComposeRedirectBody() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/hub/social-media');
    }, [router]);
    return null;
}

// ITEM 36 (2026-09-08): `ComposeRedirect.getLayout = (page) => page;` used to
// be here. pages/_app.js has no getLayout support at all, so it did nothing -
// the stub still rendered the header and footer for the instant it existed.
// Left as a plain page; the footer's Create control no longer routes here.

export default function ComposeRedirect() {
    return (
        <>
            <SEOHead
                title="Compose Has Moved"
                description="This Route Now Sends You To The Social Media Feed, Where The Composer Lives."
                canonical="/hub/social-media/compose"
                noindex
            />
            <ComposeRedirectBody />
        </>
    );
}
