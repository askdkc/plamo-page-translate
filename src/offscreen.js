import { Wllama } from '@wllama/wllama';
import { makePrompt } from './translation.js';
import model from '../models/model.json';

let owner = null, loading = null, translating = false;
const engine = new Wllama({ default: chrome.runtime.getURL('vendor/wllama.wasm') }, { suppressNativeLog: true });

async function load() {
  const response = await fetch(chrome.runtime.getURL(`models/${model.file}`));
  if (!response.ok) throw new Error('同梱モデルが見つかりません。モデル付きのdistフォルダーを読み込んでください。');
  const blob = await response.blob();
  if (blob.size !== model.bytes) throw new Error('同梱モデルが破損しています。再ビルドしてください。');
  await engine.loadModel([blob], {
    n_ctx: 2048, n_batch: 256, n_ubatch: 128,
    n_threads: Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)),
    n_gpu_layers: 0, // CPU baseline works independently of GPU/driver availability.
  });
}

async function handle(message) {
  if (message.type === 'owner') return { ok: true, owner };
  if (message.type === 'claim') {
    if (owner && owner !== message.owner) throw new Error('別のページを翻訳中です。そのページの翻訳を停止してからお試しください。');
    owner = message.owner;
    return {ok:true};
  }
  if (message.type === 'begin' && owner === message.owner) {
    loading ??= load();
    await loading;
    return { ok: true };
  }
  if (message.type !== 'translate' || owner !== message.owner) throw new Error('翻訳が終了しています。もう一度開始してください。');
  if (translating) throw new Error('文章を翻訳中です。');
  const prompt = makePrompt(message.text, message.language);
  translating = true;
  try {
    await loading;
    const result = await engine.createCompletion({ prompt, temperature: 0, max_tokens: 1024, stop: ['<|plamo:tag|>', '<|plamo:bos|>'] });
    if (result.choices[0]?.finish_reason === 'length') throw new Error('翻訳が長さの上限に達しました。この文章は原文のままです。');
    const text = result.choices[0]?.text?.trim();
    if (!text) throw new Error('翻訳結果を取得できませんでした。');
    return { ok: true, text };
  } finally { translating = false; }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.tab || message?.destination !== 'engine') return;
  handle(message).then(respond, error => respond({ ok: false, error: error.message }));
  return true;
});
// Keep the MV3 broker alive while a model request is in flight. No external traffic.
setInterval(() => { if (owner) chrome.runtime.sendMessage({ destination: 'background', type: 'heartbeat' }).catch(() => {}); }, 10000);
