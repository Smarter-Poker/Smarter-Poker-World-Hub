/* ═══════════════════════════════════════════════════════════════════════════
   Club Arena Index — Serves the Club Arena SPA at /hub/club-arena
   ═══════════════════════════════════════════════════════════════════════════

   This page exists to prevent the dynamic [orbId].js route from catching
   /hub/club-arena and showing a generic placeholder. Instead, this serves
   the Club Arena SPA's index.html from public/hub/club-arena/.

   The SPA boots React, initializes auth via shared localStorage, and
   React Router handles all client-side navigation from here.
   ═══════════════════════════════════════════════════════════════════════════ */

export default function ClubArenaIndex() {
    // This component is never rendered — getServerSideProps redirects to the
    // static index.html in public/hub/club-arena/ which boots the SPA.
    return null;
}

export async function getServerSideProps({ res }) {
    // Serve the Club Arena SPA's index.html directly
    // The file lives in public/hub/club-arena/index.html
    const fs = await import('fs');
    const path = await import('path');

    const htmlPath = path.join(process.cwd(), 'public', 'hub', 'club-arena', 'index.html');

    try {
        const html = fs.readFileSync(htmlPath, 'utf-8');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        res.write(html);
        res.end();
    } catch (err) {
        // Fallback: redirect to /hub/club-arena/ (trailing slash triggers public/ file serving)
        return {
            redirect: {
                destination: '/hub/club-arena/',
                permanent: false,
            },
        };
    }

    return { props: {} };
}
