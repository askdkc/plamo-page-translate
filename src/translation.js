export const LANGUAGES = { ja: '日本語', en: 'English', zh: '中文', ko: '한국어', fr: 'Français', de: 'Deutsch', es: 'Español' };
export const MAX_CHARS = 400;

// Preserve every code point, including separators, when dividing long page text.
export function splitText(text, limit = MAX_CHARS) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('分割サイズが不正です。');
  const chars = [...text], parts = [];
  for (let start = 0; start < chars.length;) {
    let end = Math.min(start + limit, chars.length);
    if (end < chars.length) {
      for (let i = end; i > start + limit / 2; i--) {
        if (/[\s。！？.!?]/u.test(chars[i - 1])) { end = i; break; }
      }
    }
    parts.push(chars.slice(start, end).join(''));
    start = end;
  }
  return parts;
}

export function makePrompt(text, language) {
  if (!Object.hasOwn(LANGUAGES, language)) throw new Error('翻訳先の言語が不正です。');
  if (typeof text !== 'string' || !text.trim() || [...text].length > MAX_CHARS) throw new Error('翻訳する文章の長さが不正です。');
  // Source text must not introduce PFML3 control tokens.
  const safe = text.replaceAll('<|plamo:', '＜|plamo:');
  return `<|plamo:tag|>dataset<|plamo:msg|>translation<|plamo:tag|>input<|plamo:msg|>${safe}<|plamo:tag|>output<|plamo:key|>lang<|plamo:val|>${language}<|plamo:msg|>`;
}

export async function translateEntries(entries, translate, { signal, onProgress = () => {} } = {}) {
  const cache = new Map();
  let completed = 0;
  for (const entry of entries) {
    signal?.throwIfAborted();
    let result = '';
    for (const part of splitText(entry.text)) {
      signal?.throwIfAborted();
      const source = part.trim();
      if (!source) { result += part; continue; }
      let translated = cache.get(source);
      if (translated === undefined) {
        translated = await translate(source);
        signal?.throwIfAborted();
        if (typeof translated !== 'string' || !translated.trim()) throw new Error('翻訳結果が空でした。再試行してください。');
        translated = translated.trim();
        // The cache lasts only for this page operation and is bounded.
        if (cache.size < 2000) cache.set(source, translated);
      }
      result += part.match(/^\s*/u)[0] + translated + part.match(/\s*$/u)[0];
    }
    signal?.throwIfAborted();
    entry.apply(result);
    onProgress(++completed, entries.length);
  }
  return completed;
}
