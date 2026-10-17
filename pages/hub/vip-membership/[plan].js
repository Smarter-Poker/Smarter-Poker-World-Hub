import DiamondStorePage from '../diamond-store';
import { vipProductPageProps } from '../../../src/lib/store/vipStructuredData.mjs';

export default function VipProductPage(props) {
  return <DiamondStorePage {...props} key={`${props.vipProduct.gift}:${props.vipProduct.plan}`} initialTab="vip" />;
}

export function getServerSideProps(context) {
  return vipProductPageProps(context, false);
}
