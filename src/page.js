const EXCLUDED = 'script,style,noscript,template,textarea,input,select,option,code,pre,kbd,samp,svg,canvas,math,[contenteditable]:not([contenteditable="false"]),[translate="no"],.notranslate,[data-plamobrave-ui]';

export class PageText {
  constructor(document) { this.document = document; this.originals = new Map(); }

  collect(range = null) {
    if (range?.collapsed) return [];
    const entries = [];
    const visit = root => {
      if (root.nodeType === 1 && root.matches(EXCLUDED)) return;
      const doc = root.ownerDocument || root;
      const walker = doc.createTreeWalker(root, 1 | 4, {
        acceptNode: node => {
          if (node.nodeType === 1) {
            if (node.matches(EXCLUDED) || node.hidden || node.getAttribute('aria-hidden') === 'true') return 2;
            const style = doc.defaultView.getComputedStyle(node);
            if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return 2;
            return 1;
          }
          return /\p{L}/u.test(node.data) ? 1 : 2;
        },
      });
      let node;
      while ((node = walker.nextNode())) {
        if (node.nodeType === 1) {
          if (node.shadowRoot) visit(node.shadowRoot);
          if (node.tagName === 'IFRAME') {
            try { if (node.contentDocument?.body) visit(node.contentDocument.body); } catch { /* Cross-origin frames are outside activeTab access. */ }
          }
          continue;
        }
        const textNode = node, previous = this.originals.get(textNode);
        if (range && !range.intersectsNode(textNode)) continue;
        const observed = textNode.data;
        const start = range?.startContainer === textNode ? range.startOffset : 0;
        const end = range?.endContainer === textNode ? range.endOffset : observed.length;
        if (start >= end) continue;
        const original = previous && observed === previous.translated ? previous.original : observed;
        // Partial selections use current offsets; whole-page translation uses the original.
        const text = range ? observed.slice(start, end) : original;
        if (!/\p{L}/u.test(text)) continue;
        entries.push({ text, apply: translated => {
          if (!textNode.isConnected || textNode.data !== observed) return;
          const replacement = range ? observed.slice(0, start) + translated + observed.slice(end) : translated;
          this.originals.set(textNode, { original, translated: replacement });
          textNode.data = replacement;
        } });
      }
    };
    if (this.document.body) visit(this.document.body);
    return entries;
  }

  restore() {
    for (const [node, value] of this.originals) {
      if (node.isConnected && node.data === value.translated) node.data = value.original;
    }
    this.originals.clear();
  }
}
