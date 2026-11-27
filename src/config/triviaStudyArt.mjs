/**
 * Bespoke #SMARTERDESIGN artwork for /hub/trivia/study (Study Your Misses).
 * Stored independently from src/config/triviaIntroArt.mjs so the locked
 * Phase 4/8/10 intro-v1/v2/v3 provenance registries remain untouched.
 */
const crop = (width, height, avif, webp, src) => Object.freeze({ width, height, avif, webp, src });

export const TRIVIA_STUDY_ART = Object.freeze({
    key: 'study',
    preview:
        'data:image/webp;base64,UklGRpoAAABXRUJQVlA4II4AAACQBACdASogABQAPrlMnUqnJCKhsAwA4BcJYgCw7CHf5lG6ujrZv1WXh98PlkAA/vkTJJ0hrU2CL+As4hglZwd6L3k2/smqAk5dVMzInFteA36egs8n9x+mMpVdYDxPY7UmHjRiLbvTSpzqvDP6Zn/92vd0r9VOwcIv/bqMzvgoBhwl0EE3IEbEgLO6kAAA',
    mobile: crop(
        1440,
        900,
        '/images/trivia/study-v1/study-mobile-640.89cfd8c6a6.avif 640w, /images/trivia/study-v1/study-mobile-960.db009839a5.avif 960w, /images/trivia/study-v1/study-mobile-1440.a6724d5fc3.avif 1440w',
        '/images/trivia/study-v1/study-mobile-640.e95197d044.webp 640w, /images/trivia/study-v1/study-mobile-960.a52361258a.webp 960w, /images/trivia/study-v1/study-mobile-1440.a4a39c5b8a.webp 1440w',
        '/images/trivia/study-v1/study-mobile-960.a52361258a.webp',
    ),
    wide: crop(
        1440,
        600,
        '/images/trivia/study-v1/study-wide-640.a44c478a97.avif 640w, /images/trivia/study-v1/study-wide-960.1244cb7973.avif 960w, /images/trivia/study-v1/study-wide-1440.7d30109399.avif 1440w',
        '/images/trivia/study-v1/study-wide-640.830c81d58d.webp 640w, /images/trivia/study-v1/study-wide-960.cbda7983e8.webp 960w, /images/trivia/study-v1/study-wide-1440.216904cfa0.webp 1440w',
        '/images/trivia/study-v1/study-wide-960.cbda7983e8.webp',
    ),
});
