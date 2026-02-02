/**
 * 🎬 VIRAL POKER VIDEO CLIPPER
 * ═══════════════════════════════════════════════════════════════════════════
 * Downloads viral poker content from YouTube/Twitch and clips it into
 * short-form vertical videos for TikTok/Reels style content.
 * 
 * SOURCES (Best for clipping):
 * - Hustler Casino Live (YouTube) - Most permissive
 * - HCL Poker Clips (YouTube) - Pre-clipped content
 * - Twitch poker streamers
 * - Poker compilation channels
 * 
 * AVOID:
 * - PokerGO (strict DMCA enforcement)
 * 
 * PIPELINE:
 * 1. Discover viral videos from curated channels
 * 2. Download via yt-dlp
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
    STORAGE_PATH: 'reels/clips'
};

// ═══════════════════════════════════════════════════════════════════════════
// CURATED POKER VIDEO SOURCES
// These are channels known for permissive content policies
// ═══════════════════════════════════════════════════════════════════════════
const POKER_SOURCES = {
    youtube_channels: [
        {
            id: 'UCNJhx0JD6HoT1fz0Z3tZpSw', // Hustler Casino Live
            name: 'Hustler Casino Live',
            type: 'livestream_highlights',
            safe_to_clip: true
        },
        {
            id: 'UC_lVPKHbLDIkdI5H84VRwxQ', // HCL Poker Clips
            name: 'HCL Poker Clips',
            type: 'pre_clipped',
            safe_to_clip: true
        },
        {
            id: 'UCrM5f8qg7mPwDzFXaeLYG4g', // PokerStars
            name: 'PokerStars',
            type: 'tournament_highlights',
            safe_to_clip: true
        },
        {
            id: 'UCB_sfU5NC1dlIVj7pz7Y5NQ', // Doug Polk Poker
            name: 'Doug Polk Poker',
            type: 'analysis_clips',
            safe_to_clip: true
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
            const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
            if (supabaseUrl && supabaseKey) {
                this.supabase = createClient(supabaseUrl, supabaseKey);
            }
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

    // ═══════════════════════════════════════════════════════════════════════
    // DOWNLOAD METHODS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Download a video or specific section using yt-dlp
     * Supports: YouTube, Twitch clips, Twitter, TikTok
     */
    async downloadVideo(url, options = {}) {
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

        console.log(`📥 Downloading: ${url}`);
        console.log(`   Args: yt-dlp ${ytdlpArgs.join(' ')}`);

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
                console.log(`✅ Downloaded: ${outputPath}`);
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
            console.error(`❌ Download failed: ${error.message}`);
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
            const { stdout } = await execAsync(`yt-dlp --dump-json "${url}"`);
            return JSON.parse(stdout);
        } catch (error) {
            console.error(`Failed to get video info: ${error.message}`);
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

        console.log(`✂️ Extracting clip: ${startSeconds}s for ${duration}s`);

        try {
            await execAsync(ffmpegCmd);

            if (fs.existsSync(outputPath)) {
                console.log(`✅ Clip extracted: ${outputPath}`);
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
            console.error(`❌ Clip extraction failed: ${error.message}`);
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

        console.log(`📐 Converting to vertical: ${inputPath}`);

        try {
            await execAsync(ffmpegCmd, { maxBuffer: 100 * 1024 * 1024 });

            if (fs.existsSync(outputPath)) {
                console.log(`✅ Converted to vertical: ${outputPath}`);

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
            console.error(`❌ Vertical conversion failed: ${error.message}`);
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
            console.error(`Caption generation failed: ${error.message}`);
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
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`;
        const storagePath = `${CONFIG.STORAGE_PATH}/${fileName}`;

        console.log(`☁️ Uploading clip to storage...`);

        const supabase = this.getSupabase();
        if (!supabase) {
            return { success: false, error: 'Supabase client not configured' };
        }

        try {
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
            console.log(`✅ Uploaded: ${publicUrl}`);

            // Create reel record if author provided
            if (metadata.authorId) {
                const { data: reel, error: reelError } = await supabase
                    .from('social_reels')
                    .insert({
                        author_id: metadata.authorId,
                        video_url: publicUrl,
                        caption: metadata.caption || '',
                        source_url: metadata.sourceUrl || null,
                        source_type: metadata.sourceType || 'clipped',
                        duration_seconds: metadata.duration || null,
                        visibility: 'public'
                    })
                    .select()
                    .single();

                if (reelError) {
                    console.error(`Reel record creation failed: ${reelError.message}`);
                } else {
                    console.log(`✅ Reel created: ${reel.id}`);
                    return { success: true, publicUrl, reel };
                }
            }

            return { success: true, publicUrl };

        } catch (error) {
            console.error(`❌ Upload failed: ${error.message}`);
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
        console.log(`\n🎬 PROCESSING VIDEO CLIP`);
        console.log(`   Source: ${videoUrl}`);
        console.log(`   Start: ${clipConfig.startTime}s, Duration: ${clipConfig.duration}s`);
        console.log('═'.repeat(60));

        try {
            // Step 1: Download video (or specific section)
            const download = await this.downloadVideo(videoUrl, {
                startTime: this.formatTimestamp(clipConfig.startTime),
                endTime: this.formatTimestamp(clipConfig.startTime + clipConfig.duration)
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
                sourceType: 'clipped',
                duration: clipConfig.duration
            });

            // Clean up local file
            if (fs.existsSync(currentPath)) {
                fs.unlinkSync(currentPath);
            }

            console.log(`\n✅ CLIP PROCESSED SUCCESSFULLY`);
            return uploadResult;

        } catch (error) {
            console.error(`\n❌ PIPELINE FAILED: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Process multiple clips from a single source video
     */
    async processMultipleClips(videoUrl, clips) {
        // Download full video once
        const download = await this.downloadVideo(videoUrl);
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
                            duration: clip.duration
                        }
                    );

                    results.push(uploadResult);

                    // Clean up
                    if (fs.existsSync(verticalResult.path)) {
                        fs.unlinkSync(verticalResult.path);
                    }
                }
            }
        }

        // Clean up source video
        if (fs.existsSync(download.path)) {
            fs.unlinkSync(download.path);
        }

        return {
            success: true,
            results,
            processed: results.filter(r => r.success).length,
            total: clips.length
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
