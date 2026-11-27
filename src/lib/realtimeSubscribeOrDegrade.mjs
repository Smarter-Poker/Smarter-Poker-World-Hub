// A live-update channel is an enhancement to a page, never a precondition
// for rendering it (Production Alerts fleet, incident
// digest-client-crash-venue-realtime, 2026-11-27).
//
// realtime-js opens its WebSocket synchronously inside channel.subscribe().
// When the browser refuses the socket ("Failed to construct 'WebSocket': the
// provided URL is invalid", a blocked or stubbed WebSocket, a locked-down
// crawler), that constructor throws straight out of the React effect, and the
// page error boundary replaces the whole public venue page with a crash
// screen. Measured 2026-11-26 18:30Z to 2026-11-27 07:05Z: 49 crashes on
// /hub/venues/<id>, every one from this call, every one an anonymous viewer.
//
// subscribeOrDegrade keeps the page: it returns the subscribed channel, or
// null after removing any half-built channel and logging why live updates
// are off. The page already has its data from the initial fetch; only the
// push of later changes is lost, and only for that browser.

export function subscribeOrDegrade(client, buildChannel, label) {
  let channel = null;
  try {
    channel = buildChannel(client);
    channel.subscribe();
    return channel;
  } catch (error) {
    const reason = (error && error.message) || String(error);
    console.warn('[realtime] ' + label + ': live updates unavailable in this browser: ' + reason);
    if (channel) {
      try {
        client.removeChannel(channel);
      } catch (releaseError) {
        console.warn('[realtime] ' + label + ': could not release the unused channel: ' + ((releaseError && releaseError.message) || String(releaseError)));
      }
    }
    return null;
  }
}

export function releaseChannel(client, channel) {
  if (channel) client.removeChannel(channel);
}
