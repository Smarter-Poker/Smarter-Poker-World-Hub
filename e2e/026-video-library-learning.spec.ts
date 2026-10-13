import { test, expect, type Page, type Frame } from '@playwright/test';

const VIDEO_ID = 'phase7v0000';
const TITLE = 'Daniel Negreanu Poker Decision';
const VIDEO = { id: VIDEO_ID, videoId: VIDEO_ID, source: 'HCL', sourceName: 'Channel Contract Poker', title: TITLE, tags: ['Daniel Negreanu'], type: 'cash', duration: '18:42', availabilityStatus: 'verified', embeddable: true, availabilityCheckedAt: new Date().toISOString() };

// The iframe retains the provider origin and emits messages from its actual
// contentWindow. This qualifies our protocol wiring, not YouTube playback.
const PROVIDER_DOCUMENT = `<!doctype html><title>Isolated Provider Contract</title><script>
window.contract = {commands: [], emit(event, info) { parent.postMessage(JSON.stringify({event, info}), '*'); }};
addEventListener('message', event => { try { const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; if (message.event === 'command') window.contract.commands.push(message); } catch {} });
</script>`;

async function fixtures(page: Page) {
    await page.route('https://www.youtube-nocookie.com/embed/**', route => route.fulfill({ contentType: 'text/html', body: PROVIDER_DOCUMENT }));
    await page.route('**/api/video-library/catalog**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: [VIDEO], pagination: { total: 1, hasMore: false } }) }));
    await page.route('**/api/video-library/live**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: [], checkedAt: new Date().toISOString(), unavailableChannels: 0 }) }));
}

async function provider(page: Page): Promise<Frame> {
    await expect(page.locator('iframe[src*="youtube-nocookie.com/embed/"]')).toHaveCount(1);
    const handle = await page.locator('iframe[src*="youtube-nocookie.com/embed/"]').elementHandle();
    const frame = await handle?.contentFrame();
    if (!frame) throw new Error('Actual Mounted Provider Frame Missing');
    await frame.waitForLoadState('load');
    await frame.waitForFunction(() => Boolean((window as any).contract));
    return frame;
}

async function emit(frame: Frame, event: string, info: unknown) {
    await frame.evaluate(({ event, info }) => (window as any).contract.emit(event, info), { event, info });
}

async function commands(frame: Frame, func: string) {
    return frame.evaluate(func => (window as any).contract.commands.filter((command: any) => command.func === func).length, func);
}

async function geometry(page: Page) {
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    const footer = page.getByRole('navigation', { name: /Video Library Footer/i });
    await expect.poll(() => footer.evaluate(element => Math.abs(element.getBoundingClientRect().bottom - innerHeight))).toBeLessThanOrEqual(1);
    await expect(page.locator('header').first()).toBeVisible();
}

async function ready(frame: Frame, position = 10) {
    await emit(frame, 'infoDelivery', { currentTime: position, duration: 1122 });
    await emit(frame, 'onStateChange', 1);
}

async function chooseAndContinue(page: Page, frame: Frame) {
    await expect(page.getByRole('region', { name: 'Playback Tools', exact: true })).toHaveCount(1);
    const quiz = page.getByRole('region', { name: 'What Would You Do?', exact: true });
    await expect(quiz).toHaveCount(1);
    const originalIframe = await page.locator('iframe[src*="youtube-nocookie.com/embed/"]').elementHandle();
    const beforePause = await commands(frame, 'pauseVideo');
    await expect(quiz.getByRole('button', { name: 'What Would You Do?', exact: true })).toBeEnabled();
    await quiz.getByRole('button', { name: 'What Would You Do?', exact: true }).click();
    await expect.poll(() => commands(frame, 'pauseVideo')).toBe(beforePause + 1);
    await expect(quiz.getByText('Waiting For The Player To Pause.', { exact: true })).toBeVisible();
    await emit(frame, 'onStateChange', 2);
    await quiz.getByRole('button', { name: 'Call', exact: true }).click();
    const reason = quiz.getByRole('textbox', { name: 'Why This Decision?' });
    await reason.fill('Compare the price with the range.');
    await expect(reason).toHaveValue('Compare the price with the range.');
    await expect(quiz.getByText(/Your Decision, Not A Solver Answer/i)).toBeVisible();
    const buttons = quiz.getByRole('button');
    for (const button of await buttons.all()) {
        if (!(await button.isVisible())) continue;
        const bounds = await button.boundingBox();
        expect(bounds?.height).toBeGreaterThanOrEqual(44);
    }
    const beforePlay = await commands(frame, 'playVideo');
    await quiz.getByRole('button', { name: 'Continue Watching', exact: true }).click();
    await expect.poll(() => commands(frame, 'playVideo')).toBe(beforePlay + 1);
    await expect(quiz.getByRole('button', { name: 'Call', exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Playback Tools', exact: true })).toHaveCount(1);
    await expect(quiz).toHaveCount(1);
    expect(await originalIframe?.evaluate(element => element.isConnected && element === document.querySelector('iframe[src*="youtube-nocookie.com/embed/"]'))).toBe(true);
}

test.describe('Phase 7 Poker Learning', () => {
    test('library quiz pauses the actual frame, records a session decision and explicitly continues', async ({ page }) => {
        await fixtures(page);
        await page.goto('/hub/video-library', { waitUntil: 'commit' });
        await page.getByRole('link', { name: `Play ${TITLE}`, exact: true }).first().click();
        const frame = await provider(page);
        await ready(frame);
        await chooseAndContinue(page, frame);
        await geometry(page);
    });

    test('standalone quiz cancels without resuming and resets when opening another video', async ({ page }) => {
        await fixtures(page);
        await page.goto(`/hub/video-library/watch/${VIDEO_ID}/daniel-negreanu-poker-decision`, { waitUntil: 'commit' });
        await page.getByRole('button', { name: `Play ${TITLE}`, exact: true }).click();
        const frame = await provider(page);
        await ready(frame);
        const quiz = page.getByRole('region', { name: 'What Would You Do?', exact: true });
        await expect(quiz.getByRole('checkbox', { name: 'Pause At Hand Markers' })).toBeVisible();
        const beforePause = await commands(frame, 'pauseVideo');
        const beforePlay = await commands(frame, 'playVideo');
        await quiz.getByRole('button', { name: 'What Would You Do?', exact: true }).click();
        await expect.poll(() => commands(frame, 'pauseVideo')).toBe(beforePause + 1);
        await emit(frame, 'onStateChange', 2);
        await quiz.getByRole('button', { name: 'Cancel Quiz', exact: true }).click();
        expect(await commands(frame, 'playVideo')).toBe(beforePlay);
        await emit(frame, 'onStateChange', 1);
        await chooseAndContinue(page, frame);
        await emit(frame, 'infoDelivery', { currentTime: 10 });
        await page.getByRole('button', { name: 'Mark This Hand', exact: true }).click();
        await quiz.getByRole('checkbox', { name: 'Pause At Hand Markers' }).check();
        await emit(frame, 'infoDelivery', { currentTime: 8 });
        await emit(frame, 'onStateChange', 1);
        const beforeMarker = await commands(frame, 'pauseVideo');
        await emit(frame, 'infoDelivery', { currentTime: 11 });
        await expect.poll(() => commands(frame, 'pauseVideo')).toBe(beforeMarker + 1);
        await emit(frame, 'onStateChange', 2);
        await quiz.getByRole('button', { name: 'Cancel Quiz', exact: true }).click();
        await emit(frame, 'infoDelivery', { currentTime: 8 });
        await emit(frame, 'onStateChange', 1);
        await emit(frame, 'infoDelivery', { currentTime: 12 });
        await expect(page.getByRole('slider', { name: 'Seek Video' })).toHaveValue('12');
        await expect(page.getByRole('region', { name: 'Playback Tools', exact: true })).toHaveCount(1);
        await expect(quiz).toHaveCount(1);
        expect(await commands(frame, 'pauseVideo')).toBe(beforeMarker + 1);
        await expect(quiz.getByRole('button', { name: 'Call', exact: true })).toHaveCount(0);
        await geometry(page);
        await page.getByRole('link', { name: /Daniel Negreanu Tournament Review/ }).first().click();
        await expect(page).toHaveURL(/\/watch\/phase7v0001\//);
        await expect(page.getByRole('heading', { name: 'Daniel Negreanu Tournament Review', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Call', exact: true })).toHaveCount(0);
    });

    test('public player page indexes only exact catalog names and navigates to its real watch route', async ({ page }) => {
        await fixtures(page);
        await page.goto('/hub/video-library', { waitUntil: 'commit' });
        await page.getByRole('link', { name: 'Poker Players', exact: true }).click();
        await expect(page).toHaveURL(/\/video-library\/players$/);
        await expect(page.getByRole('heading', { name: 'Poker Players', exact: true })).toBeVisible();
        await page.getByRole('link', { name: 'Daniel Negreanu', exact: true }).click();
        await expect(page).toHaveURL(/\/video-library\/players\/daniel-negreanu/);
        await expect(page.getByRole('heading', { name: 'Daniel Negreanu', exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Videos Naming Daniel Negreanu', exact: true })).toBeVisible();
        await expect(page.getByText('Unrelated River Decision', { exact: true })).toHaveCount(0);
        await expect(page.getByText('Videos Whose Published Titles Or Tags Name This Player.', { exact: true })).toBeVisible();
        const link = page.getByRole('link', { name: `Watch ${TITLE}`, exact: true });
        await expect(link).toHaveAttribute('href', `/hub/video-library/watch/${VIDEO_ID}/daniel-negreanu-poker-decision`);
        expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        await geometry(page);
        await link.click();
        await expect(page.getByRole('heading', { name: TITLE, exact: true })).toBeVisible();
    });
});
