import MessengerDock from './dock/MessengerDock';
import { supabase } from '../../lib/supabase';
import { getAuthUser, getAccessToken } from '../../lib/authUtils';
import { messengerPreferences } from '../../services/preferences-service';
import { listenBroadcast, broadcastSync } from '../../lib/broadcastSync';
import { requestForDockActor } from './dock/bindDockRequest.mjs';
const services = {
    supabase, getAuthUser, getPreferences: actorId => messengerPreferences.get(actorId), listenBroadcast, broadcastSync,
    request: (path, options = {}) => requestForDockActor(path, options, getAccessToken),
    openMessenger: id => window.location.assign(`/hub/messenger${id ? `?conversation=${encodeURIComponent(id)}` : ''}`),
};
export default function MessengerDockHost() { return <MessengerDock services={services} />; }
