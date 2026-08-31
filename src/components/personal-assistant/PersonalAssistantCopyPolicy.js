import { useEffect } from 'react';
import {
  applyPersonalAssistantCopyPolicy,
  PERSONAL_ASSISTANT_COPY_CLASS,
} from '../../lib/personal-assistant/copyPolicy.mjs';

/** Enforces the Personal Assistant copy contract in route content and portals. */
export default function PersonalAssistantCopyPolicy() {
  useEffect(() => {
    const root = document.body;
    root.classList.add(PERSONAL_ASSISTANT_COPY_CLASS);
    applyPersonalAssistantCopyPolicy(root);

    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData' || mutation.type === 'attributes') {
          applyPersonalAssistantCopyPolicy(mutation.target);
          continue;
        }
        mutation.addedNodes.forEach(applyPersonalAssistantCopyPolicy);
      }
    });
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'aria-description', 'placeholder', 'title', 'data-tooltip'],
    });

    return () => {
      observer.disconnect();
      root.classList.remove(PERSONAL_ASSISTANT_COPY_CLASS);
    };
  }, []);

  return (
    <style jsx global>{`
      body.${PERSONAL_ASSISTANT_COPY_CLASS},
      body.${PERSONAL_ASSISTANT_COPY_CLASS} * {
        text-transform: capitalize !important;
      }

      body.${PERSONAL_ASSISTANT_COPY_CLASS} :is(input, textarea)::placeholder {
        text-transform: capitalize !important;
      }
    `}</style>
  );
}
