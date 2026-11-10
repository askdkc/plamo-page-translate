import { actionPopup } from './popup-driver.mjs';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Translation acceptance</title></head><body>
<h1 id="heading">Welcome to our website.</h1><p id="paragraph">The meeting has been moved to next Monday.</p>
<a id="link" href="#destination">Read more</a><p id="below" style="margin-top:1200px">Thank you for your help.</p>
<input id="input" value="Do not change my input"><textarea>My private draft</textarea><pre id="code">const hello = 'world';</pre><p translate="no" id="excluded">Do not translate this.</p><p hidden id="hidden">Hidden text</p>
</body></html>`;
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const profile=await mkdtemp(resolve(tmpdir(),'plamobrave-browser-'));
let context;
const logs=[];
try {
  context=await chromium.launchPersistentContext(profile,{executablePath:process.env.BROWSER_PATH || chromium.executablePath(),headless:false,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${resolve('dist')}`,`--load-extension=${resolve('dist')}`,'--no-first-run','--enable-unsafe-extension-debugging'],viewport:{width:1100,height:800}});
  context.on('console',msg=>{ if(msg.type()==='error') logs.push(msg.text().slice(0,1000)); });
  console.log('Browser launched:', await context.browser()?.version());
  await new Promise(r=>setTimeout(r,800));
  if (!context.serviceWorkers().length) { const cdp = await context.browser().newBrowserCDPSession(); console.log('Extension load:',await cdp.send('Extensions.loadUnpacked',{path:resolve('dist')})); }
  const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker',{timeout:10000});
  console.log('Extension worker:',worker.url());
  const page=await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.bringToFront();
  {
    console.log('READY: click the extension action in the test browser.');
    const cdp=await context.browser().newBrowserCDPSession();
    for(let i=0;i<180;i++){const targets=await cdp.send('Target.getTargets');if(targets.targetInfos.some(t=>t.url.endsWith('/popup.html')))break;await new Promise(r=>setTimeout(r,1000));}
  }
  await new Promise(r=>setTimeout(r,1200));
  const popup=await actionPopup(context);
  console.log('Popup:',await popup.locator('body').innerText());
  console.log('Translation started');
  const started=Date.now();
  while(Date.now()-started<180000){
    const status=await popup.locator('#status').innerText();
    console.log(status);
    if(status.includes('完了しました')) break;
    if(status.includes('翻訳できませんでした')) throw new Error(status);
    await new Promise(r=>setTimeout(r,5000));
  }
  assert.match(await popup.locator('#status').innerText(),/完了しました/);
  const result=await page.locator('body').innerText();
  console.log('PAGE RESULT:',result);
  for(const id of ['heading','paragraph','link','below']) assert.match(await page.locator(`#${id}`).innerText(),/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u);
  assert.equal(await page.locator('#link').getAttribute('href'),'#destination');
  assert.equal(await page.locator('#input').inputValue(),'Do not change my input');
  assert.equal(await page.locator('#excluded').innerText(),'Do not translate this.');
  assert.equal(await page.locator('#code').innerText(),"const hello = 'world';");
  await mkdir('artifacts',{recursive:true});
  await page.screenshot({path:'artifacts/page-translated.png'});
  await popup.screenshot({path:'artifacts/popup.png'});
  { console.log('READY: restore original text.');for(let i=0;i<120;i++){if((await page.locator('#heading').innerText())==='Welcome to our website.')break;await new Promise(r=>setTimeout(r,1000));} }
  assert.equal(await page.locator('#heading').innerText(),'Welcome to our website.');
  assert.equal(await page.locator('#paragraph').innerText(),'The meeting has been moved to next Monday.');
  console.log('PASS: bundled model / whole page / below fold / link / exclusions / restore');
  await writeFile('artifacts/browser-result.json',JSON.stringify({passed:true,result,logs},null,2));
} catch(error) { console.error('Browser errors:',logs); if(context) { const diagnostics=await context.newPage();await diagnostics.goto('chrome://extensions/');console.log('Extensions UI:',await diagnostics.locator('body').innerText());await mkdir('artifacts',{recursive:true});await diagnostics.screenshot({path:'artifacts/extensions-error.png'}); } throw error; }
finally { await context?.close(); await new Promise(r=>server.close(r)); await rm(profile,{recursive:true,force:true}); }
