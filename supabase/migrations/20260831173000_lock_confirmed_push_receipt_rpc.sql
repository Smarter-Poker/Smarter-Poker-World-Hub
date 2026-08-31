-- Keep receipt reconciliation behind the service-role API boundary.
-- This follow-up migration also reconciles environments where the original
-- function was deployed before its final grant list was narrowed.
REVOKE ALL ON FUNCTION public.confirm_push_subscription_receipt(text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.confirm_push_subscription_receipt(text)
  TO service_role;
