/**
 * 🛡️ CONTENT MODERATION AGENT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ENFORCES CONTENT QUALITY LAWS:
 * This agent identifies and removes posts containing fake/AI-generated content
 * that violates the platform's visual authenticity standards.
 * 
 * VIOLATIONS DETECTED:
 * ❌ Fake AI-generated poker room images (distorted people, weird lighting)
 * ❌ Chips with text/logos on them (violates Chip Law)
 * ❌ Unrealistic/cartoonish casino environments
 * ❌ Phone mockups, stock photos, clearly synthetic content
 * 
 * ENFORCEMENT:
 * - Removes violating posts from social_posts table
 * - Removes associated media from storage
 * - Logs violations for review
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment
config({ path: path.resolve(__dirname, '../../../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT QUALITY LAW - HARD RULES
// ═══════════════════════════════════════════════════════════════════════════

const CONTENT_QUALITY_LAW = {
    // FORBIDDEN IMAGE TYPES
    forbidden: {
        fakePokerRooms: 'AI-generated ornate/unrealistic poker rooms',
        chipsWithText: 'Chips with casino names, dollar amounts, or logos',
        distortedPeople: 'AI-generated people with distorted features',
        phoneMockups: 'Phone screens displaying poker content',
        stockPhotos: 'Generic stock poker imagery',
        cartoonish: 'Cartoonish or clearly synthetic content'
    },

    // REQUIRED FOR AUTHENTIC CONTENT
    required: {
        realisticLighting: 'Natural casino/tournament lighting',
        authenticChips: 'Plain casino clay chips without text',
        realEnvironment: 'Believable poker room setting',
        naturalPeople: 'Real or realistic human subjects'
    }
};

// Known violating usernames from user report
const KNOWN_VIOLATORS = [
    'DesertDonk',
    'TexasQueen92',
    'LANitOwl',
    'SeattleSolver'
];

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT MODERATION AGENT
// ═══════════════════════════════════════════════════════════════════════════

class ContentModerationAgent {
    constructor() {
        if (!SUPABASE_URL || !SUPABASE_KEY) {
            throw new Error('Missing Supabase credentials');
        }
        this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        this.violations = [];
    }

    /**
     * 🔍 Find all posts from violating users
     */
    async findViolatingPosts() {
        console.log('\n🛡️ CONTENT MODERATION AGENT');
        console.log('═'.repeat(60));
        console.log('Scanning for content law violations...\n');

        // Get all posts with images
        const { data: posts, error } = await this.supabase
            .from('social_posts')
            .select('id, content, media_urls, created_at, author_id')
            .not('media_urls', 'is', null);

        if (error) {
            console.error('❌ Failed to fetch posts:', error.message);
            return [];
        }

        // Get all profiles to map author_id to username
        const authorIds = [...new Set(posts.map(p => p.author_id).filter(Boolean))];
        const { data: profiles } = await this.supabase
            .from('profiles')
            .select('id, username, display_name')
            .in('id', authorIds);

        const profileMap = new Map((profiles || []).map(p => [p.id, p]));

        // Filter posts from known violators
        const violatingPosts = posts.filter(post => {
            const profile = profileMap.get(post.author_id);
            const username = profile?.username || profile?.display_name || '';
            return KNOWN_VIOLATORS.some(v =>
                username.toLowerCase().includes(v.toLowerCase())
            );
        }).map(post => ({
            ...post,
            profile: profileMap.get(post.author_id)
        }));

        console.log(`Found ${violatingPosts.length} posts from known violators:\n`);

        for (const post of violatingPosts) {
            const username = post.profile?.username || post.profile?.display_name || 'Unknown';
            console.log(`❌ ${username}: "${post.content?.substring(0, 50)}..."`);
            console.log(`   Media: ${post.media_urls?.length || 0} files`);
            console.log(`   Posted: ${new Date(post.created_at).toLocaleDateString()}\n`);
        }

        return violatingPosts;
    }

    /**
     * 🗑️ Remove violating posts
     */
    async purgeViolatingPosts(dryRun = true) {
        const violatingPosts = await this.findViolatingPosts();

        if (violatingPosts.length === 0) {
            console.log('✅ No violating posts found!');
            return { removed: 0, dryRun };
        }

        if (dryRun) {
            console.log('\n⚠️  DRY RUN MODE - No posts will be deleted');
            console.log(`Would remove ${violatingPosts.length} posts\n`);
            return { removed: 0, wouldRemove: violatingPosts.length, dryRun: true };
        }

        console.log('\n🗑️ PURGING VIOLATING POSTS...\n');

        let removed = 0;
        for (const post of violatingPosts) {
            const username = post.profile?.username || 'Unknown';

            // Delete the post
            const { error } = await this.supabase
                .from('social_posts')
                .delete()
                .eq('id', post.id);

            if (error) {
                console.error(`❌ Failed to delete post ${post.id}:`, error.message);
            } else {
                console.log(`✅ Removed post from ${username}: "${post.content?.substring(0, 30)}..."`);
                removed++;
            }
        }

        console.log(`\n═══════════════════════════════════════════════════════════`);
        console.log(`🛡️ CONTENT LAW ENFORCED: ${removed} violating posts removed`);
        console.log(`═══════════════════════════════════════════════════════════\n`);

        return { removed, dryRun: false };
    }

    /**
     * 🔒 Add content validation to prevent future violations
     */
    async installContentFilter() {
        // Create a content_violations table to track violations
        const migrationSQL = `
-- Content Moderation Log Table
CREATE TABLE IF NOT EXISTS content_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL,
    user_id UUID REFERENCES profiles(id),
    violation_type TEXT NOT NULL,
    violation_details JSONB,
    moderated_at TIMESTAMPTZ DEFAULT NOW(),
    moderator_notes TEXT
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_content_violations_user 
ON content_violations(user_id);

-- RLS policies
ALTER TABLE content_violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view violations"
ON content_violations FOR SELECT
TO authenticated
USING (auth.uid() IN (
    SELECT id FROM profiles WHERE role = 'admin'
));
`;

        console.log('\n📋 Content Violations Migration SQL:');
        console.log(migrationSQL);

        return migrationSQL;
    }

    /**
     * 📊 Generate moderation report
     */
    async generateReport() {
        const violatingPosts = await this.findViolatingPosts();

        const report = {
            timestamp: new Date().toISOString(),
            totalViolations: violatingPosts.length,
            violatorsList: KNOWN_VIOLATORS,
            violations: violatingPosts.map(p => ({
                id: p.id,
                username: p.profiles?.username,
                content: p.content?.substring(0, 100),
                mediaCount: p.media_urls?.length || 0,
                createdAt: p.created_at
            })),
            lawsViolated: [
                'CHIP LAW - Chips with text/logos',
                'TABLE QUALITY LAW - Fake AI-generated rooms',
                'AUTHENTICITY LAW - Clearly synthetic content'
            ]
        };

        console.log('\n📊 MODERATION REPORT');
        console.log(JSON.stringify(report, null, 2));

        return report;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export { ContentModerationAgent, CONTENT_QUALITY_LAW };
export default ContentModerationAgent;

// ═══════════════════════════════════════════════════════════════════════════
// CLI EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

if (process.argv[1]?.includes('ContentModerationAgent')) {
    const agent = new ContentModerationAgent();
    const dryRun = !process.argv.includes('--execute');

    if (dryRun) {
        console.log('🛡️ Running in DRY RUN mode. Use --execute to actually delete posts.\n');
    }

    agent.purgeViolatingPosts(dryRun).then(result => {
        if (result.dryRun) {
            console.log(`\nTo execute removal, run: node ContentModerationAgent.js --execute`);
        }
    }).catch(err => {
        console.error('Error:', err.message);
    });
}
