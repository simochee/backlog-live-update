# Live for Backlog

[Backlog](https://backlog.com/) の課題画面を、リロードせずに最新へ追従させるブラウザ拡張です。

- 他者が追加したコメントを、ページを再読み込みせずに追記し、投稿直後と同じ更新ハイライトを付けます。
- 状態・担当者・期限日・カスタム属性など課題詳細フィールドの変更も、画面に live 反映します。

## アーキテクチャ

拡張は 3 つのコンテキストで動き、ページの内部状態を直接書き換えます。

```
┌─ popup ──────────────┐     ┌─ content script (isolated world) ─┐
│ space ID / API key /  │     │ tab 可視中のみ public API を poll  │
│ interval を保存       │     │ 変化を検知 → CustomEvent で依頼   │
└──────────────────────┘     └────────────────┬──────────────────┘
                                               │ injectScript / CustomEvent
                                               ▼
                              ┌─ comment-bridge (MAIN world) ──────┐
                              │ React fiber / TanStack QueryClient  │
                              │ を辿って state を直接更新・invalidate│
                              └─────────────────────────────────────┘
```

### なぜ MAIN world に bridge を注入するのか

Backlog が保持するコメント表示 state(React の hook)と TanStack Query の `QueryClient` は、
**ページ自身の JS context(MAIN world)にしか存在しません**。content script が動く isolated
world からは到達できないため、`injectScript` で MAIN world に bridge を流し込み、両 world を
`CustomEvent` で橋渡しします。event 名と payload 型は [`utils/bridge-protocol.ts`](utils/bridge-protocol.ts)
に集約し、world 境界をまたぐ contract を一箇所で管理しています。

### データフロー

高頻度の内部 API 直叩きは避け、**変化検知は安価な public API を probe に使い、実データの取得・
整形・再描画は Backlog 自身に任せる**方針です(`pollWhileVisible` で tab 可視中のみ実行)。

1. **コメント追加**: content が public API で「最新 id より新しいコメントの有無」だけを最小
   ペイロードで確認 → あれば bridge が内部 API で render-ready なコメントを取得し、fiber の
   state に dedup append + ハイライト。
2. **課題詳細の更新**: content が public API の `updated` を監視 → 進んだら bridge が当該課題の
   TanStack Query を `invalidate` し、Backlog に再 fetch・再 render させる(差分判定を持たない
   ぶん壊れにくい)。

React や内部 API の未文書な構造に依存するため、検出に失敗した場合は静かに no-op し、画面を
壊さないようにしています。

## 開発

ツールは [mise](https://mise.jdx.dev/) で固定しています(bun)。

```sh
mise install        # bun を用意
bun install         # 依存解決 + wxt prepare + lefthook install
bun run dev         # Chrome 向け開発ビルド(--watch)
bun run dev:firefox # Firefox 向け
bun test            # vitest (watch)
bun run compile     # wxt prepare && tsc --noEmit
bun run build       # 本番ビルド
```

- Lint / format: [Biome](https://biomejs.dev/)(`bunx biome check --write .`)
- pre-commit で staged ファイルを整形、pre-push で lint / typecheck / test を実行([lefthook](lefthook.yml))。
  同じ 3 チェックを [CI](.github/workflows/ci.yml) でも回します。
- デバッグログは dev ビルドで常時有効。本番ビルドで出すには `WXT_DEBUG_LOG=true bun run build`。

## 設定

ツールバーの popup から、対象の Backlog スペース ID・API key と polling 間隔(分)を設定します。
拡張は現在開いているホストとスペース ID が一致したときのみ起動します。

## 技術スタック

[WXT](https://wxt.dev/) / React 19 / TypeScript / [Valibot](https://valibot.dev/)(設定スキーマ) /
[backlog-js](https://github.com/nulab/backlog-js) / Vitest + happy-dom / Biome。

## License

[MIT](LICENSE)
