import { REELS_MOBILE_BUDGETS } from '../../lib/reelsDeliveryContract.mjs';

export default function ReelPlayerFrame({
  as: Element = 'div',
  active = true,
  dataSaver = false,
  reelId,
  className,
  children,
  ...props
}) {
  return (
    <Element
      {...props}
      className={className}
      data-reel-player="canonical"
      data-reel-id={reelId || undefined}
      data-reel-active={active ? 'true' : 'false'}
      data-reel-data-saver={dataSaver ? 'true' : 'false'}
      data-reel-player-budget={REELS_MOBILE_BUDGETS.maxMountedPlayers}
    >
      {children}
    </Element>
  );
}
