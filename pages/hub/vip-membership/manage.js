import Link from 'next/link';
import { CalendarClock, Crown, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';

import MarketplaceDetailExperience from '../../../src/components/store/MarketplaceDetailExperience';
import detailStyles from '../../../src/components/store/MarketplaceDetailExperience.module.css';
import { ensureAuthReady, getAuthUser } from '../../../src/lib/authUtils';
import supabase from '../../../src/lib/supabase';

export default function VipManagePage() {
  const [membership, setMembership] = useState({ loading: true, isVip: false, tier: null, expiresAt: null });
  const canonical = '/hub/vip-membership/manage';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = getAuthUser() || (await ensureAuthReady(supabase));
      if (!user?.id) {
        if (!cancelled) setMembership({ loading: false, isVip: false, signedOut: true, tier: null, expiresAt: null });
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('is_vip, vip_tier, vip_expires_at')
        .eq('id', user.id)
        .maybeSingle();
      if (!cancelled) {
        setMembership({
          loading: false,
          isVip: Boolean(data?.is_vip),
          tier: data?.vip_tier || null,
          expiresAt: data?.vip_expires_at || null,
        });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const stateLabel = membership.loading
    ? 'Checking Membership'
    : membership.isVip
      ? 'VIP Active'
      : 'No Active VIP';
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Manage Smarter.Poker VIP Membership',
    description: 'Review VIP entitlement status and open secure subscription management.',
    url: `https://smarter.poker${canonical}`,
  };

  return (
    <MarketplaceDetailExperience
      canonical={canonical}
      title="VIP Command Center"
      description="Review your verified entitlement, expiration signal, and subscription controls from one secure record."
      eyebrow="High Limit Access / Membership Record"
      image="/images/store-v3/vip-hero.webp"
      imageAlt="Smarter.Poker VIP command platform"
      breadcrumbs={[
        { label: 'Marketplace', href: '/hub/diamond-store' },
        { label: 'VIP Membership', href: '/hub/vip-membership' },
        { label: 'Manage', href: canonical },
      ]}
      status={stateLabel}
      actions={
        <>
          <Link href="/hub/settings?section=billing"><Settings size={16} aria-hidden="true" /> Open Billing Settings</Link>
          <Link href="/hub/vip-membership/compare"><CalendarClock size={16} aria-hidden="true" /> Compare Plans</Link>
        </>
      }
      structuredData={schema}
    >
      <div className={detailStyles.detailGrid}>
        <section className={detailStyles.detailCard} role="status" aria-live="polite">
          <h2><Crown size={22} aria-hidden="true" /> Entitlement Signal</h2>
          {membership.loading ? (
            <p>Reading the server-owned VIP record…</p>
          ) : membership.signedOut ? (
            <p>Sign in to view your private membership record and billing controls.</p>
          ) : membership.isVip ? (
            <>
              <p>Your VIP entitlement is active{membership.tier ? ` at the ${membership.tier} tier` : ''}.</p>
              <p>{membership.expiresAt ? `Current access runs through ${new Date(membership.expiresAt).toLocaleDateString()}.` : 'This membership has no recorded expiration date.'}</p>
            </>
          ) : (
            <p>No active VIP entitlement was found. Choose a daily, monthly, or annual plan to activate the full suite.</p>
          )}
        </section>
        <section className={detailStyles.detailCard}>
          <h2>Secure Controls</h2>
          <p>Billing Settings is the authoritative surface for card subscription state. The VIP storefront handles new card and diamond purchases; both update this entitlement record after server verification.</p>
          <p><Link href="/hub/vip-membership">Return to VIP Membership</Link></p>
        </section>
      </div>
    </MarketplaceDetailExperience>
  );
}
