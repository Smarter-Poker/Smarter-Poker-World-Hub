/**
 * /hub/poker-near-me → redirect to /hub/poker-near-me/lobby
 *
 * The root Poker Near Me path redirects to the cinematic lobby.
 * All feature sub-pages live under /hub/poker-near-me/[feature].
 *
 * SEO FIX: this used to be a client-side router.replace() inside useEffect, which
 * served an empty HTML document (no title, no meta description, no JSON-LD) to
 * crawlers and flashed a blank page for users. The hop is now a real 302 issued
 * before any HTML is sent. Query params are forwarded verbatim (e.g. ?pod=, ?q=,
 * ?sort=). permanent: false — the lobby is today's destination, but the canonical
 * entry URL stays ours to re-point later.
 */

export async function getServerSideProps({ query }) {
    const params = new URLSearchParams();
    Object.entries(query || {}).forEach(([key, value]) => {
        if (Array.isArray(value)) {
            value.forEach((v) => {
                if (v !== undefined && v !== null) params.append(key, String(v));
            });
        } else if (value !== undefined && value !== null) {
            params.append(key, String(value));
        }
    });
    const qs = params.toString();
    return {
        redirect: {
            destination: '/hub/poker-near-me/lobby' + (qs ? '?' + qs : ''),
            permanent: false,
        },
    };
}

// Never rendered — getServerSideProps always redirects. Kept because Next.js
// requires a default export on every file under pages/.
export default function PokerNearMeIndex() {
    return null;
}
