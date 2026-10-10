import ArticleCard from './ArticleCard';
import { useExternalLink } from '../ui/ExternalLinkModal';

// Share the feed's metadata hydration, safe image proxy and text-first layout.
// One click owner keeps the caller's in-app article reader connected.
export function SharedLinkPreviewCard({ onClick, ...preview }) {
    const { openExternal } = useExternalLink();
    return <ArticleCard {...preview} onClick={onClick || openExternal} />;
}

export default SharedLinkPreviewCard;
