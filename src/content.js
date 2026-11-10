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
      shadow.innerHTML = `<style>:host{color-scheme:light}aside{font:14px/1.5 system-ui;color:#152d29;background:#fff;border:1px solid #b4cdc5;border-radius:12px;padding:14px 16px;box-shadow:0 6px 28px #10282030;max-width:360px}p{margin:0 0 10px;overflow-wrap:anywhere}button{font:inherit;border:1px solid #71958a;border-radius:7px;padding:6px 12px;background:#f0f6f3;color:#183b30;cursor:pointer;margin-right:6px}button:focus-visible{outline:3px solid #13755d;outline-offset:2px}button:disabled{opacity:.5;cursor:default}small{display:block;color:#52685f;margin-bottom:8px}</style><aside aria-label="PLaMo ページ翻訳"><small>Built with PLaMo · 端末内翻訳</small><p role="status" aria-live="polite"></p><button id="stop">停止</button><button id="restore">原文に戻す</button><button id="hide" aria-label="翻訳の状態表示を閉じる">閉じる</button></aside>`;
      shadow.querySelector('#stop').onclick = () => void stop(false);
      shadow.querySelector('#restore').onclick = () => void stop(true);
      shadow.querySelector('#hide').onclick = () => { host.remove(); banner = null; };
      document.documentElement.append(host);
      banner = shadow;
    }
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

  async function start(language) {
    const op = { id: crypto.randomUUID(), controller: new AbortController() };
    operation = op;
    const entries = page.collect();
    setStatus({ phase: 'loading', done: 0, total: entries.length, message: `同梱モデルを読み込んでいます…（${entries.length}か所）` });
    try {
      if (!entries.length) { setStatus({ phase: 'done', message: '翻訳できる文章が見つかりませんでした。' }); return; }
      await request('begin', op.id);
      op.controller.signal.throwIfAborted();
      setStatus({ phase: 'translating', message: `ページを翻訳しています… 0 / ${entries.length}` });
      await translateEntries(entries, async text => (await request('translate', op.id, { text, language })).text, {
        signal: op.controller.signal,
        onProgress: (done, total) => setStatus({ phase: 'translating', done, total, message: `ページを翻訳しています… ${done} / ${total}` }),
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
