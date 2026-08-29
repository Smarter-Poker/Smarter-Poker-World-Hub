const PRINTFUL_API_BASE = 'https://api.printful.com';
const REQUEST_TIMEOUT_MS = 15000;
const UUID_HEX_RE = /^[0-9a-f]{32}$/i;

class PrintfulConfigurationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PrintfulConfigurationError';
        this.code = 'PRINTFUL_NOT_CONFIGURED';
    }
}

class PrintfulRequestError extends Error {
    constructor(message, status = 502) {
        super(message);
        this.name = 'PrintfulRequestError';
        this.code = 'PRINTFUL_REQUEST_FAILED';
        this.status = status;
    }
}

function cleanString(value, maxLength = 255) {
    if (typeof value !== 'string') return null;
    const cleaned = value.trim().replace(/[\u0000-\u001f\u007f]/g, ' ');
    return cleaned ? cleaned.slice(0, maxLength) : null;
}

function positiveInteger(value) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function isPrintfulConfigured(env = process.env) {
    return Boolean(cleanString(env.PRINTFUL_API_TOKEN, 4096));
}

function isAutoConfirmEnabled(env = process.env) {
    return String(env.PRINTFUL_AUTO_CONFIRM || '').trim().toLowerCase() === 'true';
}

function isPrintfulReady(env = process.env) {
    return isPrintfulConfigured(env) && isAutoConfirmEnabled(env);
}

function sanitizeExternalOrderId(orderId) {
    const compact = cleanString(orderId, 64)?.replace(/-/g, '') || '';
    if (!UUID_HEX_RE.test(compact)) {
        throw new TypeError('Printful external order ids must originate from a UUID');
    }
    return compact.toLowerCase();
}

function restoreUuidFromExternalId(externalId) {
    const compact = cleanString(String(externalId || ''), 64)?.replace(/-/g, '') || '';
    if (!UUID_HEX_RE.test(compact)) return null;
    const value = compact.toLowerCase();
    return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function metadataObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * Provider ids live in catalog metadata so they can be changed without a code
 * deployment. A variant mapping always wins over an item-level mapping.
 */
function resolvePrintfulMapping(itemMetadata, variantMetadata) {
    const item = metadataObject(itemMetadata);
    const variant = metadataObject(variantMetadata);
    const sources = [
        metadataObject(variant.printful),
        variant,
        metadataObject(item.printful),
        item,
    ];

    for (const source of sources) {
        const syncVariantId = positiveInteger(source.sync_variant_id ?? source.syncVariantId);
        if (syncVariantId) return { sync_variant_id: syncVariantId };

        const externalVariantId = cleanString(
            source.external_variant_id ?? source.externalVariantId,
            64,
        );
        if (externalVariantId) return { external_variant_id: externalVariantId };
    }
    return null;
}

function buildPrintfulItems(orderItems) {
    if (!Array.isArray(orderItems) || orderItems.length === 0) {
        throw new TypeError('A Printful order requires at least one item');
    }

    return orderItems.map((item) => {
        const quantity = positiveInteger(item?.quantity ?? item?.qty);
        const mapping = resolvePrintfulMapping(
            item?.fulfillmentMetadata,
            item?.variantFulfillmentMetadata,
        ) || resolvePrintfulMapping(item?.providerVariant, item?.providerVariant);

        if (!quantity || quantity > 10 || !mapping) {
            throw new PrintfulConfigurationError('A merchandise line is missing a valid Printful variant mapping');
        }

        return { ...mapping, quantity };
    });
}

function normalizePrintfulRecipient(sessionOrRecipient) {
    const collected = metadataObject(sessionOrRecipient?.collected_information);
    const shipping = metadataObject(
        collected.shipping_details
        || sessionOrRecipient?.shipping_details
        || sessionOrRecipient?.shipping
        || sessionOrRecipient,
    );
    const customer = metadataObject(sessionOrRecipient?.customer_details);
    const address = metadataObject(shipping.address || shipping);

    const recipient = {
        name: cleanString(shipping.name || sessionOrRecipient?.name, 120),
        address1: cleanString(address.line1 || address.address1, 200),
        address2: cleanString(address.line2 || address.address2, 200) || undefined,
        city: cleanString(address.city, 120),
        state_code: cleanString(address.state || address.state_code, 16) || undefined,
        country_code: cleanString(address.country || address.country_code, 2)?.toUpperCase(),
        zip: cleanString(address.postal_code || address.zip, 24),
        email: cleanString(customer.email || shipping.email || sessionOrRecipient?.email, 254) || undefined,
        phone: cleanString(customer.phone || shipping.phone || sessionOrRecipient?.phone, 40) || undefined,
    };

    const missing = ['name', 'address1', 'city', 'country_code', 'zip']
        .filter((field) => !recipient[field]);
    if (missing.length) {
        const error = new TypeError(`Shipping address is missing: ${missing.join(', ')}`);
        error.code = 'SHIPPING_ADDRESS_INCOMPLETE';
        throw error;
    }
    return recipient;
}

function publicShippingAddress(recipient) {
    return {
        name: recipient.name,
        line1: recipient.address1,
        line2: recipient.address2 || null,
        city: recipient.city,
        state: recipient.state_code || null,
        postal_code: recipient.zip,
        country: recipient.country_code,
    };
}

async function createPrintfulOrder({
    orderId,
    recipient,
    items,
    confirm = isAutoConfirmEnabled(),
    fetchImpl = globalThis.fetch,
    env = process.env,
    apiBase = PRINTFUL_API_BASE,
}) {
    const token = cleanString(env.PRINTFUL_API_TOKEN, 4096);
    if (!token) throw new PrintfulConfigurationError('Printful API token is not configured');
    if (typeof fetchImpl !== 'function') throw new PrintfulConfigurationError('A fetch implementation is required');

    const externalId = sanitizeExternalOrderId(orderId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    };
    const storeId = cleanString(env.PRINTFUL_STORE_ID, 64);
    if (storeId) headers['X-PF-Store-ID'] = storeId;

    try {
        const response = await fetchImpl(
            `${String(apiBase).replace(/\/$/, '')}/orders?confirm=${confirm ? 'true' : 'false'}&update_existing=true`,
            {
                method: 'POST',
                headers,
                signal: controller.signal,
                body: JSON.stringify({
                    external_id: externalId,
                    recipient,
                    items,
                }),
            },
        );
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.result) {
            throw new PrintfulRequestError(
                `Printful rejected the order request (${response.status || 502})`,
                response.status || 502,
            );
        }
        return payload.result;
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw new PrintfulRequestError('Printful order request timed out', 504);
        }
        if (error instanceof PrintfulRequestError || error instanceof PrintfulConfigurationError) throw error;
        throw new PrintfulRequestError('Printful order request failed', 502);
    } finally {
        clearTimeout(timeout);
    }
}

async function cancelPrintfulOrder({
    orderId,
    providerOrderId,
    fetchImpl = globalThis.fetch,
    env = process.env,
    apiBase = PRINTFUL_API_BASE,
}) {
    const token = cleanString(env.PRINTFUL_API_TOKEN, 4096);
    if (!token) throw new PrintfulConfigurationError('Printful API token is not configured');
    if (typeof fetchImpl !== 'function') throw new PrintfulConfigurationError('A fetch implementation is required');

    const numericProviderId = positiveInteger(providerOrderId);
    const orderReference = numericProviderId
        ? String(numericProviderId)
        : `@${sanitizeExternalOrderId(orderId)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const headers = { Authorization: `Bearer ${token}` };
    const storeId = cleanString(env.PRINTFUL_STORE_ID, 64);
    if (storeId) headers['X-PF-Store-ID'] = storeId;

    try {
        const response = await fetchImpl(
            `${String(apiBase).replace(/\/$/, '')}/orders/${encodeURIComponent(orderReference)}`,
            { method: 'DELETE', headers, signal: controller.signal },
        );
        const payload = await response.json().catch(() => null);
        // DELETE is idempotent for our reconciliation purposes: a provider
        // order that is already absent cannot subsequently be fulfilled.
        if (response.status === 404) return { canceled: true, already_absent: true };
        if (!response.ok) {
            throw new PrintfulRequestError(
                `Printful rejected the cancellation request (${response.status || 502})`,
                response.status || 502,
            );
        }
        return payload?.result || { canceled: true };
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw new PrintfulRequestError('Printful cancellation request timed out', 504);
        }
        if (error instanceof PrintfulRequestError || error instanceof PrintfulConfigurationError) throw error;
        throw new PrintfulRequestError('Printful cancellation request failed', 502);
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = {
    PRINTFUL_API_BASE,
    PrintfulConfigurationError,
    PrintfulRequestError,
    isPrintfulConfigured,
    isAutoConfirmEnabled,
    isPrintfulReady,
    sanitizeExternalOrderId,
    restoreUuidFromExternalId,
    resolvePrintfulMapping,
    buildPrintfulItems,
    normalizePrintfulRecipient,
    publicShippingAddress,
    createPrintfulOrder,
    cancelPrintfulOrder,
};
