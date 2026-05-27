# 課題詳細の live revalidate 設計

## 背景 / 目的

現状はコメント追加を watch して live append するのみ。課題詳細の各フィールド
(状態・担当者・優先度・期限日・カスタム属性 等)も、他者の更新を画面リロード無しで
反映したい。

内部 API を高頻度に polling するのは負荷・行儀の面で避けたい。public API を変化検知の
安価な probe として使い、実データの取得・整形・再描画は Backlog 自身に任せる。

## 確定した前提

- Backlog の課題詳細データは **TanStack Query** で管理されている(実ページで確認済み)。
  fiber tree を走査し `memoizedProps.client || memoizedProps.value` が `getQueryCache()`
  を持つ object = QueryClient を取得できる。
- QueryClient は **MAIN world(page context)** にのみ存在する。
- public API `getIssue(issueIdOrKey)` は issueKey を受け付ける。URL `/view/PROJ-123` から
  issueKey が取れるため、課題詳細 poll には fiber bridge からの issueId 取得は不要。
- public API の戻り値 `updated`(最終更新時刻)で変化を安価に検知できる。

## 方式: TanStack Query invalidate

我々が public API 値を内部 state 形状へ変換するのではなく、変化を検知したら Backlog の
data-fetching 層(TanStack Query)に refetch させる。fetch・整形・render は全て Backlog
側で行われるため **render-ready 不一致が原理的に発生しない**。

field-level の差分判定は不要。`updated` が進んだ事実だけで当該 query を invalidate し、
Backlog が変化分を自前で再描画する。

### 棄却した代替案

- public API 値を内部 state 形状へ手動 mapping → status ラベル localization・担当者
  iconURL・説明 HTML 化 等の render-ready 変換が必要で脆く高コスト。
- 不一致フィールドを内部 API(`GetInitialComments.action` の課題詳細版相当)で補完する
  hybrid → 内部 API 依存が増え、TanStack 方式より複雑。
- 変化検知時に DOM へ「更新あり」バッジ/再読込促しを出すだけ → live 書き換えにならない。

## アーキテクチャ / データフロー

既存 comment 機能と同じ 3 層・同一 `pollWhileVisible` タイマーに相乗りする並行フロー。

1. **content script (isolated world)**: tab 可視中、`settings.interval` 毎に
   `backlog.getIssue(issueKey)` を poll。戻り値 `updated` を前回値(closure 保持)と比較。
2. **変化検知**: `updated` が進んだ → `lfb:revalidate-issue` を bridge へ dispatch。
   detail に `{ issueKey, issueId }`(issueId は `getIssue` 応答の `id`)を載せる。
   初回 tick は baseline 記録のみで発火しない。
3. **bridge (MAIN world)**: 受信 → `findQueryClient()` → `getQueryCache().getAll()` から
   queryKey に issueKey / issueId を含む query のみ `invalidateQueries` →
   Backlog が内部 API で再 fetch・全フィールド再 render。

## 確定した設計判断

- **(A) invalidate 対象の絞り方**: 全 invalidate は避け、queryKey が現在の issueKey /
  issueId を含む query のみを対象にする(comment や無関係 query への波及防止)。
  実装時に `getQueryCache().getAll()` で実 queryKey 形状を実見して照合条件を確定する。
- **(B) `updated` gate の割り切り**: comment 追加でも `updated` は進むため、comment 追加時
  にも課題 refetch が走る(フィールド不変なら再 render は無害、内部 API 1 回が無駄になる
  だけ)。field-level 判定は持たず YAGNI。将来 `updated` を起点に comment probe と統合し
  1 call へ最適化する余地はあるが今はやらない。
- **(C) タイマー共有**: 既存 comment poll tick と同一 `pollWhileVisible` 内で `getIssue` も
  呼ぶ(visibility loop 二重化回避)。comment probe と issue probe は関心分離のため独立
  2 call のまま。

## コンポーネント

### `utils/react-fiber.ts` — `findQueryClient()` 追加

- 既存 `findRootFiber()` で root fiber を得て、fiber tree を走査。
- `memoizedProps.client || memoizedProps.value` が `typeof getQueryCache === "function"`
  の object を返す。未検出は `null`。
- `window.__qc` 等の global には依存しない(Backlog 再 mount で陳腐化し得るため毎回再取得)。

### `entrypoints/comment-bridge.ts` — `lfb:revalidate-issue` リスナー追加

- detail(JSON 文字列)から `{ issueKey, issueId }` を読む。
- `findQueryClient()` → null なら no-op。
- `getQueryCache().getAll()` を走査し、queryKey に issueKey / issueId を含む query を
  `queryClient.invalidateQueries({ queryKey })`(または対象 query 群へ refetch)。
- 全体 try/catch。失敗時 no-op(未文書構造依存のため shape 変化で壊れ得る)。

### `entrypoints/content/index.tsx` — issue poll フロー統合

- 既存 `onElementAppear("#comments")` コールバック内に統合。
- issue 毎の `lastUpdated: string | undefined` を closure 保持。課題切替(`#comments`
  再出現)で `undefined` に reset(既存 `stopPoll?.()` と同じタイミング)。
- 同一 `pollWhileVisible` tick 内で `backlog.getIssue(issueKey)` を呼ぶ。
  - 失敗(network / rate limit)は catch して skip。
  - `lastUpdated === undefined` → baseline 記録のみ。
  - `issue.updated > lastUpdated` → `lfb:revalidate-issue` 発火 + `lastUpdated` 更新。

## エラー処理

- `getIssue` 失敗: catch して tick skip(comment probe と同方針)。
- `findQueryClient()` null: bridge 側で no-op。
- `invalidateQueries` 例外: try/catch で握りつぶし no-op。
- いずれも未文書 API / React 内部構造依存のため、壊れたら静かに no-op し画面を壊さない。

## テスト

- `utils/react-fiber.test.ts`: `findQueryClient()` が fiber tree から
  `getQueryCache` を持つ object を見つける / 未検出で null を返す。
- bridge / content の結線は既存 comment 同様、純粋ロジックを util へ寄せて単体化を優先。

## 未確定 / 実装時に確定する点

- 実 queryKey 形状(issueKey か issueId か別表現か)→ `getAll()` で実見して (A) の照合条件確定。
- invalidate が Backlog 側で loading スピナー等の UX ノイズを出さないか(background refetch
  なら通常データ保持のまま無音の想定)。
- inline 編集中に refetch が走った場合の挙動(編集 draft は component local state の想定で
  query data 上書きの影響は受けにくいが、実挙動を確認)。
