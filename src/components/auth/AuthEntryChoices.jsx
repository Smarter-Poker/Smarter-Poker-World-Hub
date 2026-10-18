import { authSwitchHref } from '../../lib/clubInvite';

/** Referral visitors can choose either door before filling the registration form. */
export default function AuthEntryChoices({ current, query }) {
  if (!query?.ref && !query?.invite && !query?.redirect) return null;
  return (
    <nav aria-label="Account Access" style={{ position: 'relative', margin: '12px auto', zIndex: 40, display: 'flex', width: 'calc(100% - 48px)', maxWidth: 320, padding: 4, gap: 4, background: '#0b1018', border: '1px solid #405b75', borderRadius: 12, boxSizing: 'border-box', boxShadow: '0 4px 18px #000' }}>
      {[['login', 'Sign In'], ['signup', 'Sign Up']].map(([mode, label]) => (
        <a key={mode} href={authSwitchHref(`/auth/${mode}`, query)} aria-current={current === mode ? 'page' : undefined}
          style={{ flex: 1, textAlign: 'center', padding: '12px 8px', minHeight: 44, boxSizing: 'border-box', borderRadius: 8, color: '#fff', background: current === mode ? '#244c76' : 'transparent', fontWeight: 700, textDecoration: 'none' }}>{label}</a>
      ))}
    </nav>
  );
}
