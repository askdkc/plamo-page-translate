import { PageText } from './page.js';
import { LANGUAGES, translateEntries } from './translation.js';

if (!globalThis.__plamoPageTranslate) {
  globalThis.__plamoPageTranslate = true;
  const page = new PageText(document);
  let operation = null, banner = null;
  let status = { phase: 'idle', done: 0, total: 0, message: 'このページを端末内で翻訳できます。', hasTranslations: false };

  function setStatus(values) {
    status = { ...status, ...values, hasTranslations: page.originals.size > 0 };
    if (!banner) {
      const host = document.createElement('div');
      host.dataset.plamobraveUi = '';
      host.style.cssText = 'all:initial;position:fixed;bottom:16px;right:16px;z-index:2147483647;max-width:calc(100vw - 32px)';
      const shadow = host.attachShadow({mode:'open'});
      shadow.innerHTML = `<style>:host{color-scheme:light}aside{font:14px/1.5 system-ui;color:#152d29;background:#fff;border:1px solid #b4cdc5;border-radius:12px;padding:14px 16px;box-shadow:0 6px 28px #10282030;max-width:360px}.activity{display:flex;align-items:center;gap:10px;margin-bottom:10px}p{margin:0;overflow-wrap:anywhere}.spinner{flex:none;width:18px;height:18px;border:3px solid #c9ded6;border-top-color:#13755d;border-radius:50%;animation:plamo-spin .8s linear infinite}.spinner[hidden],progress[hidden]{display:none}progress{display:block;width:100%;height:6px;margin:0 0 12px;accent-color:#13755d}@keyframes plamo-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.spinner{animation:none}}button{font:inherit;border:1px solid #71958a;border-radius:7px;padding:6px 12px;background:#f0f6f3;color:#183b30;cursor:pointer;margin-right:6px}button:focus-visible{outline:3px solid #13755d;outline-offset:2px}button:disabled{opacity:.5;cursor:default}small{display:block;color:#52685f;margin-bottom:8px}</style><aside aria-label="PLaMo ページ翻訳"><small>Built with PLaMo · 端末内翻訳</small><div class="activity"><span class="spinner" aria-hidden="true" hidden></span><p role="status" aria-live="polite"></p></div><progress aria-label="翻訳の進行状況" hidden></progress><button id="stop">停止</button><button id="restore">原文に戻す</button><button id="hide" aria-label="翻訳の状態表示を閉じる">閉じる</button></aside>`;
      shadow.querySelector('#stop').onclick = () => void stop(false);
      shadow.querySelector('#restore').onclick = () => void stop(true);
      shadow.querySelector('#hide').onclick = () => { host.remove(); banner = null; };
      document.documentElement.append(host);
      banner = shadow;
    }
    const busy = ['loading', 'translating', 'stopping'].includes(status.phase);
    banner.querySelector('.spinner').hidden = !busy;
    const progress = banner.querySelector('progress');
    progress.hidden = !busy;
    progress.max = status.total || 1;
    if (status.phase === 'translating') progress.value = status.done;
    else progress.removeAttribute('value');
    banner.querySelector('[role=status]').textContent = status.message;
    banner.querySelector('#stop').disabled = !operation || status.phase === 'stopping';
    banner.querySelector('#restore').disabled = !status.hasTranslations && !operation;
  }

  async function request(type, runId, extra = {}) {
    const result = await chrome.runtime.sendMessage({ destination: 'background', type, runId, ...extra });
    if (!result?.ok) throw new Error(result?.error || '翻訳エンジンとの接続が切れました。');
    return result;
  }

  async function stop(restore) {
    const op = operation;
    if (op) {
      op.controller.abort();
      setStatus({ phase: 'stopping', message: '翻訳を停止しています…' });
      try { await request('release', op.id); }
      catch (error) { setStatus({ phase: 'error', message: `停止処理: ${error.message}` }); return; }
      if (operation === op) operation = null;
    }
    if (restore) page.restore();
    setStatus({ phase: restore ? 'idle' : 'cancelled', message: restore ? '原文に戻しました。' : '翻訳を停止しました。翻訳済みの部分はそのまま残っています。' });
  }

  async function preferredLanguage() {
    try {
      const stored = await chrome.storage.local.get('language');
      if (Object.hasOwn(LANGUAGES, stored.language)) return stored.language;
    } catch { /* The saved preference is optional; fall back to Japanese. */ }
    return 'ja';
  }

  async function start(language, entries = page.collect(), label = 'ページ') {
    const op = { id: crypto.randomUUID(), controller: new AbortController() };
    operation = op;
    setStatus({ phase: 'loading', done: 0, total: entries.length, message: `同梱モデルを読み込んでいます…（${entries.length}か所）` });
    try {
      if (!entries.length) { setStatus({ phase: 'done', message: '翻訳できる文章が見つかりませんでした。' }); return; }
      language ??= await preferredLanguage();
      op.controller.signal.throwIfAborted();
      await request('begin', op.id);
      op.controller.signal.throwIfAborted();
      setStatus({ phase: 'translating', message: `${label}を翻訳しています… 0 / ${entries.length}` });
      await translateEntries(entries, async text => (await request('translate', op.id, { text, language })).text, {
        signal: op.controller.signal,
        onProgress: (done, total) => setStatus({ phase: 'translating', done, total, message: `${label}を翻訳しています… ${done} / ${total}` }),
      });
      setStatus({ phase: 'done', message: `${entries.length}か所の翻訳が完了しました。` });
    } catch (error) {
      if (!op.controller.signal.aborted) setStatus({ phase: 'error', message: `翻訳できませんでした: ${error.message} 翻訳済みの部分は保持しています。` });
    } finally {
      try { await request('release', op.id); } catch (error) {
        if (!op.controller.signal.aborted) setStatus({phase:'error',message:`終了処理に失敗しました: ${error.message}`});
      }
      if (operation === op) { operation = null; if (banner) setStatus({}); }
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || message?.destination !== 'page') return;
    if (message.type === 'status') { respond(status); return; }
    if (message.type === 'translate-selection') {
      const text = typeof message.text === 'string' ? message.text : '';
      if (!text.trim()) { respond({ok:false,error:'選択された文章がありません。'}); return; }
      if (operation) { respond({ok:false,error:'このページを翻訳中です。'}); return; }
      const selected = document.getSelection();
      if (!selected?.rangeCount || selected.isCollapsed || selected.toString().trim() !== text.trim()) {
        respond({ok:false,error:'選択範囲を取得できません。ページの文章を選択し直してください。'}); return;
      }
      const entries = page.collect(selected.getRangeAt(0).cloneRange());
      if (!entries.length) { respond({ok:false,error:'選択範囲に翻訳できる文章がありません。'}); return; }
      void start(undefined, entries, '選択部分');
      respond({ok:true}); return;
    }
    if (message.type === 'start') {
      if (operation) { respond({ok:false,error:'このページを翻訳中です。'}); return; }
      if (!Object.hasOwn(LANGUAGES, message.language)) { respond({ok:false,error:'言語が不正です。'}); return; }
      void start(message.language);
      respond({ok:true}); return;
    }
    if (message.type === 'stop' || message.type === 'restore') {
      stop(message.type === 'restore').then(() => respond({ok:true}), error => respond({ok:false,error:error.message}));
      return true;
    }
  });
  // The background also closes the worker on tab navigation/removal.
  window.addEventListener('pagehide', () => { operation?.controller.abort(); }, {once:true});
}
