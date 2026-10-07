import Head from 'next/head';

import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import VideoCreatorRightsConsole from '../../../src/components/video-rights/VideoCreatorRightsConsole';

export default function VideoRightsModerationPage() {
  return <>
    <Head>
      <title>Video Rights Moderation | Smarter.Poker</title>
      <meta name="robots" content="noindex,nofollow" />
    </Head>
    <UniversalHeader pageDepth={2} />
    <main style={{ minHeight: '100dvh', background: 'radial-gradient(circle at 50% -15%, #172f42 0, #02060a 34rem, #000 70rem)' }}>
      <VideoCreatorRightsConsole mode="admin" />
    </main>
  </>;
}
