import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../src/background.js',import.meta.url),'utf8');
function harness({ failInjection = false } = {}) {
  let listener, installed, clicked, owner=null, exists=false, loads=0, closes=0, beginResolve;
  const menus=[], injections=[], sent=[];
  const runtime={
    id:'test',getURL:path=>`chrome-extension://test/${path}`,
    getContexts:async()=>exists?[{}]:[],onMessage:{addListener:fn=>{listener=fn;}},
    onInstalled:{addListener:fn=>{installed=fn;}},
    sendMessage:async message=>{
      if(message.type==='claim') {if(owner && owner!==message.owner)return {ok:false,error:'busy'};owner=message.owner;return {ok:true};}
      if(message.type==='owner')return {owner};
      if(message.type==='begin')return new Promise(resolve=>{beginResolve=resolve;});
      return {ok:true,text:'translated'};
    },
  };
  const chrome={
    runtime,
    contextMenus:{
      removeAll:callback=>{menus.length=0;callback?.();},
      create:properties=>{menus.push(properties);return properties.id;},
      onClicked:{addListener:fn=>{clicked=fn;}},
    },
    scripting:{executeScript:async options=>{injections.push(options);if(failInjection)throw new Error('このページでは実行できません。');}},
    offscreen:{createDocument:async()=>{exists=true;loads++;},closeDocument:async()=>{exists=false;owner=null;closes++;beginResolve?.({ok:false,error:'closed'});}},
    tabs:{onRemoved:{addListener(){}},onUpdated:{addListener(){}},sendMessage:async(tabId,message,options)=>{sent.push({tabId,message,options});return {ok:true};}},
  };
  vm.runInNewContext(source,{chrome,console:{warn(){},log(){},error(){}}});
  return {
    send:(type,runId='run-a',tabId=1)=>new Promise(resolve=>listener({destination:'background',type,runId},{id:'test',tab:{id:tabId},documentId:'doc'},resolve)),
    state:()=>({owner,exists,loads,closes}),
    ready:()=>beginResolve?.({ok:true}),
    install:()=>installed?.(),
    click:(info,tab)=>clicked?.(info,tab),
    // The service worker runs in its own realm, so snapshot API arguments as plain JSON.
    menus:()=>JSON.parse(JSON.stringify(menus)),
    injections:()=>JSON.parse(JSON.stringify(injections)),
    sent:()=>JSON.parse(JSON.stringify(sent)),
  };
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const settle=async()=>{for(let i=0;i<5;i++)await tick();};
test('stop during model loading releases worker; a new run can start',async()=>{
  const h=harness();const pending=h.send('begin');await tick();
  assert.equal(h.state().loads,1);
  await h.send('release');assert.equal(h.state().closes,1);
  assert.equal((await pending).ok,false);
  const next=h.send('begin','run-b');await tick();h.ready();
  assert.equal((await next).ok,true);await h.send('release','run-b');
  assert.equal(h.state().closes,2);
});
test('other tabs cannot seize or close the active translation',async()=>{
  const h=harness();const pending=h.send('begin');await tick();
  assert.equal((await h.send('begin','run-b',2)).ok,false);
  await h.send('release','run-b',2);assert.equal(h.state().closes,0);
  h.ready();await pending;await h.send('release');assert.equal(h.state().closes,1);
});
test('immediate stop is serialized after worker creation and claim',async()=>{
  const h=harness();const pending=h.send('begin');const stopped=h.send('release');
  await stopped;assert.equal(h.state().exists,false);await pending;
});
test('the 選択部分を翻訳 menu is offered for selected text on web pages',()=>{
  const h=harness();h.install();
  assert.deepEqual(h.menus(),[{
    id:'plamo-translate-selection',
    title:'選択部分を翻訳',
    contexts:['selection'],
    documentUrlPatterns:['http://*/*','https://*/*'],
  }]);
});
test('choosing the menu item injects the page script and sends the selected text',async()=>{
  const h=harness();
  h.click({menuItemId:'plamo-translate-selection',selectionText:'The meeting has been moved.',frameId:3},{id:42});
  await settle();
  assert.deepEqual(h.injections(),[{target:{tabId:42,frameIds:[0]},files:['content.js']}]);
  assert.deepEqual(h.sent(),[{tabId:42,message:{destination:'page',type:'translate-selection',text:'The meeting has been moved.'},options:{frameId:0}}]);
});
test('empty selections, other menu items and tabs without ids do nothing',async()=>{
  const h=harness();
  h.click({menuItemId:'plamo-translate-selection',selectionText:' \n '},{id:1});
  h.click({menuItemId:'other',selectionText:'Hello'},{id:1});
  h.click({menuItemId:'plamo-translate-selection',selectionText:'Hello'},{});
  await settle();
  assert.deepEqual(h.injections(),[]);assert.deepEqual(h.sent(),[]);
});
test('a page that forbids script injection sends no translation request',async()=>{
  const h=harness({failInjection:true});
  h.click({menuItemId:'plamo-translate-selection',selectionText:'Hello'},{id:9});
  await settle();
  assert.equal(h.injections().length,1);assert.deepEqual(h.sent(),[]);
});
