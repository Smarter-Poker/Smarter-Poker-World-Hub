/**
 * Grok API Client (xAI)
 * 
 * OpenAI-compatible wrapper for xAI's Grok API.
 * Uses a proxy to automatically map OpenAI model names to Grok equivalents.
 * 
 * Base URL: https://api.x.ai/v1
 * API Key: XAI_API_KEY environment variable
 * 
 * @see https://docs.x.ai/docs/models
 */

import OpenAI from 'openai';

/**
 * Feature flag to enable/disable Grok API
 * Set USE_GROK_API=false to fallback to OpenAI
 */
const USE_GROK = process.env.USE_GROK_API !== 'false';

/**
 * Model mapping from OpenAI to Grok
 */
const MODEL_MAP = {
    'gpt-4o': 'grok-3',
    'gpt-4o-mini': 'grok-3-mini',
    'gpt-3.5-turbo': 'grok-3',
    'gpt-4': 'grok-3',
    'gpt-4-turbo': 'grok-3',
    'gpt-4-vision-preview': 'grok-2-vision-1212',
    'dall-e-3': 'grok-2-image-1212',
    'dall-e-2': 'grok-2-image-1212',
};

/**
 * Map OpenAI model names to Grok equivalents
 */
export function mapModelToGrok(openaiModel) {
    if (!USE_GROK) {
        return openaiModel;
    }
    return MODEL_MAP[openaiModel] || 'grok-3';
}

/**
 * Create a proxied OpenAI client that automatically maps models
 */
function createGrokProxyClient() {
    if (!process.env.XAI_API_KEY) {
        console.warn('[GrokClient] XAI_API_KEY not set - API calls will fail');
    }

    // Create the base Grok client
    const baseClient = new OpenAI({
        apiKey: process.env.XAI_API_KEY || 'not-set',
        baseURL: 'https://api.x.ai/v1',
    });

    // Create proxied chat.completions.create that maps models
    const originalCreate = baseClient.chat.completions.create.bind(baseClient.chat.completions);
    baseClient.chat.completions.create = async function (params) {
        const mappedModel = mapModelToGrok(params.model);
        console.log(`[GrokClient] Model mapping: ${params.model} → ${mappedModel}`);
        return originalCreate({
            ...params,
            model: mappedModel,
        });
    };

    // Create proxied images.generate that maps models
    const originalImagesGenerate = baseClient.images.generate.bind(baseClient.images);
    baseClient.images.generate = async function (params) {
        const mappedModel = mapModelToGrok(params.model);
        console.log(`[GrokClient] Image model mapping: ${params.model} → ${mappedModel}`);
        return originalImagesGenerate({
            ...params,
            model: mappedModel,
        });
    };

    return baseClient;
}

/**
 * Create fallback OpenAI client
 */
function createOpenAIClient() {
    if (!process.env.OPENAI_API_KEY) {
        return null;
    }
    return new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });
}

// Initialize clients
let grokClient = null;
let openaiClient = null;

/**
 * Get the active AI client (Grok or OpenAI fallback)
 * Returns a proxied client that automatically maps models when using Grok
 */
export function getAIClient() {
    if (USE_GROK) {
        if (!grokClient) {
            grokClient = createGrokProxyClient();
        }
        return grokClient;
    } else {
        if (!openaiClient) {
            openaiClient = createOpenAIClient();
        }
        if (!openaiClient) {
            throw new Error('OpenAI fallback is enabled but OPENAI_API_KEY is not set');
        }
        return openaiClient;
    }
}

/**
 * Alias for getAIClient - for backwards compatibility
 */
export const getGrokClient = getAIClient;

/**
 * Create a chat completion with automatic model mapping
 */
export async function createChatCompletion(params) {
    const client = getAIClient();
    return client.chat.completions.create(params);
}

/**
 * Generate an image with automatic model mapping
 */
export async function generateImage(params) {
    const client = getAIClient();
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

// Default export - the Grok client with auto model mapping
export default getAIClient();
