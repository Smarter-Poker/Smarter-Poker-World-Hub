import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import sharp from 'sharp';
import { captureBankrollPanel } from './bankrollPanelCapture';

function luminance(red: number, green: number, blue: number) {
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

// Check the solid ink against the actual photograph at every fully painted
// letter pixel. A color-only DOM assertion cannot detect a bright scene crop.
async function inspectTitleContrast(heading: Locator) {
  const capture = { animations: 'disabled', scale: 'css' } as const;
  const painted = await heading.screenshot(capture);
  const background = await heading.screenshot({
    ...capture,
    style:
      '[data-header-art] :is(h1,h2) { color:transparent !important; -webkit-text-fill-color:transparent !important; text-shadow:none !important; }',
  });
  const [ink, base] = await Promise.all(
    [painted, background].map((buffer) => sharp(buffer).removeAlpha().raw().toBuffer())
  );
  expect(ink.length).toBe(base.length);
  let solidPixels = 0,
    lowest = Infinity;
  for (let i = 0; i < ink.length; i += 3) {
    if (
      Math.abs(ink[i] - 243) > 2 ||
      Math.abs(ink[i + 1] - 247) > 2 ||
      Math.abs(ink[i + 2] - 252) > 2
    )
      continue;
    solidPixels++;
    const backdrop = luminance(base[i], base[i + 1], base[i + 2]);
    lowest = Math.min(
      lowest,
      (luminance(ink[i], ink[i + 1], ink[i + 2]) + 0.05) / (backdrop + 0.05)
    );
  }
  expect(solidPixels, 'Fully painted title lettering').toBeGreaterThan(12);
  expect(lowest, 'Solid large title contrast against its page photograph').toBeGreaterThanOrEqual(
    3
  );
}

export async function verifyBankrollHeader(
  page: Page,
  header: Locator,
  title: string,
  art: string,
  info: TestInfo
) {
  const heading = header.getByRole('heading', { name: title, exact: true });
  const help = header.getByRole('button', { name: 'Help For ' + title, exact: true });
  await expect(heading).toBeVisible({ timeout: 15000 });
  await expect(header).toHaveAttribute('data-header-art', art);
  const problems = await header.evaluate(async (element, art) => {
    await document.fonts.ready;
    const problems: string[] = [];
    const images = Array.from(element.querySelectorAll('img'));
    await Promise.all(images.map((image) => image.decode()));
    if (images.length !== 2 || !images.every((im) => im.naturalWidth >= 150))
      problems.push('Missing artwork');
    const badge = images.find((im) => im.src.endsWith('/' + art + '-seal.webp')),
      scene = images.find((im) => im.src.endsWith('/' + art + '-scene.webp'));
    if (!badge || !scene) return ['Incorrect per-page assets'];
    const label = element.querySelector('h1,h2')!,
      help = Array.from(element.querySelectorAll('button')).find((b) =>
        b.getAttribute('aria-label')?.startsWith('Help For')
      )!;
    const h = element.getBoundingClientRect(),
      i = badge.getBoundingClientRect(),
      q = help.getBoundingClientRect(),
      s = scene.getBoundingClientRect();
    const style = getComputedStyle(label);
    if (
      style.backgroundImage !== 'none' ||
      style.webkitTextFillColor !== 'rgb(243, 247, 252)' ||
      Number(style.fontWeight) < 700
    )
      problems.push('Title is not solid silver bold');
    if (getComputedStyle(element).borderImageSource === 'none') problems.push('Missing steel rim');
    if (
      Math.abs(i.width - i.height) > 1 ||
      i.width < 38 ||
      !getComputedStyle(badge).borderRadius.includes('50%')
    )
      problems.push('Seal size/shape');
    if (s.right > h.right || s.width < h.width * 0.4 || s.left <= i.right)
      problems.push('Scene position');
    if (s.bottom < h.bottom - 8 || s.top > h.top + 8)
      problems.push(
        'Scene does not reach the rim: ' +
          JSON.stringify({
            height: s.height,
            header: h.height,
            computed: getComputedStyle(scene).height,
            max: getComputedStyle(scene).maxHeight,
          })
      );
    if (
      q.width < 44 ||
      q.height < 44 ||
      q.top < h.top ||
      q.top > h.top + 25 ||
      q.right > h.right ||
      q.right < h.right - 25
    )
      problems.push('Help geometry');
    const range = document.createRange();
    range.selectNodeContents(label);
    for (const r of range.getClientRects()) {
      if (r.left < i.right - 1 || r.right > h.right - 1 || r.top < h.top || r.bottom > h.bottom)
        problems.push('Title is clipped');
      if (r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top)
        problems.push('Help covers title');
    }
    return problems;
  }, art);
  expect(problems, title).toEqual([]);
  await inspectTitleContrast(heading);
  await help.focus();
  await page.keyboard.press('Enter');
  const guide = page.getByRole('dialog', { name: title + ' Help', exact: true });
  await expect(guide).toBeVisible();
  await expect(guide.locator('p').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(guide).toBeHidden();
  await expect(help).toBeFocused();
  await help.evaluate((el) => (el as HTMLElement).blur());
  await captureBankrollPanel(page, header, info, 'header-' + art);
}
