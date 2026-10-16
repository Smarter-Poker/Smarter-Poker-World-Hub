// Only enrich peers from an already-authorized private conversation projection.
export async function enrichMessengerClubRelationships(db, actorId, conversations) {
    const peers = [...new Set(conversations.filter(row => !row.is_group && row.otherUser?.id && !row.otherUser.is_club_identity).map(row => row.otherUser.id))];
    const tags = new Map();
    for (let start = 0; start < peers.length; start += 100) {
        const batch = peers.slice(start, start + 100);
        const { data, error } = await db.rpc('fn_messenger_club_relationships', { p_viewer: actorId, p_peers: batch });
        if (error || !Array.isArray(data) || data.some(row => !batch.includes(row.peer_user_id) || typeof row.club_id !== 'string' || typeof row.label !== 'string' || !row.label.trim())) {
            throw Object.assign(new Error('Club Chat Relationships Are Unavailable'), { status: 503 });
        }
        for (const row of data) {
            const list = tags.get(row.peer_user_id) || [];
            list.push({ clubId: row.club_id, clubName: row.club_name, role: row.role, label: row.label, isUpline: row.is_upline === true });
            tags.set(row.peer_user_id, list);
        }
    }
    return conversations.map(row => ({ ...row, relationshipTags: tags.get(row.otherUser?.id) || [] }));
}
