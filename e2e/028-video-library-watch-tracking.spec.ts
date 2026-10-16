import { test, expect } from '@playwright/test';
import { installRealtimeSessionGuard } from './fixtures/realtimeSessionGuard';

// This file plants a fabricated session. Keep it off live Supabase Realtime.
test.beforeEach(async ({ context }) => {
  await installRealtimeSessionGuard(context);
});

const OWNER = '33333333-3333-4333-8333-333333333333';
const VIDEO_ID = 'phase7v0000';
// Native buttons in the actual official-origin iframe emit the isolated
// provider protocol. This is compiled wiring proof, not live provider proof.
const PROVIDER = `<!doctype html><title>Tracking Provider Contract</title><button id="play">Play</button><button id="pause">Pause</button><script>
let started = null, position = 0; window.commands = [];
const emit = (event,info) => parent.postMessage(JSON.stringify({event,info}), '*');
function tick(){if(started!==null) emit('infoDelivery',{currentTime:position+(Date.now()-started)/1000,duration:70,playerState:1});}
function play(){if(started===null)started=Date.now();tick();emit('onStateChange',1);}
function pause(){if(started!==null)position+=(Date.now()-started)/1000;started=null;emit('infoDelivery',{currentTime:position,duration:70,playerState:2});emit('onStateChange',2);}
document.getElementById('play').onclick=play;
document.getElementById('pause').onclick=pause;
addEventListener('message',event=>{if(event.source!==parent)return;let data;try{data=JSON.parse(event.data);}catch{return;}
if(data.event!=='command')return;window.commands.push(data);
if(data.func==='seekTo'){position=Number(data.args[0]);if(started!==null)started=Date.now();}
if(data.func==='playVideo')play();if(data.func==='pauseVideo')pause();});
setInterval(tick,100);
</script>`;

test('canonical compiled viewer persists confirmed owned watch progress without reloading its running iframe', async ({ page }) => {
    let row = { video_id: VIDEO_ID, progress_seconds: 20, watch_duration_seconds: 20, duration_seconds: 70, watched_at: new Date().toISOString() };
    const writes: any[] = [];
    await page.addInitScript(({ owner }) => {
        localStorage.setItem('smarter-poker-auth', JSON.stringify({ access_token: 'local-browser-fixture-only', refresh_token: 'local-browser-fixture-only', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: owner, email: 'owner-tools-fixture@example.invalid', user_metadata: {} } }));
    }, { owner: OWNER });
    await page.route('**/auth/v1/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: OWNER, email: 'owner-tools-fixture@example.invalid' }) }));
    await page.route('**/rest/v1/**', route => route.fulfill({ contentType: 'application/json', body: '[]' }));
    await page.route('**/rest/v1/video_watch_history**', route => {
        expect(new URL(route.request().url()).searchParams.get('user_id')).toBe(`eq.${OWNER}`);
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify([row]) });
    });
    await page.route('**/rest/v1/rpc/record_video_watch_session', route => {
        const body = route.request().postDataJSON(); writes.push(body);
        expect(body.p_expected_user_id).toBe(OWNER); expect(body.p_video_id).toBe(VIDEO_ID);
        expect(body.p_additional_seconds).toBeGreaterThanOrEqual(1);
        // The server's acknowledged total deliberately differs from the local
        // cumulative guess, proving the UI uses the authoritative response.
        row = { ...row, watch_duration_seconds: 21, progress_seconds: body.p_progress_seconds };
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ canonical_video_id: VIDEO_ID, watch_duration_seconds: row.watch_duration_seconds, progress_seconds: row.progress_seconds }]) });
    });
    await page.route('**/api/video-library/study-status**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, ownerId: OWNER, data: { currentStreak: 0, diamondsToday: 0, studiedToday: false, basis: 'rewarded_video_watch_days' } }) }));
    await page.route('https://www.youtube-nocookie.com/embed/**', route => route.fulfill({ contentType: 'text/html', body: PROVIDER }));
    await page.goto(`/hub/video-library/watch/${VIDEO_ID}/daniel-negreanu-poker-decision`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-watch-tracking="ready"]')).toBeVisible();
    const iframe = page.locator('iframe[src*="youtube-nocookie.com/embed/"]');
    await expect(iframe).toBeVisible();
    await expect(page.locator('.vl-play-facade')).toHaveCount(0);
    const original = await iframe.elementHandle();
    const source = await iframe.getAttribute('src');
    expect(new URL(source!).searchParams.get('autoplay')).toBe('0');
    expect(new URL(source!).searchParams.has('start')).toBe(false);
    const provider = await original!.contentFrame();
    await expect(provider!.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    const commands = () => provider!.evaluate(() => (window as any).commands);
    expect((await commands()).filter((item: any) => item.func === 'playVideo')).toHaveLength(0);
    expect(writes).toHaveLength(0);
    const resume = page.getByRole('button', { name: 'Resume Saved Position', exact: true });
    await expect(resume).toBeVisible();
    await resume.evaluate(element => element.scrollIntoView({block:'center'}));
    await resume.click();
    await expect.poll(async () => (await commands()).some((item: any) => item.func === 'seekTo' && item.args[0] === 20)).toBe(true);
    await expect.poll(async () => (await commands()).some((item: any) => item.func === 'playVideo')).toBe(true);
    await expect.poll(async () => Number(await page.getByRole('slider', { name: 'Seek Video' }).inputValue())).toBeGreaterThan(22);
    const mini = page.getByRole('button', { name: 'Mini-Player', exact: true });
    await mini.evaluate(element => element.scrollIntoView({block:'center'}));
    await mini.click();
    const close = page.locator('.vl-mini-controls').getByRole('button', { name: 'Close Player', exact: true });
    await close.click();
    await expect.poll(async () => (await commands()).some((item: any) => item.func === 'pauseVideo')).toBe(true);
    await expect(page.locator('[data-watch-tracking="saved"]')).toHaveText('Watch Progress Saved');
    expect(writes).toHaveLength(1);
    expect(await iframe.getAttribute('src')).toBe(source);
    expect(await original?.evaluate(element => element.isConnected && element === document.querySelector('iframe[src*="youtube-nocookie.com/embed/"]'))).toBe(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-watch-tracking="ready"]')).toBeVisible();
    await expect(iframe).toBeVisible();
    expect(await iframe.getAttribute('src')).toBe(source);
    const resumedFrame = await (await iframe.elementHandle())!.contentFrame();
    const restoredPosition = Math.floor(row.progress_seconds);
    await expect(resume).toBeVisible();
    await resume.evaluate(element => element.scrollIntoView({block:'center'}));
    await resume.click();
    await expect.poll(() => resumedFrame!.evaluate(position => (window as any).commands.some((item: any) => item.func === 'seekTo' && item.args[0] === position), restoredPosition)).toBe(true);
    expect(await iframe.getAttribute('src')).toBe(source);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(await page.evaluate(() => document.documentElement.clientWidth));
});
