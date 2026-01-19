---
description: All external links must open in internal popups, never navigate away from smarter.poker
---
# 🔒 Link Containment Law — NEVER Navigate Away

**MANDATORY**: Users must NEVER leave smarter.poker when clicking any link. All external content opens in an internal modal/popup.

## Core Principle

**NO EXTERNAL NAVIGATION** — When a user clicks any link to an external site (anything not on smarter.poker), the link must:
1. Intercept the click
2. Prevent default navigation  
3. Open the content in an `ExternalLinkModal` iframe popup
4. Keep the user on smarter.poker at all times

## Implementation

### Global Interception (Automatic)
The `ExternalLinkProvider` in `_app.js` automatically intercepts ALL external links site-wide:

```jsx
// Already handled globally - no action needed for most cases
// Links like <a href="https://example.com">...</a> are auto-intercepted
```

### Programmatic Usage
For programmatic navigation (e.g., buttons that open URLs):

```jsx
import { useExternalLink } from '../src/components/ui/ExternalLinkModal';

function MyComponent() {
  const { openExternal } = useExternalLink();
  
  const handleClick = () => {
    // DO THIS - opens in modal
    openExternal('https://example.com', 'Example Site');
    
    // NEVER DO THIS:
    // window.location.href = 'https://example.com';
    // window.open('https://example.com');
    // router.push('https://example.com');
  };
  
  return <button onClick={handleClick}>View Content</button>;
}
```

## What Counts as External

The system automatically intercepts links that:
- Start with `http://` or `https://` or `//`
- Do NOT contain `smarter.poker` or `localhost`

## Fallback for Unembeddable Sites

Some sites block iframe embedding (X-Frame-Options). For these:
1. The modal shows an error message
2. A "Open in New Tab" button allows manual opening
3. User is informed they're leaving temporarily

## Enforcement

- **Automatic**: All `<a href="...">` links are intercepted globally
- **Manual check**: Any `window.open()`, `location.href`, or programmatic navigation
- **Code review**: Reject any PR that allows external navigation without the modal

## Files Involved

- `src/components/ui/ExternalLinkModal.jsx` — Core component and provider
- `pages/_app.js` — Wraps entire app with `ExternalLinkProvider`
