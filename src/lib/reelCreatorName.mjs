export function reelCreatorName(reel, { preferProfile = false } = {}) {
  const profileName = reel?.profiles?.display_name || reel?.profiles?.username || null;
  const channelName = reel?.channel_name || null;
  return (preferProfile ? profileName || channelName : channelName || profileName)
    || 'Creator Unavailable';
}

export default reelCreatorName;
