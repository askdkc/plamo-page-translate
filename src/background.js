let lifecycle = Promise.resolve();
const engineURL = chrome.runtime.getURL('offscreen.html');
const SELECTION_MENU_ID = 'plamo-translate-selection';

function withLifecycle(action) {
  const result = lifecycle.then(action, action);
  lifecycle = result.catch(() => {});
  return result;
}

async function engineExists() {
  return (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [engineURL] })).length > 0;
}

async function claimEngine(owner) {
  await withLifecycle(async () => {
    if (!await engineExists()) await chrome.offscreen.createDocument({
      url: 'offscreen.html', reasons: ['WORKERS', 'BLOBS'],
      justification: 'Run the bundled GGUF translation model in a local WebAssembly worker.',
    });
    const claim = await chrome.runtime.sendMessage({destination:'engine',type:'claim',owner});
    if (!claim?.ok) throw new Error(claim?.error || '翻訳エンジンを開始できませんでした。');
  });
}

async function closeEngine(owner) {
  return withLifecycle(async () => {
    if (!await engineExists()) return { ok: true };
    const current = await chrome.runtime.sendMessage({ destination: 'engine', type: 'owner' });
    if (current.owner === owner) await chrome.offscreen.closeDocument();
    return { ok: true };
  });
}

// Menus persist across service-worker restarts, so register them when the extension is installed or updated.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: SELECTION_MENU_ID,
      title: '選択部分を翻訳',
      contexts: ['selection'],
      documentUrlPatterns: ['http://*/*', 'https://*/*'],
    });
  });
});

// Inject into the frame that owns the selection so its DOM can be updated.
async function translateSelection(tabId, selectionText, frameId = 0) {
  const text = typeof selectionText === 'string' ? selectionText : '';
  if (!text.trim()) return;
  await chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, files: ['content.js'] });
  const response = await chrome.tabs.sendMessage(tabId, { destination: 'page', type: 'translate-selection', text }, { frameId });
  if (!response?.ok) throw new Error(response?.error || 'ページから応答がありません。ページを再読み込みしてください。');
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== SELECTION_MENU_ID || !tab?.id) return;
  void (async () => {
    await Promise.allSettled([
      chrome.action.setBadgeText({tabId:tab.id,text:''}),
      chrome.action.setTitle({tabId:tab.id,title:'PLaMo ページ翻訳'}),
    ]);
    try {
      await translateSelection(tab.id, info.selectionText, info.frameId);
    } catch (error) {
      console.warn('選択部分を翻訳できませんでした。', error);
      // Injection can fail before any page UI exists (e.g. an inaccessible frame).
      await Promise.allSettled([
        chrome.action.setBadgeText({tabId:tab.id,text:'!'}),
        chrome.action.setBadgeBackgroundColor({tabId:tab.id,color:'#b3261e'}),
        chrome.action.setTitle({tabId:tab.id,title:`翻訳を開始できませんでした: ${error.message}`}),
      ]);
    }
  })();
});

async function dispatch(message, sender) {
  if (!sender.tab || !sender.documentId || !/^[a-zA-Z0-9-]{1,80}$/.test(message.runId || '')) throw new Error('翻訳要求が不正です。');
  const owner = `${sender.tab.id}:${sender.documentId}:${message.runId}`;
  if (message.type === 'release') return closeEngine(owner);
  if (!['begin', 'translate'].includes(message.type)) throw new Error('未対応の操作です。');
  if (message.type === 'begin') await claimEngine(owner);
  const response = await chrome.runtime.sendMessage({ destination: 'engine', type: message.type, owner, text: message.text, language: message.language });
  if (!response) throw new Error('翻訳エンジンとの接続が切れました。もう一度翻訳してください。');
  return response;
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message?.destination !== 'background') return;
  if (message.type === 'heartbeat' && sender.url === engineURL) { respond({ok:true}); return; }
  dispatch(message, sender).then(respond, error => respond({ ok: false, error: error.message }));
  return true;
});

chrome.tabs.onRemoved.addListener(tabId => {
  void withLifecycle(async () => {
    if (!await engineExists()) return;
    const current = await chrome.runtime.sendMessage({ destination: 'engine', type: 'owner' });
    if (current.owner?.startsWith(`${tabId}:`)) await chrome.offscreen.closeDocument();
  }).catch(console.warn);
});

chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status !== 'loading') return;
  void withLifecycle(async () => {
    if (!await engineExists()) return;
    const current = await chrome.runtime.sendMessage({ destination: 'engine', type: 'owner' });
    if (current.owner?.startsWith(`${tabId}:`)) await chrome.offscreen.closeDocument();
  }).catch(console.warn);
});
