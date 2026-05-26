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
 * Backlog 画面が state に積むコメント1件分の形状。実画面の fiber から実測した
 * 構造に準拠(GetInitialComments.action のレスポンス要素と同一)。
 */
export interface PageComment {
	id: number;
	name: string;
	icon: string;
	createdUserId: string;
	createdUser: {
		id: number;
		userId: string;
		uniqueId: string;
		name: string;
		mailAddress: string;
		roleType: number;
		keyword: string;
		lang: string | null;
		icon: string;
	};
	createdOn: string;
	updatedOn: string;
	content: string;
	plainContent: string;
	changelog: never[];
	notifyResource: never[];
	mentionsInContent: null;
}

/** コメント一覧を保持する hook の state 形状。 */
export interface CommentState {
	issueId: number;
	commentIds: number[];
	comments: PageComment[];
}

interface Hook {
	memoizedState: unknown;
	queue: { dispatch: (action: CommentState) => void } | null;
	next: Hook | null;
}

interface Fiber {
	tag: number;
	child: Fiber | null;
	sibling: Fiber | null;
	memoizedState: unknown;
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
				return { dispatch: hook.queue.dispatch, state: hook.memoizedState };
			}
		}
	}
	return null;
}
