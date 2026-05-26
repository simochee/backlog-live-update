import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type CommentState,
	findCommentStateHook,
	isCommentState,
	walkFibers,
	walkHooks,
} from "./react-fiber";

type Fiber = {
	tag: number;
	child: Fiber | null;
	sibling: Fiber | null;
	memoizedState: unknown;
};

type Hook = {
	memoizedState: unknown;
	queue: { dispatch: (action: CommentState) => void } | null;
	next: Hook | null;
};

const fiber = (tag: number, overrides: Partial<Fiber> = {}): Fiber => ({
	tag,
	child: null,
	sibling: null,
	memoizedState: null,
	...overrides,
});

const hook = (overrides: Partial<Hook> = {}): Hook => ({
	memoizedState: null,
	queue: null,
	next: null,
	...overrides,
});

const sampleState = (): CommentState => ({
	issueId: 42,
	commentIds: [1, 2],
	comments: [],
});

/** document.body 配下に React root を模した container を設置する。 */
function mountRoot(root: Fiber) {
	const container = document.createElement("div");
	(container as unknown as Record<string, unknown>).__reactContainer$test = {
		stateNode: { current: root },
	};
	document.body.appendChild(container);
}

afterEach(() => {
	document.body.replaceChildren();
});

describe("walkFibers", () => {
	it("child を sibling より先に辿る pre-order DFS で列挙する", () => {
		// root -> child A -> (A child A1), A sibling B
		const a1 = fiber(11);
		const b = fiber(20);
		const a = fiber(10, { child: a1, sibling: b });
		const root = fiber(3, { child: a });

		expect([...walkFibers(root)].map((f) => f.tag)).toEqual([3, 10, 11, 20]);
	});

	it("null を渡しても何も列挙しない", () => {
		expect([...walkFibers(null)]).toEqual([]);
	});
});

describe("walkHooks", () => {
	it("hook 連結リストを先頭から順に列挙する", () => {
		const h2 = hook({ memoizedState: 2 });
		const h1 = hook({ memoizedState: 1, next: h2 });
		const owner = fiber(0, { memoizedState: h1 });

		expect([...walkHooks(owner)].map((h) => h.memoizedState)).toEqual([1, 2]);
	});
});

describe("isCommentState", () => {
	it("issueId(number) と commentIds/comments(配列) を満たせば true", () => {
		expect(isCommentState(sampleState())).toBe(true);
	});

	it.each([
		["null", null],
		["issueId が string", { issueId: "1", commentIds: [], comments: [] }],
		["commentIds が非配列", { issueId: 1, commentIds: {}, comments: [] }],
		["comments 欠損", { issueId: 1, commentIds: [] }],
	])("%s なら false", (_label, value) => {
		expect(isCommentState(value)).toBe(false);
	});
});

describe("findCommentStateHook", () => {
	it("CommentState を持つ hook を検出し dispatch / state を返す", () => {
		const state = sampleState();
		const dispatch = vi.fn();
		const target = hook({ memoizedState: state, queue: { dispatch } });
		const unrelated = hook({ memoizedState: 0, queue: { dispatch: vi.fn() } });
		unrelated.next = target;
		const app = fiber(0, { memoizedState: unrelated });
		mountRoot(fiber(3, { child: app }));

		const found = findCommentStateHook();

		expect(found?.state).toBe(state);
		found?.dispatch({ ...state, commentIds: [1, 2, 3] });
		expect(dispatch).toHaveBeenCalledWith({ ...state, commentIds: [1, 2, 3] });
	});

	it("queue を持たない hook は無視する", () => {
		const noQueue = hook({ memoizedState: sampleState(), queue: null });
		mountRoot(fiber(3, { child: fiber(0, { memoizedState: noQueue }) }));

		expect(findCommentStateHook()).toBeNull();
	});

	it("FunctionComponent 以外(tag 0/15 以外)の fiber は走査しない", () => {
		const target = hook({
			memoizedState: sampleState(),
			queue: { dispatch: vi.fn() },
		});
		// tag 1 (ClassComponent) は対象外
		mountRoot(fiber(3, { child: fiber(1, { memoizedState: target }) }));

		expect(findCommentStateHook()).toBeNull();
	});

	it("React root が無ければ null", () => {
		expect(findCommentStateHook()).toBeNull();
	});
});
