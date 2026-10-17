const VIP_PLAN_IDS = new Set(['vip-monthly', 'vip-yearly', 'vip-lifetime']);

/** Keep the reviewed plan through sign-in without accepting an arbitrary redirect. */
export function vipSignInHref(planId, productPath = null) {
  const plan = VIP_PLAN_IDS.has(planId) ? planId : 'vip-monthly';
  const detail = `/hub/vip-membership/${plan.replace('vip-', '')}`;
  if (productPath === detail) return `/auth/login?redirect=${encodeURIComponent(detail)}`;
  return `/auth/login?redirect=${encodeURIComponent(`/hub/vip-membership?plan=${plan}`)}`;
}
