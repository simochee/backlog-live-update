import * as v from "valibot";

const REACT_CONTAINER_KEY_PREFIX = "__reactContainer$";

const FUNCTION_COMPONENT_TAGS = new Set([0, 15]);

export const PageCommentSchema = v.looseObject({ id: v.number() });
export type PageComment = v.InferOutput<typeof PageCommentSchema>;

export interface CommentState {
	issueId: number;
	commentIds: number[];
	comments: PageComment[];
}

interface Hook {
	memoizedState: unknown;
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

export interface CommentStateHook {
	dispatch: (action: CommentState) => void;
	state: CommentState;
}

let cachedRoot: { element: Element; key: string } | undefined;

function readRoot(element: Element, key: string): Fiber | null {
	const container = (element as unknown as Record<string, unknown>)[key] as
		| { stateNode?: { current?: Fiber } }
		| undefined;
	return container?.stateNode?.current ?? null;
}

export function findRootFiber(start: Element = document.body): Fiber | null {
	if (cachedRoot?.element.isConnected && start.contains(cachedRoot.element)) {
		const root = readRoot(cachedRoot.element, cachedRoot.key);
		if (root) return root;
	}
	cachedRoot = undefined;
	const queue: Element[] = [start];
	for (let index = 0; index < queue.length; index++) {
		const element = queue[index];
		const key = Object.keys(element).find((k) =>
			k.startsWith(REACT_CONTAINER_KEY_PREFIX),
		);
		if (key) {
			const root = readRoot(element, key);
			if (root) {
				cachedRoot = { element, key };
				return root;
			}
		}
		queue.push(...Array.from(element.children));
	}
	return null;
}

// 深いツリーで call stack を溢れさせないため、再帰せずスタックを使う。
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

export function* walkHooks(fiber: Fiber): Generator<Hook> {
	let hook = fiber.memoizedState as Hook | null;
	while (hook) {
		yield hook;
		hook = hook.next;
	}
}

// 5,000 hook × 200 回の比較で v.is は約24倍遅いため、全 hook を調べる判定は手書きのまま保つ。
export function isCommentState(value: unknown): value is CommentState {
	if (typeof value !== "object" || value === null) return false;
	const state = value as Record<string, unknown>;
	return (
		typeof state.issueId === "number" &&
		Array.isArray(state.commentIds) &&
		Array.isArray(state.comments)
	);
}

export interface QueryClientLike {
	getQueryCache(): { getAll(): { queryKey: unknown }[] };
	invalidateQueries(filters?: {
		predicate?: (query: { queryKey: unknown }) => boolean;
	}): unknown;
}

// 5,000 値 × 200 回の比較で v.is は約21倍遅いため、fiber 探索では手書きの判定を保つ。
function isQueryClient(value: unknown): value is QueryClientLike {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { getQueryCache?: unknown }).getQueryCache === "function"
	);
}

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

export interface CommentStarItem {
	id: number;
	url: string;
	userId: number;
	userName: string;
	userIcon: string;
	comment: unknown;
}

export type CommentStarMap = Record<string, CommentStarItem[]>;

export interface CommentStarMapHook {
	dispatch: (action: CommentStarMap) => void;
	state: CommentStarMap;
}

// 5,000 hook × 200 回の比較で v.is は約13倍遅いため、plain object を含む判定は手書きのまま保つ。
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
