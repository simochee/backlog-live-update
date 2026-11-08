import * as v from "valibot";

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

export const PageCommentSchema = v.looseObject({ id: v.number() });
export type PageComment = v.InferOutput<typeof PageCommentSchema>;

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
 * 要求し、size は問わない。そのため空 object や配列だけを持つ無関係な state も通る。
 * hook の特定には `findCommentStarMapHook` の隣接 state 判定を併用すること。
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
 * star を取得する hook(`useStarsForIssueComments`)が starMap の直後に持つ
 * `useState<{ isLoading: boolean; queue: Comment[][] }>` の形か判定する。
 */
function isStarLoadingQueue(value: unknown): boolean {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	return typeof v.isLoading === "boolean" && Array.isArray(v.queue);
}

/**
 * fiber tree を走査し、comment 用 starMap を保持する useState hook を見つける。
 * starMap 形の state のうち、次の hook が star 読み込みキューであるものだけを採用する。
 */
export function findCommentStarMapHook(): CommentStarMapHook | null {
	const root = findRootFiber();
	if (!root) return null;
	for (const fiber of walkFibers(root)) {
		if (!FUNCTION_COMPONENT_TAGS.has(fiber.tag)) continue;
		for (const hook of walkHooks(fiber)) {
			if (!hook.queue) continue;
			const s = hook.memoizedState;
			if (!isCommentStarMap(s)) continue;
			// starMap の形だけでは、star が 1 件も無い課題の `{}` と無関係な空 object や
			// 配列だけを持つ state を区別できない。形だけで選ぶと別 component の state に
			// patch を書き込み、画面のスター数が変わらなくなる(issue #1)。
			if (!isStarLoadingQueue(hook.next?.memoizedState)) continue;
			return {
				dispatch: hook.queue.dispatch as unknown as (a: CommentStarMap) => void,
				state: s,
			};
		}
	}
	return null;
}
