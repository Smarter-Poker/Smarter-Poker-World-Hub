/* One lazy-loading rule for the Bankroll Manager: a section's chunk arrives
   when it mounts and shows the same shimmer block until it does (mobile
   phase 1b, PERF). Shared by the page and its section modules. */
import dynamic from 'next/dynamic';

export const SectionSkeleton = () => <div className="bankroll-skel" style={{ height: 300 }} />;
export const lazySection = (loader) => dynamic(loader, { ssr: false, loading: SectionSkeleton });
