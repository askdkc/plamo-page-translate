import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../src/background.js',import.meta.url),'utf8');
function harness() {
  let listener, owner=null, exists=false, loads=0, closes=0, beginResolve;
  const runtime={
    id:'test',getURL:path=>`chrome-extension://test/${path}`,
    getContexts:async()=>exists?[{}]:[],onMessage:{addListener:fn=>{listener=fn;}},
    sendMessage:async message=>{
      if(message.type==='claim') {if(owner && owner!==message.owner)return {ok:false,error:'busy'};owner=message.owner;return {ok:true};}
      if(message.type==='owner')return {owner};
      if(message.type==='begin')return new Promise(resolve=>{beginResolve=resolve;});
      return {ok:true,text:'translated'};
    },
  };
  const chrome={runtime,offscreen:{createDocument:async()=>{exists=true;loads++;},closeDocument:async()=>{exists=false;owner=null;closes++;beginResolve?.({ok:false,error:'closed'});}},tabs:{onRemoved:{addListener(){}},onUpdated:{addListener(){}}}};
  vm.runInNewContext(source,{chrome,console});
  return {send:(type,runId='run-a',tabId=1)=>new Promise(resolve=>listener({destination:'background',type,runId},{id:'test',tab:{id:tabId},documentId:'doc'},resolve)),state:()=>({owner,exists,loads,closes}),ready:()=>beginResolve?.({ok:true})};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
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
