import { useState } from 'react';
import { BankrollActionTarget } from '../BankrollHeaderAdd';
import Link from 'next/link';
import { ArrowUpRight, ChevronRight } from 'lucide-react';
import BankrollImageHeader from '../BankrollImageHeader';
import styles from './TokeWorkspace.module.css';

const home = '/hub/toke-tracker';
// No viewport prefetch on Toke Tracker links (2026-11-28). next/link fetched
// all four tool pages, the Bankroll Manager dashboard and their chunks the
// moment the landing painted: about 130 KB of JavaScript for pages the dealer
// had not chosen, which put /hub/toke-tracker over its 900 KB mobile budget
// (e2e/mobile-budget.spec.ts). The pages router still prefetches on hover and
// touchstart, so the tap that navigates warms its own page first.
const sections = [
  { slug: 'shift', title: 'Shift Tracker', art: 'dealer-shift' },
  { slug: 'analytics', title: 'Analytics', art: 'dealer-analytics' },
  { slug: 'vault', title: 'Dealer Vault', art: 'dealer-vault' },
  { slug: 'venues', title: 'Venue Intel', art: 'dealer-venues' },
];

export function TokeDestinations() {
  return <nav aria-label="Toke Tracker Tools" className={styles.destinations}>
    {sections.map(item => <Link href={home + '/' + item.slug} key={item.slug} prefetch={false} className={styles.destination}>
      <img src={'/images/smarterdesign/' + item.art + '.webp'} alt="" width="600" height="400" />
      <strong>{item.title}</strong><ArrowUpRight size={22} aria-hidden="true" />
    </Link>)}
  </nav>;
}

export function TokeWorkspace({ section, children }) {
  const [actionTarget, setActionTarget] = useState(null);
  const current = sections.find(item => item.slug === section);
  const title = current?.title || 'Toke Tracker';
  return <div className={'smarterdesign ' + styles.workspace}><main className={styles.shell}>
    <BankrollImageHeader title={title} art={'toke-' + (section || 'home')} back={{ href: '/hub/bankroll-manager' }}
      parent={current && <Link href={home} prefetch={false} className={styles.parentLink}>Toke Tracker<ChevronRight size={14} aria-hidden="true" /></Link>}>
      <div ref={setActionTarget} className={styles.headerActions} />
    </BankrollImageHeader>
    {current && <nav aria-label="Toke Tracker Tools" className={'sd-tabs ' + styles.sectionNav}>
      {sections.map(item => <Link key={item.slug} href={home + '/' + item.slug} prefetch={false} aria-current={item.slug === section ? 'page' : undefined}>{item.title}</Link>)}
    </nav>}
    <BankrollActionTarget.Provider value={actionTarget}>{children}</BankrollActionTarget.Provider>
  </main></div>;
}
