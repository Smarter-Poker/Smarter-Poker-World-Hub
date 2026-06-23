// Safe no-op stub. A subagent's transient type-check scratch file could not be
// deleted from the sandbox (mount denies unlink), so it is neutralized here:
// a valid default export keeps the Next.js build green if it is ever committed.
// Safe to delete on the host machine.
export default function TeamsCheckPlaceholder() {
  return null;
}
