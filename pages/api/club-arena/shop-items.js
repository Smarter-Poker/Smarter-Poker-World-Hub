/**
 * POST /api/club-arena/shop-items
 * ═══════════════════════════════════════════════════════════════════════════
 * Admin CRUD for club_shop_items. Replaces the anon-key client-side flow in
 * pages/hub/diamond-store.js which was silently failing after the 2026-05-01
 * RLS lockdown (Tier B): anon writes to club_shop_items now blocked.
 *
 * Body (action-dispatched):
 *   { action: 'create', clubId, name, price, description?, category, imageUrl? }
 *   { action: 'toggle', clubId, itemId }            : flip is_active
 *   { action: 'delete', clubId, itemId }            : hard delete
 *
 * Auth: Bearer token + caller must be owner/admin in club_members.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { setPrivateCommerceResponse } from '../../../src/lib/store/privateCommerceResponse';
import {
  getMaximumCardFundedClubItemPrice,
  loadActiveDiamondPackageCatalog,
} from '../../../src/lib/store/diamondPackageCatalog.mjs';

const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
// 2026-08-19 (audit pass 4): this route and manage-shop.js are the two admin
// write paths for club_shop_items. They had different rules -- items created
// here granted NOTHING on redeem, accepted any image URL, and could be hard
// deleted (CASCADING away the purchase history). Both now share one module.
const {
  VALID_CATEGORIES,
  ITEM_TYPE_BY_CATEGORY,
  GRANT_TYPES,
  buildGrantSpec,
  normalizeImageUrl,
  itemHasSales,
  HAS_SALES_ERROR,
  enforceAllThrowablesMutation,
  enforceFulfillableMutation,
  normalizePurchaseCategory,
} = require('../../../src/lib/club-arena/shopItemRules');
const { isUUID } = require('../../../src/lib/club-arena/validate');

let _sb = null;
function sb() {
  if (!_sb) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
    _sb = createClient(url, key, { auth: { persistSession: false } });
  }
  return _sb;
}

async function loadMaximumCardFundedPrice() {
  const { catalog } = await loadActiveDiamondPackageCatalog(sb(), { cacheMs: 0 });
  const maximum = getMaximumCardFundedClubItemPrice(catalog);
  if (!Number.isSafeInteger(maximum) || maximum <= 0) {
    throw new Error('No active Diamond package can fund a Club Shop item');
  }
  return maximum;
}

async function verifyAdmin(token, clubId) {
  const { data: authData, error: authErr } = await sb().auth.getUser(token);
  const user = authData?.user;
  if (authErr || !user) return { error: 'invalid_token', status: 401 };

  const { data: membership } = await sb()
    .from('club_members')
    .select('role')
    .eq('club_id', clubId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return { error: 'admin_required', status: 403 };
  }
  return { user };
}

export default async function handler(req, res) {
  try {
    setPrivateCommerceResponse(res);
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, 'club-arena/shop-items')) return;

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const { action, clubId } = req.body || {};
    if (!action) return res.status(400).json({ success: false, error: 'action required' });
    if (!clubId) return res.status(400).json({ success: false, error: 'clubId required' });
    if (!isUUID(clubId))
      return res.status(400).json({ success: false, error: 'Invalid clubId format' });

    const auth = await verifyAdmin(token, clubId);
    if (auth.error) return res.status(auth.status).json({ success: false, error: auth.error });

    // ─── CREATE ────────────────────────────────────────────────────
    if (action === 'create') {
      const throwableGuard = enforceAllThrowablesMutation('create', req.body);
      if (throwableGuard.error) {
        return res.status(400).json({
          success: false,
          error: throwableGuard.error,
          code: throwableGuard.code,
        });
      }
      const { name, price, description, category, imageUrl } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, error: 'name required' });
      }
      const trimmedName = String(name).trim().slice(0, 200);
      const numPrice = Number(price);
      if (!Number.isSafeInteger(numPrice) || numPrice <= 0) {
        return res.status(400).json({ success: false, error: 'price must be positive integer' });
      }
      let maximumCardFundedPrice;
      try {
        maximumCardFundedPrice = await loadMaximumCardFundedPrice();
      } catch (catalogError) {
        console.warn(
          '[shop-items] Diamond package catalog unavailable:',
          catalogError?.message || catalogError
        );
        return res.status(503).json({
          success: false,
          error: 'Current Card pricing could not be verified. Please try again.',
          code: 'DIAMOND_PACKAGE_CATALOG_UNAVAILABLE',
        });
      }
      if (numPrice > maximumCardFundedPrice) {
        return res.status(400).json({
          success: false,
          error: `price cannot exceed ${maximumCardFundedPrice.toLocaleString()} Diamonds`,
          code: 'CARD_PRICE_LIMIT_EXCEEDED',
          maximumCardFundedPrice,
        });
      }
      const normalizedCategory = normalizePurchaseCategory(category);
      if (normalizedCategory.error) {
        return res.status(400).json({
          success: false,
          error: normalizedCategory.error,
          code: normalizedCategory.code,
        });
      }
      const cat = normalizedCategory.value;

      const img = normalizeImageUrl(imageUrl);
      if (img.error) return res.status(400).json({ success: false, error: img.error });

      // Without a grant_spec the item is decorative: members pay chips and
      // fn_redeem_shop_item takes no branch. Derived from the category
      // unless the caller states one explicitly.
      const grant = buildGrantSpec(cat, req.body.grantType, req.body.grantQty, req.body.grantRef);
      if (grant.error) {
        return res.status(400).json({ success: false, error: grant.error, code: grant.code });
      }

      const { data, error } = await sb()
        .from('club_shop_items')
        .insert({
          club_id: clubId,
          name: trimmedName,
          price: numPrice,
          description: description ? String(description).trim().slice(0, 500) : null,
          category: cat,
          item_type: ITEM_TYPE_BY_CATEGORY[cat] || null,
          grant_spec: grant.spec,
          image_url: img.skip ? null : img.value,
          is_active: true,
          // Every currently sellable Club Shop item is consumable.
          // A non-stackable row turns purchase history into a false
          // permanent-ownership block after the first redemption.
          stackable: true,
        })
        .select()
        .maybeSingle();
      if (error) {
        console.error('[shop-items] insert error:', error);
        return res.status(500).json({ success: false, error: 'create_failed' });
      }
      return res.status(200).json({ success: true, item: data });
    }

    // ─── TOGGLE (flip is_active) ───────────────────────────────────
    if (action === 'toggle') {
      const { itemId } = req.body;
      if (!itemId) return res.status(400).json({ success: false, error: 'itemId required' });
      const { data: existing } = await sb()
        .from('club_shop_items')
        .select('id, name, category, item_type, grant_spec, is_active, stackable, price')
        .eq('id', itemId)
        .eq('club_id', clubId)
        .maybeSingle();
      if (!existing) return res.status(404).json({ success: false, error: 'item_not_found' });

      const throwableGuard = enforceAllThrowablesMutation('toggle', req.body, existing);
      if (throwableGuard.error) {
        return res.status(400).json({
          success: false,
          error: throwableGuard.error,
          code: throwableGuard.code,
        });
      }
      const fulfillmentGuard = enforceFulfillableMutation('toggle', req.body, existing);
      if (fulfillmentGuard.error) {
        return res.status(400).json({
          success: false,
          error: fulfillmentGuard.error,
          code: fulfillmentGuard.code,
        });
      }

      const nextIsActive = !existing.is_active;
      if (nextIsActive) {
        let maximumCardFundedPrice;
        try {
          maximumCardFundedPrice = await loadMaximumCardFundedPrice();
        } catch (catalogError) {
          console.warn(
            '[shop-items] Diamond package catalog unavailable:',
            catalogError?.message || catalogError
          );
          return res.status(503).json({
            success: false,
            error: 'Current Card pricing could not be verified. Please try again.',
            code: 'DIAMOND_PACKAGE_CATALOG_UNAVAILABLE',
          });
        }
        const storedPrice = Number(existing.price);
        if (
          !Number.isSafeInteger(storedPrice) ||
          storedPrice <= 0 ||
          storedPrice > maximumCardFundedPrice
        ) {
          return res.status(400).json({
            success: false,
            error: `price must be between 1 and ${maximumCardFundedPrice.toLocaleString()} Diamonds before activation`,
            code: 'CARD_PRICE_LIMIT_EXCEEDED',
            maximumCardFundedPrice,
          });
        }
      }

      const { data, error } = await sb()
        .from('club_shop_items')
        .update({ is_active: nextIsActive })
        .eq('id', itemId)
        .eq('club_id', clubId)
        .select()
        .maybeSingle();
      if (error) {
        console.error('[shop-items] toggle error:', error);
        return res.status(500).json({ success: false, error: 'toggle_failed' });
      }
      return res.status(200).json({ success: true, item: data });
    }

    // ─── DELETE ────────────────────────────────────────────────────
    // ─── UPDATE (parity with manage-shop) ──────────────────────────
    if (action === 'update') {
      const { itemId, name, description, price, category, imageUrl, isActive } = req.body;
      if (!itemId) return res.status(400).json({ success: false, error: 'itemId required' });

      const { data: existingItem, error: existingItemError } = await sb()
        .from('club_shop_items')
        .select(
          'name, description, category, item_type, grant_spec, image_url, is_active, stackable, per_user_limit, price, sale_price'
        )
        .eq('id', itemId)
        .eq('club_id', clubId)
        .maybeSingle();
      if (existingItemError) throw existingItemError;
      if (!existingItem) return res.status(404).json({ success: false, error: 'item_not_found' });

      const throwableGuard = enforceAllThrowablesMutation('update', req.body, existingItem);
      if (throwableGuard.error) {
        return res.status(400).json({
          success: false,
          error: throwableGuard.error,
          code: throwableGuard.code,
        });
      }
      const fulfillmentBase = throwableGuard.managed
        ? { ...existingItem, ...throwableGuard.updates }
        : existingItem;
      const fulfillmentGuard = enforceFulfillableMutation('update', req.body, fulfillmentBase);
      if (fulfillmentGuard.error) {
        return res.status(400).json({
          success: false,
          error: fulfillmentGuard.error,
          code: fulfillmentGuard.code,
        });
      }

      const updates = {};
      if (name !== undefined) {
        if (typeof name !== 'string' || !name.trim()) {
          return res.status(400).json({ success: false, error: 'name cannot be empty' });
        }
        updates.name = name.trim().slice(0, 200);
      }
      if (description !== undefined) {
        updates.description = description ? String(description).trim().slice(0, 500) : null;
      }
      if (price !== undefined) {
        const p = Number(price);
        if (!Number.isSafeInteger(p) || p <= 0 || p > 1000000000) {
          return res.status(400).json({ success: false, error: 'invalid price' });
        }
        updates.price = p;
      }
      if (category !== undefined) {
        if (!VALID_CATEGORIES.includes(category)) {
          return res.status(400).json({ success: false, error: 'invalid category' });
        }
        updates.category = category;
        updates.item_type = ITEM_TYPE_BY_CATEGORY[category] || null;
      }
      if (
        req.body.grantType !== undefined ||
        req.body.grantQty !== undefined ||
        req.body.grantRef !== undefined ||
        category !== undefined
      ) {
        if (req.body.grantType !== undefined && !GRANT_TYPES.includes(req.body.grantType)) {
          return res.status(400).json({ success: false, error: 'invalid grantType' });
        }
        // The grant must travel with the category, or the card
        // advertises one thing and redemption grants another.
        const grantCategory = category || existingItem.category;
        const g = buildGrantSpec(
          grantCategory,
          req.body.grantType,
          req.body.grantQty,
          req.body.grantRef
        );
        if (g.error) {
          return res.status(400).json({ success: false, error: g.error, code: g.code });
        }
        updates.grant_spec = g.spec;
      }
      if (imageUrl !== undefined) {
        const img = normalizeImageUrl(imageUrl);
        if (img.error) return res.status(400).json({ success: false, error: img.error });
        updates.image_url = img.value;
      }
      if (isActive !== undefined) updates.is_active = !!isActive;
      if (req.body.stock !== undefined) {
        const raw = req.body.stock;
        if (raw === null || String(raw).trim() === '') {
          updates.stock = null;
        } else {
          const n = Math.floor(Number(raw));
          if (!Number.isFinite(n) || n < 0 || n > 1000000) {
            return res.status(400).json({ success: false, error: 'invalid stock' });
          }
          updates.stock = n;
        }
      }
      if (throwableGuard.managed) Object.assign(updates, throwableGuard.updates);

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, error: 'no fields to update' });
      }

      const candidatePrice = updates.price ?? Number(existingItem.price);
      if (existingItem.sale_price !== null && Number(existingItem.sale_price) > candidatePrice) {
        return res.status(400).json({ success: false, error: 'sale price cannot exceed price' });
      }
      let maximumCardFundedPrice;
      try {
        maximumCardFundedPrice = await loadMaximumCardFundedPrice();
      } catch (catalogError) {
        console.warn(
          '[shop-items] Diamond package catalog unavailable:',
          catalogError?.message || catalogError
        );
        return res.status(503).json({
          success: false,
          error: 'Current Card pricing could not be verified. Please try again.',
          code: 'DIAMOND_PACKAGE_CATALOG_UNAVAILABLE',
        });
      }
      if (
        !Number.isSafeInteger(candidatePrice) ||
        candidatePrice <= 0 ||
        candidatePrice > maximumCardFundedPrice
      ) {
        return res.status(400).json({
          success: false,
          error: `price must be between 1 and ${maximumCardFundedPrice.toLocaleString()} Diamonds`,
          code: 'CARD_PRICE_LIMIT_EXCEEDED',
          maximumCardFundedPrice,
        });
      }

      const { error } = await sb()
        .from('club_shop_items')
        .update(updates)
        .eq('id', itemId)
        .eq('club_id', clubId);
      if (error) {
        console.error('[shop-items] update error:', error);
        return res.status(500).json({ success: false, error: 'update_failed' });
      }
      return res.status(200).json({ success: true });
    }

    if (action === 'delete') {
      const { itemId } = req.body;
      if (!itemId) return res.status(400).json({ success: false, error: 'itemId required' });

      const { data: existing, error: existingError } = await sb()
        .from('club_shop_items')
        .select('id, name, category, item_type, grant_spec')
        .eq('id', itemId)
        .eq('club_id', clubId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing) return res.status(404).json({ success: false, error: 'item_not_found' });

      const throwableGuard = enforceAllThrowablesMutation('delete', req.body, existing);
      if (throwableGuard.error) {
        return res.status(400).json({
          success: false,
          error: throwableGuard.error,
          code: throwableGuard.code,
        });
      }
      if (await itemHasSales(sb(), clubId, itemId)) {
        return res.status(400).json({ success: false, error: HAS_SALES_ERROR, hasSales: true });
      }
      const { error } = await sb()
        .from('club_shop_items')
        .delete()
        .eq('id', itemId)
        .eq('club_id', clubId);
      if (error) {
        console.error('[shop-items] delete error:', error);
        return res.status(500).json({ success: false, error: 'delete_failed' });
      }
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ success: false, error: 'unknown action' });
  } catch (e) {
    console.error('[shop-items] unexpected error:', e);
    try {
      reportApiError(e, { route: '/api/club-arena/shop-items' });
    } catch (reportError) {
      console.warn('[shop-items] error reporting failed:', reportError?.message || reportError);
    }
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
}
