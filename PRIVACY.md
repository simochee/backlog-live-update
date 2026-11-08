# Privacy Policy

_Last updated: November 8, 2026_

[日本語](#プライバシーポリシー)

Backlog Live Update ("the extension") keeps open Backlog issue and pull request
pages up to date without reloading. This policy explains what data the
extension handles. The extension is unofficial and is not an official Nulab
product.

## Data the extension handles

- **Settings**: the Backlog spaces you add (space key, API key, and whether
  updates are on), and the update interval. They are stored only in your
  browser's extension storage (`storage.local`).
- **Suggested space**: when you click the toolbar icon on a Backlog page, the
  space key and address of that page are kept in session storage
  (`storage.session`) so the options page can suggest adding it. It is cleared
  when the browser closes.
- **Issue and pull request data**: the issue key or pull request number of the
  page you have open, and its fields, comments, stars, and notification
  read status. They are fetched from your Backlog space only to update the page
  you are viewing, and are not stored by the extension.

## Where data is sent

The extension sends requests only to the Backlog host of the tab you are
viewing (`*.backlog.com`, `*.backlog.jp`, or `*.backlogtool.com`), and only for
spaces you added. Each API key is included only in requests to its own space.

The extension has no servers of its own. It does not use analytics or tracking,
does not sell or share your data with third parties, and does not load remote
code.

## Removing your data

Remove a space in the extension options, or uninstall the extension, to remove
the stored settings from your browser. To revoke the API key itself, delete it
from Personal Settings → API in Backlog.

## Contact

Please open an issue at
<https://github.com/simochee/live-for-backlog/issues>.

---

# プライバシーポリシー

_最終更新日: 2026 年 11 月 8 日_

Backlog Live Update（以下「本拡張機能」）は、開いている Backlog の課題ページとプルリクエスト
ページをリロードなしで最新の状態に保つ拡張機能です。本ポリシーでは、本拡張機能が扱うデータに
ついて説明します。本拡張機能は非公式のもので、ヌーラボの公式製品ではありません。

## 扱うデータ

- **設定**: 追加した Backlog スペース（スペースキー、API キー、更新のオン・オフ）と更新間隔。
  ブラウザの拡張機能用ストレージ（`storage.local`）にのみ保存します。
- **スペースの候補**: Backlog のページでツールバーのアイコンをクリックすると、そのページの
  スペースキーとアドレスをセッションストレージ（`storage.session`）に保持し、オプション画面で
  追加の候補として表示します。ブラウザを閉じると消えます。
- **課題とプルリクエストのデータ**: 開いている課題のキーやプルリクエストの番号と、その項目・
  コメント・スター・お知らせの既読状況。表示中のページを更新するためだけにあなたの
  Backlog スペースから取得し、本拡張機能が保存することはありません。

## データの送信先

本拡張機能は、表示中のタブの Backlog ホスト（`*.backlog.com`、`*.backlog.jp`、
`*.backlogtool.com`）にのみ、追加したスペースに限ってリクエストを送ります。API キーも、
それぞれのスペースへのリクエストにだけ含めます。

本拡張機能は独自のサーバーを持たず、解析やトラッキングを行いません。データを販売したり
第三者と共有したりすることはなく、リモートのコードも読み込みません。

## データの削除

拡張機能のオプションでスペースを削除するか、本拡張機能をアンインストールすると、保存された
設定はブラウザから削除されます。API キー自体を無効にするには、Backlog の「個人設定 → API」
から削除してください。

## お問い合わせ

<https://github.com/simochee/live-for-backlog/issues> に Issue を作成してください。
