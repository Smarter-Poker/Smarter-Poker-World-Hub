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
    // Fallback loader: redirect to the SPA index.html if SSR path resolution fails.
    // Uses safe navigation instead of document.write() to avoid DOM XSS vectors.
    window.location.replace('/hub/club-arena/' + window.location.search + window.location.hash);
  </script>
</head>
<body><div id="root"><p style="color:#fff;text-align:center;padding:40px">Loading Club Arena...</p></div></body>
</html>`;

// MIME types for static assets served from public/hub/club-arena/
const MIME_TYPES = {
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.map': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.txt': 'text/plain',
    '.xml': 'application/xml',
};

export async function getServerSideProps({ req, res }) {
    // fs and path are server-only — require them inside getServerSideProps
    // so webpack doesn't try to bundle them for the client
    const fs = require('fs');
    const path = require('path');

    // ── Static Asset Detection ──────────────────────────────────────────
    // Vercel's filesystem routing sometimes doesn't serve static files from
    // public/ before the catch-all [[...slug]] page. This block detects
    // requests for static assets (by file extension) and serves them directly
    // from the public/ directory with correct MIME types and caching headers.
    const urlPath = (req.url || '').split('?')[0]; // strip query string
    const ext = path.extname(urlPath).toLowerCase();

    if (ext && MIME_TYPES[ext]) {
        // This is a static asset request — serve the file directly
        const relativePath = urlPath; // e.g. /hub/club-arena/assets/index-KYOW60ge.js
        const filePaths = [
            path.join(process.cwd(), 'public', relativePath),
            path.join(__dirname, '..', '..', '..', 'public', relativePath),
        ];

        for (const filePath of filePaths) {
            try {
                const fileBuffer = fs.readFileSync(filePath);
                res.setHeader('Content-Type', MIME_TYPES[ext]);
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.write(fileBuffer);
                res.end();
                return { props: {} };
            } catch {
                // Try next path
            }
        }

        // File not found — return 404 instead of SPA HTML
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain');
        res.write('Not Found');
        res.end();
        return { props: {} };
    }

    // ── SPA HTML Serving ────────────────────────────────────────────────
    // For non-asset requests (SPA routes), serve the Vite SPA index.html
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
    res.setHeader('Cache-Control', 'public, s-maxage=0, must-revalidate');
    res.write(spaHtml);
    res.end();
    return { props: {} };
}
