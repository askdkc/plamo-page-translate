import { chromium } from 'playwright';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH || chromium.executablePath(),headless:true});
try {
  const page=await browser.newPage();
  await page.setContent(`<body><p id="text">Original <a href="#target">link</a></p><div hidden>hidden</div><pre>code</pre><div contenteditable>draft</div><div translate="no">excluded</div><div style="display:none">invisible</div><div id="shadow"></div><iframe id="frame" srcdoc="<body><p>Frame text</p></body>"></iframe></body>`);
  const pageBundle=await build({entryPoints:['src/page.js'],bundle:true,format:'iife',globalName:'PageTest',write:false});
  await page.addScriptTag({content:pageBundle.outputFiles[0].text});
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
  const selected = await page.evaluate(() => {
    document.body.innerHTML='<p id="target">Before Hello <a href="#link">world</a> after</p><p id="keep">Untouched</p><input value="draft">';
    const target=document.querySelector('#target'), link=target.querySelector('a');
    let clicks=0;link.addEventListener('click',event=>{event.preventDefault();clicks++;});
    const range=document.createRange();range.setStart(target.firstChild,7);range.setEnd(link.firstChild,5);
    const translator=new PageTest.PageText(document), entries=translator.collect(range);
    const sources=entries.map(entry=>entry.text);
    entries[0].apply('こんにちは ');entries[1].apply('世界');
    link.click();
    const translated=target.textContent, sameLink=target.querySelector('a')===link;
    translator.restore();
    const restored=target.textContent;
    // Element boundaries, unselected siblings and excluded nodes.
    range.selectNodeContents(target);
    const whole=translator.collect(range);whole.forEach(entry=>entry.apply('訳'));
    translator.restore();
    range.setStart(target.firstChild,7);range.setEnd(target.firstChild,12);
    translator.collect(range)[0].apply('一');
    range.setStart(target.firstChild,7);range.setEnd(target.firstChild,8);
    translator.collect(range)[0].apply('二');
    translator.restore();
    const repeatedRestore=target.textContent;
    range.selectNodeContents(target);
    const stale=translator.collect(range)[0];target.firstChild.data='Site update';stale.apply('old');
    range.selectNodeContents(document.querySelector('input'));
    return {sources,translated,sameLink,clicks,restored,repeatedRestore,stale:target.firstChild.data,
      excluded:translator.collect(range).length,keep:document.querySelector('#keep').textContent};
  });
  assert.deepEqual(selected,{sources:['Hello ','world'],translated:'Before こんにちは 世界 after',sameLink:true,clicks:1,
    restored:'Before Hello world after',repeatedRestore:'Before Hello world after',stale:'Site update',excluded:0,keep:'Untouched'});
  console.log('PASS: DOM preservation, exclusions, shadow DOM, iframe, stale writes, restore after site edits.');
  console.log('PASS: partial selection, element boundaries, links/listeners, repeated translations and restoration.');
} finally { await browser.close(); }
