const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function executeClubWelcomeRequest(body, rpc) {
    if (!body || !['read', 'save'].includes(body.action)) throw Object.assign(new Error('Invalid Welcome Message Request'), { status: 400 });
    let name = 'fn_my_club_welcome_messages';
    let args = {};
    if (body.action === 'save') {
        if (!UUID.test(body.clubId || '') || !UUID.test(body.requestId || '') || typeof body.content !== 'string' || body.content.length > 2000 || typeof body.enabled !== 'boolean' || !Number.isSafeInteger(body.revision) || body.revision < 0 || (body.enabled && !body.content.trim())) {
            throw Object.assign(new Error('Enter A Welcome Message Of Up To 2000 Characters'), { status: 400 });
        }
        name = 'fn_save_club_welcome_message';
        args = { p_club_id: body.clubId, p_content: body.content, p_enabled: body.enabled, p_expected_revision: body.revision, p_request_id: body.requestId };
    }
    // There is deliberately no user-id argument. PostgREST uses the caller's
    // verified JWT and each function derives its actor from auth.uid().
    const { data, error } = await rpc(name, args);
    if (error) {
        const status = error.code === '42501' ? 403 : error.code === '40001' ? 409 : error.code === '22023' ? 400 : 503;
        throw Object.assign(new Error(status === 503 ? 'Welcome Messages Are Temporarily Unavailable' : error.message), { status });
    }
    if (body.action === 'read' && !Array.isArray(data)) throw Object.assign(new Error('Welcome Messages Are Temporarily Unavailable'), { status: 503 });
    if (body.action === 'save' && (!data || data.success !== true || !Number.isSafeInteger(data.revision) || data.revision < 1 || typeof data.content !== 'string' || typeof data.enabled !== 'boolean')) throw Object.assign(new Error('Welcome Message Save Could Not Be Confirmed'), { status: 503 });
    return body.action === 'read' ? { success: true, clubs: data } : data;
}
