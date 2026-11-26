import { useState } from 'react';
import { BankrollActionTarget } from '../BankrollHeaderAdd';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, ChevronRight } from 'lucide-react';
import BankrollHelp from '../BankrollHelp';
import styles from './TokeWorkspace.module.css';

const home = '/hub/toke-tracker';
const sections = [
  { slug: 'shift', title: 'Shift Tracker', art: 'dealer-shift' },
  { slug: 'analytics', title: 'Analytics', art: 'dealer-analytics' },
  { slug: 'vault', title: 'Dealer Vault', art: 'dealer-vault' },
  { slug: 'venues', title: 'Venue Intel', art: 'dealer-venues' },
];

export function TokeDestinations() {
  return <nav aria-label="Toke Tracker Tools" className={styles.destinations}>
    {sections.map(item => <Link href={home + '/' + item.slug} key={item.slug} className={styles.destination}>
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
    <header className={'sd-masthead ' + styles.masthead} style={{ '--toke-art': 'url("/images/smarterdesign/' + (current?.art || 'dealer-table') + '.webp")' }}>
      {current && <Link href={home} className={styles.parentLink}>Toke Tracker<ChevronRight size={14} aria-hidden="true" /></Link>}
      <h1>{title}</h1>
      <div ref={setActionTarget} className={styles.headerActions}><Link href="/hub/bankroll-manager" className={'sd-button ' + styles.back}><ArrowLeft aria-hidden="true" size={16} /> Back To Dashboard</Link></div>
      <BankrollHelp title={title} section={'toke-' + (section || 'home')} />
    </header>
    {current && <nav aria-label="Toke Tracker Tools" className={'sd-tabs ' + styles.sectionNav}>
      {sections.map(item => <Link key={item.slug} href={home + '/' + item.slug} aria-current={item.slug === section ? 'page' : undefined}>{item.title}</Link>)}
    </nav>}
    <BankrollActionTarget.Provider value={actionTarget}>{children}</BankrollActionTarget.Provider>
  </main></div>;
}
