/**
 * Grok API Client (xAI)
 * 
 * OpenAI-compatible wrapper for xAI's Grok API.
 * Uses the OpenAI SDK with custom base URL for seamless integration.
 * 
 * Base URL: https://api.x.ai/v1
 * API Key: XAI_API_KEY environment variable
 * 
 * @see https://docs.x.ai/docs/models
 */

import OpenAI from 'openai';

// Initialize Grok client with xAI endpoint
const grok = new OpenAI({
    apiKey: process.env.XAI_API_KEY,
    baseURL: 'https://api.x.ai/v1',
});

/**
 * Feature flag to enable/disable Grok API
 * Set USE_GROK_API=false to fallback to OpenAI
 */
const USE_GROK = process.env.USE_GROK_API !== 'false';

/**
 * Fallback OpenAI client (for rollback capability)
 */
let openaiClient = null;
if (!USE_GROK && process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });
}

/**
 * Get the active AI client (Grok or OpenAI fallback)
 */
export function getAIClient() {
    if (USE_GROK) {
        if (!process.env.XAI_API_KEY) {
            throw new Error('XAI_API_KEY environment variable is not set. Get your key from https://console.x.ai');
        }
        return grok;
    } else {
        if (!openaiClient) {
            throw new Error('OpenAI fallback is enabled but OPENAI_API_KEY is not set');
        }
        return openaiClient;
    }
}

/**
 * Map OpenAI model names to Grok equivalents
 * 
 * @param {string} openaiModel - OpenAI model name (e.g., 'gpt-4o')
 * @returns {string} Grok model name (e.g., 'grok-3')
 */
export function mapModelToGrok(openaiModel) {
    if (!USE_GROK) {
        return openaiModel; // Return original if using OpenAI fallback
    }

    const modelMap = {
        'gpt-4o': 'grok-3',
        'gpt-4o-mini': 'grok-3-mini',
        'gpt-3.5-turbo': 'grok-3',
        'gpt-4': 'grok-3',
        'gpt-4-turbo': 'grok-3',
    };

    return modelMap[openaiModel] || 'grok-3'; // Default to grok-3
}

/**
 * Create a chat completion with automatic model mapping
 * 
 * @param {object} params - OpenAI-compatible parameters
 * @returns {Promise} Chat completion response
 */
export async function createChatCompletion(params) {
    const client = getAIClient();
    const model = mapModelToGrok(params.model);

    return client.chat.completions.create({
        ...params,
        model,
    });
}

/**
 * Generate an image with Grok's image generation API
 * 
 * @param {object} params - Image generation parameters
 * @returns {Promise} Image generation response
 */
export async function generateImage(params) {
    const client = getAIClient();

    // Grok uses the same API structure as DALL-E
    return client.images.generate(params);
}

/**
 * Check if Grok API is enabled
 */
export function isGrokEnabled() {
    return USE_GROK;
}

/**
 * Get the current provider name
 */
export function getProviderName() {
    return USE_GROK ? 'Grok (xAI)' : 'OpenAI';
}

// Default export
export default grok;
