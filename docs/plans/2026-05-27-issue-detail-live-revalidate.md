# 課題詳細 live revalidate 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 課題詳細を public API でpollし、`updated`が進んだらBacklogのTanStack Query を invalidate して全フィールドをlive再描画する。

**Architecture:** public API `getIssue` を変化検知の安価なprobeとして使い、実データのfetch・整形・renderはBacklog自身に任せる。QueryClientはMAIN world(page context)にのみ存在するため、content script(isolated)が変化を検知して `lfb:revalidate-issue` イベントでbridgeへ依頼し、bridgeがQueryClientを取得してissue関連queryをinvalidateする。

**Tech Stack:** WXT (content script + unlisted MAIN world script), React fiber 走査, TanStack Query (Backlog側), backlog-js, valibot, Vitest + happy-dom。

設計詳細: `docs/plans/2026-05-27-issue-detail-live-revalidate-design.md`

---

## 前提知識(codebase固有)

- `utils/react-fiber.ts`: `findRootFiber()` が `document.body` 配下を BFS して
  `__reactContainer$<id>` expando から root fiber を返す。`walkFibers(root)` が
  pre-order DFS で fiber を列挙する generator。`findCommentStateHook()` がその応用例。
- `entrypoints/comment-bridge.ts`: `defineUnlistedScript` で MAIN world で動く。
  `script.addEventListener("lfb:...")` で content script と双方向通信。CustomEvent の
  `detail` は **JSON 文字列**でやり取りする(world 境界で object がそのまま読めないため)。
- `entrypoints/content/index.tsx`: isolated world。`injectScript("/comment-bridge.js")`
  で bridge を注入。`onElementAppear("#comments", cb)` で課題画面表示を検知し、
  `pollWhileVisible(cb, interval)` で tab 可視中のみ poll。`stopPoll?.()` で課題切替時に
  前回 poll を停止。`backlog-js` の `Backlog` instance で public API を叩く。
- テスト規約(`utils/react-fiber.test.ts`): fiber/hook を plain object factory で組み、
  `mountRoot()` で `__reactContainer$test` を持つ container を `document.body` に設置。
  `afterEach` で `document.body.replaceChildren()`。日本語の `it` 文。
- `backlog.getIssue(issueIdOrKey)` は issueKey(`PROJ-123`)を受け取り、`updated: string`
  (ISO 時刻文字列)を含む issue object を返す。

---

## Task 1: `findQueryClient()` を react-fiber.ts に追加

fiber tree から TanStack Query の QueryClient(`getQueryCache()` を持つ object)を取得する。

**Files:**
- Modify: `utils/react-fiber.ts`
- Test: `utils/react-fiber.test.ts`

**Step 1: 構造型と Fiber 拡張を追加**

`utils/react-fiber.ts` の `Fiber` interface に `memoizedProps` を足し、QueryClient の
構造型と本体を追加する。

```ts
interface Fiber {
	tag: number;
	child: Fiber | null;
	sibling: Fiber | null;
	memoizedState: unknown;
	memoizedProps?: { client?: unknown; value?: unknown } | null;
}

/** TanStack Query QueryClient の、本拡張が触る最小 surface。 */
export interface QueryClientLike {
	getQueryCache(): { getAll(): { queryKey: unknown }[] };
	invalidateQueries(filters: { queryKey: unknown }): unknown;
}

/** 値が QueryClientLike か(getQueryCache を持つか)を判定する。 */
function isQueryClient(value: unknown): value is QueryClientLike {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { getQueryCache?: unknown }).getQueryCache === "function"
	);
}

/**
 * fiber tree を走査し、QueryClientProvider が props で運ぶ QueryClient を返す。
 * `memoizedProps.client`(Provider) または `.value`(Context.Provider)を見る。
 * 未検出は null。global(window.__qc 等)には依存せず毎回再取得する。
 */
export function findQueryClient(): QueryClientLike | null {
	const root = findRootFiber();
	if (!root) return null;
	for (const fiber of walkFibers(root)) {
		const props = fiber.memoizedProps;
		if (!props) continue;
		const candidate = props.client ?? props.value;
		if (isQueryClient(candidate)) return candidate;
	}
	return null;
}
```

**Step 2: 失敗するテストを書く**

`utils/react-fiber.test.ts` に追記。既存 `Fiber` type に `memoizedProps` を足し、
`fiber()` factory も対応させる。

```ts
// 既存 import に findQueryClient を追加
// Fiber type に: memoizedProps?: { client?: unknown; value?: unknown } | null;
// fiber() factory の既定に memoizedProps を含めなくてよい(optional)

describe("findQueryClient", () => {
	const queryClient = () => ({
		getQueryCache: () => ({ getAll: () => [] }),
		invalidateQueries: vi.fn(),
	});

	it("memoizedProps.client が getQueryCache を持つ fiber から QueryClient を返す", () => {
		const qc = queryClient();
		const provider = fiber(0, { memoizedProps: { client: qc } });
		mountRoot(fiber(3, { child: provider }));
		expect(findQueryClient()).toBe(qc);
	});

	it("memoizedProps.value 経由(Context.Provider)でも検出する", () => {
		const qc = queryClient();
		const provider = fiber(0, { memoizedProps: { value: qc } });
		mountRoot(fiber(3, { child: provider }));
		expect(findQueryClient()).toBe(qc);
	});

	it("getQueryCache を持たない props は無視し、未検出なら null", () => {
		const provider = fiber(0, { memoizedProps: { value: { foo: 1 } } });
		mountRoot(fiber(3, { child: provider }));
		expect(findQueryClient()).toBeNull();
	});

	it("React root が無ければ null", () => {
		expect(findQueryClient()).toBeNull();
	});
});
```

**Step 3: テスト失敗を確認**

Run: `npx vitest run utils/react-fiber.test.ts -t findQueryClient`
Expected: FAIL(`findQueryClient` 未 export / 未定義)

**Step 4: Step 1 の実装を適用してテスト緑を確認**

Run: `npx vitest run utils/react-fiber.test.ts`
Expected: PASS(既存テスト含め全緑)

**Step 5: Commit**

```bash
git add utils/react-fiber.ts utils/react-fiber.test.ts
git commit -m "feat: locate TanStack Query client via react fiber walk"
```

---

## Task 2: `revalidateIssueQueries()` util を新規作成

QueryClient の query cache から、現在の課題に関連する query のみを invalidate する純粋ロジック。
queryKey の実形状は未知のため、key を **deep scan** し issueKey(string)または issueId(number)
を含む query を対象にする(全 invalidate を避け波及を防ぐ)。

**Files:**
- Create: `utils/revalidate-issue-queries.ts`
- Test: `utils/revalidate-issue-queries.test.ts`

**Step 1: 失敗するテストを書く**

```ts
import { describe, expect, it, vi } from "vitest";
import { queryKeyMatchesIssue, revalidateIssueQueries } from "./revalidate-issue-queries";

describe("queryKeyMatchesIssue", () => {
	const issue = { issueKey: "PROJ-123", issueId: 42 };

	it.each([
		["issueKey を含む配列", ["issue", "PROJ-123"]],
		["issueId(number) を含む配列", ["issue", 42]],
		["ネストした object 値に含む", ["issue", { id: 42 }]],
	])("%s は true", (_label, key) => {
		expect(queryKeyMatchesIssue(key, issue)).toBe(true);
	});

	it.each([
		["無関係な key", ["project", "PROJ"]],
		["別 issueId", ["issue", 99]],
	])("%s は false", (_label, key) => {
		expect(queryKeyMatchesIssue(key, issue)).toBe(false);
	});
});

describe("revalidateIssueQueries", () => {
	it("該当 query のみ invalidate し件数を返す", () => {
		const invalidateQueries = vi.fn();
		const client = {
			getQueryCache: () => ({
				getAll: () => [
					{ queryKey: ["issue", "PROJ-123"] },
					{ queryKey: ["issue", 42, "comments"] },
					{ queryKey: ["project", "PROJ"] },
				],
			}),
			invalidateQueries,
		};

		const count = revalidateIssueQueries(client, { issueKey: "PROJ-123", issueId: 42 });

		expect(count).toBe(2);
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["issue", "PROJ-123"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["issue", 42, "comments"] });
		expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ["project", "PROJ"] });
	});

	it("該当無しなら invalidate せず 0 を返す", () => {
		const invalidateQueries = vi.fn();
		const client = {
			getQueryCache: () => ({ getAll: () => [{ queryKey: ["project", "PROJ"] }] }),
			invalidateQueries,
		};
		expect(revalidateIssueQueries(client, { issueKey: "PROJ-123", issueId: 42 })).toBe(0);
		expect(invalidateQueries).not.toHaveBeenCalled();
	});
});
```

**Step 2: テスト失敗を確認**

Run: `npx vitest run utils/revalidate-issue-queries.test.ts`
Expected: FAIL(モジュール未存在)

**Step 3: 最小実装**

```ts
import type { QueryClientLike } from "./react-fiber";

/** 対象課題を識別する値。 */
export interface IssueRef {
	issueKey: string;
	issueId: number;
}

/** 値(配列/object/プリミティブ)を再帰走査し、issueKey か issueId に一致する要素があるか。 */
export function queryKeyMatchesIssue(key: unknown, issue: IssueRef): boolean {
	if (key === issue.issueKey || key === issue.issueId) return true;
	if (Array.isArray(key)) return key.some((k) => queryKeyMatchesIssue(k, issue));
	if (typeof key === "object" && key !== null) {
		return Object.values(key).some((v) => queryKeyMatchesIssue(v, issue));
	}
	return false;
}

/**
 * query cache を走査し、queryKey に当該課題を含む query のみ invalidate する。
 * invalidate した件数を返す(0 なら対象 query 無し)。queryKey 形状は未文書のため
 * deep scan で堅牢に照合する。
 */
export function revalidateIssueQueries(
	client: QueryClientLike,
	issue: IssueRef,
): number {
	let count = 0;
	for (const query of client.getQueryCache().getAll()) {
		if (queryKeyMatchesIssue(query.queryKey, issue)) {
			client.invalidateQueries({ queryKey: query.queryKey });
			count++;
		}
	}
	return count;
}
```

**Step 4: テスト緑を確認**

Run: `npx vitest run utils/revalidate-issue-queries.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add utils/revalidate-issue-queries.ts utils/revalidate-issue-queries.test.ts
git commit -m "feat: invalidate issue-scoped TanStack queries by deep key match"
```

---

## Task 3: bridge に `lfb:revalidate-issue` リスナーを追加

content script からの依頼を受け、QueryClient を取得して revalidate を実行する MAIN world 結線。
薄い glue のため単体テストは行わず、typecheck + 手動検証で確認する。

**Files:**
- Modify: `entrypoints/comment-bridge.ts`

**Step 1: import と リスナーを追加**

ファイル冒頭の import に追記:

```ts
import { findQueryClient } from "../utils/react-fiber";
import { revalidateIssueQueries } from "../utils/revalidate-issue-queries";
```

既存の `script.addEventListener("lfb:fetch-append", ...)` の後ろに追記:

```ts
script.addEventListener("lfb:revalidate-issue", (event) => {
	if (!(event instanceof CustomEvent)) return;
	try {
		const { issueKey, issueId } = JSON.parse(event.detail) as {
			issueKey: string;
			issueId: number;
		};
		const client = findQueryClient();
		if (!client) return;
		revalidateIssueQueries(client, { issueKey, issueId });
	} catch {
		// 未文書構造依存。壊れても静かに no-op し画面を壊さない。
	}
});
```

bridge 冒頭の JSDoc に `lfb:revalidate-issue` の説明を 1 行追記(他イベントと同様)。

**Step 2: typecheck**

Run: `npm run compile`
Expected: 型エラー無し

**Step 3: Commit**

```bash
git add entrypoints/comment-bridge.ts
git commit -m "feat: revalidate issue queries on bridge request"
```

---

## Task 4: content script に課題詳細 poll フローを統合

既存 comment poll の `pollWhileVisible` tick に `getIssue` の `updated` 監視を相乗りさせる。
isolated world + backlog-js + injectScript 結線のため単体テストせず、build + 手動検証で確認する。

**Files:**
- Modify: `entrypoints/content/index.tsx`

**Step 1: issueKey の保持と updated 監視を追加**

`onElementAppear("#comments", () => { ... })` コールバック内、`issueKey` 取得済みの箇所に
`lastUpdated` を導入し、`pollWhileVisible` のコールバック内へ issue probe を追記する。

```ts
// stopPoll?.() の直後あたり、poll 開始前に baseline を初期化
let lastUpdated: string | undefined;

stopPoll?.();
stopPoll = pollWhileVisible(
	async () => {
		// --- 既存: comment probe(state 要求 → public API probe → fetch-append)---
		const state = await requestState();
		if (state.found && state.issueId != null) {
			const probe = await backlog.getIssueComments(state.issueId, {
				minId: state.minId,
				count: 1,
				order: "desc",
			});
			if (probe.length > 0) {
				script.dispatchEvent(new CustomEvent("lfb:fetch-append"));
			}
		}

		// --- 追加: 課題詳細の updated 監視 → 進んだら revalidate 依頼 ---
		try {
			const issue = await backlog.getIssue(issueKey);
			if (lastUpdated === undefined) {
				lastUpdated = issue.updated; // 初回は baseline 記録のみ
			} else if (issue.updated > lastUpdated) {
				lastUpdated = issue.updated;
				script.dispatchEvent(
					new CustomEvent("lfb:revalidate-issue", {
						detail: JSON.stringify({ issueKey, issueId: issue.id }),
					}),
				);
			}
		} catch {
			// network / rate limit 等。この tick は skip し次回継続。
		}
	},
	settings.interval * 60 * 1000,
);
```

注意:
- 既存 comment probe ロジックは早期 return から `if` ネストへ変えるが、挙動は変えない
  (comment 側が条件外でも issue probe を必ず走らせるため)。
- `issue.updated` / `issue.id` の型は backlog-js の Issue 型に含まれる。`backlog-js` の
  型で出ない場合のみ最小の局所キャストに留める。

**Step 2: build / typecheck**

Run: `npm run compile`
Expected: 型エラー無し

**Step 3: 既存テスト全実行**

Run: `npx vitest run`
Expected: 全 PASS(回帰無し)

**Step 4: 手動検証(@superpowers:verification-before-completion)**

`npm run dev` で拡張をロードし、対象 space の課題詳細を開く。別ブラウザ/別ユーザで
当該課題の状態・担当者等を変更 → `settings.interval` 経過後にリロード無しで画面へ反映される
ことを確認。DevTools で `lfb:revalidate-issue` 発火と invalidate 後の内部 API 再 fetch を観察。
queryKey 実形状が deep scan で拾えているか(`window.__qc.getQueryCache().getAll()` で確認)。

**Step 5: Commit**

```bash
git add entrypoints/content/index.tsx
git commit -m "feat: poll issue updated and request live revalidate while visible"
```

---

## 完了条件

- `npx vitest run` 全 PASS、`npm run compile` 型エラー無し。
- 課題詳細フィールド更新が tab 可視中にリロード無しで反映される。
- API 失敗・QueryClient 未検出・queryKey 形状変化のいずれでも画面を壊さず no-op する。

## 既知の割り切り(設計 doc 参照)

- comment 追加でも `updated` は進むため余分な課題 refetch が走り得る(無害、YAGNI)。
- queryKey 実形状は手動検証で確認。deep scan が過剰一致する場合のみ Task 2 の照合条件を狭める。
