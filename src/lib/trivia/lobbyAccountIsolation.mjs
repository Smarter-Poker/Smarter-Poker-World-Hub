/**
 * Account-bound request ownership for the Trivia lobby.
 *
 * A monotonic generation prevents an older refresh from overwriting a newer
 * refresh. The caller also supplies the currently rendered user id so an
 * account switch invalidates the old account before the next effect begins.
 */
export function createTriviaLobbyAccountRequestGuard() {
    let generation = 0;

    return {
        begin(userId) {
            generation += 1;
            return { generation, userId: userId || null };
        },
        invalidate() {
            generation += 1;
        },
        isCurrent(request, currentUserId) {
            return request?.generation === generation
                && request.userId === (currentUserId || null);
        },
    };
}

/**
 * A successful owner-profile read is authoritative even when no row exists.
 * In that null-row case the previous balance/VIP state must be cleared rather
 * than leaking the last account's values. Failed reads deliberately retain the
 * last valid values for the same account.
 */
export function projectTriviaLobbyProfileRead(profileRead) {
    const response = profileRead?.status === 'fulfilled' ? profileRead.value : null;
    if (!response || response.error) {
        return {
            status: 'error',
            applyValue: false,
            userDiamonds: 0,
            isVip: false,
            profileExists: false,
        };
    }

    const profile = response.data || null;
    return {
        status: 'ready',
        applyValue: true,
        userDiamonds: profile?.diamonds || 0,
        isVip: profile?.is_vip === true,
        profileExists: Boolean(profile),
    };
}
