import React from 'react';

export default function PushPromptModal({
showPushPrompt, setShowPushPrompt, enablePushNotifications, C, isMobile
}) {
    return (
        <div style={{
                    position: 'fixed',
                    bottom: isMobile ? 70 : 20,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'linear-gradient(135deg, #1877F2, #0A5DC7)',
                    color: 'white',
                    padding: '12px 20px',
                    borderRadius: 12,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    maxWidth: 400,
                }}>
                    <span style={{ fontSize: 28 }}></span>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>Enable Call Notifications</div>
                        <div style={{ fontSize: 12, opacity: 0.9 }}>Get Notified When Someone Calls You</div>
                    </div>
                    <button
                        onClick={async () => {
                            const success = await subscribePush();
                            // Persist choice permanently — never ask again
                            setPushPromptHandled(true);
                            try { localStorage.setItem('messenger_push_prompt_handled', '1'); } catch (e) { console.warn('[App] Handled exception:', e); }
                            if (user?.id) {
                                // Try atomic RPC merge first (single UPDATE, no read-write race)
                                // Fallback to SELECT+UPDATE — OK here since pushPromptHandled only goes false→true
                                supabase.rpc('fn_merge_messenger_preferences', {
                                    p_user_id: user.id,
                                    p_key: 'pushPromptHandled',
                                    p_value: true,
                                }).catch(async () => {
                                    const { data: cur } = await supabase.from('profiles').select('messenger_preferences').eq('id', user.id).maybeSingle();
                                    const merged = { ...(cur?.messenger_preferences || {}), pushPromptHandled: true };
                                    const { error: prefErr } = await supabase.from('profiles').update({ messenger_preferences: merged }).eq('id', user.id);
                                    if (prefErr) console.warn('[Messenger] push prompt pref persist failed (Enable):', prefErr.message);
                                });
                            }
                            setShowPushPrompt(false);
                            if (success) {
                                setToast({ type: 'success', message: 'Push Notifications Enabled!' });
                            }
                        }}
                        style={{
                            padding: '8px 16px',
                            background: 'white',
                            color: '#1877F2',
                            border: 'none',
                            borderRadius: 8,
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >Enable</button>
                    <button
                        onClick={async () => {
                            // Persist dismissal permanently — never ask again
                            setPushPromptHandled(true);
                            try { localStorage.setItem('messenger_push_prompt_handled', '1'); } catch (e) { console.warn('[App] Handled exception:', e); }
                            if (user?.id) {
                                // Atomic JSONB merge — fallback to SELECT+UPDATE if RPC not deployed
                                supabase.rpc('fn_merge_messenger_preferences', {
                                    p_user_id: user.id,
                                    p_key: 'pushPromptHandled',
                                    p_value: true,
                                }).catch(async () => {
                                    const { data: cur } = await supabase.from('profiles').select('messenger_preferences').eq('id', user.id).maybeSingle();
                                    const merged = { ...(cur?.messenger_preferences || {}), pushPromptHandled: true };
                                    const { error: prefErr } = await supabase.from('profiles').update({ messenger_preferences: merged }).eq('id', user.id);
                                    if (prefErr) console.warn('[Messenger] push prompt pref persist failed (Dismiss):', prefErr.message);
                                });
                            }
                            setShowPushPrompt(false);
                        }}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: 18,
                            opacity: 0.7,
                        }}
                    >×</button>
                </div>
    );
}
