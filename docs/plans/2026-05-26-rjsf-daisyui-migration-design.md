# popup を RJSF + daisyui へ移行 設計

- 日付: 2026-05-26
- 対象: `entrypoints/popup` の設定フォームを react-spectrum から react-jsonschema-form (RJSF) + daisyui テーマへ移行
- 背景: react-spectrum の UI が微妙。schema を定義済みなので RJSF で schema 駆動のフォーム自動生成に切り替える。

## 決定事項サマリ

| 項目 | 決定 |
| --- | --- |
| schema SSOT | **valibot**（`utils/settings.ts`）を維持。`@valibot/to-json-schema` で JSON Schema に変換して RJSF へ渡す |
| フォーム | RJSF v6（`@rjsf/core`）+ `@rjsf/daisyui` テーマ + `@rjsf/validator-ajv8` |
| CSS | Tailwind v4 + daisyui v5。`@tailwindcss/vite` plugin |
| daisyui テーマ | **forest** のみ（`themes: forest --default;`）。popup に `data-theme="forest"` |
| storage | `storage.local`（`settingsStorage`）維持 |
| 保存 | 自動保存（全体保留方式）維持。RJSF `onChange` → valibot `safeParse` 成功時のみ `setValue` |
| 検証 UI | RJSF（AJV）が担当。`utils/validation.ts`（`toValidationErrors`）は不要 → 削除 |
| React 19 | @rjsf/core v6.5.3 / @rjsf/daisyui / @tailwindcss/vite いずれも対応確認済 |

## バージョン確認済

- `@rjsf/core` 6.5.3（peer `react >=18`）
- `@rjsf/daisyui` 6.5.3（peer `daisyui ^5.0.29`, `react >=18`）
- `daisyui` 5.5.20（Tailwind v4 ベース）
- `@tailwindcss/vite` 4.3.0（peer `vite ^5/6/7/8`、WXT の vite と整合）
- `@valibot/to-json-schema` 1.7.0（peer `valibot ^1.4.0`、現状 1.4.1 と整合）

## 1. schema 変更（`utils/settings.ts`）

valibot を SSOT に維持しつつ、RJSF 用に以下を調整する。

- 各フィールドに `v.title()`（必要なら `v.description()`）メタデータを付与 → RJSF がフォーム label に使う。
- regex の `i` フラグを除去（`/^[a-z0-9-]+$/i` → `/^[a-zA-Z0-9-]+$/`）。JSON Schema `pattern` はフラグ非対応のため。
- `toJsonSchema(SettingsSchema)` で JSON Schema を生成するヘルパー（`settingsJsonSchema`）を export。

```ts
import * as v from "valibot";
import { toJsonSchema } from "@valibot/to-json-schema";

export const SpaceConfigSchema = v.object({
  id: v.pipe(
    v.string(),
    v.title("Space ID"),
    v.nonEmpty("Space ID は必須です"),
    v.regex(/^[a-zA-Z0-9-]+$/, "英数字とハイフンのみ使用できます"),
  ),
  apiKey: v.pipe(v.string(), v.title("API Key"), v.nonEmpty("API Key は必須です")),
  enabled: v.pipe(v.boolean(), v.title("有効")),
});

export const SettingsSchema = v.object({
  globalEnabled: v.pipe(v.boolean(), v.title("全機能を有効化")),
  intervalMinutes: v.pipe(
    v.number(),
    v.title("更新間隔(分)"),
    v.integer("整数で入力してください"),
    v.minValue(1, "1 以上で入力してください"),
    v.maxValue(30, "30 以下で入力してください"),
  ),
  spaces: v.pipe(v.array(SpaceConfigSchema), v.title("スペース")),
});

export type Settings = v.InferOutput<typeof SettingsSchema>;
export type SpaceConfig = v.InferOutput<typeof SpaceConfigSchema>;

export const DEFAULT_SETTINGS: Settings = {
  globalEnabled: true,
  intervalMinutes: 1,
  spaces: [],
};

export const settingsJsonSchema = toJsonSchema(SettingsSchema);

export const settingsStorage = storage.defineItem<Settings>("local:settings", {
  fallback: DEFAULT_SETTINGS,
});
```

（`v.title` の付与位置・`toJsonSchema` の出力が必須/範囲/pattern を含むかは実装時に test で確認する。）

## 2. uiSchema（popup 側、表示専用）

構造・検証は JSON Schema（valibot 由来）。見た目だけ uiSchema で制御。

- `apiKey`（spaces.items）: `"ui:widget": "password"`
- `globalEnabled` / `enabled`: boolean → daisyui の checkbox/toggle（デフォルト widget）
- `spaces`: array → RJSF が追加/削除ボタンを自動生成
- 必要に応じて `"ui:options"` で order やラベル微調整

## 3. フォーム（`entrypoints/popup/App.tsx` 全面置換）

```tsx
import Form from "@rjsf/daisyui";
import validator from "@rjsf/validator-ajv8";
import { settingsJsonSchema, SettingsSchema, settingsStorage, DEFAULT_SETTINGS, type Settings } from "@/utils/settings";
import { safeParse } from "valibot";

// mount 時 load（ignore/catch ガードは現状を踏襲）
// update(formData): safeParse 成功時のみ settingsStorage.setValue（全体保留方式）

<Form
  schema={settingsJsonSchema}
  uiSchema={uiSchema}
  validator={validator}
  formData={settings}
  liveValidate
  onChange={({ formData }) => update(formData)}
/>
```

- 送信ボタンは不要（自動保存）→ `<Form>` の children を空にするか submit ボタンを非表示。
- `update`: `safeParse(SettingsSchema, formData)` 成功時のみ `settingsStorage.setValue`。失敗時は state 保持で RJSF が inline エラー表示。
- mount load の `ignore` フラグ・read/write の `.catch` は現状実装を踏襲。

## 4. Tailwind / daisyui 統合

- `wxt.config.ts` の `vite.plugins` に `@tailwindcss/vite` を追加。
- popup の CSS（`entrypoints/popup/style.css` or 専用 css）:
  ```css
  @import "tailwindcss";
  @plugin "daisyui" {
    themes: forest --default;
  }
  ```
- popup の `index.html` の `<html>` に `data-theme="forest"`、`lang="ja"`。
- content script は shadow DOM のため Tailwind と干渉しない（popup 限定）。

## 5. 依存変更

追加:
- `@rjsf/core` `@rjsf/utils` `@rjsf/validator-ajv8` `@rjsf/daisyui`
- `daisyui` `tailwindcss` `@tailwindcss/vite`
- `@valibot/to-json-schema`

削除:
- `@adobe/react-spectrum`

## 6. 削除 / 置換ファイル

- 削除: `utils/validation.ts`, `utils/validation.test.ts`（RJSF が検証 UI を担う → `toValidationErrors` 不要）
- 維持・拡張: `utils/settings.ts`（title 付与・regex 修正・`settingsJsonSchema` 追加）、`utils/settings.test.ts`
- 全面置換: `entrypoints/popup/App.tsx`、`entrypoints/popup/style.css`、`entrypoints/popup/index.html`（data-theme/lang）

## 7. テスト

- `utils/settings.test.ts`: 既存 valibot 検証ケースを維持 + `settingsJsonSchema` が `required` / `minimum`/`maximum` / `pattern` / `title` を含む JSON Schema を生成することを検証。
- RJSF の component test は重いので省略。build と手動（`bun run dev`）で見た目・挙動を確認。

## 8. 懸念・実装時の確認点

- `@valibot/to-json-schema` が `v.title` / `v.regex`（フラグなし）/ `v.minValue`/`maxValue` / `v.nonEmpty` を期待通り JSON Schema 化するか（test で確認、ダメなら手書き JSON Schema 部分補完）。
- bundle サイズ（RJSF + AJV）。daisyui は forest のみで CSS 削減。
- RJSF v6 の daisyui テーマで password widget / array 操作が正しく描画されるか（手動確認）。
