const fs = require('fs');
const p = 'src/components/poker-near-me/VenueCard.js';
let c = fs.readFileSync(p, 'utf8');

if (!c.includes("import { eventBus } ")) {
  c = c.replace(/import \{ getAccessToken \} from '\.\.\/\.\.\/lib\/authUtils';/, "import { getAccessToken } from '../../lib/authUtils';\nimport { eventBus } from '../../engine/EventBus';");
}

if (!c.includes("eventBus.on('page:follow'")) {
  c = c.replace(/        checkFollowState\(\);\n        return \(\) => \{ mounted = false; \};/m, `        checkFollowState();
        
        const unsub = eventBus.on('page:follow', (e) => {
            if (e.payload && e.payload.slug === venue.host_social_page_slug) {
                if (mounted) setIsFollowing(true);
            }
        });
        
        return () => { 
            mounted = false; 
            unsub();
        };`);
}

if (!c.includes("eventBus.emit('page:follow'")) {
  c = c.replace(/            if \(res\.ok\) setIsFollowing\(true\);/, `            if (res.ok) {
                setIsFollowing(true);
                try { eventBus.emit('page:follow', { slug: venue.host_social_page_slug }, 'VenueCard'); } catch {}
            }`);
}

fs.writeFileSync(p, c);
