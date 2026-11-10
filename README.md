# PLaMo Page Translate

Translate entire web pages locally in Chrome with a bundled PLaMo GGUF model. No translation server required. **Built with PLaMo.**

## Install

Requires Chrome 137+ and Node.js 22+ to build. The model download is about 573 MB.

```sh
npm ci
npm run model:download
npm run build
```

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select the generated `dist` folder.

## Use

Open a web page, click the extension icon, choose a language, and click **ページ全体を翻訳** (Translate entire page). Translation continues when the popup closes. Use **停止** to stop or **原文に戻す** to restore the original text.

Images, PDFs, code, and input fields are excluded. Click Translate again for newly loaded content.

[MIT License](LICENSE) · Author: dkc. The bundled model retains its separate [PLaMo Community License](models/LICENSE.en).
