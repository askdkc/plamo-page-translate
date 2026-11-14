# Implementation and verification

Scope: bundled PLaMo GGUF, whole-page text translation initiated by the extension action, and translation of the selected text from the page context menu; cancellation and reversible text replacement. No server or runtime network downloads. No commit or publication.

## Contracts

- Page collection/replacement → preserve DOM, links, edits, excluded content and original text → code.boundary.v1, code.effects.v1 → browser DOM assertions.
- Translation → bounded Unicode chunks, validated PFML3, cancellation between effects, deterministic reuse → code.boundary.v1, code.effects.v1 → Node tests and real model execution.
- Runtime → one owner per offscreen worker, no cross-tab cancellation, unload on end/navigation/removal → code.effects.v1 → packaged extension browser acceptance.
- Controls → loading/progress/success/error/cancel/restore and keyboard-accessible controls → ui.async.v1 → action popup and page banner acceptance.
- Selection → right-click 「選択部分を翻訳」 on selected text, translation shown beside the selection, close/replace the previous result, page text unchanged → code.boundary.v1, ui.async.v1 → background unit tests, selection popup DOM test, packaged extension browser acceptance.

The initial empty translation functions failed all five behavioral tests (splitting, PFML3, whole-page iteration, cancellation, partial failure); the implementation passes them. This was a new repository without executable app behavior or CI configuration.

## Delivery

`npm ci` → `npm run model:download` (pinned revision + SHA-256) → `npm run build` (checks full model hash, bundles all JS/WASM/model/licenses) → load `dist` as an unpacked MV3 extension → action popup → content script → background broker → offscreen WASM worker → guarded text-node writes.

The selection menu is registered at install time for `http`/`https` documents. Choosing it injects the page translator into the top frame of the current tab and sends only the selected text; the content script reuses the engine broker and shows the translation in a shadow-DOM popup beside the selection. Page text is not modified, and the popup closes on its button, Escape, an outside click, or a new selection request. The first request while a whole-page translation runs reports the busy engine instead of replacing it.

A new translation takes a snapshot of rendered text, including below-fold text, open shadow roots and accessible same-origin frames. New content requires another click. Inputs, code, hidden text, translate=no, images/PDF and cross-origin frames are excluded. Inline text fragments are translated separately to preserve page markup; linguistic context can be weaker than translating entire HTML paragraphs. Model is loaded lazily and unloaded when the operation ends, is cancelled, or the tab navigates/closes. CPU execution is the compatibility baseline.

## Observed results

- `npm test`: 12 passing behavioral tests, including cancellation during model loading, immediate stop, retry, cross-tab ownership, the selection menu definition and its click → inject → message wiring.
- `npm run test:dom`: passed in Chrome for Testing 156.0.8078.4 on macOS. Verified excluded inputs/code/hidden/editable text; shadow roots and same-origin iframe collection; links; stale-write protection; restoration after site edits; and the selection popup's loading/result/error states, anchoring, viewport clamping, close button, Escape and outside click.
- `npm run test:selection`: passed in headless Chrome for Testing 156.0.8078.4 on macOS against the packaged `dist`. The registered `plamo-translate-selection` item was found through the real `chrome.contextMenus` API, the selected text was translated through the bundled GGUF model (“The meeting has been moved to next Monday.” → “会議は来週の月曜日に変更されました。”), the popup stayed inside the viewport and closed, and the page text stayed unchanged. The script adds a host permission for its local test server because only a real context-menu click grants activeTab; the click handler itself is covered by `npm test`. Native menu rendering and an actual right-click remain a manual check.
- Packaged extension loaded under its normal MV3 CSP (no blob worker allowance). The action was opened through the actual browser extension menu, granting only activeTab. Its “ページ全体を翻訳” button ran the bundled GGUF model on CPU.
- Real output: “The meeting has been moved to next Monday.” → “会議は来週の月曜日に変更されました。” The heading, link text and below-fold paragraph also translated; href, input, code and translate=no stayed intact. “原文に戻す” restored the original heading and paragraph. Browser error log was empty. Screenshots/results are in ignored `artifacts/`.
- wllama's default blob workers violate MV3 CSP. `scripts/vendor-static.mjs` extracts the pinned package's exact worker/emscripten sources into extension files and narrowly replaces worker creation; it rejects an unexpected vendor source layout. No remote worker or model fetch occurs at runtime.
- CI runs the same unit tests, DOM tests, hash-verified model download and build. No remote is configured and remote CI has not been run. Interactive real-model acceptance remains a local, explicit `test:browser` workflow.

Actual model/packaged behavior was tested on macOS with Chrome for Testing 145 (whole page, interactive) and 156.0.8078.4 (whole page regression and selection, automated). Other OSes, Brave runtime, Web Store publication/review, performance on large production pages and non-Japanese translation quality have not been verified. CPU is used; GPU acceleration is not claimed.
