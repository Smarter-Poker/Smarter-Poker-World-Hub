const fs = require('fs');
const p = 'src/components/poker-near-me/VenueCard.js';
let c = fs.readFileSync(p, 'utf8');

if (!c.includes('// New: Fetch follow status on mount')) {
  c = c.replace(/    const cardRef = useRef\(null\);/, `    const cardRef = useRef(null);

    // New: Fetch follow status on mount for home games
    useEffect(() => {
        let mounted = true;
        const checkFollowState = async () => {
            if (venue && venue.venue_type === 'home_game' && venue.host_social_page_slug) {
                try {
                    const token = getAccessToken();
                    if (!token) return;
                    const res = await fetch('/api/social/pages/follow?slug=' + venue.host_social_page_slug, {
                        headers: { Authorization: \`Bearer \$\{token\}\` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (mounted && data.is_following) setIsFollowing(true);
                    }
                } catch { }
            }
        };
        checkFollowState();
        return () => { mounted = false; };
    }, [venue]);`);
}

if (!c.includes('isNewcomer &&')) {
  c = c.replace(/\{hasPromo && <span className="vc3-badge vc3-badge-promo">Active Promo<\/span>\}/, `$&
                {isNewcomer && <span className="vc3-badge vc3-badge-new" style={{color:'#fff', background:'#6366f1', borderColor:'#4f46e5'}}>New Addition</span>}`);
}

fs.writeFileSync(p, c);
