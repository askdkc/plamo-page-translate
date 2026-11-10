const $ = id => document.getElementById(id);
let tabId;
function error(message) { $('status').textContent = message; }
async function send(type, extra = {}) {
  const result = await chrome.tabs.sendMessage(tabId, { destination: 'page', type, ...extra }, {frameId:0});
  if (result?.ok === false) throw new Error(result.error);
  return result;
}
async function refresh() {
  const state = await send('status');
  const busy = ['loading','translating','stopping'].includes(state.phase);
  $('translate').disabled = busy;
  $('language').disabled = busy;
  $('stop').disabled = !busy || state.phase === 'stopping';
  $('restore').disabled = !state.hasTranslations && !busy;
  $('status').textContent = state.message;
  $('progress').hidden = !busy;
  if (state.phase === 'loading') $('progress').removeAttribute('value');
  else { $('progress').max = state.total || 1; $('progress').value = state.done; }
}
async function act(type) {
  try {
    $('translate').disabled = true;
    if (type === 'start') await chrome.storage.local.set({language:$('language').value});
    await send(type, {language:$('language').value});
    await refresh();
  } catch (e) { error(e.message); $('translate').disabled = false; }
}
$('translate').onclick = () => void act('start');
$('stop').onclick = () => void act('stop');
$('restore').onclick = () => void act('restore');
try {
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (!tab?.id || !/^https?:/.test(tab.url || '')) throw new Error('通常のWebページを開いてから実行してください。ブラウザの設定画面やPDFには対応していません。');
  tabId = tab.id;
  const stored = await chrome.storage.local.get('language');
  if (stored.language && [...$('language').options].some(option => option.value === stored.language)) $('language').value = stored.language;
  await chrome.scripting.executeScript({ target:{tabId}, files:['content.js'] });
  await refresh();
  const timer = setInterval(() => refresh().catch(() => { clearInterval(timer); $('translate').disabled=true; error('ページが切り替わりました。この画面を開き直してください。'); }), 500);
} catch (e) { error(`このページでは翻訳を開始できません。${e.message}`); }
