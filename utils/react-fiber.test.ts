import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
	type CommentState,
	findCommentStarMapHook,
	findCommentStateHook,
	findQueryClient,
	findRootFiber,
	isCommentState,
	walkFibers,
	walkHooks,
} from "./react-fiber";

type Fiber = {
	tag: number;
	child: Fiber | null;
	sibling: Fiber | null;
	memoizedState: unknown;
	memoizedProps?: Record<string, unknown> | null;
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
	return container;
}

afterEach(() => {
	document.body.replaceChildren();
});

describe("findRootFiber", () => {
	it("キャッシュ済み container からも最新の current を返す", () => {
		const first = fiber(3);
		const container = mountRoot(first);
		expect(findRootFiber()).toBe(first);
		const next = fiber(3);
		(container as unknown as Record<string, unknown>).__reactContainer$test = {
			stateNode: { current: next },
		};
		expect(findRootFiber()).toBe(next);
	});

	it("container が DOM から外れたら新しい root を探す", () => {
		const container = mountRoot(fiber(3));
		findRootFiber();
		container.remove();
		const next = fiber(3);
		mountRoot(next);
		expect(findRootFiber()).toBe(next);
	});

	it("container の key が消えたら新しい root を探す", () => {
		const container = mountRoot(fiber(3));
		findRootFiber();
		delete (container as unknown as Record<string, unknown>)
			.__reactContainer$test;
		const next = fiber(3);
		mountRoot(next);
		expect(findRootFiber()).toBe(next);
	});

	it("探索開始要素の外にあるキャッシュを返さない", () => {
		mountRoot(fiber(3));
		findRootFiber();
		expect(findRootFiber(document.createElement("div"))).toBeNull();
	});
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

describe("findCommentStarMapHook", () => {
	const star = (commentId: number) => ({
		id: 100,
		url: `https://example.backlog.com/view/A-1#comment-${commentId}`,
		userId: 1,
		userName: "alice",
		userIcon: "NulabAccountIcon.action?userId=1&name=large",
		comment: null,
	});

	/** `useStarsForIssueComments` と同じく starMap → 読み込みキューの順で hook を並べる。 */
	const starHooks = (starMap: unknown) => {
		const dispatch = vi.fn();
		const loadingQueue = hook({
			memoizedState: { isLoading: false, queue: [] },
			queue: { dispatch: vi.fn() },
		});
		const starMapHook = hook({
			memoizedState: starMap,
			queue: { dispatch },
			next: loadingQueue,
		});
		return { head: starMapHook, dispatch };
	};

	it("star が 1 件も無い課題でも、先に出る無関係な空 object state ではなく starMap を返す", () => {
		const unrelatedEmpty = hook({
			memoizedState: {},
			queue: { dispatch: vi.fn() },
		});
		const header = fiber(0, { memoizedState: unrelatedEmpty });
		const starMap = {};
		const { head, dispatch } = starHooks(starMap);
		header.sibling = fiber(0, { memoizedState: head });
		mountRoot(fiber(3, { child: header }));

		const found = findCommentStarMapHook();

		expect(found?.state).toBe(starMap);
		found?.dispatch({ "7": [star(7)] });
		expect(dispatch).toHaveBeenCalledWith({ "7": [star(7)] });
	});

	it("starMap が空でも、後に出る配列だけを持つ state ではなく starMap を返す", () => {
		const starMap = {};
		const { head } = starHooks(starMap);
		const form = hook({
			memoizedState: { userIds: [] },
			queue: { dispatch: vi.fn() },
		});
		const viewIssue = fiber(0, {
			memoizedState: head,
			child: fiber(0, { memoizedState: form }),
		});
		mountRoot(fiber(3, { child: viewIssue }));

		expect(findCommentStarMapHook()?.state).toBe(starMap);
	});

	it("読み込みキューが後に続かない starMap 形の state しか無ければ null", () => {
		const lone = hook({
			memoizedState: { "7": [star(7)] },
			queue: { dispatch: vi.fn() },
		});
		mountRoot(fiber(3, { child: fiber(0, { memoizedState: lone }) }));

		expect(findCommentStarMapHook()).toBeNull();
	});
});

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

	it("client と value の両方が存在するとき client を優先して返す", () => {
		const qc1 = queryClient();
		const qc2 = queryClient();
		const provider = fiber(0, { memoizedProps: { client: qc1, value: qc2 } });
		mountRoot(fiber(3, { child: provider }));
		expect(findQueryClient()).toBe(qc1);
	});

	it("React root が無ければ null", () => {
		expect(findQueryClient()).toBeNull();
	});
});
