/**
 * 📸 MEDIA UPLOAD SERVICE
 * src/app/social/MediaUploadService.js
 * 
 * Handles image and video uploads to Supabase Storage with
 * progress tracking, validation, and optimization.
 */

// ═══════════════════════════════════════════════════════════════════════════
// 📊 CONFIGURATION CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const UPLOAD_CONFIG = {
    // Size limits (in bytes)
    MAX_IMAGE_SIZE: 10 * 1024 * 1024,      // 10MB
    MAX_VIDEO_SIZE: 100 * 1024 * 1024,     // 100MB
    MAX_AVATAR_SIZE: 5 * 1024 * 1024,      // 5MB
    MAX_COVER_SIZE: 10 * 1024 * 1024,      // 10MB

    // Allowed MIME types
    ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    ALLOWED_VIDEO_TYPES: ['video/mp4', 'video/webm', 'video/quicktime'],

    // Bucket names
    BUCKETS: {
        images: 'social-images',
        videos: 'social-videos',
        avatars: 'user-avatars',
        covers: 'user-covers'
    },

    // Image optimization
    MAX_IMAGE_DIMENSION: 2048,
    JPEG_QUALITY: 0.85,
    THUMBNAIL_SIZE: 400
};

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate file before upload
 * @param {File} file - File to validate
 * @param {string} mediaType - 'image' | 'video' | 'avatar' | 'cover'
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateFile(file, mediaType = 'image') {
    if (!file) {
        return { valid: false, error: 'No file provided' };
    }

    // Check file size
    const maxSize = {
        image: UPLOAD_CONFIG.MAX_IMAGE_SIZE,
        video: UPLOAD_CONFIG.MAX_VIDEO_SIZE,
        avatar: UPLOAD_CONFIG.MAX_AVATAR_SIZE,
        cover: UPLOAD_CONFIG.MAX_COVER_SIZE
    }[mediaType] || UPLOAD_CONFIG.MAX_IMAGE_SIZE;

    if (file.size > maxSize) {
        const sizeMB = (maxSize / (1024 * 1024)).toFixed(0);
        return { valid: false, error: `File size exceeds ${sizeMB}MB limit` };
    }

    // Check MIME type
    const allowedTypes = mediaType === 'video'
        ? UPLOAD_CONFIG.ALLOWED_VIDEO_TYPES
        : UPLOAD_CONFIG.ALLOWED_IMAGE_TYPES;

    if (!allowedTypes.includes(file.type)) {
        return { valid: false, error: `File type ${file.type} is not supported` };
    }

    return { valid: true };
}

/**
 * Get image dimensions
 * @param {File} file - Image file
 * @returns {Promise<{ width: number, height: number }>}
 */
async function getImageDimensions(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            resolve({ width: img.width, height: img.height });
            URL.revokeObjectURL(img.src);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

/**
 * Get video metadata
 * @param {File} file - Video file
 * @returns {Promise<{ width: number, height: number, duration: number }>}
 */
async function getVideoMetadata(file) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';

        video.onloadedmetadata = () => {
            resolve({
                width: video.videoWidth,
                height: video.videoHeight,
                duration: video.duration
            });
            URL.revokeObjectURL(video.src);
        };
        video.onerror = reject;
        video.src = URL.createObjectURL(file);
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// 🖼️ IMAGE OPTIMIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resize and optimize image
 * @param {File} file - Original image file
 * @param {Object} options - Resize options
 * @returns {Promise<Blob>}
 */
async function optimizeImage(file, options = {}) {
    const {
        maxDimension = UPLOAD_CONFIG.MAX_IMAGE_DIMENSION,
        quality = UPLOAD_CONFIG.JPEG_QUALITY,
        format = 'image/jpeg'
    } = options;

    // Skip optimization for GIFs (preserve animation)
    if (file.type === 'image/gif') {
        return file;
    }

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;

            // Calculate new dimensions
            if (width > maxDimension || height > maxDimension) {
                const ratio = Math.min(maxDimension / width, maxDimension / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }

            // Create canvas and draw
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Convert to blob
            canvas.toBlob(
                (blob) => {
                    resolve(blob);
                    URL.revokeObjectURL(img.src);
                },
                format,
                quality
            );
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

/**
 * Create thumbnail from image
 * @param {File} file - Image file
 * @returns {Promise<Blob>}
 */
async function createThumbnail(file) {
    return optimizeImage(file, {
        maxDimension: UPLOAD_CONFIG.THUMBNAIL_SIZE,
        quality: 0.7
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// 📤 MEDIA UPLOAD SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

import { getAuthUser } from '../lib/authUtils';

export class MediaUploadService {
    constructor(supabaseClient, userId = null) {
        this.supabase = supabaseClient;
        // 🛡️ BULLETPROOF: Accept optional userId to avoid getUser() AbortError
        // Falls back to authUtils if not provided (backwards compatible)
        this.userId = userId;
    }

    // Helper to get userId safely
    _getUserId() {
        if (this.userId) return this.userId;
        // Fallback to authUtils (synchronous, safe)
        const user = getAuthUser();
        return user?.id || null;
    }

    /**
     * Upload a file to Supabase Storage
     * @param {File} file - File to upload
     * @param {Object} options - Upload options
     * @param {Function} onProgress - Progress callback (0-100)
     * @returns {Promise<{ url: string, mediaId: string, metadata: Object }>}
     */
    async uploadFile(file, { mediaType = 'image', postId = null } = {}, onProgress) {
        // Validate
        const validation = validateFile(file, mediaType);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        // Get current user (using safe helper)
        const userId = this._getUserId();
        if (!userId) {
            throw new Error('User not authenticated');
        }

        // Create upload record in database
        const { data: uploadData, error: uploadError } = await this.supabase.rpc(
            'fn_create_media_upload',
            {
                p_user_id: userId,
                p_file_name: file.name,
                p_mime_type: file.type,
                p_file_size: file.size,
                p_media_type: mediaType
            }
        );

        if (uploadError) {
            console.error('Upload record creation failed:', uploadError);
            throw new Error('Failed to initialize upload');
        }

        const { media_id, bucket_name, file_path } = uploadData[0];

        // Optimize image if needed
        let uploadFile = file;
        if (mediaType !== 'video' && file.type !== 'image/gif') {
            try {
                onProgress?.(5);
                uploadFile = await optimizeImage(file);
                onProgress?.(15);
            } catch (err) {
                console.warn('Image optimization failed, using original:', err);
            }
        }

        try {
            // Upload to Supabase Storage
            const { error: storageError } = await this.supabase.storage
                .from(bucket_name)
                .upload(file_path, uploadFile, {
                    cacheControl: '31536000', // 1 year cache
                    upsert: false,
                    onUploadProgress: (progress) => {
                        const percent = Math.round((progress.loaded / progress.total) * 70) + 20;
                        onProgress?.(Math.min(percent, 90));
                    }
                });

            if (storageError) {
                throw storageError;
            }

            onProgress?.(92);

            // Get metadata
            let metadata = { width: null, height: null, duration: null };
            try {
                if (mediaType === 'video') {
                    metadata = await getVideoMetadata(file);
                } else {
                    const dims = await getImageDimensions(file);
                    metadata = { ...dims, duration: null };
                }
            } catch (err) {
                console.warn('Failed to extract metadata:', err);
            }

            onProgress?.(95);

            // Mark upload complete
            await this.supabase.rpc('fn_complete_media_upload', {
                p_media_id: media_id,
                p_width: metadata.width,
                p_height: metadata.height,
                p_duration_seconds: metadata.duration
            });

            // Link to post if provided
            if (postId) {
                await this.supabase
                    .from('social_media')
                    .update({ post_id: postId })
                    .eq('id', media_id);
            }

            onProgress?.(100);

            // Get public URL
            const { data: urlData } = this.supabase.storage
                .from(bucket_name)
                .getPublicUrl(file_path);

            return {
                url: urlData.publicUrl,
                mediaId: media_id,
                metadata: {
                    width: metadata.width,
                    height: metadata.height,
                    duration: metadata.duration,
                    mimeType: file.type,
                    size: file.size
                }
            };

        } catch (error) {
            // Clean up failed upload
            await this.supabase
                .from('social_media')
                .update({ processing_status: 'failed' })
                .eq('id', media_id);

            throw error;
        }
    }

    /**
     * Upload multiple files
     * @param {File[]} files - Files to upload
     * @param {Object} options - Upload options
     * @param {Function} onProgress - Progress callback ({ file, progress, completed, total })
     * @returns {Promise<Array<{ url: string, mediaId: string, metadata: Object }>>}
     */
    async uploadMultiple(files, options = {}, onProgress) {
        const results = [];
        const total = files.length;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const mediaType = file.type.startsWith('video/') ? 'video' : 'image';

            const result = await this.uploadFile(
                file,
                { ...options, mediaType },
                (progress) => {
                    onProgress?.({
                        file: file.name,
                        progress,
                        completed: i,
                        total
                    });
                }
            );

            results.push(result);
        }

        return results;
    }

    /**
     * Upload avatar image
     * @param {File} file - Avatar image
     * @param {Function} onProgress - Progress callback
     * @returns {Promise<{ url: string, mediaId: string }>}
     */
    async uploadAvatar(file, onProgress) {
        // Optimize to square
        const optimized = await optimizeImage(file, {
            maxDimension: 512,
            quality: 0.9
        });

        return this.uploadFile(optimized, { mediaType: 'avatar' }, onProgress);
    }

    /**
     * Upload cover image
     * @param {File} file - Cover image
     * @param {Function} onProgress - Progress callback
     * @returns {Promise<{ url: string, mediaId: string }>}
     */
    async uploadCover(file, onProgress) {
        // Optimize for cover (wide aspect ratio)
        const optimized = await optimizeImage(file, {
            maxDimension: 1920,
            quality: 0.85
        });

        return this.uploadFile(optimized, { mediaType: 'cover' }, onProgress);
    }

    /**
     * Delete a media file
     * @param {string} mediaId - Media UUID
     * @returns {Promise<boolean>}
     */
    async deleteMedia(mediaId) {
        // Get media info
        const { data: media, error: fetchError } = await this.supabase
            .from('social_media')
            .select('bucket_name, file_path')
            .eq('id', mediaId)
            .single();

        if (fetchError || !media) {
            throw new Error('Media not found');
        }

        // Delete from storage
        const { error: storageError } = await this.supabase.storage
            .from(media.bucket_name)
            .remove([media.file_path]);

        if (storageError) {
            console.error('Storage deletion failed:', storageError);
        }

        // Delete database record
        const { error: dbError } = await this.supabase
            .from('social_media')
            .delete()
            .eq('id', mediaId);

        if (dbError) {
            throw dbError;
        }

        return true;
    }

    /**
     * Get user's storage usage
     * @returns {Promise<{ used: number, limit: number, percentage: number }>}
     */
    async getStorageUsage() {
        const userId = this._getUserId();
        if (!userId) return { used: 0, limit: 0, percentage: 0 };

        const { data, error } = await this.supabase
            .from('user_dna_profiles')
            .select('storage_used_bytes, storage_limit_bytes')
            .eq('user_id', userId)
            .single();

        if (error || !data) {
            return { used: 0, limit: 1073741824, percentage: 0 };
        }

        const used = data.storage_used_bytes || 0;
        const limit = data.storage_limit_bytes || 1073741824;

        return {
            used,
            limit,
            percentage: Math.round((used / limit) * 100)
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🏭 FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function createMediaUploadService(supabaseClient) {
    return new MediaUploadService(supabaseClient);
}

export default MediaUploadService;
