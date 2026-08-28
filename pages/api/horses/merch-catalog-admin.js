import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { logAdminAction } = require('../../../src/lib/antiAbuse');
const { isPrintfulReady, resolvePrintfulMapping } = require('../../../src/lib/store/printfulFulfillment');

const ADMIN_ROLES = ['admin', 'superadmin', 'god'];
const CATEGORIES = ['apparel', 'headwear', 'eyewear', 'tabletop', 'accessories', 'lifestyle'];
const PROVIDERS = ['printful', 'provider_pending', 'manual'];
const FULFILLMENT_STATUSES = ['mapping_required', 'mapped', 'provider_required', 'paused', 'disabled'];
const ITEM_ID_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;
const SKU_RE = /^[A-Z0-9][A-Z0-9-]{2,63}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class CatalogInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CatalogInputError';
  }
}

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for merchandise administration');
    _supabase = createClient(url, key);
  }
  return _supabase;
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

async function authorize(req) {
  const supabase = getSupabase();
  const { user, error } = await getServerUserWithFallback(req, supabase);
  if (error || !user) return { status: 401, error: 'Unauthorized' };
  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profileError || !profile || !ADMIN_ROLES.includes(profile.role)) {
    return { status: 403, error: 'Platform Admin Access Required' };
  }
  return { user, role: profile.role, supabase };
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

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;

  try {
    const auth = await authorize(req);
    if (auth.error) return res.status(auth.status).json({ success: false, error: auth.error });
    const { supabase, user } = auth;

    if (req.method === 'GET') {
      const catalog = await loadCatalog(supabase);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ success: true, ...catalog });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const entity = body.entity;
    if (!['item', 'variant'].includes(entity)) {
      return res.status(400).json({ success: false, error: 'Entity must be item or variant' });
    }

    if (req.method === 'POST') {
      if (entity === 'item') {
        const payload = itemPayload(body, { creating: true });
        payload.metadata = mergeMetadata({}, body.metadata || {});
        const { data, error } = await supabase.from('merchandise_items').insert(payload).select().maybeSingle();
        if (error) {
          if (error.code === '23505') return res.status(409).json({ success: false, error: 'That Product ID already exists' });
          throw error;
        }
        if (!data) return res.status(500).json({ success: false, error: 'Product Creation Could Not Be Verified' });
        await logAdminAction(supabase, {
          admin_user_id: user.id, action: 'merchandise.item_created', target_type: 'merchandise_item',
          target_id: data.id, after: data, req,
        });
        return res.status(201).json({ success: true, item: data });
      }

      const payload = variantPayload(body, { creating: true });
      payload.metadata = mergeMetadata({}, body.metadata || {});
      const { data, error } = await supabase.from('merchandise_item_variants').insert(payload).select().maybeSingle();
      if (error) {
        if (error.code === '23505') return res.status(409).json({ success: false, error: 'That SKU already exists' });
        if (error.code === '23503') return res.status(404).json({ success: false, error: 'Product Not Found' });
        throw error;
      }
      if (!data) return res.status(500).json({ success: false, error: 'Variant Creation Could Not Be Verified' });
      await syncHasVariants(supabase, data.item_id);
      await logAdminAction(supabase, {
        admin_user_id: user.id, action: 'merchandise.variant_created', target_type: 'merchandise_variant',
        target_id: data.id, details: { item_id: data.item_id, sku: data.sku }, after: data, req,
      });
      return res.status(201).json({ success: true, variant: data });
    }

    const id = cleanString(body.id, 64, { required: true });
    if (!id || (entity === 'item' ? !ITEM_ID_RE.test(id) : !UUID_RE.test(id))) {
      return res.status(400).json({ success: false, error: 'A valid record ID is required' });
    }
    const table = entity === 'item' ? 'merchandise_items' : 'merchandise_item_variants';
    const { data: before, error: beforeError } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) return res.status(404).json({ success: false, error: 'Record Not Found' });

    if (req.method === 'DELETE') {
      const { data, error } = await supabase.from(table).update({ is_active: false }).eq('id', id).select().maybeSingle();
      if (error) throw error;
      if (!data) return res.status(409).json({ success: false, error: 'Record Changed Before It Could Be Archived' });
      if (entity === 'variant') await syncHasVariants(supabase, before.item_id);
      await logAdminAction(supabase, {
        admin_user_id: user.id, action: `merchandise.${entity}_archived`, target_type: `merchandise_${entity}`,
        target_id: id, before, after: data, req,
      });
      return res.status(200).json({ success: true, record: data });
    }

    const payload = entity === 'item' ? itemPayload(body) : variantPayload(body);
    if (body.metadata !== undefined) payload.metadata = mergeMetadata(before.metadata, body.metadata || {});
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ success: false, error: 'No Editable Fields Supplied' });
    }
    const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().maybeSingle();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ success: false, error: 'That SKU already exists' });
      throw error;
    }
    if (!data) return res.status(409).json({ success: false, error: 'Record Changed Before It Could Be Updated' });
    if (entity === 'variant') await syncHasVariants(supabase, before.item_id);
    await logAdminAction(supabase, {
      admin_user_id: user.id, action: `merchandise.${entity}_updated`, target_type: `merchandise_${entity}`,
      target_id: id, before, after: data, req,
    });
    return res.status(200).json({ success: true, record: data });
  } catch (error) {
    console.warn('[merch-catalog-admin] request failed:', error?.message || error);
    if (error instanceof CatalogInputError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    reportApiError(error, req, { route: '/api/horses/merch-catalog-admin', method: req.method });
    const safeMessage = error?.message && !/supabase|postgres|relation|column|constraint/i.test(error.message)
      ? error.message
      : 'Merchandise Catalog Request Failed';
    return res.status(500).json({ success: false, error: safeMessage });
  }
}
