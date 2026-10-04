import Head from 'next/head';

import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import VideoCreatorRightsConsole from '../../../src/components/video-rights/VideoCreatorRightsConsole';
import ReelCollectionCommandRail from '../../../src/components/reels/ReelCollectionCommandRail';

export default function VideoCreatorStudioPage() {
  return <>
    <Head>
      <title>Creator Rights Studio | Smarter.Poker</title>
      <meta name="description" content="Claim creator sources, submit rights-cleared masters, review clips, control attribution, and manage rights cases." />
      <meta name="robots" content="noindex,nofollow" />
    </Head>
    <UniversalHeader pageDepth={2} />
    <main style={{ minHeight: '100dvh', background: 'radial-gradient(circle at 50% -15%, #13374b 0, #02070b 35rem, #000 70rem)' }}>
      <ReelCollectionCommandRail />
      <VideoCreatorRightsConsole mode="creator" />
    </main>
  </>;
}
