import { useEffect } from 'react';
import {
  normalizeWorldCopy,
  WORLD_COPY_SCOPE_CLASS,
} from '../../lib/world-copy-policy.mjs';

const COPY_ATTRIBUTES = [
  'aria-label',
  'aria-description',
  'placeholder',
  'title',
  'alt',
  'data-tooltip',
];

// Where the world copy policy must NOT retitle text: user-authored content
// and inputs. Match it by the data attributes and classes the social
// components carry (data-post-card, data-user-content, .post-content ...),
// never by a bare element name. 2026-09-04: #1322 added a bare `article` here
// and to the CSS below "to protect post casing"; every social post already
// carried the specific markers, so the only effect was on every OTHER
// <article> in every world - the Personal Assistant's system cards lost
// their title case (14 elements, e2e/021-personal-assistant.spec.ts red on
// main for the rest of the day), and news/venue cards would have followed.
const PRESERVE_SELECTOR = [
  'script',
  'style',
  'noscript',
  'code',
  'pre',
  'kbd',
  'samp',
  'textarea',
  '[contenteditable="true"]',
  '[data-preserve-case="true"]',
  '[data-user-content]',
  '[data-post-card]',
  '[data-post-content]',
  '[data-comment-content]',
  '.no-capitalize',
  '.social-feed',
  '.post-content',
  '.comment-content',
  '.social-post',
].join(',');

function shouldPreserve(element) {
  return Boolean(element?.closest?.(PRESERVE_SELECTOR));
}
function normalizeAttributes(element) {
  if (!element?.getAttribute || shouldPreserve(element)) return;
  for (const name of COPY_ATTRIBUTES) {
    const current = element.getAttribute(name);
    if (!current) continue;
    const next = normalizeWorldCopy(current);
    if (next !== current) element.setAttribute(name, next);
  }

  if (element.tagName === 'META') {
    const field = element.getAttribute('name') || element.getAttribute('property') || '';
    if (/(?:title|description)$/i.test(field)) {
      const current = element.getAttribute('content');
      const next = normalizeWorldCopy(current);
      if (current && next !== current) element.setAttribute('content', next);
    }
  }
}

export function applyWorldCopyPolicy(root) {
  if (!root || typeof document === 'undefined') return;
  const nodeApi = root.ownerDocument?.defaultView?.Node || window.Node;
  const filterApi = root.ownerDocument?.defaultView?.NodeFilter || window.NodeFilter;

  if (root.nodeType === nodeApi.TEXT_NODE) {
    if (shouldPreserve(root.parentElement)) return;
    const current = root.nodeValue || '';
    const next = normalizeWorldCopy(current);
    if (next !== current) root.nodeValue = next;
    return;
  }

  if (
    root.nodeType !== nodeApi.ELEMENT_NODE
    && root.nodeType !== nodeApi.DOCUMENT_FRAGMENT_NODE
    && root.nodeType !== nodeApi.DOCUMENT_NODE
  ) return;

  if (root.nodeType === nodeApi.ELEMENT_NODE) normalizeAttributes(root);
  const ownerDocument = root.ownerDocument || root;
  const walker = ownerDocument.createTreeWalker(root, filterApi.SHOW_TEXT);
  let textNode = walker.nextNode();
  while (textNode) {
    if (!shouldPreserve(textNode.parentElement)) {
      const current = textNode.nodeValue || '';
      const next = normalizeWorldCopy(current);
      if (next !== current) textNode.nodeValue = next;
    }
    textNode = walker.nextNode();
  }

  root.querySelectorAll?.(COPY_ATTRIBUTES.map(name => `[${name}]`).join(','))
    .forEach(normalizeAttributes);
  root.querySelectorAll?.('meta[name$="title" i],meta[name$="description" i],meta[property$="title" i],meta[property$="description" i]')
    .forEach(normalizeAttributes);
}

/** Enforces Title Case and removes long separator bars on every owned world route. */
export default function WorldCopyPolicy({ worldId }) {
  useEffect(() => {
    if (!worldId) return undefined;
    const root = document.documentElement;
    document.body.dataset.worldCopyPolicy = worldId;
    applyWorldCopyPolicy(root);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData' || mutation.type === 'attributes') {
          applyWorldCopyPolicy(mutation.target);
          continue;
        }
        mutation.addedNodes.forEach(applyWorldCopyPolicy);
      }
    });
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: COPY_ATTRIBUTES,
    });

    return () => {
      observer.disconnect();
      delete document.body.dataset.worldCopyPolicy;
    };
  }, [worldId]);

  if (!worldId) return null;
  return (
    <style jsx global>{`
      .${WORLD_COPY_SCOPE_CLASS},
      .${WORLD_COPY_SCOPE_CLASS} * {
        text-transform: capitalize !important;
      }

      .${WORLD_COPY_SCOPE_CLASS} :is(
        input, textarea, select, [contenteditable='true'],
        [data-preserve-case='true'], [data-user-content], [data-post-card],
        [data-post-content], [data-comment-content], .no-capitalize,
        .social-feed, .post-content, .comment-content, .social-post
      ),
      .${WORLD_COPY_SCOPE_CLASS} :is(
        input, textarea, select, [contenteditable='true'],
        [data-preserve-case='true'], [data-user-content], [data-post-card],
        [data-post-content], [data-comment-content], .no-capitalize,
        .social-feed, .post-content, .comment-content, .social-post
      ) * {
        text-transform: none !important;
      }

      .${WORLD_COPY_SCOPE_CLASS} :is(input, textarea)::placeholder {
        text-transform: capitalize !important;
      }
    `}</style>
  );
}
