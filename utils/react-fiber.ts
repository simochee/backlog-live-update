/**
 * Backlog の課題画面が React 内部で保持する「コメント表示 state」を、外部から
 * fiber tree を辿って参照・更新するためのユーティリティ。
 *
 * React が DOM node へ付与する expando property(`__reactContainer$<id>`)や
 * fiber / hook の内部構造に依存するため、MAIN world(ページの JS context)でのみ
 * 動作し、Backlog 側の React 更新で壊れ得る。検出失敗時は null を返し、呼び出し側で
 * tick を skip する想定。
 */

/** React root fiber を指す expando key の prefix。 */
const REACT_CONTAINER_KEY_PREFIX = "__reactContainer$";

/** hooks を持つ fiber tag(FunctionComponent / SimpleMemoComponent)。 */
const FUNCTION_COMPONENT_TAGS = new Set([0, 15]);

/**
 * Backlog 画面 state が保持する comment 1件。実体は内部 endpoint
 * `GetInitialComments.action` のレスポンス要素そのもの(render-ready)。本拡張は
 * dedup に `id` を使うだけで中身は解釈しないため、その他フィールドは不透明とする。
 */
export interface PageComment {
	id: number;
	[key: string]: unknown;
}

/** コメント一覧を保持する hook の state 形状。 */
export interface CommentState {
	issueId: number;
	commentIds: number[];
	comments: PageComment[];
}

interface Hook {
	memoizedState: unknown;
	// 各 hook で扱う state 型が異なるため、生 dispatch は `unknown` を受ける形で抽象化し、
	// 呼出側で型を絞った wrapper(`findCommentStateHook` 等)で型安全に渡す。
	queue: { dispatch: (action: unknown) => void } | null;
	next: Hook | null;
}

interface Fiber {
	tag: number;
	child: Fiber | null;
	sibling: Fiber | null;
	memoizedState: unknown;
	memoizedProps?: Record<string, unknown> | null;
}

/** 見つかったコメント hook の dispatch と現在の state。 */
export interface CommentStateHook {
	dispatch: (action: CommentState) => void;
	state: CommentState;
}

/** DOM を BFS で辿り、最も近い React root fiber を返す。未検出なら null。 */
export function findRootFiber(start: Element = document.body): Fiber | null {
	const queue: Element[] = [start];
	while (queue.length > 0) {
		const element = queue.shift();
		if (!element) break;
		const key = Object.keys(element).find((k) =>
			k.startsWith(REACT_CONTAINER_KEY_PREFIX),
		);
		if (key) {
			const container = (element as unknown as Record<string, unknown>)[key] as
				| { stateNode?: { current?: Fiber } }
				| undefined;
			return container?.stateNode?.current ?? null;
		}
		queue.push(...Array.from(element.children));
	}
	return null;
}

/**
 * fiber tree を pre-order DFS で列挙する。再帰ではなく明示スタックを用いるため、
 * sibling が大量にある幅広ツリーでも call stack を溢れさせない。
 */
export function* walkFibers(root: Fiber | null): Generator<Fiber> {
	const stack: Fiber[] = [];
	let current: Fiber | null = root;
	while (current || stack.length > 0) {
		while (current) {
			yield current;
			if (current.sibling) stack.push(current.sibling);
			current = current.child;
		}
		current = stack.pop() ?? null;
	}
}

/** fiber が持つ hook 連結リストを先頭から列挙する。 */
export function* walkHooks(fiber: Fiber): Generator<Hook> {
	let hook = fiber.memoizedState as Hook | null;
	while (hook) {
		yield hook;
		hook = hook.next;
	}
}

/** 値が CommentState の形をしているか判定する(comments 要素の中身までは検証しない)。 */
export function isCommentState(value: unknown): value is CommentState {
	if (typeof value !== "object" || value === null) return false;
	const state = value as Record<string, unknown>;
	return (
		typeof state.issueId === "number" &&
		Array.isArray(state.commentIds) &&
		Array.isArray(state.comments)
	);
}

/** TanStack Query QueryClient の、本拡張が触る最小 surface。 */
export interface QueryClientLike {
	getQueryCache(): { getAll(): { queryKey: unknown }[] };
	invalidateQueries(filters?: {
		predicate?: (query: { queryKey: unknown }) => boolean;
	}): unknown;
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
		if (isQueryClient(props.client)) return props.client;
		if (isQueryClient(props.value)) return props.value;
	}
	return null;
}

/**
 * fiber tree を走査し、CommentState を保持する hook を見つける。
 * dispatch は React の setState 相当で、新しい CommentState 全体を渡して上書きする。
 */
export function findCommentStateHook(): CommentStateHook | null {
	const root = findRootFiber();
	if (!root) return null;
	for (const fiber of walkFibers(root)) {
		if (!FUNCTION_COMPONENT_TAGS.has(fiber.tag)) continue;
		for (const hook of walkHooks(fiber)) {
			if (hook.queue && isCommentState(hook.memoizedState)) {
				return {
					dispatch: hook.queue.dispatch as (a: CommentState) => void,
					state: hook.memoizedState,
				};
			}
		}
	}
	return null;
}

/**
 * comment 1 件分の star を表す最小 shape。`useIssueCommentStars` 系の hook が starMap の
 * 値として保持する形と一致する(`/star/list` レスポンスの要素そのまま)。`comment` は
 * 既存実装では常に null で機能していないため、本拡張では null 固定で構築する。
 */
export interface CommentStarItem {
	id: number;
	url: string;
	userId: number;
	userName: string;
	userIcon: string;
	comment: unknown;
}

/** commentId(文字列キー)→ star 配列 の map。空 entry は通常持たない。 */
export type CommentStarMap = Record<string, CommentStarItem[]>;

/** 見つかった star map hook の dispatch と現在の map。 */
export interface CommentStarMapHook {
	dispatch: (action: CommentStarMap) => void;
	state: CommentStarMap;
}

/**
 * 値が CommentStarMap らしい plain object か判定する。
 *
 * - plain object(Map / Array ではない)
 * - 全 value が Array で、各要素が `{ id: number, url: string, userId: number }` を満たす
 *
 * 空 map(comment はあるが star ゼロ)もありえるため「全 entry が条件を満たす」だけを
 * 要求し、size は問わない。ただし完全な空 object も成立してしまうため、呼出側の hook
 * 探索では「同等な物が複数 hit する場合先頭を採用」する pre-order DFS で安定検出する。
 */
export function isCommentStarMap(value: unknown): value is CommentStarMap {
	if (typeof value !== "object" || value === null) return false;
	if (Array.isArray(value)) return false;
	if (Object.getPrototypeOf(value) !== Object.prototype) return false;
	for (const v of Object.values(value)) {
		if (!Array.isArray(v)) return false;
		for (const item of v) {
			if (typeof item !== "object" || item === null) return false;
			const it = item as Record<string, unknown>;
			if (typeof it.id !== "number") return false;
			if (typeof it.url !== "string") return false;
			if (typeof it.userId !== "number") return false;
		}
	}
	return true;
}

/**
 * fiber tree を走査し、comment 用 starMap を保持する useState hook を見つける。
 * 完全 empty object も成立する判定だが、本拡張は「entry を最低 1 つ持つ」hook を
 * 優先採用するため、empty に hit したら walk を続けて非 empty を探す。
 */
export function findCommentStarMapHook(): CommentStarMapHook | null {
	const root = findRootFiber();
	if (!root) return null;
	let emptyFallback: CommentStarMapHook | null = null;
	for (const fiber of walkFibers(root)) {
		if (!FUNCTION_COMPONENT_TAGS.has(fiber.tag)) continue;
		for (const hook of walkHooks(fiber)) {
			if (!hook.queue) continue;
			const s = hook.memoizedState;
			if (!isCommentStarMap(s)) continue;
			const found: CommentStarMapHook = {
				dispatch: hook.queue.dispatch as unknown as (a: CommentStarMap) => void,
				state: s,
			};
			if (Object.keys(s).length > 0) return found;
			if (!emptyFallback) emptyFallback = found;
		}
	}
	return emptyFallback;
}
