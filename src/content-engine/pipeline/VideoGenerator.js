/**
 * 🎬 AI VIDEO GENERATOR
 * ═══════════════════════════════════════════════════════════════════════════
 * Creates original short-form video content (Reels/Shorts/TikTok style).
 * 
 * Pipeline:
 * 1. Generate script from news/topic
 * 2. Create voiceover with TTS (OpenAI or ElevenLabs)
 * 3. Generate background images with AI
 * 4. Compile with FFmpeg
 * ═══════════════════════════════════════════════════════════════════════════
 */

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Configuration
const CONFIG = {
    OUTPUT_DIR: process.env.VIDEO_OUTPUT_DIR || './output/videos',
    TEMP_DIR: process.env.VIDEO_TEMP_DIR || './output/temp',

    // Video settings
    WIDTH: 1080,
    HEIGHT: 1920, // 9:16 for Reels/Shorts
    FPS: 30,

    // Audio settings
    TTS_MODEL: 'tts-1-hd',
    TTS_VOICE: 'onyx', // Options: alloy, echo, fable, onyx, nova, shimmer

    // Styling
    FONT: 'Arial-Bold',
    FONT_SIZE: 48,
    TEXT_COLOR: 'white',
    BG_COLOR: '#1a1a2e'
};

// Voice mapping for personas
const PERSONA_VOICES = {
    male: ['onyx', 'echo', 'fable'],
    female: ['nova', 'shimmer', 'alloy']
};

class VideoGenerator {
    constructor() {
        this.ensureDirectories();
    }

    ensureDirectories() {
        [CONFIG.OUTPUT_DIR, CONFIG.TEMP_DIR].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    /**
     * Generate complete video from script
     */
    async generateVideo(script, persona, options = {}) {
        const videoId = `video_${Date.now()}`;
        const tempDir = path.join(CONFIG.TEMP_DIR, videoId);
        fs.mkdirSync(tempDir, { recursive: true });

        console.log(`\n🎬 Generating video: ${videoId}\n`);

        try {
            // Step 1: Generate voiceover
            console.log('🎤 Generating voiceover...');
            const audioPath = await this.generateVoiceover(script, persona, tempDir);

            // Step 2: Get audio duration
            const duration = await this.getAudioDuration(audioPath);
            console.log(`⏱️  Audio duration: ${duration}s`);

            // Step 3: Generate background images
            console.log('🖼️  Generating visuals...');
            const imagePaths = await this.generateBackgroundImages(script, tempDir, duration);

            // Step 4: Generate text overlays
            console.log('✍️  Creating text overlays...');
            const textOverlayPath = await this.createTextOverlay(script, tempDir);

            // Step 5: Compile video
            console.log('🎞️  Compiling video...');
            const outputPath = await this.compileVideo(
                audioPath,
                imagePaths,
                textOverlayPath,
                duration,
                videoId
            );

            // Cleanup temp files
            if (!options.keepTemp) {
                fs.rmSync(tempDir, { recursive: true });
            }

            console.log(`\n✅ Video generated: ${outputPath}\n`);

            return {
                id: videoId,
                path: outputPath,
                duration: duration,
                persona: persona.alias,
                script: script,
                created_at: new Date().toISOString()
            };

        } catch (error) {
            console.error('Video generation failed:', error);
            throw error;
        }
    }

    /**
     * Generate voiceover with OpenAI TTS
     */
    async generateVoiceover(script, persona, tempDir) {
        const voice = this.getVoiceForPersona(persona);
        const audioPath = path.join(tempDir, 'voiceover.mp3');

        const response = await openai.audio.speech.create({
            model: CONFIG.TTS_MODEL,
            voice: voice,
            input: script,
            response_format: 'mp3'
        });

        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(audioPath, buffer);

        return audioPath;
    }

    /**
     * Get appropriate voice for persona
     */
    getVoiceForPersona(persona) {
        const voices = PERSONA_VOICES[persona.gender] || PERSONA_VOICES.male;
        return voices[Math.floor(Math.random() * voices.length)];
    }

    /**
     * Get audio duration using ffprobe
     */
    async getAudioDuration(audioPath) {
        const { stdout } = await execAsync(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
        );
        return parseFloat(stdout.trim());
    }

    /**
     * Generate background images with DALL-E
     */
    async generateBackgroundImages(script, tempDir, duration) {
        // Calculate how many images we need (one every 5 seconds)
        const imageCount = Math.max(1, Math.ceil(duration / 5));
        const imagePaths = [];

        // Extract key concepts for image prompts
        const imagePrompts = await this.generateImagePrompts(script, imageCount);

        for (let i = 0; i < imageCount; i++) {
            const imagePath = path.join(tempDir, `bg_${i}.png`);

            try {
                const response = await openai.images.generate({
                    model: 'dall-e-3',
                    prompt: `${imagePrompts[i]}. Style: Modern, sleek, poker-themed, dark moody atmosphere, 
                             neon accents, professional, suitable for vertical video background. 
                             No text or words in the image.`,
                    n: 1,
                    size: '1024x1792', // Closest to 9:16
                    quality: 'standard'
                });

                // Download image
                const imageUrl = response.data[0].url;
                const imageResponse = await fetch(imageUrl);
                const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
                fs.writeFileSync(imagePath, imageBuffer);
                imagePaths.push(imagePath);

            } catch (error) {
                console.error(`Image generation ${i} failed, using fallback`);
                // Create solid color fallback
                await this.createFallbackImage(imagePath);
                imagePaths.push(imagePath);
            }

            // Rate limit for DALL-E
            await this.sleep(1000);
        }

        return imagePaths;
    }

    /**
     * Generate prompts for background images
     */
    async generateImagePrompts(script, count) {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{
                role: 'user',
                content: `Based on this poker content script, generate ${count} short image prompts for background visuals.
                         Each prompt should be a different poker-related scene or concept.
                         Return as JSON array of strings.
                         
                         Script: ${script}`
            }],
            response_format: { type: 'json_object' },
            max_tokens: 300
        });

        try {
            const parsed = JSON.parse(response.choices[0].message.content);
            return parsed.prompts || Array(count).fill('Poker table with cards and chips, dramatic lighting');
        } catch {
            return Array(count).fill('Poker table with cards and chips, dramatic lighting');
        }
    }

    /**
     * Create fallback solid color image
     */
    async createFallbackImage(outputPath) {
        await execAsync(
            `ffmpeg -f lavfi -i color=c=${CONFIG.BG_COLOR}:s=${CONFIG.WIDTH}x${CONFIG.HEIGHT}:d=1 -frames:v 1 "${outputPath}" -y`
        );
    }

    /**
     * Create animated text overlay subtitle file
     */
    async createTextOverlay(script, tempDir) {
        const srtPath = path.join(tempDir, 'subtitles.srt');

        // Split script into chunks for subtitles
        const words = script.split(' ');
        const chunks = [];
        let currentChunk = [];

        words.forEach(word => {
            currentChunk.push(word);
            if (currentChunk.length >= 6 || word.endsWith('.') || word.endsWith('!') || word.endsWith('?')) {
                chunks.push(currentChunk.join(' '));
                currentChunk = [];
            }
        });
        if (currentChunk.length > 0) {
            chunks.push(currentChunk.join(' '));
        }

        // Create SRT content
        const avgDuration = 2; // seconds per chunk
        let srtContent = '';

        chunks.forEach((chunk, i) => {
            const start = this.formatSrtTime(i * avgDuration);
            const end = this.formatSrtTime((i + 1) * avgDuration);
            srtContent += `${i + 1}\n${start} --> ${end}\n${chunk}\n\n`;
        });

        fs.writeFileSync(srtPath, srtContent);
        return srtPath;
    }

    /**
     * Format time for SRT
     */
    formatSrtTime(seconds) {
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        const ms = Math.floor((seconds % 1) * 1000).toString().padStart(3, '0');
        return `${h}:${m}:${s},${ms}`;
    }

    /**
     * Compile final video with FFmpeg
     */
    async compileVideo(audioPath, imagePaths, subtitlePath, duration, videoId) {
        const outputPath = path.join(CONFIG.OUTPUT_DIR, `${videoId}.mp4`);

        // Create image sequence file
        const imageListPath = path.join(CONFIG.TEMP_DIR, videoId, 'images.txt');
        const imageDuration = duration / imagePaths.length;

        let imageListContent = '';
        imagePaths.forEach(imgPath => {
            imageListContent += `file '${imgPath}'\nduration ${imageDuration}\n`;
        });
        // Add last image again (FFmpeg requirement)
        imageListContent += `file '${imagePaths[imagePaths.length - 1]}'`;
        fs.writeFileSync(imageListPath, imageListContent);

        // FFmpeg command
        const ffmpegCmd = `ffmpeg -y \
            -f concat -safe 0 -i "${imageListPath}" \
            -i "${audioPath}" \
            -vf "scale=${CONFIG.WIDTH}:${CONFIG.HEIGHT}:force_original_aspect_ratio=decrease,pad=${CONFIG.WIDTH}:${CONFIG.HEIGHT}:(ow-iw)/2:(oh-ih)/2,subtitles=${subtitlePath}:force_style='FontName=${CONFIG.FONT},FontSize=${CONFIG.FONT_SIZE},PrimaryColour=&Hffffff&,OutlineColour=&H000000&,Outline=2,Alignment=2'" \
            -c:v libx264 -preset fast -crf 23 \
            -c:a aac -b:a 128k \
            -shortest \
            -movflags +faststart \
            "${outputPath}"`;

        await execAsync(ffmpegCmd);
        return outputPath;
    }

    /**
     * Generate video from news article
     */
    async generateFromArticle(article, persona) {
        // First, generate a video script
        const scriptResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{
                role: 'system',
                content: `You are ${persona.name}, creating a 20-30 second video script.
                         Style: ${persona.voice || 'conversational'}
                         Keep it punchy and engaging for short-form video.`
            }, {
                role: 'user',
                content: `Create a video script reacting to this poker news:
                         
                         Title: ${article.title}
                         Summary: ${article.description}
                         
                         Format: Direct to camera style, no stage directions, just the spoken words.`
            }],
            max_tokens: 200
        });

        const script = scriptResponse.choices[0].message.content;
        return this.generateVideo(script, persona);
    }

    // Utility
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export const videoGenerator = new VideoGenerator();
export default VideoGenerator;
