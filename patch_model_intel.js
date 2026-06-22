const fs = require('fs');
let content = fs.readFileSync('pages/hub/MLB-ANALYTICS/model-intel.tsx', 'utf-8');

// Fix startCum NaN crash
content = content.replace(
  "    const startCum = sliced[0].cum_pnl - sliced[0].pnl;",
  "    const startCum = sliced[0] ? (Number(sliced[0].cum_pnl || 0) - Number(sliced[0].pnl || 0)) : 0;"
);

// Update SEO Year 2026 -> 2025? Oh wait, what is the hardcoded SEO year? Let's check:
content = content.replace(/2026/g, (match, offset, str) => {
    // Only replace if it looks like an SEO title/description year, but since it says "Update hardcoded SEO 2026", 
    // it probably means we should use a dynamic year or 2026 is correct for the game year?
    // Let's just fix the startCum first and see.
    return match;
});

// Actually, I'll do it manually with regex.
content = content.replace(
  "content=\"MLB Betting Model Intelligence — 2026 Calibration & Edge Tracking | Smarter.Poker\"",
  "content=\"MLB Betting Model Intelligence — Calibration & Edge Tracking | Smarter.Poker\""
);
content = content.replace(
  "title=\"MLB Betting Model Intelligence — 2026 Calibration & Edge Tracking | Smarter.Poker\"",
  "title=\"MLB Betting Model Intelligence — Calibration & Edge Tracking | Smarter.Poker\""
);

fs.writeFileSync('pages/hub/MLB-ANALYTICS/model-intel.tsx', content);

