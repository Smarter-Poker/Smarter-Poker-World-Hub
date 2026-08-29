/**
 * Public marketplace readiness probe.
 *
 * Only capability booleans are returned. Secret values, lengths, prefixes,
 * identifiers, and provider responses are intentionally never serialized.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';

const { isPrintfulReady, resolvePrintfulMapping } = require('../../../src/lib/store/printfulFulfillment');

async function catalogReadiness(supabaseConfigured) {
  if (!supabaseConfigured) return { reachable: false, total: 0, fulfillmentReady: 0, allFulfillmentReady: false };
  try {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { data: items, error: itemError } = await client
      .from('merchandise_items')
      .select('id, has_variants, metadata')
      .eq('is_active', true)
      .limit(250);
    if (itemError) throw itemError;
    const itemIds = (items || []).map((item) => item.id);
    const { data: variants, error: variantError } = itemIds.length
      ? await client
          .from('merchandise_item_variants')
          .select('item_id, metadata')
          .in('item_id', itemIds)
          .eq('is_active', true)
          .limit(1000)
      : { data: [], error: null };
    if (variantError) throw variantError;
    const variantsByItem = new Map();
    for (const variant of variants || []) {
      const current = variantsByItem.get(variant.item_id) || [];
      current.push(variant);
      variantsByItem.set(variant.item_id, current);
    }
    const fulfillmentReady = (items || []).filter((item) => {
      const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
      if (metadata.fulfillment_provider !== 'printful') return false;
      const itemVariants = variantsByItem.get(item.id) || [];
      if (item.has_variants || itemVariants.length > 0) {
        return itemVariants.length > 0
          && itemVariants.every((variant) => Boolean(resolvePrintfulMapping(null, variant.metadata)));
      }
      return Boolean(resolvePrintfulMapping(metadata, null));
    }).length;
    const total = (items || []).length;
    return {
      reachable: true,
      total,
      fulfillmentReady,
      allFulfillmentReady: total > 0 && fulfillmentReady === total,
    };
  } catch (_) {
    return { reachable: false, total: 0, fulfillmentReady: 0, allFulfillmentReady: false };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, error: 'GET only' });
  }

  const supabase = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL
    && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const stripe = Boolean(
    process.env.STRIPE_SECRET_KEY
    && process.env.STRIPE_WEBHOOK_SECRET
  );
  const printful = Boolean(
    isPrintfulReady()
    && process.env.PRINTFUL_STORE_ID
    && process.env.PRINTFUL_WEBHOOK_SECRET
  );
  const catalog = await catalogReadiness(supabase);
  const checks = { supabase, stripe, printful };
  const ready = Object.values(checks).every(Boolean) && catalog.allFulfillmentReady;

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.status(200).json({
    success: true,
    ready,
    status: ready ? 'ready' : 'configuration-required',
    checks,
    catalog,
    capabilities: {
      cardCheckout: supabase && stripe,
      diamondCheckout: supabase,
      automaticMerchFulfillment: supabase && printful && catalog.allFulfillmentReady,
    },
  });
}
