// A deep link can only select a club the server already confirmed is joined.
export function resolveMessengerClubEntry(clubs, query) {
    const requested = query.clubId || query.forceIdentity;
    if (query.conversation || typeof requested !== 'string') return null;
    const club = clubs.find(item => item.id === requested || item.pageId === requested);
    if (!club) return null;
    const requestedFolder = ['invoices', 'notice-board'].includes(query.folder) ? query.folder : 'messages';
    const folder = requestedFolder === 'notice-board' && club.canAccessNoticeBoard === false ? 'messages' : requestedFolder;
    return { club, folder };
}
