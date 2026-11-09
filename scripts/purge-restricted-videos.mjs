/**
 * LOCAL: Purge age-restricted YouTube videos from social_posts
 * 
 * Run: node scripts/purge-restricted-videos.mjs
 * Add --confirm to actually delete (default: dry-run)
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Load env files in priority order (later files don't overwrite earlier ones)
config({ path: resolve(__dirname, '../.env.local') });
config({ path: resolve(__dirname, '../.env.production.local') });
config({ path: resolve(__dirname, '../.env.vercel.local') });
config({ path: resolve(__dirname, '../.env.production') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
}

const dryRun = !process.argv.includes('--confirm');

// Direct REST API calls to Supabase (no SDK needed)
async function supabaseQuery(table, params = {}) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    
    const res = await fetch(url.toString(), {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
        },
    });
    
    if (!res.ok) throw new Error(`Supabase ${table} query failed: ${res.status}`);
    return res.json();
}

async function supabaseDelete(table, id) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`;
    const res = await fetch(url, {
        method: 'DELETE',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
        },
    });
    return res.ok;
}

function extractVideoId(url) {
    if (!url) return null;
    const patterns = [
        /youtube\.com\/embed\/([a-zA-Z0-9_-]+)/,
        /youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/,
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/,
        /youtu\.be\/([a-zA-Z0-9_-]+)/,
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

async function main() {
    console.log(`\n🔍 Scanning for age-restricted YouTube videos in social_posts...`);
    console.log(`   Mode: ${dryRun ? '🟡 DRY RUN (add --confirm to delete)' : '🔴 LIVE DELETE'}\n`);

    // Fetch all video posts
    const videoPosts = await supabaseQuery('social_posts', {
        'select': 'id,media_urls,content,author_id,created_at',
        'content_type': 'eq.video',
        'media_urls': 'not.is.null',
        'order': 'created_at.desc',
        'limit': '500',
    });

    // Filter to YouTube-only posts
    const ytPosts = (videoPosts || []).filter(p => {
        const url = p.media_urls?.[0] || '';
        return url.includes('youtube.com') || url.includes('youtu.be');
    });

    console.log(`📊 Found ${ytPosts.length} YouTube video posts to validate\n`);

    let validCount = 0;
    let restrictedCount = 0;
    let removedCount = 0;
    let errorCount = 0;
    const restricted = [];

    for (let i = 0; i < ytPosts.length; i++) {
        const post = ytPosts[i];
        const url = post.media_urls[0];
        const videoId = extractVideoId(url);
        
        if (!videoId) {
            console.log(`   ⚠️  [${i+1}/${ytPosts.length}] No video ID: ${url}`);
            errorCount++;
            continue;
        }

        try {
            const oembedRes = await fetch(
                `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
            );

            if (!oembedRes.ok) {
                const reason = oembedRes.status === 401 ? 'AGE-RESTRICTED'
                    : oembedRes.status === 403 ? 'EMBED-DISABLED'
                    : oembedRes.status === 404 ? 'NOT-FOUND'
                    : `HTTP-${oembedRes.status}`;

                console.log(`   ❌ [${i+1}/${ytPosts.length}] ${reason}: ${videoId} — "${(post.content || '').slice(0, 60)}..."`);
                restrictedCount++;
                restricted.push({ id: post.id, videoId, reason });

                if (!dryRun) {
                    const ok = await supabaseDelete('social_posts', post.id);
                    if (ok) {
                        console.log(`      🗑️  Deleted post ${post.id}`);
                        removedCount++;
                    } else {
                        console.log(`      ⚠️  Delete failed for ${post.id}`);
                    }
                }
            } else {
                // Parse response to check embeddability
                const body = await oembedRes.json();
                if (!body.html || !body.html.includes('iframe')) {
                    console.log(`   ❌ [${i+1}/${ytPosts.length}] NOT-EMBEDDABLE: ${videoId}`);
                    restrictedCount++;
                    restricted.push({ id: post.id, videoId, reason: 'NOT-EMBEDDABLE' });

                    if (!dryRun) {
                        const ok = await supabaseDelete('social_posts', post.id);
                        if (ok) {
                            console.log(`      🗑️  Deleted post ${post.id}`);
                            removedCount++;
                        }
                    }
                } else {
                    validCount++;
                    if ((i + 1) % 10 === 0 || i === ytPosts.length - 1) {
                        console.log(`   ✅ [${i+1}/${ytPosts.length}] Checked ${validCount} valid so far...`);
                    }
                }
            }

            // Rate limit: 150ms between YouTube API calls
            await new Promise(r => setTimeout(r, 150));

        } catch (err) {
            console.log(`   ⚠️  [${i+1}/${ytPosts.length}] Error checking ${videoId}: ${err.message}`);
            errorCount++;
        }
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📊 RESULTS:`);
    console.log(`   ✅ Valid:      ${validCount}`);
    console.log(`   ❌ Restricted: ${restrictedCount}`);
    if (!dryRun) console.log(`   🗑️  Removed:    ${removedCount}`);
    console.log(`   ⚠️  Errors:    ${errorCount}`);
    console.log(`${'═'.repeat(60)}`);

    if (dryRun && restrictedCount > 0) {
        console.log(`\n🟡 DRY RUN complete. Run with --confirm to delete ${restrictedCount} restricted posts.\n`);
        console.log(`Restricted video IDs:`);
        restricted.forEach(r => console.log(`   ${r.videoId} (${r.reason}) — post: ${r.id}`));
    }

    console.log('');
}

main().catch(console.error);
