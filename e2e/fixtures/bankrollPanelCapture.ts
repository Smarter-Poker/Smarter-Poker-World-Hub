// Optional component proof at the device's tested width. Leave room for the
// real sticky shell so it cannot cover the top of a long component crop.
import type { Locator, Page, TestInfo } from '@playwright/test';

export async function captureBankrollPanel(page:Page, panel:Locator, info:TestInfo, name:string) {
  if (!process.env.BANKROLL_CONSOLE_PROOF) return;
  const viewport = page.viewportSize();
  if (!viewport) return;
  const bounds = await panel.boundingBox();
  if (!bounds) throw new Error('The requested panel is not visible');
  const height = Math.max(viewport.height, Math.ceil(bounds.height) + 320);
  try {
    if (height !== viewport.height) await page.setViewportSize({...viewport,height});
    await panel.evaluate(node => window.scrollTo({
      top: Math.max(0, window.scrollY + node.getBoundingClientRect().top - 160),
      behavior: 'instant',
    }));
    const path = info.outputPath(name + '.png');
    await panel.screenshot({path, animations:'disabled', style:'nextjs-portal{display:none}'});
    await info.attach(name,{path,contentType:'image/png'});
  } finally {
    if (height !== viewport.height) await page.setViewportSize(viewport);
  }
}
