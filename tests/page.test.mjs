import test from 'node:test';
import assert from 'node:assert/strict';
import { PageText } from '../src/page.js';

// The walker supplies eligible text nodes; browser tests cover DOM traversal/exclusions.
function fixture() {
  const nodes = ['Before Hello ', 'world', ' after', 'Untouched'].map(data => ({nodeType:4,data,isConnected:true}));
  const document = {body:{},createTreeWalker:() => {
    let index=0;return {nextNode:()=>nodes[index++]};
  }};
  document.body.ownerDocument=document;
  const page = new PageText(document);
  const range = {startContainer:nodes[0],startOffset:7,endContainer:nodes[1],endOffset:5,
    intersectsNode:node=>nodes.slice(0,2).includes(node)};
  return {nodes,page,range};
}

test('selection replaces only selected substrings and restores the complete original',()=>{
  const {nodes,page,range}=fixture();
  const entries=page.collect(range);
  assert.deepEqual(entries.map(entry=>entry.text),['Hello ','world']);
  entries[0].apply('こんにちは ');entries[1].apply('世界');
  assert.deepEqual(nodes.map(node=>node.data),['Before こんにちは ','世界',' after','Untouched']);
  page.restore();
  assert.deepEqual(nodes.map(node=>node.data),['Before Hello ','world',' after','Untouched']);
});

test('repeated partial translations retain the first original for restore and whole-page translation',()=>{
  const {nodes,page,range}=fixture();
  range.endContainer=nodes[0];range.endOffset=12;
  page.collect(range)[0].apply('一');
  range.endOffset=8;
  page.collect(range)[0].apply('二');
  assert.equal(nodes[0].data,'Before 二 ');
  assert.equal(page.collect()[0].text,'Before Hello ');
  page.restore();assert.equal(nodes[0].data,'Before Hello ');
});

test('site updates and disconnected nodes win over delayed translations and restoration',()=>{
  const {nodes,page,range}=fixture();
  const entries=page.collect(range);
  nodes[0].data='Site updated';nodes[1].isConnected=false;
  entries.forEach(entry=>entry.apply('古い翻訳'));
  assert.equal(nodes[0].data,'Site updated');assert.equal(nodes[1].data,'world');
  assert.equal(page.originals.size,0);
  nodes[1].isConnected=true;
  page.collect(range)[1].apply('世界');nodes[1].data='New site content';
  page.restore();assert.equal(nodes[1].data,'New site content');
});

test('collapsed and empty boundary selections do not translate adjacent text',()=>{
  const {page,range,nodes}=fixture();
  assert.deepEqual(page.collect({...range,collapsed:true}),[]);
  range.startOffset=nodes[0].data.length;range.endOffset=0;
  assert.deepEqual(page.collect(range),[]);
});
