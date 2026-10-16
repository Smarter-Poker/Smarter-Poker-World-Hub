import Head from 'next/head';
import SEOHead from '../seo/SEOHead';
import { serializeVideoLibraryStructuredData } from '../../lib/videoLibraryStructuredData.mjs';

/** Keep catalog-controlled JSON out of the shared component's raw serializer. */
export default function VideoLibrarySEOHead({ jsonLd, ...props }) {
    return <><SEOHead {...props} /><Head>{jsonLd && <script key="video-library-structured-data" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeVideoLibraryStructuredData(jsonLd) }} />}</Head></>;
}
