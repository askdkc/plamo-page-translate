import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { copyFile, link, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

// Chrome grants activeTab only after a real context-menu click, which automation cannot perform.
// This copy of dist adds a host permission for the test server so the service worker can inject
// the same content script and send the same message that the 選択部分を翻訳 menu item sends.
const extension = resolve('artifacts/selection-extension');
const profile = await mkdtemp(resolve(tmpdir(), 'plamobrave-selection-'));
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Selection acceptance</title></head><body>
<p id="paragraph">The meeting has been moved to next Monday.</p><p id="keep">Keep this text unchanged.</p>
</body></html>`;
const server = createServer((request, response) => { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); });
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
let context;
try {
  await rm(extension, { recursive: true, force: true });
  await mirror(resolve('dist'), extension);
  const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
  await rm(join(extension, 'manifest.json'));
  await writeFile(join(extension, 'manifest.json'), JSON.stringify({ ...manifest, host_permissions: ['http://127.0.0.1/*'] }, null, 2));

  const started = await start(extension, profile, true);
  context = started.context;
  if (!started.worker) {
    await context.close();
    const headed = await start(extension, profile, false);
    context = headed.context;
    if (!headed.worker) throw new Error('Extension service worker did not start.');
    started.worker = headed.worker;
  }
  const worker = started.worker;
  console.log('Extension worker:', worker.url());

  const page = await context.newPage();
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text().slice(0, 500)); });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.bringToFront();

  const menu = await worker.evaluate(() => new Promise(resolveProbe => {
    chrome.contextMenus.update('plamo-translate-selection', { title: '選択部分を翻訳' }, () => {
      resolveProbe(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : { ok: true });
    });
  }));
  assert.equal(menu.ok, true, `context menu registration: ${JSON.stringify(menu)}`);

  await page.evaluate(() => {
    const range = document.createRange(); range.selectNodeContents(document.querySelector('#paragraph'));
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  });
  const answer = await worker.evaluate(async text => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, files: ['content.js'] });
    return chrome.tabs.sendMessage(tab.id, { destination: 'page', type: 'translate-selection', text }, { frameId: 0 });
  }, 'The meeting has been moved to next Monday.');
  assert.equal(answer?.ok, true, `content script answer: ${JSON.stringify(answer)}`);

  const began = Date.now();
  let state;
  while (Date.now() - began < 240000) {
    state = await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return chrome.tabs.sendMessage(tab.id, { destination: 'page', type: 'status' }, { frameId: 0 });
    });
    if (state && ['done', 'error'].includes(state.phase)) break;
    await new Promise(wait => setTimeout(wait, 1000));
  }
  assert.equal(state?.phase, 'done', JSON.stringify(state));
  const translation = await page.locator('#paragraph').innerText();
  assert.match(translation, /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u);
  assert.equal(await page.locator('#keep').innerText(), 'Keep this text unchanged.');
  assert.equal(await page.getByRole('complementary', { name: '選択部分の翻訳' }).count(), 0);
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/selection-inline.png' });
  await page.locator('[data-plamobrave-ui]').locator('#restore').click();
  assert.equal(await page.locator('#paragraph').innerText(), 'The meeting has been moved to next Monday.');
  console.log('TRANSLATION:', translation);
  if (errors.length) console.log('Page console errors:', errors);
  console.log('PASS: context menu registered / selection translated through the bundled model / page text replaced / original restored / unselected text unchanged');
  await writeFile('artifacts/selection-result.json', JSON.stringify({ passed: true, translation, errors }, null, 2));
} finally {
  await context?.close();
  await new Promise(resolveClose => server.close(resolveClose));
  await rm(profile, { recursive: true, force: true });
  await rm(extension, { recursive: true, force: true });
}

async function mirror(source, target) {
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name), to = join(target, entry.name);
    if (entry.isDirectory()) await mirror(from, to);
    else await link(from, to).catch(() => copyFile(from, to));
  }
}

async function start(extensionPath, userDataDir, headless) {
  const options = {
    executablePath: process.env.BROWSER_PATH || chromium.executablePath(),
    headless, viewport: { width: 1100, height: 800 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--no-first-run', '--enable-unsafe-extension-debugging'],
  };
  const context = await chromium.launchPersistentContext(userDataDir, options);
  let worker = await serviceWorker(context, 5000);
  if (!worker) {
    try {
      const cdp = await context.browser().newBrowserCDPSession();
      console.log('Extension load:', await cdp.send('Extensions.loadUnpacked', { path: extensionPath }));
      worker = await serviceWorker(context, 15000);
    } catch (error) { console.log('Extension load failed:', error.message); }
  }
  return { context, worker };
}

async function serviceWorker(context, timeout) {
  if (context.serviceWorkers().length) return context.serviceWorkers()[0];
  try { return await context.waitForEvent('serviceworker', { timeout }); } catch { return null; }
}
