// Never retry a possibly committed RPC automatically. The host reviews their
// persisted schedule before adding any unconfirmed occurrence again.
export async function submitHomeGameOccurrence(fetchImpl, payload, token, operationId) {
  try {
    const response = await fetchImpl('/api/commander/home-games/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Idempotency-Key': operationId },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (response.ok && typeof body?.event?.id === 'string'
      && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.event.id)) {
      return { status: 'confirmed', event: body.event };
    }
    if (!response.ok && [400, 401, 403, 404, 422].includes(response.status)) {
      return { status: 'rejected', message: body?.error?.message || (typeof body?.error === 'string' ? body.error : '') || 'The Request Was Rejected. Review Your Details.' };
    }
  } catch { /* A transport/parse failure may occur after persistence. */ }
  return { status: 'unknown', message: 'Saving Is Not Confirmed. Review Your Group Schedule Before Adding This Game Again.' };
}

export async function publishPlannedHomeGameTournaments(supabase, groupId, plans) {
  const named = (plans || []).filter((plan) => typeof plan?.name === 'string' && plan.name.trim());
  const dated = named.filter((plan) => plan.scheduled_date && plan.scheduled_time);
  const results = await Promise.allSettled(dated.map(async (plan) => supabase.rpc('rpc_hg_create_tournament', {
    p_group_id: groupId,
    p_name: plan.name.trim().slice(0, 120),
    p_buy_in: Number(plan.buy_in) || 0,
    p_starting_stack: plan.starting_stack === '' || plan.starting_stack == null ? null : Number(plan.starting_stack) || null,
    p_structure: plan.structure || 'standard',
    p_scheduled_date: plan.scheduled_date,
    p_scheduled_time: plan.scheduled_time,
    p_entries_cap: plan.entries_cap === '' || plan.entries_cap == null ? null : Number(plan.entries_cap) || null,
  })));
  const confirmed = [];
  const unconfirmed = [];
  results.forEach((result, index) => {
    const id = result.status === 'fulfilled' && !result.value?.error ? result.value?.data : null;
    if (typeof id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
      confirmed.push({ id, name: dated[index].name });
    } else {
      unconfirmed.push({ name: dated[index].name });
    }
  });
  return {
    confirmed,
    unconfirmed,
    unscheduled: named.filter((plan) => !plan.scheduled_date || !plan.scheduled_time).map((plan) => ({ name: plan.name })),
  };
}
