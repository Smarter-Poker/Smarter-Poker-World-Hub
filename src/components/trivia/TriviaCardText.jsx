import { Fragment, useMemo } from 'react';
import {
    cardImagePath,
    parseStructuredTriviaQuestion,
    tokenizePokerCardText,
} from '../../lib/trivia/pokerCardText.mjs';

function renderCardGraphic(token, key, size = 'hero') {
    const dims = size === 'board'
        ? { width: 54, height: 76 }
        : { width: 30, height: 42 };
    return (
        <img
            key={key}
            className={`trivia-card-img trivia-card-img--${size}`}
            src={cardImagePath(token.rankCode || token.rank, token.suit)}
            alt={`${token.rank} Of ${token.label || token.suit}`}
            width={dims.width}
            height={dims.height}
            decoding="async"
        />
    );
}

function renderCardPill(token, key) {
    return (
        <span
            key={key}
            className={`trivia-card-pill trivia-card-pill--${token.suit}`}
            aria-label={`${token.rank} of ${token.suit}`}
        >
            <span className="trivia-card-pill__rank">{token.rank}</span>
            <span className="trivia-card-pill__suit" aria-hidden="true">{token.symbol}</span>
        </span>
    );
}

/**
 * Renders an inline token stream. Consecutive card tokens are grouped inside a
 * tight `.trivia-card-group` span so two-card starting hands (e.g. Q♠ 5♠) sit
 * neatly together with no awkward mid-hand line breaks.
 */
function renderInlineTokens(tokens, { formatText, cardStyle = 'pill', cardSize = 'hero', keyPrefix = 't' }) {
    const out = [];
    let i = 0;
    while (i < tokens.length) {
        const token = tokens[i];
        if (token.type === 'text') {
            const value = typeof formatText === 'function' ? formatText(token.value) : token.value;
            out.push(<Fragment key={`${keyPrefix}-${i}`}>{value}</Fragment>);
            i += 1;
            continue;
        }

        // Collect contiguous cards (allowing a single space between adjacent explicit cards).
        const run = [token];
        let j = i + 1;
        while (j < tokens.length) {
            if (tokens[j].type === 'card') {
                run.push(tokens[j]);
                j += 1;
            } else if (
                tokens[j].type === 'text'
                && /^\s+$/.test(tokens[j].value)
                && j + 1 < tokens.length
                && tokens[j + 1].type === 'card'
            ) {
                run.push(tokens[j + 1]);
                j += 2;
            } else {
                break;
            }
        }

        out.push(
            <span key={`${keyPrefix}-g-${i}`} className="trivia-card-group">
                {run.map((card, cIdx) => (
                    cardStyle === 'image'
                        ? renderCardGraphic(card, `${keyPrefix}-c-${i}-${cIdx}`, cardSize)
                        : renderCardPill(card, `${keyPrefix}-c-${i}-${cIdx}`)
                ))}
            </span>,
        );
        i = j;
    }
    return out;
}

/**
 * Renders poker trivia copy with #SMARTERDESIGN playing cards.
 *
 * - Default (options, explanations, body copy): compact inline 4-color card pills
 *   (or real card images when `cardStyle="image"`).
 * - `structured={true}` (question headings across all Trivia modes): automatically
 *   formats poker scenarios into a clean 3-line layout:
 *     1. Situation & hero hand (real playing cards, e.g. Q5s -> Q♠ 5♠)
 *     2. "The Board Is" + large double-size playing cards
 *     3. Bold closing question prompt ("What Is The GTO Play?")
 */
export default function TriviaCardText({
    text,
    formatText,
    structured = false,
    cardStyle = 'pill',
}) {
    const raw = String(text ?? '');

    const parsed = useMemo(() => {
        if (!structured) return null;
        return parseStructuredTriviaQuestion(raw);
    }, [raw, structured]);

    const flatTokens = useMemo(() => {
        if (structured && parsed?.structured) return null;
        return tokenizePokerCardText(raw, { expandHands: true });
    }, [parsed, raw, structured]);

    const setupTokens = useMemo(() => {
        if (!structured || !parsed?.structured || !parsed.setupLine) return [];
        return tokenizePokerCardText(parsed.setupLine, {
            expandHands: true,
            usedCards: parsed.usedCards,
        });
    }, [parsed, structured]);

    const promptTokens = useMemo(() => {
        if (!structured || !parsed?.structured || !parsed.promptLine) return [];
        return tokenizePokerCardText(parsed.promptLine, {
            expandHands: true,
            usedCards: parsed.usedCards,
        });
    }, [parsed, structured]);

    if (!raw) return null;

    if (structured && parsed?.structured) {
        const hasBoard = parsed.boardCards.length > 0;
        const boardAlt = parsed.boardCards.map((c) => `${c.rank} Of ${c.label || c.suit}`).join(', ');
        return (
            <span className="trivia-q-structured" data-structured-question="true">
                {parsed.setupLine ? (
                    <span className="trivia-q-line trivia-q-line--setup">
                        {renderInlineTokens(setupTokens, {
                            formatText,
                            cardStyle: 'image',
                            cardSize: 'hero',
                            keyPrefix: 'setup',
                        })}
                    </span>
                ) : null}

                {hasBoard ? (
                    <span
                        className="trivia-q-line trivia-q-line--board"
                        aria-label={`${parsed.boardLabel}: ${boardAlt}`}
                    >
                        <span className="trivia-q-board-label">{parsed.boardLabel}</span>
                        <span className="trivia-q-board-cards">
                            {parsed.boardCards.map((card, idx) => renderCardGraphic(card, `board-${idx}`, 'board'))}
                        </span>
                    </span>
                ) : null}

                {parsed.promptLine ? (
                    <span className="trivia-q-line trivia-q-line--prompt">
                        {renderInlineTokens(promptTokens, {
                            formatText,
                            cardStyle: 'image',
                            cardSize: 'hero',
                            keyPrefix: 'prompt',
                        })}
                    </span>
                ) : null}
            </span>
        );
    }

    if (!flatTokens || flatTokens.length === 0) return null;
    return renderInlineTokens(flatTokens, {
        formatText,
        cardStyle: structured ? 'image' : cardStyle,
        cardSize: 'hero',
        keyPrefix: 'flat',
    });
}
