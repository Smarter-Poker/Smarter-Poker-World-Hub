import { Fragment, useMemo } from 'react';
import { tokenizePokerCardText } from '../../lib/trivia/pokerCardText.mjs';

/**
 * Renders poker trivia question copy with inline #SMARTERDESIGN four-color
 * playing-card pills whenever poker hands or boards appear in the prompt.
 */
export default function TriviaCardText({ text, formatText }) {
    const tokens = useMemo(() => tokenizePokerCardText(String(text ?? '')), [text]);
    if (tokens.length === 0) return null;

    return tokens.map((token, idx) => {
        if (token.type === 'text') {
            const value = typeof formatText === 'function' ? formatText(token.value) : token.value;
            return <Fragment key={idx}>{value}</Fragment>;
        }
        return (
            <span
                key={idx}
                className={`trivia-card-pill trivia-card-pill--${token.suit}`}
                aria-label={`${token.rank} of ${token.suit}`}
            >
                <span className="trivia-card-pill__rank">{token.rank}</span>
                <span className="trivia-card-pill__suit" aria-hidden="true">{token.symbol}</span>
            </span>
        );
    });
}
