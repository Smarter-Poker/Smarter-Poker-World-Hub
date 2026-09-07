# Terms Acceptance Waits For Its Client Import

The acceptance route loaded an ES-module re-export with a CommonJS require.
When its dependency graph is asynchronous, webpack returns the pending module
before createClient is available. The first configured acceptance request
then throws before authentication or the profile update can finish.

The route now uses a named ES import so the bundler awaits that dependency.
The existing idempotency, rate-limit, authentication and update checks remain
in place. No database or access-control configuration changes are included.

A regression test compiles the real route and its actual re-export with
Next's webpack in production mode, using an asynchronous client dependency
fixture and isolated external services. Minification is not needed for the
module initialization failure. With the original require, the test returns
500 and reports createClient is not a function; with the ES import it returns
200 after the fixture verifies the authenticated profile update.

The test runs in prebuild. It establishes the bundling correction, not a live
acceptance write. Final production browser acceptance still needs verification.

The same CommonJS client import remained in public-clubs, union-invoice,
poker/engine/seat and the tables DELETE branch. The first three now use
ES imports; the conditional DELETE branch awaits import in place. Companion
wiring checks cover those four imports without claiming to test their business
logic. These changes preserve the existing authentication and chip operations.
