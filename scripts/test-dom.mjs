import { chromium } from 'playwright';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH || chromium.executablePath(),headless:true});
try {
  const page=await browser.newPage();
  await page.setContent(`<body><p id="text">Original <a href="#target">link</a></p><div hidden>hidden</div><pre>code</pre><div contenteditable>draft</div><div translate="no">excluded</div><div style="display:none">invisible</div><div id="shadow"></div><iframe id="frame" srcdoc="<body><p>Frame text</p></body>"></iframe></body>`);
  const bundle=await build({entryPoints:['src/page.js'],bundle:true,format:'iife',globalName:'PageTest',write:false});
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const result=await page.evaluate(async()=>{
    const shadow=document.querySelector('#shadow').attachShadow({mode:'open'});shadow.innerHTML='<span>Shadow text</span>';
    const frame=document.querySelector('#frame');if(frame.contentDocument.readyState!=='complete')await new Promise(r=>frame.onload=r);
    const page=new PageTest.PageText(document), entries=page.collect();
    const sources=entries.map(e=>e.text);
    for(const entry of entries)entry.apply('訳:'+entry.text);
    const href=document.querySelector('a').getAttribute('href');
    // Site changes during translation/restoration must win over stale snapshots.
    document.querySelector('#text').firstChild.data='Site changed this';
    page.restore();
    const restored=document.querySelector('a').textContent;
    const text=document.querySelector('#text').firstChild.data;
    const stale=page.collect()[0];document.querySelector('#text').firstChild.data='Newer update';stale.apply('stale translation');
    return {sources,href,restored,text,newest:document.querySelector('#text').firstChild.data,shadow:shadow.textContent,frame:frame.contentDocument.body.textContent};
  });
  assert.deepEqual(result.sources,['Original ','link','Shadow text','Frame text']);
  assert.equal(result.href,'#target');assert.equal(result.restored,'link');
  assert.equal(result.text,'Site changed this');assert.equal(result.newest,'Newer update');
  assert.equal(result.shadow,'Shadow text');assert.equal(result.frame,'Frame text');
  console.log('PASS: DOM preservation, exclusions, shadow DOM, iframe, stale writes, restore after site edits.');
} finally { await browser.close(); }
