import DiamondStorePage from '../diamond-store';
import SmarterConversionCta from '../../../src/components/seo/SmarterConversionCta';
import { vipProductPageProps } from '../../../src/lib/store/vipStructuredData.mjs';

export default function VipProductPage(props) {
  const planSlug = props?.vipProduct?.plan || 'lifetime';
  return (
    <>
      <DiamondStorePage {...props} key={`${props.vipProduct.gift}:${props.vipProduct.plan}`} initialTab="vip" />
      <div style={{ maxWidth: 960, margin: '0 auto 36px', padding: '0 16px' }}>
        <SmarterConversionCta
          compact
          context={`vip-${planSlug}`}
          redirectPath={`/hub/vip-membership/${planSlug}`}
          eyebrow="Free Smarter.Poker Account"
          title="Start Free Before Upgrading To VIP"
          description="Create Your Free Smarter.Poker Account To Unlock GTO Tools, Live Poker Venues, And Bankroll Tracking Anytime."
          ctaLabel="Create Free Account"
        />
      </div>
    </>
  );
}

export function getServerSideProps(context) {
  return vipProductPageProps(context, false);
}
