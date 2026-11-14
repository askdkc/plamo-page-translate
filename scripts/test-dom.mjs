import { chromium } from 'playwright';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH || chromium.executablePath(),headless:true});
try {
  const page=await browser.newPage();
  await page.setContent(`<body><p id="text">Original <a href="#target">link</a></p><div hidden>hidden</div><pre>code</pre><div contenteditable>draft</div><div translate="no">excluded</div><div style="display:none">invisible</div><div id="shadow"></div><iframe id="frame" srcdoc="<body><p>Frame text</p></body>"></iframe></body>`);
  const pageBundle=await build({entryPoints:['src/page.js'],bundle:true,format:'iife',globalName:'PageTest',write:false});
  const selectionBundle=await build({entryPoints:['src/selection.js'],bundle:true,format:'iife',globalName:'SelectionTest',write:false});
  await page.addScriptTag({content:pageBundle.outputFiles[0].text});
  await page.addScriptTag({content:selectionBundle.outputFiles[0].text});
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
  const panel=await page.evaluate(()=>{
    const paragraph=document.createElement('p');
    paragraph.textContent='The meeting has been moved to next Monday.';
    document.body.append(paragraph);
    const range=document.createRange();range.selectNodeContents(paragraph);
    const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
    const closed=[];
    const view=SelectionTest.openSelectionPopup(document,()=>closed.push(1));
    const host=document.querySelector('[data-plamobrave-ui]');
    const aside=host.shadowRoot.querySelector('aside');
    const status=host.shadowRoot.querySelector('[role=status]');
    const excluded=host.hasAttribute('data-plamobrave-ui');
    const label=aside.getAttribute('aria-label');
    view.setMessage('翻訳しています…');
    const loading={text:status.textContent,busy:aside.getAttribute('aria-busy'),state:aside.dataset.state};
    const anchor=range.getBoundingClientRect();
    view.setTranslation('会議は来週の月曜日に変更されました。');
    const ready={text:status.textContent,busy:aside.getAttribute('aria-busy'),state:aside.dataset.state};
    const box=host.getBoundingClientRect();
    view.setError('翻訳できませんでした: テスト');
    const failed={text:status.textContent,state:aside.dataset.state};
    host.shadowRoot.querySelector('button').click();
    return {excluded,label,loading,ready,failed,closed:closed.length,removed:!document.querySelector('[data-plamobrave-ui]'),
      anchor:{top:anchor.top,bottom:anchor.bottom},box:{top:box.top,left:box.left,right:box.right,bottom:box.bottom},
      viewport:{width:document.documentElement.clientWidth,height:document.documentElement.clientHeight}};
  });
  assert.equal(panel.excluded,true);
  assert.equal(panel.label,'選択部分の翻訳');
  assert.deepEqual(panel.loading,{text:'翻訳しています…',busy:'true',state:'busy'});
  assert.deepEqual(panel.ready,{text:'会議は来週の月曜日に変更されました。',busy:null,state:'ready'});
  assert.deepEqual(panel.failed,{text:'翻訳できませんでした: テスト',state:'error'});
  assert.equal(panel.closed,1);assert.equal(panel.removed,true);
  assert.ok(Math.abs(panel.box.top-(panel.anchor.bottom+8))<=2,`panel should open below the selection: ${JSON.stringify(panel)}`);
  assert.ok(panel.box.left>=11&&panel.box.top>=11,`panel stays inside the viewport: ${JSON.stringify(panel)}`);
  assert.ok(panel.box.right<=panel.viewport.width-11&&panel.box.bottom<=panel.viewport.height-11,`panel stays inside the viewport: ${JSON.stringify(panel)}`);
  const dismissal=await page.evaluate(()=>{
    const opened=SelectionTest.openSelectionPopup(document,()=>{});
    opened.setMessage('翻訳しています…');
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    const afterEscape=!document.querySelector('[data-plamobrave-ui]');
    SelectionTest.openSelectionPopup(document,()=>{});
    document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,composed:true}));
    const afterOutside=!document.querySelector('[data-plamobrave-ui]');
    const view=SelectionTest.openSelectionPopup(document,()=>{});
    document.querySelector('[data-plamobrave-ui]').shadowRoot.querySelector('aside').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,composed:true}));
    const keptOpen=!!document.querySelector('[data-plamobrave-ui]');
    view.close();
    return {afterEscape,afterOutside,keptOpen};
  });
  assert.deepEqual(dismissal,{afterEscape:true,afterOutside:true,keptOpen:true});
  console.log('PASS: DOM preservation, exclusions, shadow DOM, iframe, stale writes, restore after site edits.');
  console.log('PASS: selection popup states, anchoring, viewport clamping, close button, Escape and outside click.');
} finally { await browser.close(); }
