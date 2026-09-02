/**
 * MERCHANDISE CATALOG ADMIN
 *   GET    - the whole catalog, shaped with Printful mapping state
 *   POST   - create an item or a variant
 *   PATCH  - update an item or a variant
 *   DELETE - archive (is_active = false); nothing here ever hard-deletes
 *
 * Built on withOperatorRoute. Every validation, every Printful mapping rule and
 * every zero-row check below is unchanged; what moved is the auth preamble, the
 * rate limit, the response envelope and the audit shape.
 *
 * A variant id is validated with the shared uuid() helper, which accepts every
 * RFC 4122 layout. The regex that used to live here only accepted v1 to v5, so
 * a v7 variant id was rejected with a 400 that named no real problem.
 */
import { withOperatorRoute } from '../../../src/lib/horses/operatorRoute.js';
import { PERMISSIONS } from '../../../src/lib/horses/permissions.js';
import { ApiError } from '../../../src/lib/horses/apiEnvelope.js';
import { auditOperatorAction } from '../../../src/lib/horses/operatorAudit.js';
import { uuid } from '../../../src/lib/horses/validate.js';
const { isPrintfulReady, resolvePrintfulMapping } = require('../../../src/lib/store/printfulFulfillment');

const CATEGORIES = ['apparel', 'headwear', 'eyewear', 'tabletop', 'accessories', 'lifestyle'];
const PROVIDERS = ['printful', 'provider_pending', 'manual'];
const FULFILLMENT_STATUSES = ['mapping_required', 'mapped', 'provider_required', 'paused', 'disabled'];
const ITEM_ID_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;
const SKU_RE = /^[A-Z0-9][A-Z0-9-]{2,63}$/;

/** A 400 the operator can act on. Extends ApiError so the wrapper keeps its
 *  status and its message instead of scrubbing it as an unknown throw. */
class CatalogInputError extends ApiError {
  constructor(message) {
    super(400, message, 'invalid_catalog_input');
    this.name = 'CatalogInputError';
  }
}

function cleanString(value, maxLength, { required = false } = {}) {
  if (value === undefined) return undefined;
  if (value === null) return required ? undefined : null;
  const cleaned = String(value).trim().replace(/[\u0000-\u001f\u007f]/g, ' ');
  if (required && !cleaned) return undefined;
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function finiteNumber(value, min, max, { integer = false, nullable = false } = {}) {
  if (value === undefined) return undefined;
  if (nullable && (value === null || value === '')) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return undefined;
  return integer ? Math.round(parsed) : Math.round(parsed * 100) / 100;
}

function validImageUrl(value) {
  if (value === undefined) return undefined;
  const cleaned = cleanString(value, 500);
  if (cleaned === null) return null;
  if (cleaned.startsWith('/images/merch/') || cleaned.startsWith('/merch/')) return cleaned;
  try {
    const url = new URL(cleaned);
    return url.protocol === 'https:' ? url.toString().slice(0, 500) : undefined;
  } catch {
    return undefined;
  }
}

function metadataPatch(input = {}) {
  const patch = {};
  if (typeof input.made_to_order === 'boolean') patch.made_to_order = input.made_to_order;

  if (input.fulfillment_provider !== undefined) {
    if (input.fulfillment_provider === null || input.fulfillment_provider === '') patch.fulfillment_provider = null;
    else if (PROVIDERS.includes(input.fulfillment_provider)) patch.fulfillment_provider = input.fulfillment_provider;
  }

  if (input.fulfillment_status !== undefined) {
    if (input.fulfillment_status === null || input.fulfillment_status === '') patch.fulfillment_status = null;
    else if (FULFILLMENT_STATUSES.includes(input.fulfillment_status)) patch.fulfillment_status = input.fulfillment_status;
  }

  for (const field of ['design_collection', 'product_type']) {
    const value = cleanString(input[field], 100);
    if (value !== undefined) patch[field] = value;
  }

  if (input.sync_variant_id !== undefined) {
    if (input.sync_variant_id === null || input.sync_variant_id === '') patch.sync_variant_id = null;
    else {
      const id = finiteNumber(input.sync_variant_id, 1, Number.MAX_SAFE_INTEGER, { integer: true });
      if (id !== undefined) patch.sync_variant_id = id;
    }
  }

  if (input.external_variant_id !== undefined) {
    patch.external_variant_id = cleanString(input.external_variant_id, 64);
  }

  return patch;
}

function mergeMetadata(current, input) {
  const next = { ...(current && typeof current === 'object' ? current : {}), ...metadataPatch(input) };
  for (const key of ['fulfillment_provider', 'fulfillment_status', 'design_collection', 'product_type', 'sync_variant_id', 'external_variant_id']) {
    if (next[key] === null) delete next[key];
  }
  const mapping = resolvePrintfulMapping(next, next);
  if (next.fulfillment_provider === 'printful') {
    next.fulfillment_status = mapping ? 'mapped' : 'mapping_required';
    next.made_to_order = true;
  }
  return next;
}

function itemPayload(body, { creating = false } = {}) {
  const payload = {};
  if (creating) {
    const id = cleanString(body.id, 64, { required: true });
    if (!id || !ITEM_ID_RE.test(id)) throw new CatalogInputError('Product ID must be a 3-64 character lowercase slug');
    payload.id = id;
  }

  const name = cleanString(body.name, 120, { required: creating });
  if (creating && !name) throw new CatalogInputError('Product Name is required');
  if (name !== undefined) payload.name = name;

  const description = cleanString(body.description, 500);
  if (description !== undefined) payload.description = description;

  if (body.category !== undefined) {
    if (!CATEGORIES.includes(body.category)) throw new CatalogInputError('Invalid merchandise category');
    payload.category = body.category;
  } else if (creating) payload.category = 'accessories';

  if (body.image_url !== undefined) {
    const imageUrl = validImageUrl(body.image_url);
    if (imageUrl === undefined) throw new CatalogInputError('Image URL must be HTTPS or a merchandise asset path');
    payload.image_url = imageUrl;
  }

  if (body.price_usd !== undefined || creating) {
    const priceUsd = finiteNumber(body.price_usd, 0.01, 2000);
    if (priceUsd === undefined) throw new CatalogInputError('USD Price must be between $0.01 and $2,000');
    payload.price_usd = priceUsd;
  }

  if (body.price_diamonds !== undefined) {
    const diamonds = finiteNumber(body.price_diamonds, 1, 200000, { integer: true, nullable: true });
    if (diamonds === undefined) throw new CatalogInputError('Diamond Price must be between 1 and 200,000');
    payload.price_diamonds = diamonds;
  } else if (creating) payload.price_diamonds = Math.ceil(payload.price_usd * 100);

  if (body.sort_order !== undefined) {
    const sortOrder = finiteNumber(body.sort_order, -100000, 100000, { integer: true });
    if (sortOrder === undefined) throw new CatalogInputError('Sort Order is invalid');
    payload.sort_order = sortOrder;
  } else if (creating) payload.sort_order = 0;

  if (body.stock !== undefined) {
    const stock = finiteNumber(body.stock, 0, 1000000, { integer: true, nullable: true });
    if (stock === undefined) throw new CatalogInputError('Stock must be blank or a whole number between 0 and 1,000,000');
    payload.stock = stock;
  }

  for (const field of ['is_active', 'has_variants']) {
    if (typeof body[field] === 'boolean') payload[field] = body[field];
  }

  return payload;
}

function variantPayload(body, { creating = false } = {}) {
  const payload = {};
  if (creating) {
    const itemId = cleanString(body.item_id, 64, { required: true });
    const sku = cleanString(body.sku, 64, { required: true })?.toUpperCase();
    if (!itemId || !ITEM_ID_RE.test(itemId)) throw new CatalogInputError('A valid Product ID is required');
    if (!sku || !SKU_RE.test(sku)) throw new CatalogInputError('SKU must use uppercase letters, digits, and dashes');
    payload.item_id = itemId;
    payload.sku = sku;
  } else if (body.sku !== undefined) {
    const sku = cleanString(body.sku, 64, { required: true })?.toUpperCase();
    if (!sku || !SKU_RE.test(sku)) throw new CatalogInputError('SKU must use uppercase letters, digits, and dashes');
    payload.sku = sku;
  }

  for (const field of ['size', 'color']) {
    const value = cleanString(body[field], 50);
    if (value !== undefined) payload[field] = value;
  }

  for (const [field, min, max, options] of [
    ['price_usd', 0.01, 2000, { nullable: true }],
    ['price_diamonds', 1, 200000, { integer: true, nullable: true }],
    ['stock', 0, 1000000, { integer: true }],
    ['sort_order', -100000, 100000, { integer: true }],
  ]) {
    if (body[field] !== undefined || (creating && field === 'stock')) {
      const value = finiteNumber(body[field] ?? 0, min, max, options);
      if (value === undefined) throw new CatalogInputError(`${field.replaceAll('_', ' ')} is invalid`);
      payload[field] = value;
    }
  }
  if (typeof body.is_active === 'boolean') payload.is_active = body.is_active;
  return payload;
}

async function loadCatalog(supabase) {
  const [{ data: items, error: itemError }, { data: variants, error: variantError }] = await Promise.all([
    supabase.from('merchandise_items').select('*').order('sort_order').order('name').limit(500),
    supabase.from('merchandise_item_variants').select('*').order('sort_order').order('sku').limit(5000),
  ]);
  if (itemError) throw itemError;
  if (variantError) throw variantError;

  const variantsByItem = new Map();
  for (const variant of variants || []) {
    if (!variantsByItem.has(variant.item_id)) variantsByItem.set(variant.item_id, []);
    const mapping = resolvePrintfulMapping(null, variant.metadata);
    variantsByItem.get(variant.item_id).push({ ...variant, fulfillment_mapped: Boolean(mapping) });
  }
  const ready = isPrintfulReady();
  const shaped = (items || []).map(item => {
    const itemVariants = variantsByItem.get(item.id) || [];
    const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    const activeVariants = itemVariants.filter(variant => variant.is_active);
    const mappedVariants = activeVariants.filter(variant => variant.fulfillment_mapped);
    const itemMapped = Boolean(resolvePrintfulMapping(metadata, null));
    const mapped = activeVariants.length > 0 ? mappedVariants.length === activeVariants.length : itemMapped;
    return {
      ...item,
      metadata,
      variants: itemVariants,
      fulfillment_mapped: mapped,
      fulfillment_ready: Boolean(ready && metadata.fulfillment_provider === 'printful' && mapped),
    };
  });
  return {
    items: shaped,
    categories: CATEGORIES,
    providers: PROVIDERS,
    fulfillmentStatuses: FULFILLMENT_STATUSES,
    printfulReady: ready,
  };
}

async function syncHasVariants(supabase, itemId) {
  const { count, error } = await supabase
    .from('merchandise_item_variants')
    .select('id', { count: 'exact', head: true })
    .eq('item_id', itemId)
    .eq('is_active', true);
  if (error) throw error;
  const { data: updatedItem, error: updateError } = await supabase
    .from('merchandise_items')
    .update({ has_variants: Number(count || 0) > 0 })
    .eq('id', itemId)
    .select('id')
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updatedItem) throw new Error('Product variant state could not be verified');
}

export const spec = {
  name: 'horses.merch-catalog-admin',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  permission: {
    GET: PERMISSIONS.CONSOLE_READ,
    POST: PERMISSIONS.CATALOG_WRITE,
    PATCH: PERMISSIONS.CATALOG_WRITE,
    DELETE: PERMISSIONS.CATALOG_WRITE,
  },
  limit: { GET: 'read', POST: 'write', PATCH: 'write', DELETE: 'write' },
};

export async function handle({ req, res, op, db, method, body: rawBody }) {
  const supabase = db;

  if (method === 'GET') {
    const catalog = await loadCatalog(supabase);
    res.setHeader('Cache-Control', 'no-store');
    return catalog;
  }

  const body = rawBody && typeof rawBody === 'object' ? rawBody : {};
  const entity = body.entity;
  if (!['item', 'variant'].includes(entity)) {
    throw new CatalogInputError('Entity Must Be Item Or Variant');
  }

  if (method === 'POST') {
    if (entity === 'item') {
      const payload = itemPayload(body, { creating: true });
      payload.metadata = mergeMetadata({}, body.metadata || {});
      const { data, error } = await supabase.from('merchandise_items').insert(payload).select().maybeSingle();
      if (error) {
        if (error.code === '23505') throw new ApiError(409, 'That Product ID Already Exists', 'duplicate_item_id');
        throw error;
      }
      if (!data) throw new ApiError(500, 'Product Creation Could Not Be Verified', 'create_unverified');
      await auditOperatorAction(op, req, {
        action: 'merchandise.item_created',
        targetType: 'merchandise_item',
        targetId: data.id,
        after: data,
      });
      return { item: data, record: data };
    }

    const payload = variantPayload(body, { creating: true });
    payload.metadata = mergeMetadata({}, body.metadata || {});
    const { data, error } = await supabase.from('merchandise_item_variants').insert(payload).select().maybeSingle();
    if (error) {
      if (error.code === '23505') throw new ApiError(409, 'That SKU Already Exists', 'duplicate_sku');
      if (error.code === '23503') throw new ApiError(404, 'Product Not Found', 'item_not_found');
      throw error;
    }
    if (!data) throw new ApiError(500, 'Variant Creation Could Not Be Verified', 'create_unverified');
    await syncHasVariants(supabase, data.item_id);
    await auditOperatorAction(op, req, {
      action: 'merchandise.variant_created',
      targetType: 'merchandise_variant',
      targetId: data.id,
      details: { item_id: data.item_id, sku: data.sku },
      after: data,
    });
    return { variant: data, record: data };
  }

  const rawId = cleanString(body.id, 64, { required: true });
  // uuid() accepts every RFC 4122 layout, v7 included. The old inline regex
  // only matched v1 to v5, so a v7 variant id 400'd for no real reason.
  const id = entity === 'item' ? (rawId && ITEM_ID_RE.test(rawId) ? rawId : null) : uuid(rawId);
  if (!id) throw new CatalogInputError('A Valid Record ID Is Required');

  const table = entity === 'item' ? 'merchandise_items' : 'merchandise_item_variants';
  const { data: before, error: beforeError } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
  if (beforeError) throw beforeError;
  if (!before) throw new ApiError(404, 'Record Not Found', 'not_found');

  if (method === 'DELETE') {
    const { data, error } = await supabase.from(table).update({ is_active: false }).eq('id', id).select().maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(409, 'Record Changed Before It Could Be Archived', 'stale_record');
    if (entity === 'variant') await syncHasVariants(supabase, before.item_id);
    await auditOperatorAction(op, req, {
      action: `merchandise.${entity}_archived`,
      targetType: `merchandise_${entity}`,
      targetId: id,
      before,
      after: data,
    });
    return { record: data };
  }

  const payload = entity === 'item' ? itemPayload(body) : variantPayload(body);
  if (body.metadata !== undefined) payload.metadata = mergeMetadata(before.metadata, body.metadata || {});
  if (Object.keys(payload).length === 0) {
    throw new CatalogInputError('No Editable Fields Supplied');
  }
  const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().maybeSingle();
  if (error) {
    if (error.code === '23505') throw new ApiError(409, 'That SKU Already Exists', 'duplicate_sku');
    throw error;
  }
  if (!data) throw new ApiError(409, 'Record Changed Before It Could Be Updated', 'stale_record');
  if (entity === 'variant') await syncHasVariants(supabase, before.item_id);
  await auditOperatorAction(op, req, {
    action: `merchandise.${entity}_updated`,
    targetType: `merchandise_${entity}`,
    targetId: id,
    before,
    after: data,
  });
  return { record: data };
}

export default withOperatorRoute(spec, handle);
