# WorksDB

案件データベースと楽曲進捗を管理する、Google スプレッドシート連携Webアプリです。

## ファイル構成

- `DBindex.html` — 画面のHTMLとダイアログ。処理やCSSはここへ書かない。
- `css/app.css` — DBindexの見た目を一括管理。
- `css/buttons.css` — 全画面共通のボタン寸法・色・状態。
- `js/dashboard.js` — 1案件の楽曲・締切・スプレッドシート読込・進捗画面。
- `js/registry.js` — 全案件DB、案件切替、マスタースプレッドシート設定。
- `gas/Code.gs` — Google Apps Script。マスターDBと案件別シートのAPI。
- `ScheduleBoard.html` — スケジュール管理アプリ（全案件一括・個別案件ともに本アプリへ一本化）。
- `css/schedule-board.css` / `js/schedule-board.js` — スケジュール管理エディターおよび描画ロジック。
- `favicon.svg` — ブラウザ用アイコン。

`DBindex.html` では `dashboard.js` を先に、`registry.js` を後に読み込みます。案件DBは `window.WorksDBDashboard` の公開機能だけを利用し、案件画面内部の変数へ直接依存させないでください。

## 変更する場所

- 楽曲一覧、締切、案件別シート連携: `js/dashboard.js`
- 全案件DB、案件追加・編集、マスターシート連携: `js/registry.js`
- DBindexの色・余白・レイアウト: `css/app.css`
- ボタンの共通デザイン: `css/buttons.css`
- Google Sheets側の列やAPI: `gas/Code.gs`
- 一括・個別スケジュール管理: `css/schedule-board.css` / `js/schedule-board.js`

同じ機能の別実装を追加すると読込順で挙動が変わるため、上記の正本を直接変更します。

## 案件シートとスケジュールの接続

1. `DBindex.html` の案件カードで「設定」を開きます。
2. 進捗シート、WebアプリURL等を登録して保存します。
3. 同じ設定画面の「この案件のスクリプトコード」から、その案件用の `Code.gs` を表示・コピーできます。
4. 「スケジュールアプリで開く」を押すと、**案件ID** をキーとして `ScheduleBoard.html?project={案件ID}` が開きます。
5. `DBindex.html` 上のスケジュール描画も、`ScheduleBoard.html` が使用する管理データベース（共通シート / 一括キャッシュ）から案件IDを接続キーとして一元的に読み込んで描画されます。

案件名を変更してもペアリングが外れないよう、すべての連携・描画キーには固定の **案件ID (id)** を使用します。

## ローカル確認

このフォルダーで次を実行し、`http://127.0.0.1:8768/DBindex.html` を開きます。

```powershell
python -m http.server 8768 --bind 127.0.0.1
```

Google連携を使わない状態でも、ローカル保存された案件の表示・追加・切替を確認できます。Google連携は画面右上の「マスター設定」からWebアプリURLを登録します。