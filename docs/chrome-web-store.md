# Chrome Web Store submission

## Listing

- Name: PLaMo Page Translate
- Author: dkc
- Price: Free; no paid features or subscriptions.
- Language: Japanese (the extension's interface language).
- Category: Tools / Translation, if available in the dashboard.
- Homepage: https://github.com/askdkc/plamo-page-translate
- Support: https://github.com/askdkc/plamo-page-translate/issues
- Privacy policy: publish `PRIVACY.md` before using https://github.com/askdkc/plamo-page-translate/blob/main/PRIVACY.md
- Package: `release/plamo-page-translate-0.1.0.zip`
- Store icon: `src/icons/icon-128.png`
- Screenshot: a current, actual extension capture at 1280 × 800 is required before submission.

## Detailed description

PLaMo Page Translate は、いま開いているページの文章を端末内で翻訳する拡張機能です。翻訳モデルを同梱しているため、インストール後は翻訳サービスへの接続や API キーの設定なしで使えます。

拡張機能を開いて翻訳先を選び、「ページ全体を翻訳」を押してください。画面の下にある文章も順番に翻訳します。途中で停止したり、「原文に戻す」で元の文章に戻したりできます。ポップアップを閉じても翻訳は続きます。

翻訳先は日本語、英語、中国語、韓国語、フランス語、ドイツ語、スペイン語から選べます。操作画面は日本語です。

ページの文章や翻訳文を開発者や翻訳サービスに送信しません。広告、アクセス解析、アカウント登録、サブスクリプションはありません。翻訳先の設定だけをブラウザー内に保存します。

モデルを同梱しているため、ダウンロードは約 540 MB あります。翻訳には CPU とメモリーを使い、端末の性能や文章量によって時間がかかります。Chrome 137 以降が必要です。翻訳結果には誤りが含まれる場合があります。

画像内の文字、PDF、コード、入力欄、別ドメインの埋め込み枠は対象外です。Chrome の設定画面や Chrome Web Store など、拡張機能がアクセスできないページでは使えません。後から読み込まれた文章は、もう一度翻訳してください。

Built with PLaMo. PLaMo 3 Translate 0.8B の GGUF Q4_K_M モデルを使用しています。拡張機能のコードは MIT ライセンス、モデルは PLaMo Community License に従います。業務利用などにはモデルの登録・契約条件があります。詳しくは拡張機能内の「モデルと利用条件」をご確認ください。

## Privacy practices

Single purpose: Translate the text of a user-selected web page locally with a bundled model, with controls to stop translation and restore the original.

Permission justifications:

- `activeTab`: Grants temporary access to the selected page when the user invokes the extension. No all-sites host permission is requested.
- `scripting`: Injects the page translator to collect eligible text, apply translations, display progress, and restore originals.
- `offscreen`: Hosts the bundled WebAssembly translation engine and workers so translation can continue after the popup closes.
- `storage`: Saves only the selected target language in `chrome.storage.local`.

Remote code: No. JavaScript, WebAssembly, workers, and model weights are bundled in the uploaded ZIP. The runtime does not download executable code or models.

Data handling: The extension locally processes website content chosen by the user. It does not transmit this content, translations, or browsing history to the developer or a service. Page scripts can observe translated text inserted into the page. No analytics or advertising. Review the dashboard's exact data-category wording against `PRIVACY.md`; do not characterize local page access as no data access.

## Reviewer instructions

No account, API key, subscription, or separate model download is needed. Install the extension and open an ordinary HTTPS page containing English prose. Open the extension action, choose 日本語, and click ページ全体を翻訳. Wait for model loading and translation; processing is local and may take time. Text should change while links and form inputs remain intact. Close the popup to verify translation continues. Click 原文に戻す in the page banner or popup to restore the original text. 停止 cancels further translation and leaves already translated text visible.

## Remaining publication prerequisites

- Access to the registered Chrome Web Store developer account. New accounts require Google's one-time registration fee, even for free extensions.
- Confirm PFN registration or applicable permission for distributing the bundled model. Its license defines providing products as commercial-purpose use; a zero price does not remove that condition.
- Publish the privacy policy and capture the required current screenshot.
- Upload the ZIP, complete the listing and privacy declarations, choose public/free distribution, and submit for Google review. Submission is not approval or live publication.
