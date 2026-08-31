export const PERSONAL_ASSISTANT_COPY_CLASS = 'pa-copy-policy';

const EM_DASH = /\s*—\s*/g;
const WORD_START = /(^|[\s·/|:;,.!?()[\]{}"+\-–])([a-z])/g;

export function normalizePersonalAssistantSeparators(value) {
  if (typeof value !== 'string' || !value.includes('—')) return value;
  if (value.trim() === '—') return 'Not Available';
  return value.replace(EM_DASH, ' · ');
}

export function titleCasePersonalAssistantCopy(value) {
  if (typeof value !== 'string') return value;
  return value.replace(WORD_START, (_, lead, first) => `${lead}${first.toUpperCase()}`);
}

export function normalizePersonalAssistantCopy(value) {
  return titleCasePersonalAssistantCopy(normalizePersonalAssistantSeparators(value));
}

function normalizeAttributes(element) {
  for (const name of ['alt', 'aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'placeholder', 'title', 'data-tooltip']) {
    const current = element.getAttribute?.(name);
    if (!current) continue;
    const next = normalizePersonalAssistantCopy(current);
    if (next !== current) element.setAttribute(name, next);
  }
}

function isCopyTextNode(node) {
  const parent = node?.parentElement;
  return !parent || !['SCRIPT', 'STYLE', 'TEXTAREA', 'TEMPLATE'].includes(parent.tagName);
}

export function applyPersonalAssistantCopyPolicy(root) {
  if (!root || typeof document === 'undefined') return;

  if (root.nodeType === Node.TEXT_NODE) {
    if (!isCopyTextNode(root)) return;
    const next = normalizePersonalAssistantSeparators(root.nodeValue || '');
    if (next !== root.nodeValue) root.nodeValue = next;
    return;
  }

  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) normalizeAttributes(root);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let textNode = walker.nextNode();
  while (textNode) {
    const next = isCopyTextNode(textNode)
      ? normalizePersonalAssistantSeparators(textNode.nodeValue || '')
      : textNode.nodeValue;
    if (next !== textNode.nodeValue) textNode.nodeValue = next;
    textNode = walker.nextNode();
  }

  root.querySelectorAll?.('[alt],[aria-label],[aria-description],[aria-roledescription],[aria-valuetext],[placeholder],[title],[data-tooltip]')
    .forEach(normalizeAttributes);
}
