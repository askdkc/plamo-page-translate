import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

// Resize the source artwork into the extension's committed PNG assets.
// This is an authoring tool; installation and builds do not require a browser.
const source = (await readFile('src/icons/icon-source.png')).toString('base64');
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_PATH || chromium.executablePath(),
  headless: true,
});
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const size of [16, 32, 48, 128]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}img{display:block;width:100vw;height:100vh}</style><img src="data:image/png;base64,${source}" alt="">`);
    await page.locator('img').evaluate(image => image.decode());
    await page.screenshot({ path: `src/icons/icon-${size}.png`, omitBackground: true });
  }
} finally {
  await browser.close();
}
