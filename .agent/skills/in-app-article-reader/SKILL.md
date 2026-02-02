---
name: In-App Article Reader
description: Server-side proxy system for displaying external articles inside smarter.poker without leaving the app
---

# In-App Article Reader System

## Overview

This skill documents the hardened system for displaying external articles/stories inside smarter.poker. Users can read full articles from PokerNews, Pokerfuse, etc. without ever leaving the app.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     SMARTER.POKER                               │
├─────────────────────────────────────────────────────────────────┤
│  ArticleCard.jsx          │  ArticleReaderModal.jsx             │
│  - Displays preview       │  - Full-screen overlay              │
│  - onClick → opens modal  │  - iframe with proxied content      │
│                           │  - Back/Open buttons                │
├───────────────────────────┼─────────────────────────────────────┤
│                    /api/proxy?url=<encoded>                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 1. Validates URL (protocol, SSRF prevention)           │    │
│  │ 2. Fetches with retry + exponential backoff            │    │
│  │ 3. Rewrites ALL URLs → /api/proxy?url=...              │    │
│  │ 4. Injects navigation interception                     │    │
│  │ 5. Returns HTML that embeds in iframe                  │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     EXTERNAL SITE                               │
│  (pokernews.com, pokerfuse.com, etc.)                           │
│  - Fetched server-side, bypasses X-Frame-Options               │
│  - All resources (CSS, JS, images) proxied                     │
└─────────────────────────────────────────────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `/pages/api/proxy.js` | SERVER-SIDE PROXY - Fetches and rewrites external pages |
| `/src/components/social/ArticleCard.jsx` | Article preview component with onClick |
| `/src/components/social/ArticleReaderModal.jsx` | Full-screen modal with iframe |
| `/pages/hub/social-media.js` | Integration point (articleReader state) |

## How It Works

### 1. User Clicks Article Card
```javascript
// In social-media.js, PostCard passes callback:
onOpenArticle={(url) => setArticleReader({ open: true, url, title })}
```

### 2. Modal Opens with Proxied URL
```javascript
// ArticleReaderModal.jsx
<iframe src={`/api/proxy?url=${encodeURIComponent(url)}`} />
```

### 3. Proxy Fetches and Rewrites
```javascript
// /api/proxy.js rewrites ALL URLs:
href="https://pokernews.com/page" → href="/api/proxy?url=https%3A%2F%2Fpokernews.com%2Fpage"
src="/images/logo.png" → src="/api/proxy?url=https%3A%2F%2Fpokernews.com%2Fimages%2Flogo.png"
```

### 4. Content Displays in Iframe
The HTML is served from smarter.poker domain, so iframe works. All navigation stays in-app.

## Hardening Features

### Error Handling
- Input validation (URL, protocol, SSRF prevention)
- Retry with exponential backoff (3 attempts)
- 10 second timeout per request
- Size limits (10MB max)
- Graceful degradation for blocked sites

### Security
- Blocked hosts: localhost, 127.0.0.1 (SSRF prevention)
- Only http/https protocols allowed
- Content-Security-Policy for iframe embedding

### Monitoring
- `X-Proxy-Success: true` header on success
- `X-Proxy-Source: <domain>` header for debugging
- Console log in injected script

## Troubleshooting

### Article Shows as Blank/Error
1. Check browser console for errors
2. Some sites may still block even with proxy
3. Use "↗ Open" button as fallback

### Links Navigate Away from App
1. Check if URL rewriting is working
2. Verify navigation interception script injected
3. Check console for "[Smarter.Poker Proxy]" log

### Slow Loading
1. Increase `CONFIG.TIMEOUT_MS` if needed
2. Check if external site is slow
3. Retry logic handles transient failures

## DO NOT MODIFY

These files should only be modified with extreme care:
1. `/pages/api/proxy.js` - Core proxy logic
2. `rewriteHtml()` function - URL rewriting critical for staying in-app

## Testing

Run E2E test:
```bash
node scripts/test-article-reader.js
```

Manual test:
1. Go to /hub/social-media
2. Find article card (POKERNEWS.COM, pokerfuse.com)
3. Click card → should open full-screen modal
4. Content should display with text, images
5. Back button should return to feed
