# Shared authentication network deadline

World Hub and Club Arena share smarter-poker-auth and the SDK Web Lock.
Bounding only a Club Arena reconnect caller cannot release a hanging refresh
owned by the Hub. The browser Supabase client now applies a ten-second
fetch/body deadline to its configured auth endpoint. Database requests are
unchanged. The SDK retains its own refresh retry window and session lock;
there is no independent refresh loop or manual token rotation.

The matching Club Arena regression uses the real GoTrueClient and proves
that a timed-out refresh retains storage, releases a queued session read,
and allows the next refresh. Hub's Node tests cover fetch/body hangs,
response preservation and prior cancellation, and are wired into the CI
guard entry point. Old already-open Hub bundles can retain their previous
behavior until they load the new release. This change is not evidence that
the specific reported mobile outage has been reproduced or cured.
