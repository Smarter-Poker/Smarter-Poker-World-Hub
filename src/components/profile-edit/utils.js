export function getProfileJwt() {
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    try {
        const authStr = localStorage.getItem('smarter-poker-auth');
        if (authStr) {
            const parsed = JSON.parse(authStr);
            if (parsed?.access_token) return parsed.access_token;
        }
    } catch { /* fallback */ }
    return supabaseKey;
}
export function getDaysInMonth(month, year) {
    if (!month) return 31;
    const m = parseInt(month, 10);
    const y = year ? parseInt(year, 10) : 2000; // default to leap year if no year
    if ([4, 6, 9, 11].includes(m)) return 30;
    if (m === 2) return (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28;
    return 31;
}
export function stripSocialHandle(value, platform) {
    if (!value) return '';
    let v = value.trim();
    // Strip common URL prefixes
    const patterns = {
        twitter: [/^https?:\/\/(www\.)?(twitter|x)\.com\//i],
        instagram: [/^https?:\/\/(www\.)?instagram\.com\//i],
        tiktok: [/^https?:\/\/(www\.)?tiktok\.com\/@?/i],
        telegram: [/^https?:\/\/(www\.)?(t\.me|telegram\.me)\//i],
    };
    const plats = patterns[platform] || [];
    for (const p of plats) v = v.replace(p, '');
    // Strip leading @
    v = v.replace(/^@/, '');
    // Strip trailing slashes
    v = v.replace(/\/+$/, '');
    return v;
}
export function calcProfileCompletion(profile) {
    const fields = [
        { key: 'first_name', weight: 1 },
        { key: 'last_name', weight: 1 },
        { key: 'username', weight: 1.5 },
        { key: 'bio', weight: 1.5 },
        { key: 'avatar_url', weight: 2 },
        { key: 'cover_photo_url', weight: 1 },
        { key: 'city', weight: 0.5 },
        { key: 'state', weight: 0.5 },
        { key: 'country', weight: 0.5 },
        { key: 'favorite_game', weight: 1 },
        { key: 'birthday', weight: 1 },
        { key: 'home_casino', weight: 1 },
    ];
    const total = fields.reduce((s, f) => s + f.weight, 0);
    const filled = fields.reduce((s, f) => {
        const v = profile[f.key];
        return s + (v && String(v).trim().length > 0 ? f.weight : 0);
    }, 0);
    return Math.round((filled / total) * 100);
}
export async function compressImage(file, maxWidth = 1200, quality = 0.85) {
    return new Promise((resolve) => {
        // Skip non-image files or very small files
        if (!file.type.startsWith('image/') || file.size < 50000) {
            resolve(file);
            return;
        }
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            // Skip if already small enough
            if (img.width <= maxWidth && file.size < 200000) {
                resolve(file);
                return;
            }
            const canvas = document.createElement('canvas');
            const ratio = Math.min(maxWidth / img.width, 1);
            canvas.width = Math.round(img.width * ratio);
            canvas.height = Math.round(img.height * ratio);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
                if (!blob) { resolve(file); return; }
                const compressed = new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() });
                console.warn(`[Compress] ${(file.size/1024).toFixed(0)}KB → ${(compressed.size/1024).toFixed(0)}KB (${Math.round((1-compressed.size/file.size)*100)}% reduction)`);
                resolve(compressed);
            }, 'image/jpeg', quality);
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
    });
}
