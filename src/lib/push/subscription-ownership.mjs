// Enrollment and retirement are one database transaction. Never fall back to
// independent table writes when the installed ownership contract is unavailable.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function changePushSubscription(db, userId, subscription, enabled) {
    const { data, error } = await db.rpc('fn_change_push_subscription_ownership', {
        p_user_id: userId, p_subscription: subscription, p_enabled: enabled,
    });
    if (error) {
        const conflict = error.message === 'push_subscription_possession_mismatch';
        throw Object.assign(new Error(conflict
            ? 'This device could not be reassigned to this account.'
            : 'Device notification settings are temporarily unavailable.'), { status: conflict ? 409 : 503 });
    }
    if (!data || data.schema_version !== 1 || data.success !== true ||
        data.user_id !== userId || data.endpoint !== subscription.endpoint ||
        data.enabled !== enabled || !Array.isArray(data.displaced_user_ids) ||
        data.displaced_user_ids.some(id => !UUID.test(id || '') || id === userId) ||
        new Set(data.displaced_user_ids).size !== data.displaced_user_ids.length) {
        throw Object.assign(new Error('Device notification settings could not be confirmed.'), { status: 503 });
    }
    return data;
}
