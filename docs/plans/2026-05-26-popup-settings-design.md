# Popup 設定ページ 設計

- 日付: 2026-05-26
- 対象: `entrypoints/popup` を Backlog 連携設定の入力ページにする
- 目的: スタイル自作を避けつつ、機密情報(API Key)を含む設定を入力・永続化する

## 決定事項サマリ

| 項目 | 決定 |
| --- | --- |
| UI library | `@adobe/react-spectrum`（popup は通常 document でshadow DOM でない → global CSS 問題なし） |
| 保存先 | `browser.storage.local`（WXT `storage.defineItem`）。機密性重視で sync は使わない |
| 有効化フラグ | `globalEnabled` を master switch とし、OFF なら全 space 停止。ON 時に各 space の `enabled` が効く |
| interval | 全 space 共通の単一値。default 1 / min 1 / max 30（分） |
| 保存タイミング | 自動保存（変更を即 `storage.local` へ反映、保存ボタンなし） |
| validation | react-spectrum `validationBehavior="aria"`（リアルタイム表示）+ valibot schema |
| schema library | valibot（軽量・tree-shakable） |
| 接続テスト(API疎通) | 今回スコープ外（YAGNI） |

## データモデル / Schema（single source of truth）

`utils/settings.ts` に集約。valibot schema を唯一の正とし、storage 保存・load・UI 検証すべてで共有する。

```ts
import * as v from "valibot";
import { storage } from "wxt/storage";

export const SpaceConfigSchema = v.object({
  id: v.pipe(
    v.string(),
    v.nonEmpty("Space ID は必須です"),
    v.regex(/^[a-z0-9-]+$/i, "英数字とハイフンのみ"),
  ),
  apiKey: v.pipe(v.string(), v.nonEmpty("API Key は必須です")),
  enabled: v.boolean(),
});

export const SettingsSchema = v.object({
  globalEnabled: v.boolean(),
  intervalMinutes: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(1),
    v.maxValue(30),
  ),
  spaces: v.array(SpaceConfigSchema),
});

export type Settings = v.InferOutput<typeof SettingsSchema>;
export type SpaceConfig = v.InferOutput<typeof SpaceConfigSchema>;

export const DEFAULT_SETTINGS: Settings = {
  globalEnabled: true,
  intervalMinutes: 1,
  spaces: [],
};

export const settingsStorage = storage.defineItem<Settings>("local:settings", {
  fallback: DEFAULT_SETTINGS,
});
```

- Space ID 重複は schema では単純検証しきれない → 保存前に別途チェックし UI 警告（保存は許容 or 行単位エラー表示）。

## UI 構成（`entrypoints/popup/App.tsx`）

- ルート: `<Provider theme={defaultTheme} colorScheme="light">`、popup に `min-width: 360px`（react-spectrum は幅が親依存のため明示）
- `<Form validationBehavior="aria">` で包む（submit なしのリアルタイム検証）
- 全体設定:
  - `<Switch>` … `globalEnabled`（master switch）
  - `<NumberField label="更新間隔(分)" minValue={1} maxValue={30} step={1}>`
- space 配列 — 各行を `<Flex>` 横並び:
  - `<TextField label="Space ID" isRequired>`
  - `<TextField label="API Key" type="password" isRequired>`（マスク表示）
  - `<Switch>` … space の `enabled`
  - `<ActionButton>` … 行削除（ゴミ箱 icon）
- `<Button variant="accent">` … space 行追加

## データフロー（自動保存）

1. mount 時: `settingsStorage.getValue()` で初期 state 復元
2. 変更時: state 更新 → `settingsStorage.setValue()` を即時反映（軽い debounce 任意）
3. content script / background は同一 `settingsStorage` key を参照。`globalEnabled=false` で全機能停止

## Validation 統合（方式B: form 単位）

- 入力のたび `Settings` 全体を `v.safeParse(SettingsSchema, draft)` で検証
- 失敗時、valibot の issues を field 名（例 `spaces.0.id`）→ メッセージへ map し、react-spectrum `<Form validationErrors={{...}}>` に注入
- 保存ガード: invalid な行は `storage` へ反映せず、UI 上はエラー表示のまま編集継続（valid 部分のみ反映 or 全体保留かは実装時に確定）
- NumberField の範囲(1〜30)は schema・component 双方で表現（二重防御）

## エラーハンドリング

- storage 書込失敗は稀だが try/catch でログ。UI は前回値保持
- API Key 空・形式不正・interval 範囲外は schema が捕捉し inline エラー表示

## テスト（vitest 導入済）

- `utils/settings.ts` を中心に unit test:
  - `SettingsSchema` の valid/invalid ケース
  - storage load 時の fallback / 不正データ時の挙動（WXT `fakeBrowser` で mock）
  - issues → `validationErrors` 変換ユーティリティ
- component test は react-spectrum の DOM が重いため最小限 or 省略

## 追加依存

- `@adobe/react-spectrum`
- `valibot`
