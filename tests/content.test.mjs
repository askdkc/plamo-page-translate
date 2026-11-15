import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { LANGUAGES, translateEntries } from '../src/translation.js';
const source = (await readFile(new URL('../src/content.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness({ selectionText = 'Hello\n\nworld', missing = false, collectError = false } = {}) {
  let listener, begin, translate, applied, visible = false;
  const controls = new Map();
  const shadow = {querySelector(selector) {
    if (!controls.has(selector)) controls.set(selector, {hidden:true, removeAttribute(name){delete this[name];}});
    return controls.get(selector);
  }};
  const document = {
    getSelection:()=>missing ? null : {rangeCount:1,isCollapsed:false,toString:()=>selectionText,getRangeAt:()=>({cloneRange:()=>({})})},
    createElement:()=>({dataset:{},style:{},attachShadow:()=>shadow,remove(){visible=false;}}),
    documentElement:{append(){visible=true;}},
  };
  class PageText {
    originals = new Map();
    collect() {if (collectError) throw new Error('Range unavailable');return [{text:'Hello world',apply:text=>{applied=text;this.originals.set(1,{});}}];}
    restore(){this.originals.clear();}
  }
  const chrome = {storage:{local:{get:async()=>({})}},runtime:{id:'test',onMessage:{addListener:fn=>{listener=fn;}},sendMessage:async message=>{
    if(message.type==='begin') return new Promise(resolve=>{begin=resolve;});
    if(message.type==='translate') return new Promise(resolve=>{translate=resolve;});
    return {ok:true};
  }}};
  vm.runInNewContext(source,{document,PageText,LANGUAGES,translateEntries,chrome,AbortController,crypto:{randomUUID:()=> 'run-1'},window:{addEventListener(){}}});
  return {
    send:(type,text='Hello world')=>new Promise(resolve=>listener({destination:'page',type,text},{id:'test'},resolve)),
    begin:()=>begin?.({ok:true}),translate:()=>translate?.({ok:true,text:'こんにちは世界'}),
    control:selector=>controls.get(selector),visible:()=>visible,applied:()=>applied,
  };
}
test('context-menu whitespace normalization still starts selection translation and shows progress',async()=>{
  const h=harness();
  assert.equal((await h.send('translate-selection')).ok,true);
  assert.equal(h.visible(),true);assert.equal(h.control('.spinner').hidden,false);
  await tick();h.begin();await tick();
  assert.equal(h.control('progress').value,0);
  h.translate();await tick();
  assert.equal(h.applied(),'こんにちは世界');assert.equal(h.control('.spinner').hidden,true);
  assert.equal((await h.send('status')).phase,'done');
});
for (const [name,options] of [['missing selection',{missing:true}],['different selection',{selectionText:'Different text'}],['range collection failure',{collectError:true,selectionText:'Hello world'}]]) {
  test(`${name} displays an error instead of silently rejecting the menu action`,async()=>{
    const h=harness(options);
    assert.equal((await h.send('translate-selection')).ok,false);
    assert.equal(h.visible(),true);
    assert.equal((await h.send('status')).phase,'error');
    assert.equal(h.control('.spinner').hidden,true);
    assert.ok(h.control('[role=status]').textContent.length>0);
  });
}
