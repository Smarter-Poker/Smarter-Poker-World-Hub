export const VIDEO_OWNER_TOOLS = Object.freeze([
    { href: '/hub/admin/video-sources', title: 'Sources', description: 'Manage Channels, Topics And Ingestion Status.' },
    { href: '/hub/admin/video-editorial', title: 'Editorial Review', description: 'Edit, Approve Or Quarantine Video Candidates.' },
    { href: '/hub/admin/video-rights-moderation', title: 'Rights Moderation', description: 'Review Rights Evidence And Moderation Cases.' },
    { href: '/hub/admin/video-native-studio', title: 'Native Studio', description: 'Review Rights-Cleared Clips And Processing.' },
    { href: '/hub/admin/video-operations', title: 'Pipeline Controls', description: 'Manage Audited Pipeline Switches And Inspect Delivery.' },
]);

function sum(rows, field, predicate = () => true) {
    if (!Array.isArray(rows)) throw new Error('The Control Panel Snapshot Is Incomplete.');
    return rows.filter(predicate).reduce((total, row) => {
        const value = Number(row?.[field]);
        if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(total + value)) throw new Error('The Control Panel Snapshot Is Incomplete.');
        return total + value;
    }, 0);
}

export function summarizeVideoOwnerSnapshot(snapshot) {
    if (!snapshot || !Number.isFinite(Date.parse(snapshot.generatedAt)) || snapshot.windowHours !== 24
        || !Number.isSafeInteger(snapshot.organicSessions) || snapshot.organicSessions < 0
        || !Array.isArray(snapshot.controls) || snapshot.controls.some(control => typeof control.control_key !== 'string' || typeof control.enabled !== 'boolean')) {
        throw new Error('The Control Panel Snapshot Could Not Be Verified.');
    }
    return [
        { label: 'Active Sources', value: sum(snapshot.sources, 'active') },
        { label: 'Published Highlights', value: sum(snapshot.candidates, 'count', row => row.status === 'published') },
        { label: 'Qualified Study Sessions In 24 Hours', value: snapshot.organicSessions },
        { label: 'Pending Rights Reviews', value: sum(snapshot.moderationCases, 'count', row => ['submitted', 'triaged', 'in_review'].includes(row.status)) },
        { label: 'Dead-Letter Jobs', value: sum(snapshot.jobs, 'count', row => row.status === 'dead_letter') },
    ];
}
