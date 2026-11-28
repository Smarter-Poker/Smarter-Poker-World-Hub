/**
 * The live stream that is running in this tab, if any - without the LiveKit SDK.
 *
 * GlobalPiPManager is mounted by _app on every page, and it only ever renders
 * for a stream that GoLiveModal or LiveStreamViewer already started. It used to
 * import LiveStreamService directly, which statically imports livekit-client,
 * so every page of the estate downloaded the whole SDK (527 KB decoded, about
 * 141 KB over the wire) a moment after hydration, for a widget that renders
 * null unless a stream is live. That alone pushed most World roots over their
 * mobile JS budget.
 *
 * A stream cannot exist until LiveStreamService has been loaded by the surface
 * that starts it, so the service registers its singleton here when its module
 * evaluates, and the PiP reads it from here. No service registered means no
 * stream, and the SDK stays off pages that never stream.
 */
let activeService = null;

export function registerLiveStreamService(service) {
  activeService = service || null;
}

export function getLiveStreamService() {
  return activeService;
}
