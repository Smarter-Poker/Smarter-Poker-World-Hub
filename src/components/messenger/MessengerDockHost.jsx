import MessengerDock from './dock/MessengerDock';
import { supabase } from '../../lib/supabase';
import { authedFetch, getAuthUser, getAccessToken } from '../../lib/authUtils';
import { messengerPreferences } from '../../services/preferences-service';
import { listenBroadcast, broadcastSync } from '../../lib/broadcastSync';
const services = {
    supabase, getAuthUser, getPreferences: actorId => messengerPreferences.get(actorId), listenBroadcast, broadcastSync,
    request: (path, options = {}) => authedFetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers, Authorization: `Bearer ${getAccessToken()}` } }),
    openMessenger: id => window.location.assign(`/hub/messenger${id ? `?conversation=${encodeURIComponent(id)}` : ''}`),
};
export default function MessengerDockHost() { return <MessengerDock services={services} />; }
