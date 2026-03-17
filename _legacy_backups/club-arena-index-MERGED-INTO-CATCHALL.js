/* ═══════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Iframe Embed (Canonical SPA)
   ═══════════════════════════════════════════════════════════════════════════
   Loads the Club Arena SPA from Vercel. The SPA is the single source of
   truth for all Club Arena functionality. No duplicate rendering.
   ═══════════════════════════════════════════════════════════════════════════ */

import SEOHead from '../../src/components/seo/SEOHead';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import ClubArenaEmbed from '../../src/components/club-arena/ClubArenaEmbed';

export default function ClubArenaPage() {
    return (
        <>
            <SEOHead
                title="Club Arena — Private Online Poker Clubs | Smarter.Poker"
                description="Create or join private poker clubs. Play NLH, PLO, tournaments and more with friends."
            />
            <UniversalHeader />
            <ClubArenaEmbed spaRoute="" />
        </>
    );
}
