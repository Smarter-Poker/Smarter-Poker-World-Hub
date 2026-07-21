// Root App Router layout.
// 2026-07-21: the app/ dir previously held only route handlers (app/api/*),
// so Next synthesized the /_not-found page from its BUILTIN layout/not-found
// client modules. Webpack emitted those builtins into the client-reference
// manifest nondeterministically, intermittently crashing `next build
// --webpack` during the /_not-found export with:
//   "Cannot read properties of undefined (reading
//    'next/dist/client/components/builtin/layout')"
// Declaring an explicit root layout (+ app/not-found.js) replaces the
// builtins with project files that are always bundled, making the manifest —
// and the build — deterministic. Pages Router routes and pages/404.js are
// unaffected.
export const metadata = {
  title: 'Smarter.Poker',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
