import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import * as messageMedia from '../src/lib/messenger/messageMedia.mjs';
import * as liveInvite from '../src/lib/messenger/liveInvite.mjs';
import * as callReceipt from '../src/lib/messenger/callReceipt.mjs';
import * as reliabilityIncident from '../src/lib/messenger/reliabilityIncident.mjs';
import * as accountingMessage from '../src/lib/accountingMessage.mjs';
import * as unionEco from '../src/lib/unionEco.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const LIGHT_THEME = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    blue: '#0084FF', red: '#E41E3F', border: '#E4E6EB', hoverBg: '#E4E6EB',
    ownBubble: 'linear-gradient(135deg, #0084FF 0%, #0066CC 100%)', otherBubble: '#E4E6EB',
};

function loadMessageBubble() {
    const filePath = path.resolve(process.cwd(), 'src/components/messenger/MessageBubble.js');
    const code = ts.transpileModule(readFileSync(filePath, 'utf8'), {
        fileName: 'MessageBubble.jsx',
        compilerOptions: {
            jsx: ts.JsxEmit.React,
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            esModuleInterop: true,
        },
    }).outputText;
    const mod = { exports: {} };
    const Nothing = () => null;
    new Function('require', 'module', 'exports', code)((name: string) => ({
        './MediaViewer': { __esModule: true, default: Nothing, ATTACHMENT_ATTRIBUTE: 'data-message-attachment' },
        './MessengerTheme': { defaultTheme: LIGHT_THEME },
        './Avatar': { Avatar: Nothing },
        './AccountingInvoiceCard': { __esModule: true, default: Nothing },
        './InvoicePaymentStatus': { __esModule: true, default: Nothing },
        './CashoutRequestActions': { __esModule: true, default: Nothing, formatChips: String },
        './ReliabilityIncidentControls': { __esModule: true, default: Nothing, ReliabilityMessageHeader: Nothing, ReliabilityMessageDelete: Nothing },
        '../../lib/authUtils': { getAccessToken: () => null, authedFetch: async () => ({}) },
        '../../lib/accountingMessage.mjs': accountingMessage,
        '../../lib/unionEco.mjs': unionEco,
        '../../lib/messenger/messageMedia.mjs': messageMedia,
        '../../lib/messenger/liveInvite.mjs': liveInvite,
        '../../lib/messenger/callReceipt.mjs': callReceipt,
        '../../lib/messenger/reliabilityIncident.mjs': reliabilityIncident,
    }[name] || require(name)), mod, mod.exports);
    return mod.exports.MessageBubble;
}

function makeSvgDataUrl(width: number, height: number, fill: string) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${fill}"/></svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const MessageBubble = loadMessageBubble();

const CASES = [
    { name: 'portrait-phone-screenshot', w: 1080, h: 2340, caption: '', meta: { media_width: 1080, media_height: 2340 }, viewport: { width: 1280, height: 800 } },
    { name: 'landscape-photo', w: 1600, h: 900, caption: '', meta: { media_width: 1600, media_height: 900 }, viewport: { width: 1280, height: 800 } },
    { name: 'square-photo-mobile', w: 800, h: 800, caption: '', meta: { media_width: 800, media_height: 800 }, viewport: { width: 375, height: 760 } },
    { name: 'portrait-captioned-centered', w: 400, h: 1200, caption: 'This Is A Wide Caption Under A Narrow Portrait Screenshot', meta: { media_width: 400, media_height: 1200 }, viewport: { width: 1280, height: 800 } },
];

for (const tc of CASES) {
    test(`Messenger media frame geometry stays exact 1px tight for ${tc.name}`, async ({ page }) => {
        await page.setViewportSize(tc.viewport);
        const placeholderUrl = 'https://smarter.poker/test-image.png';
        const content = tc.caption ? `[Image](${placeholderUrl}) ${tc.caption}` : `[Image](${placeholderUrl})`;
        const markup = renderToStaticMarkup(React.createElement(MessageBubble, {
            message: { id: tc.name, content, media_metadata: tc.meta, created_at: '2026-11-25T17:00:00Z' },
            isOwn: true, showAvatar: false, showTime: true, isLastInGroup: true,
            onReply: () => {}, onReact: () => {}, onDelete: () => {},
            currentUserId: 'u1', theme: LIGHT_THEME,
        })).replaceAll(placeholderUrl, makeSvgDataUrl(tc.w, tc.h, '#1a73e8'));

        await page.setContent(`<!doctype html><html><body style="margin:0;padding:16px;background:#fff;font-family:-apple-system,sans-serif;">${markup}</body></html>`, { waitUntil: 'load' });
        await page.locator('[data-media-frame="image"] img').waitFor({ state: 'visible' });
        await page.evaluate(async () => {
            const img = document.querySelector('[data-media-frame="image"] img') as HTMLImageElement | null;
            if (img && typeof img.decode === 'function') await img.decode().catch(() => {});
        });

        const metrics = await page.evaluate(() => {
            const frame = document.querySelector('[data-media-frame="image"]') as HTMLElement;
            const img = frame.querySelector('img') as HTMLImageElement;
            const actions = document.querySelector('[data-message-actions]') as HTMLElement;
            const fRect = frame.getBoundingClientRect();
            const iRect = img.getBoundingClientRect();
            const cs = getComputedStyle(frame);
            const actionsCs = actions ? getComputedStyle(actions) : null;
            return {
                frameW: Math.round(fRect.width),
                frameH: Math.round(fRect.height),
                imgW: Math.round(iRect.width),
                imgH: Math.round(iRect.height),
                leftGap: Math.round(iRect.left - fRect.left),
                rightGap: Math.round(fRect.right - iRect.right),
                topGap: Math.round(iRect.top - fRect.top),
                paddingTop: cs.paddingTop,
                paddingLeft: cs.paddingLeft,
                borderWidth: cs.borderTopWidth,
                actionsPosition: actionsCs?.position || null,
            };
        });

        expect(metrics.paddingTop).toBe('0px');
        expect(metrics.paddingLeft).toBe('0px');
        expect(metrics.borderWidth).toBe('1px');
        expect(metrics.actionsPosition).toBe('absolute');
        expect(metrics.imgW).toBeGreaterThanOrEqual(160);
        expect(metrics.topGap).toBeLessThanOrEqual(2);

        if (!tc.caption) {
            expect(Math.abs((metrics.frameW - metrics.imgW) - 2)).toBeLessThanOrEqual(1);
            expect(Math.abs((metrics.frameH - metrics.imgH) - 2)).toBeLessThanOrEqual(1);
        } else {
            // Captioned narrow portrait must be balanced horizontally (centered), never lopsided.
            expect(Math.abs(metrics.leftGap - metrics.rightGap)).toBeLessThanOrEqual(2);
        }
    });
}
