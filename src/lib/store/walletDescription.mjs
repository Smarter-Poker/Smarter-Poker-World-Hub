import { marketplaceCopy } from './marketplaceCopy.js';

const WALLET_ACRONYMS = new Set(['VIP', 'GPS', 'WSOP', 'WPT', 'ID', 'UID', 'UTC']);
const TRAILING_LEDGER_REFERENCE = /\s*\[[a-f0-9-]+\]\s*$/iu;
const TRANSFER_DESCRIPTION =
  /^((?:sent|received)\s+[\d,]+\s+diamonds\s+(?:to|from))\s+(.+)$/iu;

export function titleCaseWalletText(value) {
  if (!value) return '';
  return marketplaceCopy(
    String(value)
      .toLowerCase()
      .split(' ')
      .map((word) => {
        if (!word) return '';
        const upper = word.toUpperCase();
        if (WALLET_ACRONYMS.has(upper)) return upper;
        if (word.startsWith('vip:')) {
          return `VIP:${word.slice(4).charAt(0).toUpperCase()}${word.slice(5)}`;
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ')
  );
}

function formatLargeNumbers(value) {
  return value.replace(/\b(\d{4,})\b/gu, (match) => {
    const number = Number.parseInt(match, 10);
    if (match.length === 4 && number >= 1900 && number <= 2099) return match;
    return number.toLocaleString();
  });
}

/**
 * Formats ledger prose while returning transfer identities separately. The
 * caller renders `identity` inside a preserve-case boundary, so neither the
 * wallet's visual Title Case rule nor the World copy observer can rewrite a
 * username or display name embedded by the transfer API.
 */
export function formatWalletDescriptionParts(description) {
  if (!description) return { copy: '', identity: null };

  const cleaned = String(description).replace(TRAILING_LEDGER_REFERENCE, '');
  const transfer = cleaned.match(TRANSFER_DESCRIPTION);
  if (transfer) {
    return {
      copy: titleCaseWalletText(formatLargeNumbers(transfer[1])),
      identity: transfer[2],
    };
  }

  return {
    copy: titleCaseWalletText(formatLargeNumbers(cleaned)),
    identity: null,
  };
}
