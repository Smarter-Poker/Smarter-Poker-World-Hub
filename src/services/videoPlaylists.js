import { supabase } from '../lib/supabase';

export async function getVideoPlaylists(userId) {
    const { data, error } = await supabase
        .from('video_playlists')
        .select('*, items:video_playlist_items(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    
    if (error) {
        console.warn('Error fetching playlists:', error);
        return [];
    }
    return data || [];
}

export async function createPlaylist(userId, name) {
    const { data, error } = await supabase
        .from('video_playlists')
        .insert([{ user_id: userId, name }])
        .select()
        .single();
    
    if (error) throw error;
    return data;
}

export async function addVideoToPlaylist(playlistId, videoId, videoTitle, videoSource) {
    const { data, error } = await supabase
        .from('video_playlist_items')
        .insert([{
            playlist_id: playlistId,
            video_id: videoId,
            video_title: videoTitle,
            video_source: videoSource
        }]);
    
    // Ignore duplicate key errors if already in playlist
    if (error && error.code !== '23505') throw error;
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
