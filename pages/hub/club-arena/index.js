/* ═══════════════════════════════════════════════════════════════════════════
   Club Arena Index — Serves the Club Arena SPA at /hub/club-arena
   ═══════════════════════════════════════════════════════════════════════════
   This page prevents the dynamic [orbId].js route from catching /hub/club-arena.
   It reads public/hub/club-arena/index.html and streams it directly.
   NO redirects. NO hardcoded hashes. Reads the actual built SPA HTML.
   ═══════════════════════════════════════════════════════════════════════════ */

import fs from 'fs';
import path from 'path';

// Read the SPA HTML at module load time (happens once per cold start)
// On Vercel, process.cwd() points to the project root during build,
// and public/ files are available at runtime in the output.
let spaHtml = '';
try {
    // Try Vercel's runtime path first
    const vercelPath = path.join(process.cwd(), 'public', 'hub', 'club-arena', 'index.html');
    spaHtml = fs.readFileSync(vercelPath, 'utf-8');
} catch {
    try {
        // Fallback: try relative to the page file
        const relativePath = path.join(__dirname, '..', '..', '..', 'public', 'hub', 'club-arena', 'index.html');
        spaHtml = fs.readFileSync(relativePath, 'utf-8');
    } catch {
        // Last resort: minimal bootstrap that loads the SPA assets dynamically
        spaHtml = `<!DOCTYPE html>
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
    }
}

export default function ClubArenaIndex() {
    return null;
}

export async function getServerSideProps({ res }) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    res.write(spaHtml);
    res.end();
    return { props: {} };
}
