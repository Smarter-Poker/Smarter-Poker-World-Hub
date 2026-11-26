import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('calculator shortcuts, game selection and Arena card controls', async ({ page }) => {
  await page.goto('/hub/poker-tools');
  const shortcuts = page.getByRole('navigation', { name: 'Calculator Shortcuts' });
  for (const [name, slug] of [['Equity Calculator', 'equity-calculator'], ['ICM Calculator', 'icm-calculator']]) {
    const link = shortcuts.getByRole('link', { name });
    await expect(link).toBeInViewport();
    await expect(link).toHaveAttribute('href', '/hub/training/' + slug);
  }
  const selector = page.getByRole('button', { name: /^Game:/ });
  await selector.click();
  await page.getByRole('menuitemradio', { name: 'Razz' }).click();
  await expect(selector).toHaveAccessibleName('Game: Razz');
  await selector.press('ArrowDown');
  await expect(page.getByRole('menuitemradio', { name: 'Razz' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(selector).toBeFocused();
  await page.getByRole('button', { name: 'Pick A Card For Hero', exact: true }).first().click();
  const picker = page.getByRole('dialog', { name: 'Card Picker' });
  await picker.getByRole('button', { name: 'Hearts', exact: true }).click();
  await expect(picker.getByRole('button', { name: 'Hearts', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const card = picker.getByRole('button', { name: 'Q Of Hearts', exact: true });
  const image = card.locator('img');
  await expect(image).toHaveCSS('image-rendering', 'auto');
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => {
    const box = node.getBoundingClientRect();
    return node.naturalWidth > 0 && Math.abs(box.width / box.height - node.naturalWidth / node.naturalHeight) < 0.01;
  })).toBe(true);
  await card.click();
  await picker.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'Remove Q Of Hearts From Hero' })).toBeVisible();
});
