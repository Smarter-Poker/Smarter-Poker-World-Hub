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

export default function ComposeRedirect() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/hub/social-media');
    }, [router]);
    return null;
}

ComposeRedirect.getLayout = (page) => page;
