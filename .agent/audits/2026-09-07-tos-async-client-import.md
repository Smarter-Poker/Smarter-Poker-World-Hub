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
