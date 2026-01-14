/**
 * 🐴 HORSE STABLE - Central Coordination Hub
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * The Stable coordinates all horse activities:
 * - Content Bus: Prevents horses from posting same clips
 * - Social Bus: Coordinates social interactions
 * - Source Rotation: Ensures diverse content sources
 * 
 * Think of it as the "message bus" where horses communicate
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '../../../.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ═══════════════════════════════════════════════════════════════════════════
// HORSE STABLE - Singleton coordination hub
// ═══════════════════════════════════════════════════════════════════════════
class HorseStable {
    constructor() {
        // Content coordination
        this.usedClips = new Map();        // clipId -> { usedAt, horseName }
        this.horseLastSource = new Map();  // horseId -> lastSourceUsed
        this.recentContent = [];           // Last 50 clips posted by any horse

        // Social coordination  
        this.recentInteractions = new Map(); // Track interactions

        // Supabase client
        this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    }

    // ═══════════════════════════════════════════════════════════
    // CONTENT BUS - Prevents duplicate clips
    // ═══════════════════════════════════════════════════════════

    /**
     * Reserve a clip for a horse - no other horse can use it 
     */
    reserveClip(clipId, horseId, horseName, windowHours = 24) {
        const windowMs = windowHours * 60 * 60 * 1000;

        // Check if clip was recently used by ANY horse
        const existing = this.usedClips.get(clipId);
        if (existing && Date.now() - existing.usedAt < windowMs) {
            console.log(`   ⚠️ Clip ${clipId} already used by ${existing.horseName}`);
            return false;
        }

        // Reserve it
        this.usedClips.set(clipId, {
            usedAt: Date.now(),
            horseId,
            horseName
        });

        this.recentContent.unshift({ clipId, horseId, horseName, at: Date.now() });
        if (this.recentContent.length > 50) this.recentContent.pop();

        return true;
    }

    /**
     * Check if a clip is available
     */
    isClipAvailable(clipId, windowHours = 24) {
        const windowMs = windowHours * 60 * 60 * 1000;
        const existing = this.usedClips.get(clipId);
        return !existing || Date.now() - existing.usedAt >= windowMs;
    }

    /**
     * Get all recently used clip IDs
     */
    getRecentlyUsedClips(windowHours = 24) {
        const windowMs = windowHours * 60 * 60 * 1000;
        const cutoff = Date.now() - windowMs;
        return Array.from(this.usedClips.entries())
            .filter(([_, data]) => data.usedAt > cutoff)
            .map(([clipId]) => clipId);
    }

    // ═══════════════════════════════════════════════════════════
    // SOURCE ROTATION - Ensures content variety
    // ═══════════════════════════════════════════════════════════

    /**
     * Get last source a horse posted from
     */
    getLastSource(horseId) {
        return this.horseLastSource.get(horseId) || null;
    }

    /**
     * Record that a horse posted from a source
     */
    recordSource(horseId, source) {
        this.horseLastSource.set(horseId, source);
    }

    /**
     * Get sources NOT recently used by this horse
     */
    getAvailableSources(horseId, allSources) {
        const lastSource = this.getLastSource(horseId);
        if (!lastSource) return allSources;
        return allSources.filter(s => s !== lastSource);
    }

    // ═══════════════════════════════════════════════════════════
    // SOCIAL BUS - Coordinates social interactions
    // ═══════════════════════════════════════════════════════════

    hasRecentInteraction(horseId, targetId, type, windowMs = 3600000) {
        const key = `${horseId}:${targetId}:${type}`;
        const lastTime = this.recentInteractions.get(key);
        return lastTime && Date.now() - lastTime < windowMs;
    }

    recordInteraction(horseId, targetId, type) {
        const key = `${horseId}:${targetId}:${type}`;
        this.recentInteractions.set(key, Date.now());
    }

    // ═══════════════════════════════════════════════════════════
    // DATABASE SYNC - Load/save state from Supabase
    // ═══════════════════════════════════════════════════════════

    /**
     * Load recent clip usage from database
     */
    async syncFromDatabase() {
        try {
            const { data: usage } = await this.supabase
                .from('clip_usage_log')
                .select('clip_id, author_id, used_at')
                .gte('used_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
                .order('used_at', { ascending: false });

            if (usage) {
                for (const u of usage) {
                    this.usedClips.set(u.clip_id, {
                        usedAt: new Date(u.used_at).getTime(),
                        horseId: u.author_id,
                        horseName: 'Horse'
                    });
                }
                console.log(`   📦 Synced ${usage.length} recent clips from database`);
            }
        } catch (e) {
            console.log('   ⚠️ Could not sync from database:', e.message);
        }
    }

    /**
     * Get stable status summary
     */
    getStatus() {
        return {
            usedClipsCount: this.usedClips.size,
            recentContentCount: this.recentContent.length,
            horsesTracked: this.horseLastSource.size,
            interactionsTracked: this.recentInteractions.size
        };
    }
}

// Singleton instance
const stable = new HorseStable();

export { stable, HorseStable };
export default stable;
