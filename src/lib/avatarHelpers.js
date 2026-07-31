import { AVATAR_LIBRARY } from '../data/AVATAR_LIBRARY';

const VILLAIN_AVATAR_POOL = (() => {
    const seen = new Set();
    const pool = [];
    for (const entry of (AVATAR_LIBRARY || [])) {
        const src = entry && entry.image;
        if (!src || seen.has(src)) continue;
        seen.add(src);
        pool.push(src);
    }
    return pool;
})();

const HERO_DEFAULT_AVATAR = '/avatars/table/free_fox.png';

function hashHandKey(key) {
    const s = String(key == null ? '' : key);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

function seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function dealSeatAvatars(handKey, count, heroSrc) {
    const heroAvatar = heroSrc || HERO_DEFAULT_AVATAR;
    const pool = VILLAIN_AVATAR_POOL.filter(src => src !== heroAvatar);
    const rng = seededRandom(hashHandKey(handKey));
    
    // Fisher-Yates partial shuffle
    for (let i = 0; i < count - 1; i++) {
        const j = i + Math.floor(rng() * (pool.length - i));
        const temp = pool[i];
        pool[i] = pool[j];
        pool[j] = temp;
    }
    
    return [heroAvatar, ...pool.slice(0, count - 1)];
}
