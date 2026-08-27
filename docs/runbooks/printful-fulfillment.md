# Printful Fulfillment Runbook

This integration is fail-closed. The Smarter.Poker storefront cannot accept a merchandise payment unless the provider token, automatic confirmation switch, and exact selected variant mapping are all present.

## Provider Setup

1. Create a Printful Manual Order Platform/API store owned by Smarter.Poker.
2. Create these product templates with the masters in `public/images/merch/neural-steel/print/`:
   - Neural Steel Diamond Hat: `brain-spade-embroidery.png` on the front embroidery area.
   - Royal Circuit Tee: `royal-circuit.png` as the large back DTG print.
   - Diamond Altitude Hoodie: `diamond-altitude.png` as the large back DTG print.
3. Choose the final Printful base products, colours, sizes, retail prices, and shipping regions. The current storefront supports United States and Canada addresses.
4. Create a restricted Printful private token that can read store products and create/update orders.

## Environment Variables

Configure these as Vercel secrets for Production, Preview, and Development as appropriate:

- `PRINTFUL_API_TOKEN`: Private Printful API token.
- `PRINTFUL_STORE_ID`: Printful store id. Recommended and required for account-level tokens with more than one store.
- `PRINTFUL_WEBHOOK_SECRET`: A random secret used only in the Printful webhook URL.
- `PRINTFUL_AUTO_CONFIRM`: Keep unset or `false` during provider validation. Set to `true` only after the product mappings and draft-order proof are verified. Confirmed Printful orders charge the provider billing method.

Never expose these values through `NEXT_PUBLIC_*` variables.

## Variant Mapping

Read the Printful sync variants for each product and map every active Smarter.Poker variant to the matching provider size and colour. A variant metadata example:

```json
{
  "fulfillment_provider": "printful",
  "fulfillment_status": "mapped",
  "printful": {
    "sync_variant_id": 123456789
  }
}
```

Do not place one item-level variant id on a product that has sizes or colours. The checkout deliberately requires variant-level mapping so one size cannot be substituted for another.

## Webhook

Register this URL in Printful, substituting the configured secret:

```text
https://smarter.poker/api/store/webhooks/printful?secret=PRINTFUL_WEBHOOK_SECRET
```

Subscribe to `package_shipped`, `order_failed`, `order_canceled`, and `package_returned`. The handler validates the secret with a timing-safe comparison and, when configured, validates the Printful store id. Shipped packages update the customer-visible carrier and tracking fields. Provider failures remain paid and are flagged for recovery or refund; a provider cancellation never pretends the Stripe payment was refunded.

## Safe Activation Order

1. Deploy the code and catalog migration with `PRINTFUL_AUTO_CONFIRM` disabled.
2. Configure the token, store id, and webhook secret.
3. Register the webhook.
4. Create the Printful templates and map every active variant.
5. Create and inspect one unconfirmed draft directly in Printful using non-customer test details. Do not use the public Stripe checkout for this proof.
6. Verify the product, print placement, shipping service, and retail margin in Printful.
7. Set `PRINTFUL_AUTO_CONFIRM=true` and redeploy. The catalog then exposes only mapped options as purchasable.
8. Place one owner-authorized low-cost end-to-end order. Verify Stripe payment, Printful confirmation, order status, shipping address, and tracking webhook before advertising the store.

## Recovery Checks

Search `merchandise_orders.metadata` for:

- `needs_review: true`
- `fulfillment_status: submission_failed`
- `reason: shipping_address_incomplete`
- `needs_refund: true`

Printful order submission uses the 32-character merchandise order UUID as `external_id` and sends `update_existing=true`, so a Stripe webhook retry updates the same provider order rather than creating a duplicate.
