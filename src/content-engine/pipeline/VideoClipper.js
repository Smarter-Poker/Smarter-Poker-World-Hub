/**
 * 🎬 VIRAL POKER VIDEO CLIPPER
 * ═══════════════════════════════════════════════════════════════════════════
 * Produces short-form vertical videos only from assets for which
 * Smarter.Poker has explicit owned or licensed processing rights.
 * Third-party channels remain discovery/embed sources; their inclusion in
 * this registry is never permission to download, transform, or republish.
 * 
 * PIPELINE:
 * 1. Discover viral videos from curated channels
 * 2. Verify owned/licensed rights before acquiring the source media
 * 3. Extract clips via FFmpeg (specific timestamps)
 * 4. Convert to 9:16 vertical format
 * 5. Add captions (Whisper AI)
 * 6. Upload to storage and assign to Horse profiles
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { getGrokClient } from '../../lib/grokClient.js';
import { createClient } from '@supabase/supabase-js';

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════
const CONFIG = {
    // Directories
    DOWNLOAD_DIR: process.env.VIDEO_DOWNLOAD_DIR || './output/downloads',
    CLIPS_DIR: process.env.VIDEO_CLIPS_DIR || './output/clips',
    TEMP_DIR: process.env.VIDEO_TEMP_DIR || './output/temp',

    // Video settings for TikTok/Reels
    OUTPUT_WIDTH: 1080,
    OUTPUT_HEIGHT: 1920, // 9:16 vertical
    FPS: 30,

    // Clip settings
    MIN_CLIP_DURATION: 15,  // seconds
    MAX_CLIP_DURATION: 60,  // seconds
    DEFAULT_CLIP_DURATION: 30,

    // Quality
    VIDEO_BITRATE: '4M',
    AUDIO_BITRATE: '192k',

    // Supabase storage bucket
    STORAGE_BUCKET: 'social-media',
    // Native Reel playback is intentionally author-scoped. The canonical feed
    // rejects broad `reels/clips/...` objects because it cannot prove that the
    // object belongs to the reel author.
    STORAGE_PATH: 'reels'
};

// Keep this in lockstep with the canonical Reel feed's author identity gate.
// A storage object is public, so accepting an arbitrary string here would let
// a caller write outside the namespace the feed treats as trusted.
const AUTHOR_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POKER_TOPICS = new Set(['poker', 'cash', 'tournament']);
const NATIVE_CLIPPING_QUARANTINE_REASON = 'rights_registry_not_implemented';

// ═══════════════════════════════════════════════════════════════════════════
// POKER DISCOVERY SOURCES
// Discovery metadata is not evidence of processing or republication rights.
// ═══════════════════════════════════════════════════════════════════════════
const POKER_SOURCES = {
    youtube_channels: [
        {
            id: 'UCNJhx0JD6HoT1fz0Z3tZpSw', // Hustler Casino Live
            name: 'Hustler Casino Live',
            type: 'livestream_highlights',
            safe_to_clip: false,
            requires_rights_clearance: true
        },
        {
            id: 'UC_lVPKHbLDIkdI5H84VRwxQ', // HCL Poker Clips
            name: 'HCL Poker Clips',
            type: 'pre_clipped',
            safe_to_clip: false,
            requires_rights_clearance: true
        },
        {
            id: 'UCrM5f8qg7mPwDzFXaeLYG4g', // PokerStars
            name: 'PokerStars',
            type: 'tournament_highlights',
            safe_to_clip: false,
            requires_rights_clearance: true
        },
        {
            id: 'UCB_sfU5NC1dlIVj7pz7Y5NQ', // Doug Polk Poker
            name: 'Doug Polk Poker',
            type: 'analysis_clips',
            safe_to_clip: false,
            requires_rights_clearance: true
        }
    ],

    // Pre-curated viral video URLs (seed list)
    seed_videos: [
        // Format: { url, start_time, end_time, description }
        // These can be manually added or discovered via RSS/API
    ],

    // Twitch poker category
    twitch_category: 'Poker',

    // Keywords for finding viral content
    viral_keywords: [
        'biggest pot',
        'insane bluff',
        'bad beat',
        'soul read',
        'hero call',
        'slow roll karma',
        'million dollar hand',
        'tom dwan',
        'phil hellmuth',
        'nik airball'
    ]
};

// ═══════════════════════════════════════════════════════════════════════════
// VIDEO CLIPPER CLASS
// ═══════════════════════════════════════════════════════════════════════════
class VideoClipper {
    constructor() {
        // Grok client (OpenAI-compatible)
        this.openai = getGrokClient();
        // Supabase is lazy-initialized when needed (to ensure env vars are loaded)
        this.supabase = null;
        this.ensureDirectories();
    }

    // Lazy init Supabase client when needed
    getSupabase() {
        if (!this.supabase) {
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
            if (!supabaseUrl || !supabaseKey) {
                throw new Error('VideoClipper requires service-role Supabase configuration');
            }
            this.supabase = createClient(supabaseUrl, supabaseKey);
        }
        return this.supabase;
    }

    ensureDirectories() {
        [CONFIG.DOWNLOAD_DIR, CONFIG.CLIPS_DIR, CONFIG.TEMP_DIR].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    /**
     * Phase 1 quarantine boundary.
     *
     * A caller-supplied `rightsStatus` string is not rights evidence. Native
     * acquisition stays disabled until Phase 6 replaces this method with a
     * database-backed grant lookup (asset, owner/license, permitted uses,
     * territory, dates and revocation) plus a durable job claim. Keeping the
     * result explicit also makes accidental reactivation visible in tests.
     */
    async getNativeClippingGate() {
        return {
            enabled: false,
            reason: NATIVE_CLIPPING_QUARANTINE_REASON,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DOWNLOAD METHODS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Download a video or specific section using yt-dlp
     * Supports: YouTube, Twitch clips, Twitter, TikTok
     */
    async downloadVideo(url, options = {}) {
        const clippingGate = await this.getNativeClippingGate();
        if (!clippingGate.enabled) {
            return {
                success: false,
                error: clippingGate.reason,
                sourceUrl: url,
            };
        }
        const rightsStatus = options.rightsStatus || 'unknown';
        if (!['owned', 'licensed'].includes(rightsStatus)) {
            return {
                success: false,
                error: 'rights_clearance_required',
                sourceUrl: url
            };
        }
        const videoId = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const outputPath = path.join(CONFIG.DOWNLOAD_DIR, `${videoId}.mp4`);

        // Build args array (avoids shell escaping issues)
        const ytdlpArgs = [
            '--extractor-args', 'youtube:player_client=web',
            '-f', 'best[height<=720]',
            '--merge-output-format', 'mp4',
            '-o', outputPath,
            '--no-playlist'
        ];

        // Download only a specific section if timestamps provided
        if (options.startTime && options.endTime) {
            ytdlpArgs.push('--download-sections', `*${options.startTime}-${options.endTime}`);
        }

        // Add cookies if needed for authentication
        if (options.cookiesFile) {
            ytdlpArgs.push('--cookies', options.cookiesFile);
        }

        ytdlpArgs.push(url);

        console.debug(`📥 Downloading: ${url}`);
        console.debug(`   Args: yt-dlp ${ytdlpArgs.join(' ')}`);

        try {
            // Use spawn to avoid shell escaping issues
            const { spawn } = await import('child_process');

            await new Promise((resolve, reject) => {
                const proc = spawn('yt-dlp', ytdlpArgs, { stdio: 'inherit' });
                proc.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`yt-dlp exited with code ${code}`));
                });
                proc.on('error', reject);
            });

            if (fs.existsSync(outputPath)) {
                console.debug(`✅ Downloaded: ${outputPath}`);
                return {
                    success: true,
                    path: outputPath,
                    videoId,
                    sourceUrl: url
                };
            } else {
                throw new Error('Download completed but file not found');
            }
        } catch (error) {
            console.warn(`❌ Download failed: ${error.message}`);
            return {
                success: false,
                error: error.message,
                sourceUrl: url
            };
        }
    }

    /**
     * Get video metadata without downloading
     */
    async getVideoInfo(url) {
        try {
            // Use spawn instead of execAsync to avoid shell injection risks
            const { spawn } = await import('child_process');

            return await new Promise((resolve, reject) => {
                let output = '';
                const proc = spawn('yt-dlp', ['--dump-json', url]);

                proc.stdout.on('data', (data) => {
                    output += data.toString();
                });

                proc.on('close', (code) => {
                    if (code === 0) {
                        try {
                            resolve(JSON.parse(output));
                        } catch (e) {
                            reject(new Error(`Failed to parse JSON: ${e.message}`));
                        }
                    } else {
                        reject(new Error(`yt-dlp exited with code ${code}`));
                    }
                });

                proc.on('error', reject);
            });
        } catch (error) {
            console.warn(`Failed to get video info: ${error.message}`);
            return null;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CLIPPING METHODS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Extract a clip from a downloaded video
     * @param {string} inputPath - Path to source video
     * @param {number} startSeconds - Start time in seconds
     * @param {number} duration - Duration in seconds
     * @param {object} options - Additional options
     */
    async extractClip(inputPath, startSeconds, duration, options = {}) {
        const clipId = `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const outputPath = path.join(CONFIG.CLIPS_DIR, `${clipId}.mp4`);

        // Clamp duration
        duration = Math.min(Math.max(duration, CONFIG.MIN_CLIP_DURATION), CONFIG.MAX_CLIP_DURATION);

        // Format timestamp for FFmpeg
        const startTimestamp = this.formatTimestamp(startSeconds);

        // FFmpeg command for clip extraction with re-encoding
        // Using -c copy would be faster but doesn't allow format conversion
        const ffmpegCmd = `ffmpeg -y \
            -ss ${startTimestamp} \
            -i "${inputPath}" \
            -t ${duration} \
            -c:v libx264 -preset fast -crf 23 \
            -c:a aac -b:a ${CONFIG.AUDIO_BITRATE} \
            -movflags +faststart \
            "${outputPath}"`;

        console.debug(`✂️ Extracting clip: ${startSeconds}s for ${duration}s`);

        try {
            await execAsync(ffmpegCmd);

            if (fs.existsSync(outputPath)) {
                console.debug(`✅ Clip extracted: ${outputPath}`);
                return {
                    success: true,
                    path: outputPath,
                    clipId,
                    startSeconds,
                    duration
                };
            } else {
                throw new Error('Clip extraction completed but file not found');
            }
        } catch (error) {
            console.warn(`❌ Clip extraction failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Convert horizontal video to vertical (9:16) format for TikTok/Reels
     * Uses blur background technique for best results
     * Limited to 45 seconds and compressed for Supabase upload
     */
    async convertToVertical(inputPath, options = {}) {
        const outputId = `vert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const outputPath = path.join(CONFIG.CLIPS_DIR, `${outputId}.mp4`);

        // Use smaller resolution for file size (720x1280 instead of 1080x1920)
        const width = 720;
        const height = 1280;
        const maxDuration = options.maxDuration || 45; // Limit to 45 seconds

        // FFmpeg filter to:
        // 1. Create blurred background at 9:16
        // 2. Scale original video to fit
        // 3. Overlay on center
        const filterComplex = `
            [0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,
            crop=${width}:${height},
            boxblur=15:8[bg];
            [0:v]scale=${width}:-2:force_original_aspect_ratio=decrease[fg];
            [bg][fg]overlay=(W-w)/2:(H-h)/2
        `.replace(/\s+/g, '');

        // Higher CRF (28) + lower bitrate for smaller files
        const ffmpegCmd = `ffmpeg -y \
            -i "${inputPath}" \
            -t ${maxDuration} \
            -filter_complex "${filterComplex}" \
            -c:v libx264 -preset fast -crf 28 \
            -c:a aac -b:a 128k \
            -r 24 \
            -movflags +faststart \
            "${outputPath}"`;

        console.debug(`📐 Converting to vertical: ${inputPath}`);

        try {
            await execAsync(ffmpegCmd, { maxBuffer: 100 * 1024 * 1024 });

            if (fs.existsSync(outputPath)) {
                console.debug(`✅ Converted to vertical: ${outputPath}`);

                // Clean up original if requested
                if (options.deleteOriginal && inputPath !== outputPath) {
                    fs.unlinkSync(inputPath);
                }

                return {
                    success: true,
                    path: outputPath,
                    outputId
                };
            } else {
                throw new Error('Conversion completed but file not found');
            }
        } catch (error) {
            console.warn(`❌ Vertical conversion failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CAPTION GENERATION (Whisper AI)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Generate captions for a video using Whisper
     */
    async generateCaptions(videoPath) {
        const audioPath = path.join(CONFIG.TEMP_DIR, `audio_${Date.now()}.mp3`);

        try {
            // Extract audio
            await execAsync(`ffmpeg -y -i "${videoPath}" -vn -acodec mp3 -ar 16000 "${audioPath}"`);

            // Send to Whisper
            const audioFile = fs.createReadStream(audioPath);
            const transcription = await this.openai.audio.transcriptions.create({
                file: audioFile,
                model: 'whisper-1',
                response_format: 'srt'
            });

            // Clean up audio file
            fs.unlinkSync(audioPath);

            return {
                success: true,
                srt: transcription,
                format: 'srt'
            };
        } catch (error) {
            console.warn(`Caption generation failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Burn captions into video
     */
    async burnCaptions(videoPath, srtContent, options = {}) {
        const srtPath = path.join(CONFIG.TEMP_DIR, `subs_${Date.now()}.srt`);
        const outputPath = videoPath.replace('.mp4', '_captioned.mp4');

        fs.writeFileSync(srtPath, srtContent);

        const fontStyle = options.fontStyle ||
            "FontName=Arial,FontSize=24,PrimaryColour=&Hffffff&,OutlineColour=&H000000&,Outline=2,Alignment=2";

        const ffmpegCmd = `ffmpeg -y \
            -i "${videoPath}" \
            -vf "subtitles=${srtPath}:force_style='${fontStyle}'" \
            -c:v libx264 -preset fast -crf 23 \
            -c:a copy \
            "${outputPath}"`;

        try {
            await execAsync(ffmpegCmd);
            fs.unlinkSync(srtPath);

            if (fs.existsSync(outputPath)) {
                return { success: true, path: outputPath };
            }
            throw new Error('Caption burn completed but file not found');
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STORAGE & DATABASE
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Upload clip to Supabase storage and create reel record
     */
    async uploadAndCreateReel(clipPath, metadata = {}) {
        const clippingGate = await this.getNativeClippingGate();
        if (!clippingGate.enabled) {
            return {
                success: false,
                publicationSkipped: true,
                reason: clippingGate.reason,
            };
        }
        const rightsStatus = metadata.rightsStatus || 'unknown';
        if (!['owned', 'licensed'].includes(rightsStatus)) {
            console.warn('Upload blocked: an explicit owned/licensed rightsStatus is required');
            return {
                success: false,
                publicationSkipped: true,
                reason: 'rights_clearance_required'
            };
        }
        const authorId = String(metadata.authorId || '').trim();
        if (!AUTHOR_ID_RE.test(authorId)) {
            console.warn('Upload blocked: an author UUID is required for a trusted native Reel namespace');
            return {
                success: false,
                publicationSkipped: true,
                reason: 'author_id_required'
            };
        }
        const topic = String(metadata.topic || '').trim().toLowerCase();
        if (!POKER_TOPICS.has(topic)) {
            console.warn('Upload blocked: an explicit poker topic is required');
            return {
                success: false,
                publicationSkipped: true,
                reason: 'poker_topic_required'
            };
        }
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`;
        const storagePath = `${CONFIG.STORAGE_PATH}/${authorId}/${fileName}`;

        console.debug(`☁️ Uploading clip to storage...`);

        try {
            const supabase = this.getSupabase();
            // Read file
            const fileBuffer = fs.readFileSync(clipPath);

            // Upload to Supabase storage
            const { error: uploadError } = await supabase.storage
                .from(CONFIG.STORAGE_BUCKET)
                .upload(storagePath, fileBuffer, {
                    contentType: 'video/mp4',
                    upsert: false
                });

            if (uploadError) throw uploadError;

            // Get public URL
            const { data: urlData } = supabase.storage
                .from(CONFIG.STORAGE_BUCKET)
                .getPublicUrl(storagePath);

            const publicUrl = urlData.publicUrl;
            console.debug(`✅ Uploaded: ${publicUrl}`);

            // The author is validated above before a public object is written.
            const { data: reel, error: reelError } = await supabase
                .from('social_reels')
                .insert({
                        // 2026-08-15 CHECK 13 fix: source_url/duration_seconds/
                        // visibility are not columns on social_reels (real:
                        // original_youtube_url / is_public; no duration column) —
                        // the insert 42703'd, so clipped reels were never created.
                        author_id: authorId,
                        video_url: publicUrl,
                        caption: metadata.caption || '',
                        original_youtube_url: metadata.sourceUrl || null,
                        // source_type remains the legacy transport enum. New
                        // orthogonal fields carry origin, playback, topic and rights.
                        source_type: 'native',
                        origin_type: 'generated',
                        playback_type: 'native',
                        topic,
                        rights_status: rightsStatus,
                        source_asset_id: null,
                        canonical_asset_key: metadata.canonicalAssetKey || `native:${storagePath}`,
                        media_status: 'ready',
                        is_public: true
                })
                .select()
                .maybeSingle();

            if (reelError || !reel) {
                const reason = reelError?.message || 'No data returned';
                console.warn(`Reel creation failed: ${reason}; removing uploaded object`);
                const { error: cleanupError } = await supabase.storage
                    .from(CONFIG.STORAGE_BUCKET)
                    .remove([storagePath]);
                if (cleanupError) {
                    throw new Error(`Reel creation failed (${reason}); orphan cleanup failed (${cleanupError.message})`);
                }
                throw new Error(`Reel creation failed: ${reason}`);
            }

            console.debug(`✅ Reel created: ${reel.id}`);
            return { success: true, publicUrl, reel };

        } catch (error) {
            console.warn(`❌ Upload failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // COMPLETE PIPELINE
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Complete pipeline: Download -> Clip -> Convert -> Caption -> Upload
     */
    async processVideo(videoUrl, clipConfig) {
        console.debug(`\n🎬 PROCESSING VIDEO CLIP`);
        console.debug(`   Source: ${videoUrl}`);
        console.debug(`   Start: ${clipConfig.startTime}s, Duration: ${clipConfig.duration}s`);
        console.debug('═'.repeat(60));

        try {
            const rightsStatus = clipConfig.rightsStatus || 'unknown';
            if (!['owned', 'licensed'].includes(rightsStatus)) {
                throw new Error('rights_clearance_required');
            }
            // Step 1: Download video (or specific section)
            const download = await this.downloadVideo(videoUrl, {
                startTime: this.formatTimestamp(clipConfig.startTime),
                endTime: this.formatTimestamp(clipConfig.startTime + clipConfig.duration),
                rightsStatus
            });

            if (!download.success) {
                throw new Error(`Download failed: ${download.error}`);
            }

            let currentPath = download.path;

            // Step 2: Convert to vertical if needed
            if (clipConfig.convertToVertical !== false) {
                const verticalResult = await this.convertToVertical(currentPath, { deleteOriginal: true });
                if (verticalResult.success) {
                    currentPath = verticalResult.path;
                }
            }

            // Step 3: Generate and burn captions if requested
            if (clipConfig.addCaptions) {
                const captionResult = await this.generateCaptions(currentPath);
                if (captionResult.success) {
                    const burnResult = await this.burnCaptions(currentPath, captionResult.srt);
                    if (burnResult.success) {
                        // Delete uncaptioned version
                        fs.unlinkSync(currentPath);
                        currentPath = burnResult.path;
                    }
                }
            }

            // Step 4: Upload and create reel
            const uploadResult = await this.uploadAndCreateReel(currentPath, {
                authorId: clipConfig.authorId,
                caption: clipConfig.caption || '',
                sourceUrl: videoUrl,
                duration: clipConfig.duration,
                rightsStatus,
                topic: clipConfig.topic,
                canonicalAssetKey: clipConfig.canonicalAssetKey
            });

            // Clean up local file
            if (fs.existsSync(currentPath)) {
                fs.unlinkSync(currentPath);
            }

            console.debug(`\n✅ CLIP PROCESSED SUCCESSFULLY`);
            return uploadResult;

        } catch (error) {
            console.warn(`\n❌ PIPELINE FAILED: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Process multiple clips from a single source video
     */
    async processMultipleClips(videoUrl, clips) {
        if (!Array.isArray(clips) || clips.length === 0 || clips.some(
            clip => !['owned', 'licensed'].includes(clip.rightsStatus || 'unknown')
        )) {
            return { success: false, error: 'rights_clearance_required', results: [], processed: 0, total: clips?.length || 0 };
        }
        // Download full video once
        const rightsStatus = clips.every(clip => clip.rightsStatus === 'owned') ? 'owned' : 'licensed';
        const download = await this.downloadVideo(videoUrl, { rightsStatus });
        if (!download.success) {
            return { success: false, error: download.error };
        }

        const results = [];

        for (const clip of clips) {
            // Extract clip
            const extractResult = await this.extractClip(
                download.path,
                clip.startTime,
                clip.duration
            );

            if (extractResult.success) {
                // Convert to vertical
                const verticalResult = await this.convertToVertical(
                    extractResult.path,
                    { deleteOriginal: true }
                );

                if (verticalResult.success) {
                    // Upload
                    const uploadResult = await this.uploadAndCreateReel(
                        verticalResult.path,
                        {
                            authorId: clip.authorId,
                            caption: clip.caption,
                            sourceUrl: videoUrl,
                            duration: clip.duration,
                            rightsStatus: clip.rightsStatus,
                            topic: clip.topic,
                            canonicalAssetKey: clip.canonicalAssetKey
                        }
                    );

                    results.push(uploadResult);

                    // Clean up
                    if (fs.existsSync(verticalResult.path)) {
                        fs.unlinkSync(verticalResult.path);
                    }
                } else {
                    results.push({ success: false, error: verticalResult.error || 'vertical_conversion_failed' });
                }
            } else {
                results.push({ success: false, error: extractResult.error || 'clip_extraction_failed' });
            }
        }

        // Clean up source video
        if (fs.existsSync(download.path)) {
            fs.unlinkSync(download.path);
        }

        return {
            success: results.length === clips.length && results.every(result => result.success),
            results,
            processed: results.filter(r => r.success).length,
            total: clips.length,
            error: results.some(result => !result.success) ? 'one_or_more_clips_failed' : null,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // UTILITY METHODS
    // ═══════════════════════════════════════════════════════════════════════

    formatTimestamp(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    /**
     * Get video duration in seconds
     */
    async getVideoDuration(videoPath) {
        try {
            const { stdout } = await execAsync(
                `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
            );
            return parseFloat(stdout.trim());
        } catch {
            return 0;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const videoClipper = new VideoClipper();
export default VideoClipper;
export { POKER_SOURCES, CONFIG };
