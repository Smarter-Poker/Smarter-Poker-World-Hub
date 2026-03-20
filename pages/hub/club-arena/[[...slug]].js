/* ═══════════════════════════════════════════════════════════════════════════
   Club Arena SPA Catch-All — Serves the Vite SPA at ALL /hub/club-arena/* routes
   ═══════════════════════════════════════════════════════════════════════════
   
   This catch-all page ensures that EVERY route under /hub/club-arena/ loads
   the Vite SPA's index.html, allowing React Router (with basename="/hub/club-arena")
   to handle all routing client-side.
   
   WITHOUT this catch-all, each sub-page (cashier, admin, tournaments, etc.)
   would need its own Next.js page file, causing a FULL PAGE RELOAD on every
   navigation between pages. This catch-all eliminates that problem entirely.
   
   How it works:
   1. getServerSideProps reads the pre-built SPA HTML from public/hub/club-arena/index.html
   2. Streams it directly to the browser (bypassing Next.js rendering)
   3. The SPA boots, React Router reads the URL, renders the correct page
   4. All subsequent navigation is instant SPA transitions (no page reloads)
   
   NOTE: This file replaces all previous standalone page files (cashier.js,
   admin.js, tournaments.js, etc.) which were individual Next.js pages that
   caused full page reloads on every navigation.
   ═══════════════════════════════════════════════════════════════════════════ */

export default function ClubArenaCatchAll() {
    return null;
}

const FALLBACK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Club Arena | Smarter.Poker</title>
  <script>
    // Dynamic loader: fetch the real index.html from public/ and replace this page
    fetch('/hub/club-arena/index.html')
      .then(r => r.text())
      .then(html => { document.open(); document.write(html); document.close(); })
      .catch(() => { document.body.innerHTML = '<p>Loading Club Arena...</p>'; window.location.reload(); });
  </script>
</head>
<body><div id="root"><p style="color:#fff;text-align:center;padding:40px">Loading Club Arena...</p></div></body>
</html>`;

export async function getServerSideProps({ res }) {
    // fs and path are server-only — require them inside getServerSideProps
    // so webpack doesn't try to bundle them for the client
    const fs = require('fs');
    const path = require('path');

    let spaHtml = '';
    try {
        const vercelPath = path.join(process.cwd(), 'public', 'hub', 'club-arena', 'index.html');
        spaHtml = fs.readFileSync(vercelPath, 'utf-8');
    } catch {
        try {
            const relativePath = path.join(__dirname, '..', '..', '..', 'public', 'hub', 'club-arena', 'index.html');
            spaHtml = fs.readFileSync(relativePath, 'utf-8');
        } catch {
            spaHtml = FALLBACK_HTML;
        }
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    res.write(spaHtml);
    res.end();
    return { props: {} };
}
