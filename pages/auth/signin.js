/* ═══════════════════════════════════════════════════════════════════════════
   /auth/signin → /auth/login SAFETY-NET REDIRECT
   ─────────────────────────────────────────────────────────────────────────
   pages/auth/login.js has warned since Vanguard Silver that "a redirect
   exists at pages/auth/signin.js as a safety net" — but the file did not
   actually exist, so any link, bookmark, email, or agent that guessed
   /auth/signin got a 404 instead of the sign-in page. This file makes the
   comment true. It preserves the query string (?redirect=, ?provider=)
   so deep-links keep working through the bounce.

   Canonical sign-in page: /auth/login (do NOT move it here).
   ═══════════════════════════════════════════════════════════════════════════ */

export async function getServerSideProps({ query }) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query || {})) {
        if (typeof v === 'string') params.append(k, v);
        else if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
    }
    const qs = params.toString();
    return {
        redirect: {
            destination: `/auth/login${qs ? `?${qs}` : ''}`,
            permanent: false,
        },
    };
}

// Never rendered — getServerSideProps always redirects. Kept minimal so the
// page adds nothing to the client bundle beyond the route itself.
export default function SignInRedirect() {
    return null;
}
