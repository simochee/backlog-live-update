import { describe, expect, it, vi } from "vite-plus/test";
import {
	findPullRequestStore,
	type PullRequestComment,
	type PullRequestStore,
	syncPullRequest,
} from "./pull-request-store";

function observable<T>(initial: T) {
	let value = initial;
	return vi.fn((...args: [T?]) => {
		if (args.length) value = args[0] as T;
		return value;
	});
}
function rawComment(id: number, created = "2026-11-08T09:44:08Z") {
	return { id, created };
}
function fixture(
	known: number[] = [],
	served = [rawComment(1), rawComment(2)],
) {
	const comments: PullRequestComment[] = known.map((id) => ({
		id,
		flush: observable(false),
	}));
	const getPullRequestComments = vi.fn().mockResolvedValue(served);
	const store: PullRequestStore = {
		projectKey: "TEST",
		repoName: "repo",
		number: 1,
		pullRequestCommentArray: Object.assign(() => comments),
		asPullRequestCommentVM: (value) => ({
			id: (value as { id: number }).id,
			flush: observable(false),
		}),
		pushComment: (comment) => {
			comments.push(comment);
		},
		pullRequestService: { getPullRequestComments },
	};
	return { store, comments, getPullRequestComments };
}
const probeOf = (...ids: number[]) => ({
	comments: ids.map((id) => rawComment(id)),
});

describe("PR の新着コメントの同期", () => {
	it("ページに無いコメントが public API にあるときだけ内部エンドポイントで取得して追記する", async () => {
		const { store, comments, getPullRequestComments } = fixture([1]);
		await syncPullRequest(store, probeOf(1, 2));
		expect(comments.map((c) => c.id)).toEqual([1, 2]);
		expect(comments[1]?.flush).toHaveBeenCalledWith(true);
		expect(getPullRequestComments).toHaveBeenCalledOnce();
	});
	it("変化が無ければ内部エンドポイントを呼ばない", async () => {
		const { store, getPullRequestComments } = fixture([1, 2]);
		await syncPullRequest(store, probeOf(1, 2));
		await syncPullRequest(store, probeOf());
		expect(getPullRequestComments).not.toHaveBeenCalled();
	});
	it("新着の作成日時の 1 秒前を下限にして同じ秒の別コメントも取りこぼさない", async () => {
		const { store, comments, getPullRequestComments } = fixture(
			[1],
			[rawComment(1), rawComment(2), rawComment(3)],
		);
		await syncPullRequest(store, {
			comments: [
				rawComment(3, "2026-11-08T09:44:09Z"),
				rawComment(2, "2026-11-08T09:44:08Z"),
				rawComment(1, "2026-11-08T09:44:07Z"),
			],
		});
		expect(getPullRequestComments).toHaveBeenCalledWith(
			"TEST",
			"repo",
			1,
			"2026-11-08T09:44:07Z",
		);
		expect(comments.map((c) => c.id)).toEqual([1, 2, 3]);
	});
	it("再取得でも既にあるコメントは重複しない", async () => {
		const { store, comments } = fixture();
		await syncPullRequest(store, probeOf(1, 2));
		await syncPullRequest(store, probeOf(1, 2, 3));
		expect(comments.map((c) => c.id)).toEqual([1, 2]);
	});
	it("取得中の Backlog 自身の追記と競合しても重複しない", async () => {
		const { store, comments } = fixture();
		const pending = syncPullRequest(store, probeOf(1, 2));
		store.pushComment(store.asPullRequestCommentVM(rawComment(1)));
		await pending;
		store.pushComment(store.asPullRequestCommentVM(rawComment(2)));
		expect(comments.map((c) => c.id)).toEqual([1, 2]);
	});
	it("同時に要求されても取得は一度だけ行う", async () => {
		const { store, getPullRequestComments } = fixture();
		await Promise.all([
			syncPullRequest(store, probeOf(1, 2)),
			syncPullRequest(store, probeOf(1, 2)),
		]);
		expect(getPullRequestComments).toHaveBeenCalledTimes(1);
	});
	it("遷移後や不正な応答では追記しない", async () => {
		const { store, comments, getPullRequestComments } = fixture();
		await syncPullRequest(store, probeOf(1), () => false);
		getPullRequestComments.mockResolvedValue({ error: true });
		await syncPullRequest(store, probeOf(1));
		expect(comments).toEqual([]);
	});
	it("必要な store が見つからなければ何もしない", () => {
		expect(
			findPullRequestStore({}, document.createElement("div")),
		).toBeUndefined();
		expect(
			findPullRequestStore(
				{ dataFor: () => ({ store: {} }) },
				document.createElement("div"),
			),
		).toBeUndefined();
		const { store } = fixture();
		expect(
			findPullRequestStore(
				{ dataFor: () => ({ store }) },
				document.createElement("div"),
			),
		).toBe(store);
	});
});
