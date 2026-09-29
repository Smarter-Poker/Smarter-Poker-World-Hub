// A visible notification can come from either inbox. Never send synthetic
// poker IDs to the social endpoint, or treat a failed write as a read receipt.
export async function persistNotificationReads(ids, token, request = fetch) {
    const unique = [...new Set(ids)];
    if (!unique.length) return [];
    const savedIds = [];
    const failures = [];
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const save = async (url, method, body, batch) => {
        try {
            const response = await request(url, { method, headers, body: JSON.stringify(body) });
            const receipt = await response.json();
            if (!response.ok || receipt?.success !== true) throw new Error('Read Status Could Not Be Saved');
            savedIds.push(...batch);
        } catch (error) { failures.push(error); }
    };
    const social = unique.filter(id => !id.startsWith('poker-'));
    for (let start = 0; start < social.length; start += 200) {
        const batch = social.slice(start, start + 200);
        await save('/api/notifications/mark-read', 'POST', { ids: batch }, batch);
    }
    const poker = unique.filter(id => id.startsWith('poker-'));
    for (let start = 0; start < poker.length; start += 4) {
        await Promise.all(poker.slice(start, start + 4).map(id =>
            save('/api/poker/notifications', 'PUT', { notification_id: id.slice(6) }, [id])));
    }
    // Every launched request has settled before reporting the subset acknowledged.
    // A retry remains an explicit user action and cannot replay an unknown batch.
    if (failures.length) throw Object.assign(new Error('Read Status Could Not Be Saved'), { savedIds });
    return savedIds;
}
