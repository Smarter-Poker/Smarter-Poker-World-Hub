export const PERSONAL_ASSISTANT_COPY_CLASS = 'pa-copy-policy';

const EM_DASH = /\s*—\s*/g;

export function normalizePersonalAssistantCopy(value) {
  if (typeof value !== 'string' || !value.includes('—')) return value;
  if (value.trim() === '—') return 'Not Available';
  return value.replace(EM_DASH, ' · ');
}

function normalizeAttributes(element) {
  for (const name of ['aria-label', 'aria-description', 'placeholder', 'title', 'data-tooltip']) {
    const current = element.getAttribute?.(name);
    if (!current?.includes('—')) continue;
    element.setAttribute(name, normalizePersonalAssistantCopy(current));
  }
}

export function applyPersonalAssistantCopyPolicy(root) {
  if (!root || typeof document === 'undefined') return;

  if (root.nodeType === Node.TEXT_NODE) {
    const next = normalizePersonalAssistantCopy(root.nodeValue || '');
    if (next !== root.nodeValue) root.nodeValue = next;
    return;
  }

  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) normalizeAttributes(root);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let textNode = walker.nextNode();
  while (textNode) {
    const next = normalizePersonalAssistantCopy(textNode.nodeValue || '');
    if (next !== textNode.nodeValue) textNode.nodeValue = next;
    textNode = walker.nextNode();
  }

  root.querySelectorAll?.('[aria-label],[aria-description],[placeholder],[title],[data-tooltip]')
    .forEach(normalizeAttributes);
}
