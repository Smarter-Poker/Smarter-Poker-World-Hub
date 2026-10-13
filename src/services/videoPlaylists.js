import { supabase } from '../lib/supabase';

export async function getVideoPlaylists(userId) {
    const { data, error } = await supabase
        .from('video_playlists')
        .select('*, items:video_playlist_items(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    
    if (error) {
        console.warn('Error fetching playlists:', error);
        throw error;
    }
    return (data || []).map(playlist => ({ ...playlist, items: [...(playlist.items || [])].sort((a, b) => a.sort_order - b.sort_order || String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id))) }));
}

export async function createPlaylist(userId, name) {
    const { data, error } = await supabase
        .from('video_playlists')
        .insert([{ user_id: userId, name }])
        .select()
        .maybeSingle();
    
    if (error) throw error;
    return data;
}

export async function addVideoToPlaylist(playlistId, videoId, videoTitle, videoSource) {
    const { data, error } = await supabase.rpc('fn_append_video_playlist', {
        p_playlist_id: playlistId, p_video_id: videoId, p_title: videoTitle || null, p_source: videoSource || null,
    });
    if (error) throw error;
    if (data !== true) throw new Error('Playlist Addition Could Not Be Verified.');
    return true;
}

export async function removeVideoFromPlaylist(playlistId, videoId) {
    const { error } = await supabase
        .from('video_playlist_items')
        .delete()
        .eq('playlist_id', playlistId)
        .eq('video_id', videoId);
    
    if (error) throw error;
    return true;
}

export async function getVideoPlaylist(userId, playlistId, signal) {
    const { data, error } = await supabase.from('video_playlists')
        .select('id,user_id,name,created_at,items:video_playlist_items(id,video_id,sort_order,created_at)')
        .eq('user_id', userId).eq('id', playlistId).maybeSingle().abortSignal(signal || new AbortController().signal);
    if (error) throw error;
    if (!data) return null;
    return { ...data, items: [...(data.items || [])].sort((a, b) => a.sort_order - b.sort_order || String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id))) };
}

export async function reorderVideoPlaylist(userId, playlistId, expectedVideoIds, videoIds, signal) {
    const { data, error } = await supabase.rpc('fn_reorder_video_playlist', {
        p_playlist_id: playlistId, p_expected_video_ids: expectedVideoIds, p_video_ids: videoIds,
    }).abortSignal(signal || new AbortController().signal);
    if (error) throw error;
    if (data !== true) throw new Error('Playlist Order Could Not Be Verified.');
    const actual = await getVideoPlaylist(userId, playlistId, signal);
    if (!actual || actual.items.map(item => item.video_id).join(',') !== videoIds.join(',')) throw new Error('Playlist Changed. Reload Its Order Before Trying Again.');
    return actual;
}
