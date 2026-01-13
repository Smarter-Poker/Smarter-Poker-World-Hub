/**
 * 📤 AUTO POSTER
 * ═══════════════════════════════════════════════════════════════════════════
 * Publishes generated content to the Smarter.Poker platform.
 * Handles scheduling, media uploads, and status tracking.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

class AutoPoster {
    /**
     * Post text content to the platform
     */
    async postContent(content, options = {}) {
        const {
            persona_id,
            persona_name,
            persona_alias,
            content_type = 'post',
            schedule_for = null,
            original_source = null
        } = options;

        const postData = {
            author_id: persona_id,
            author_name: persona_name,
            author_alias: persona_alias,
            content_type: content_type,
            body: content,
            status: schedule_for ? 'scheduled' : 'published',
            scheduled_for: schedule_for,
            published_at: schedule_for ? null : new Date().toISOString(),
            original_source_url: original_source?.link || null,
            original_source_name: original_source?.source || null
        };

        const { data, error } = await supabase
            .from('seeded_content')
            .insert(postData)
            .select()
            .single();

        if (error) {
            console.error('Post failed:', error);
            throw error;
        }

        console.log(`📤 Posted: ${persona_alias} - ${content.slice(0, 50)}...`);
        return data;
    }

    /**
     * Post video content with media upload
     */
    async postVideo(videoPath, metadata, options = {}) {
        const {
            persona_id,
            persona_name,
            persona_alias,
            schedule_for = null
        } = options;

        // Upload video to Supabase Storage
        const fileName = path.basename(videoPath);
        const fileBuffer = fs.readFileSync(videoPath);

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('content-videos')
            .upload(`videos/${fileName}`, fileBuffer, {
                contentType: 'video/mp4',
                cacheControl: '3600'
            });

        if (uploadError) {
            console.error('Video upload failed:', uploadError);
            throw uploadError;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from('content-videos')
            .getPublicUrl(`videos/${fileName}`);

        // Create post with video
        const postData = {
            author_id: persona_id,
            author_name: persona_name,
            author_alias: persona_alias,
            content_type: 'video',
            body: metadata.script || '',
            media_url: urlData.publicUrl,
            media_type: 'video',
            duration_seconds: metadata.duration,
            status: schedule_for ? 'scheduled' : 'published',
            scheduled_for: schedule_for,
            published_at: schedule_for ? null : new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('seeded_content')
            .insert(postData)
            .select()
            .single();

        if (error) {
            console.error('Video post failed:', error);
            throw error;
        }

        console.log(`🎬 Video posted: ${persona_alias} - ${metadata.duration}s`);
        return data;
    }

    /**
     * Schedule a batch of posts across time
     */
    async scheduleBatch(contents, options = {}) {
        const {
            start_time = new Date(),
            interval_minutes = 60,
            randomize = true
        } = options;

        const results = [];
        let currentTime = new Date(start_time);

        for (const content of contents) {
            // Add randomization to interval if enabled
            let delay = interval_minutes;
            if (randomize) {
                delay = interval_minutes * (0.5 + Math.random()); // 50% to 150% of base
            }

            const { data, error } = await supabase
                .from('seeded_content')
                .insert({
                    ...content,
                    status: 'scheduled',
                    scheduled_for: currentTime.toISOString()
                })
                .select()
                .single();

            if (!error) {
                results.push(data);
                console.log(`📅 Scheduled: ${content.author_alias} for ${currentTime.toLocaleString()}`);
            }

            currentTime = new Date(currentTime.getTime() + delay * 60 * 1000);
        }

        return results;
    }

    /**
     * Publish all due scheduled content
     */
    async publishDue() {
        const now = new Date().toISOString();

        // Get due posts
        const { data: duePosts, error: fetchError } = await supabase
            .from('seeded_content')
            .select('*')
            .eq('status', 'scheduled')
            .lte('scheduled_for', now);

        if (fetchError) {
            console.error('Fetch due posts failed:', fetchError);
            return [];
        }

        if (!duePosts || duePosts.length === 0) {
            console.log('No posts due for publishing');
            return [];
        }

        // Update status to published
        const ids = duePosts.map(p => p.id);

        const { error: updateError } = await supabase
            .from('seeded_content')
            .update({
                status: 'published',
                published_at: now
            })
            .in('id', ids);

        if (updateError) {
            console.error('Publish update failed:', updateError);
            return [];
        }

        console.log(`✅ Published ${duePosts.length} posts`);
        return duePosts;
    }

    /**
     * Get posting statistics
     */
    async getStats() {
        const { data, error } = await supabase
            .from('seeded_content')
            .select('status, content_type')
            .then(({ data }) => {
                const stats = {
                    total: data?.length || 0,
                    published: 0,
                    scheduled: 0,
                    draft: 0,
                    by_type: {}
                };

                data?.forEach(post => {
                    stats[post.status] = (stats[post.status] || 0) + 1;
                    stats.by_type[post.content_type] = (stats.by_type[post.content_type] || 0) + 1;
                });

                return { data: stats, error: null };
            });

        if (error) {
            console.error('Stats fetch failed:', error);
            return null;
        }

        return data;
    }

    /**
     * Delete old/archived content
     */
    async cleanup(daysOld = 90) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - daysOld);

        const { data, error } = await supabase
            .from('seeded_content')
            .delete()
            .eq('status', 'archived')
            .lt('created_at', cutoff.toISOString())
            .select();

        if (error) {
            console.error('Cleanup failed:', error);
            return 0;
        }

        console.log(`🗑️  Cleaned up ${data?.length || 0} old posts`);
        return data?.length || 0;
    }
}

export const autoPoster = new AutoPoster();
export default AutoPoster;
