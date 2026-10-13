import Link from 'next/link';
import { getVideoPlayers } from '../../lib/videoLibraryPlayers.mjs';

export default function PlayerLinks({ video }) {
    const players = getVideoPlayers(video);
    if (!players.length) return null;
    return <nav className="vl-player-links" aria-label="Players Named In This Video">
        <span>Players Named</span>
        {players.map(player => <Link key={player.id} href={player.path} onClick={event => event.stopPropagation()}>{player.name}</Link>)}
    </nav>;
}
