const PANEL = `<style>
:host{color-scheme:light}
aside{display:flex;align-items:flex-start;gap:10px;max-width:min(420px,calc(100vw - 24px));max-height:min(50vh,320px);overflow:auto;padding:12px 14px;border:1px solid #b4cdc5;border-radius:12px;background:#fff;color:#152d29;box-shadow:0 6px 28px #10282030;font:14px/1.6 system-ui,-apple-system,sans-serif}
p{margin:0;flex:1;min-width:0;overflow-wrap:anywhere;white-space:pre-wrap}
aside[data-state=error] p{color:#8b2b2b}
button{flex:none;font:inherit;font-size:13px;min-height:30px;padding:3px 10px;border:1px solid #71958a;border-radius:7px;background:#f0f6f3;color:#183b30;cursor:pointer}
button:focus-visible{outline:3px solid #13755d;outline-offset:2px}
</style><aside aria-label="選択部分の翻訳" data-state="busy" aria-busy="true"><p role="status" aria-live="polite"></p><button type="button">閉じる</button></aside>`;

function selectionRect(doc) {
  try {
    const selection = doc.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return null;
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    return rect && (rect.width || rect.height) ? rect : null;
  } catch { return null; }
}

// Show one translation result for the current selection without touching the page text.
export function openSelectionPopup(doc = globalThis.document, onClose = () => {}) {
  if (!doc?.documentElement) throw new Error('翻訳結果を表示できません。');
  const host = doc.createElement('div');
  host.setAttribute('data-plamobrave-ui', '');
  host.style.cssText = 'all:initial;position:fixed;display:block;left:0;top:0;z-index:2147483647;max-width:calc(100vw - 24px)';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = PANEL;
  const panel = shadow.querySelector('aside');
  const status = shadow.querySelector('[role=status]');
  const anchor = selectionRect(doc);
  let closed = false;

  function place() {
    if (closed) return;
    const margin = 12, gap = 8;
    const box = host.getBoundingClientRect();
    const width = doc.documentElement.clientWidth, height = doc.documentElement.clientHeight;
    const maxLeft = Math.max(margin, width - box.width - margin);
    const maxTop = Math.max(margin, height - box.height - margin);
    let left = anchor ? anchor.left : (width - box.width) / 2;
    let top = anchor ? anchor.bottom + gap : margin;
    if (top > maxTop) top = anchor ? anchor.top - box.height - gap : maxTop;
    host.style.left = `${Math.round(Math.min(Math.max(margin, left), maxLeft))}px`;
    host.style.top = `${Math.round(Math.min(Math.max(margin, top), maxTop))}px`;
  }

  function onKey(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    close();
  }

  function onPointer(event) {
    if (!event.composedPath().includes(host)) close();
  }

  function close() {
    if (closed) return;
    closed = true;
    host.remove();
    doc.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('pointerdown', onPointer, true);
    onClose();
  }

  function show(state, message) {
    if (closed) return;
    panel.dataset.state = state;
    if (state === 'busy') panel.setAttribute('aria-busy', 'true');
    else panel.removeAttribute('aria-busy');
    status.textContent = message;
    place();
  }

  shadow.querySelector('button').addEventListener('click', close);
  doc.documentElement.append(host);
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('pointerdown', onPointer, true);
  place();

  return {
    host,
    setMessage: message => show('busy', message),
    setTranslation: text => show('ready', text),
    setError: message => show('error', message),
    close,
  };
}
