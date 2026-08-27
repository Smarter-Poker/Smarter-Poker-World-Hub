# Neural Steel Print Collection

Original Smarter.Poker print-on-demand artwork for the Merch Store.

## Product Mapping

- `hat-diamond`: `print/brain-spade-embroidery.png` — front embroidery.
- `tshirt-gto`: `print/royal-circuit.png` — large back DTG print; optional small crest on the chest or sleeve.
- `hoodie-neural`: `print/diamond-altitude.png` — large back DTG print; optional small crest on the chest or sleeve.

The SVG files are the deterministic transparent vector masters for the two large prints. The 3600×4800 PNG files are the provider-ready render targets. The mockups are catalog presentation assets and must never be sent to a fulfillment provider as print files.

## Printful Setup

Create a Manual Order Platform/API store and three product templates in Printful. Map every Smarter.Poker catalog variant to its exact Printful sync variant. Sized or coloured products require a mapping on each `merchandise_item_variants.metadata` row:

```json
{
  "fulfillment_provider": "printful",
  "fulfillment_status": "mapped",
  "printful": {
    "sync_variant_id": 123456789
  }
}
```

For a product without size or colour variants, the same `printful.sync_variant_id` may live on `merchandise_items.metadata`.

The storefront and checkout stay disabled until the selected variant has a provider mapping, `PRINTFUL_API_TOKEN` is configured, and `PRINTFUL_AUTO_CONFIRM=true`. No paid draft orders are possible in the disabled state. See `docs/runbooks/printful-fulfillment.md` for the activation sequence.
