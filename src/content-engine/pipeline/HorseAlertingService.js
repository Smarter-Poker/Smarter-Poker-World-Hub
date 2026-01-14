/**
 * 🚨 HORSE ERROR ALERTING SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Tracks errors and sends alerts via webhooks (Discord/Slack)
 * Also provides analytics and monitoring APIs
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const ERROR_TYPES = {
    DOWNLOAD: 'download',
    CONVERSION: 'conversion',
    UPLOAD: 'upload',
    POST: 'post',
    SOCIAL: 'social',
    DATABASE: 'database'
};

// ═══════════════════════════════════════════════════════════════════════════
// HORSE ALERTING SERVICE
// ═══════════════════════════════════════════════════════════════════════════
class HorseAlertingService {
    constructor(supabaseUrl, supabaseKey) {
        this.supabase = createClient(supabaseUrl, supabaseKey);
        this.webhookUrl = process.env.HORSE_ALERT_WEBHOOK || null;
        this.errorCounts = new Map(); // Track errors for rate limiting
        this.lastAlertTime = 0;
        this.alertCooldown = 60000; // 1 minute between alerts
    }

    // ═══════════════════════════════════════════════════════════════════
    // ERROR LOGGING
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Log an error to database
     */
    async logError(authorId, errorType, errorMessage, context = {}) {
        try {
            // Log to database
            const { data, error } = await this.supabase
                .from('horse_error_log')
                .insert({
                    author_id: authorId,
                    error_type: errorType,
                    error_message: errorMessage,
                    context
                })
                .select()
                .single();

            if (error) {
                console.error('Failed to log error:', error.message);
            }

            // Track for rate limiting
            const key = errorType;
            this.errorCounts.set(key, (this.errorCounts.get(key) || 0) + 1);

            // Check if we should send alert
            await this.checkAndAlert(errorType, errorMessage, context);

            return data;
        } catch (e) {
            console.error('Error logging failed:', e.message);
        }
    }

    /**
     * Check if alert should be sent and send it
     */
    async checkAndAlert(errorType, errorMessage, context) {
        // Rate limit alerts
        const now = Date.now();
        if (now - this.lastAlertTime < this.alertCooldown) {
            return;
        }

        // Only alert on critical or repeated errors
        const errorCount = this.errorCounts.get(errorType) || 0;
        const shouldAlert =
            errorCount >= 5 || // 5+ of same type
            errorType === ERROR_TYPES.DATABASE; // Always alert on DB errors

        if (shouldAlert && this.webhookUrl) {
            await this.sendWebhookAlert(errorType, errorMessage, context, errorCount);
            this.lastAlertTime = now;
            this.errorCounts.clear(); // Reset after alert
        }
    }

    /**
     * Send alert to Discord/Slack webhook
     */
    async sendWebhookAlert(errorType, errorMessage, context, count) {
        if (!this.webhookUrl) return;

        const payload = {
            embeds: [{
                title: `🚨 Horse System Alert: ${errorType.toUpperCase()}`,
                description: errorMessage,
                color: 0xFF4444,
                fields: [
                    { name: 'Error Type', value: errorType, inline: true },
                    { name: 'Count', value: `${count} occurrences`, inline: true },
                    { name: 'Context', value: JSON.stringify(context).slice(0, 500), inline: false }
                ],
                timestamp: new Date().toISOString()
            }]
        };

        try {
            await fetch(this.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            console.log('📣 Alert sent to webhook');
        } catch (e) {
            console.error('Webhook alert failed:', e.message);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // ANALYTICS
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Get analytics summary for dashboard
     */
    async getAnalyticsSummary(days = 7) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const { data: analytics } = await this.supabase
            .from('horse_analytics')
            .select('*')
            .gte('date', startDate.toISOString().split('T')[0]);

        if (!analytics || analytics.length === 0) {
            return this.getEmptySummary();
        }

        // Aggregate metrics
        const summary = {
            period: `${days} days`,
            totalPosts: 0,
            totalStories: 0,
            totalComments: 0,
            totalLikes: 0,
            totalErrors: 0,
            sourceDistribution: {},
            dailyActivity: [],
            activeHorses: new Set()
        };

        for (const day of analytics) {
            summary.totalPosts += day.posts_created || 0;
            summary.totalStories += day.stories_created || 0;
            summary.totalComments += day.comments_made || 0;
            summary.totalLikes += day.likes_given || 0;
            summary.totalErrors += (day.download_failures || 0) + (day.upload_failures || 0);

            if (day.author_id) summary.activeHorses.add(day.author_id);

            // Merge source distribution
            if (day.source_distribution) {
                for (const [source, count] of Object.entries(day.source_distribution)) {
                    summary.sourceDistribution[source] =
                        (summary.sourceDistribution[source] || 0) + count;
                }
            }
        }

        summary.activeHorses = summary.activeHorses.size;

        return summary;
    }

    /**
     * Get recent errors for debugging
     */
    async getRecentErrors(limit = 20) {
        const { data: errors } = await this.supabase
            .from('horse_error_log')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        return errors || [];
    }

    /**
     * Get error counts by type
     */
    async getErrorBreakdown(days = 7) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const { data: errors } = await this.supabase
            .from('horse_error_log')
            .select('error_type')
            .gte('created_at', startDate.toISOString());

        const breakdown = {};
        (errors || []).forEach(e => {
            breakdown[e.error_type] = (breakdown[e.error_type] || 0) + 1;
        });

        return breakdown;
    }

    /**
     * Get top performing horses
     */
    async getTopHorses(days = 7, limit = 10) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const { data: analytics } = await this.supabase
            .from('horse_analytics')
            .select(`
                author_id,
                posts_created,
                likes_received,
                comments_received
            `)
            .gte('date', startDate.toISOString().split('T')[0]);

        // Aggregate by horse
        const horseStats = {};
        (analytics || []).forEach(a => {
            if (!horseStats[a.author_id]) {
                horseStats[a.author_id] = { posts: 0, likes: 0, comments: 0 };
            }
            horseStats[a.author_id].posts += a.posts_created || 0;
            horseStats[a.author_id].likes += a.likes_received || 0;
            horseStats[a.author_id].comments += a.comments_received || 0;
        });

        // Sort by total engagement
        return Object.entries(horseStats)
            .map(([id, stats]) => ({
                authorId: id,
                ...stats,
                engagement: stats.likes + stats.comments
            }))
            .sort((a, b) => b.engagement - a.engagement)
            .slice(0, limit);
    }

    getEmptySummary() {
        return {
            period: '7 days',
            totalPosts: 0,
            totalStories: 0,
            totalComments: 0,
            totalLikes: 0,
            totalErrors: 0,
            sourceDistribution: {},
            activeHorses: 0
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIP USAGE TRACKER (Database Persistence)
// ═══════════════════════════════════════════════════════════════════════════
class ClipUsageTracker {
    constructor(supabaseUrl, supabaseKey) {
        this.supabase = createClient(supabaseUrl, supabaseKey);
    }

    /**
     * Check if clip is available (not used in last 24h)
     */
    async isClipAvailable(clipId, hours = 24) {
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - hours);

        const { data } = await this.supabase
            .from('clip_usage_log')
            .select('id')
            .eq('clip_id', clipId)
            .eq('success', true)
            .gte('used_at', cutoff.toISOString())
            .limit(1);

        return !data || data.length === 0;
    }

    /**
     * Record clip usage
     */
    async recordUsage(clipId, authorId, source, videoId, postId = null, storyId = null) {
        const { data, error } = await this.supabase
            .from('clip_usage_log')
            .insert({
                clip_id: clipId,
                author_id: authorId,
                source,
                video_id: videoId,
                post_id: postId,
                story_id: storyId,
                success: true
            })
            .select()
            .single();

        if (error) {
            console.error('Failed to record clip usage:', error.message);
        }

        return data;
    }

    /**
     * Record failed usage attempt
     */
    async recordFailure(clipId, authorId, source, errorMessage) {
        await this.supabase
            .from('clip_usage_log')
            .insert({
                clip_id: clipId,
                author_id: authorId,
                source,
                success: false,
                error_message: errorMessage
            });
    }

    /**
     * Get recently used clips
     */
    async getRecentlyUsedClips(hours = 24) {
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - hours);

        const { data } = await this.supabase
            .from('clip_usage_log')
            .select('clip_id')
            .eq('success', true)
            .gte('used_at', cutoff.toISOString());

        return (data || []).map(d => d.clip_id);
    }
}

export { HorseAlertingService, ClipUsageTracker, ERROR_TYPES };
export default HorseAlertingService;
