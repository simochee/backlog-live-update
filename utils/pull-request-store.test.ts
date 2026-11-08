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
const T0 = "2026-11-08T09:44:08Z";
const T1 = "2026-11-08T09:50:00Z";
function rawDetail(updated = T0, summary = "summary") {
	return {
		updated,
		number: 1,
		summary,
		description: "description",
		formattedDescription: "<p>description</p>",
		status: { id: 1, name: "Open" },
		localized: { created: "2026/11/08" },
		createdUser: { id: 1 },
		attachments: [],
		base: "main",
		branch: "topic",
		assigner: null,
		issue: null,
		deleteBranchWithMerge: false,
	};
}
function rawComment(id: number, created = T0, updated = created) {
	return {
		id,
		created,
		updated,
		content: "before",
		formattedContent: "<p>before</p>",
		notifyResource: null,
	};
}
function viewModel(raw: ReturnType<typeof rawComment>): PullRequestComment {
	return {
		id: raw.id,
		content: raw.content,
		updated: raw.updated,
		flush: observable(false),
		starJsons: observable<unknown[]>([]),
		formattedContent: observable(raw.formattedContent),
		observableNotifyResource: observable<unknown>(null),
		mode: observable(1),
		inProcess: observable(false),
	};
}
function fixture(
	known: number[] = [],
	served = [rawComment(1), rawComment(2)],
) {
	const comments = known.map((id) => viewModel(rawComment(id)));
	const getPullRequestComments = vi.fn().mockResolvedValue(served);
	const getPullRequestComment = vi
		.fn()
		.mockImplementation(async (_p, _r, _n, id: number) =>
			rawComment(id, T0, T1),
		);
	const getPullRequest = vi.fn().mockResolvedValue(rawDetail(T1, "renamed"));
	const pathMap = new Map<string, PullRequestComment[]>();
	const store: PullRequestStore = {
		starJsons: observable<unknown[]>([]),
		pullRequest: observable<unknown>(rawDetail()),
		projectKey: "TEST",
		repoName: "repo",
		number: 1,
		pullRequestCommentArray: Object.assign(() => comments),
		asPullRequestCommentVM: (value) =>
			viewModel(value as ReturnType<typeof rawComment>),
		pushComment: (comment) => {
			comments.push(comment);
		},
		removeComment: (comment) => {
			const index = comments.indexOf(comment);
			if (index >= 0) comments.splice(index, 1);
		},
		pullRequestCommentPathMap: { get: (path) => pathMap.get(path) },
		pullRequestService: {
			getPullRequestComments,
			getPullRequestComment,
			getPullRequest,
		},
	};
	return {
		store,
		comments,
		pathMap,
		getPullRequestComments,
		getPullRequestComment,
		getPullRequest,
	};
}
// 内部エンドポイントとして呼ばれうるページ側の関数を、変化が無い tick で集計する。
function internalCalls(f: ReturnType<typeof fixture>) {
	return [
		f.getPullRequestComments,
		f.getPullRequestComment,
		f.getPullRequest,
	].reduce((sum, fn) => sum + fn.mock.calls.length, 0);
}
const probeOf = (...ids: number[]) => ({
	comments: ids.map((id) => ({ id, created: T0, updated: T0, stars: [] })),
	pullRequest: { updated: T0, stars: [] },
	complete: true,
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
				{ id: 3, created: "2026-11-08T09:44:09Z", updated: T0, stars: [] },
				{ id: 2, created: "2026-11-08T09:44:08Z", updated: T0, stars: [] },
				{ id: 1, created: "2026-11-08T09:44:07Z", updated: T0, stars: [] },
			],
			pullRequest: { updated: T0, stars: [] },
			complete: true,
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

describe("PR コメントの編集の同期", () => {
	const edited = (id: number) => ({
		comments: [{ id, created: T0, updated: T1, stars: [] }],
		pullRequest: { updated: T0, stars: [] },
		complete: true,
	});
	it("更新日時が進んだコメントだけ整形済みの本文を取り直して反映する", async () => {
		const { store, comments, getPullRequestComment } = fixture([1, 2]);
		await syncPullRequest(store, {
			comments: [
				{ id: 1, created: T0, updated: T1, stars: [] },
				{ id: 2, created: T0, updated: T0, stars: [] },
			],
			pullRequest: { updated: T0, stars: [] },
			complete: true,
		});
		expect(getPullRequestComment).toHaveBeenCalledOnce();
		expect(getPullRequestComment).toHaveBeenCalledWith("TEST", "repo", 1, 1);
		expect(comments[0]?.updated).toBe(T1);
		expect(comments[0]?.formattedContent).toHaveBeenLastCalledWith(
			"<p>before</p>",
		);
		expect(comments[0]?.observableNotifyResource).toHaveBeenCalledWith(null);
		expect(comments[1]?.formattedContent).not.toHaveBeenCalledWith(
			expect.anything(),
		);
	});
	it("変化が無ければ内部エンドポイントを呼ばない", async () => {
		const { store, getPullRequestComment, getPullRequestComments } = fixture([
			1, 2,
		]);
		await syncPullRequest(store, probeOf(1, 2));
		expect(getPullRequestComment).not.toHaveBeenCalled();
		expect(getPullRequestComments).not.toHaveBeenCalled();
	});
	it("編集中や送信中のコメントは書き換えない", async () => {
		const { store, comments, getPullRequestComment } = fixture([1, 2]);
		comments[0]?.mode(2);
		comments[1]?.inProcess(true);
		await syncPullRequest(store, {
			comments: [
				{ id: 1, created: T0, updated: T1, stars: [] },
				{ id: 2, created: T0, updated: T1, stars: [] },
			],
			pullRequest: { updated: T0, stars: [] },
			complete: true,
		});
		expect(getPullRequestComment).not.toHaveBeenCalled();
		expect(comments.map((c) => c.updated)).toEqual([T0, T0]);
	});
	it("取得中に編集が始まったコメントは古い取得結果で上書きしない", async () => {
		const { store, comments, getPullRequestComment } = fixture([1]);
		getPullRequestComment.mockImplementation(() => {
			comments[0]?.mode(2);
			return Promise.resolve(rawComment(1, T0, T1));
		});
		await syncPullRequest(store, edited(1));
		expect(comments[0]?.updated).toBe(T0);
	});
	it("取得中に自分の保存が完了したコメントは上書きしない", async () => {
		const { store, comments, getPullRequestComment } = fixture([1]);
		getPullRequestComment.mockImplementation(() => {
			if (comments[0]) comments[0].content = "saved locally";
			return Promise.resolve(rawComment(1, T0, T1));
		});
		await syncPullRequest(store, edited(1));
		expect(comments[0]?.content).toBe("saved locally");
	});
	it("ページの更新日時の方が新しいコメントは取り直さない", async () => {
		const { store, getPullRequestComment } = fixture([1]);
		await syncPullRequest(store, {
			comments: [
				{ id: 1, created: T0, updated: "2026-11-08T09:00:00Z", stars: [] },
			],
			pullRequest: { updated: T0, stars: [] },
			complete: true,
		});
		expect(getPullRequestComment).not.toHaveBeenCalled();
	});
	it("不正な応答では反映しない", async () => {
		const { store, comments, getPullRequestComment } = fixture([1]);
		getPullRequestComment.mockResolvedValue({ error: true });
		await syncPullRequest(store, edited(1));
		expect(comments[0]?.updated).toBe(T0);
	});
});

describe("PR コメントの削除の同期", () => {
	it("窓の範囲内にあるはずなのに public API に無いコメントを取り除く", async () => {
		const { store, comments, getPullRequestComment } = fixture([1, 2, 3]);
		await syncPullRequest(store, probeOf(1, 3));
		expect(comments.map((c) => c.id)).toEqual([1, 3]);
		expect(getPullRequestComment).not.toHaveBeenCalled();
	});
	it("インライン用の登録からも取り除く", async () => {
		const { store, comments, pathMap } = fixture([1, 2, 3]);
		const target = comments[1];
		if (!target) throw new Error("fixture");
		target.filePath = "src/a.ts";
		pathMap.set("src/a.ts", [target]);
		await syncPullRequest(store, probeOf(1, 3));
		expect(pathMap.get("src/a.ts")).toEqual([]);
	});
	it("窓より古いコメントは削除を判断できないので残す", async () => {
		const { store, comments } = fixture([1, 5, 6, 7, 8]);
		await syncPullRequest(store, {
			comments: [6, 8].map((id) => ({
				id,
				created: T0,
				updated: T0,
				stars: [],
			})),
			pullRequest: { updated: T0, stars: [] },
			complete: false,
		});
		expect(comments.map((c) => c.id)).toEqual([1, 5, 6, 8]);
	});
	it("全件を取得できた場合は最も古いコメントの削除も反映する", async () => {
		const { store, comments } = fixture([1, 2]);
		await syncPullRequest(store, probeOf(2));
		expect(comments.map((c) => c.id)).toEqual([2]);
	});
	it("取得後に投稿された最新より新しいコメントは削除しない", async () => {
		const { store, comments } = fixture([1, 2, 9]);
		await syncPullRequest(store, probeOf(1, 2));
		expect(comments.map((c) => c.id)).toEqual([1, 2, 9]);
	});
	it("編集中や送信中のコメントは削除しない", async () => {
		const { store, comments } = fixture([1, 2, 3, 4]);
		comments[1]?.mode(2);
		comments[2]?.inProcess(true);
		await syncPullRequest(store, probeOf(1, 4));
		expect(comments.map((c) => c.id)).toEqual([1, 2, 3, 4]);
	});
	it("public API が空のときは何も削除しない", async () => {
		const { store, comments } = fixture([1, 2]);
		await syncPullRequest(store, probeOf());
		expect(comments.map((c) => c.id)).toEqual([1, 2]);
	});
});

describe("PR 本文とコメントのスターの同期", () => {
	const star = (id: number, userId = 7) => ({
		id,
		url: "https://example.backlog.com/git/TEST/repo/pullRequests/1",
		userId,
		userName: `user${userId}`,
		comment: null,
	});
	const withStars = (
		comments: Record<number, ReturnType<typeof star>[]>,
		pullRequest: ReturnType<typeof star>[] = [],
	) => ({
		comments: Object.entries(comments).map(([id, stars]) => ({
			id: Number(id),
			created: T0,
			updated: T0,
			stars,
		})),
		pullRequest: { updated: T0, stars: pullRequest },
		complete: true,
	});
	it("public API のスターから画面の形を組み立てて内部エンドポイントを呼ばずに反映する", async () => {
		const { store, comments, getPullRequestComment, getPullRequestComments } =
			fixture([1, 2]);
		await syncPullRequest(
			store,
			withStars({ 1: [star(10)], 2: [] }, [star(20)]),
		);
		expect(comments[0]?.starJsons).toHaveBeenLastCalledWith([
			{
				id: 10,
				url: "https://example.backlog.com/git/TEST/repo/pullRequests/1",
				userId: 7,
				userName: "user7",
				userIcon: "UserLargeIcon.action?iconId=7",
				comment: null,
			},
		]);
		expect(store.starJsons).toHaveBeenLastCalledWith([
			expect.objectContaining({ id: 20 }),
		]);
		expect(comments[1]?.starJsons).not.toHaveBeenCalledWith(expect.anything());
		expect(getPullRequestComment).not.toHaveBeenCalled();
		expect(getPullRequestComments).not.toHaveBeenCalled();
	});
	it("スターの解除も反映する", async () => {
		const { store, comments } = fixture([1]);
		comments[0]?.starJsons([{ id: 10 }]);
		store.starJsons([{ id: 20 }]);
		await syncPullRequest(store, withStars({ 1: [] }, []));
		expect(comments[0]?.starJsons()).toEqual([]);
		expect(store.starJsons()).toEqual([]);
	});
	it("スターの集合が同じなら再描画しない", async () => {
		const { store, comments } = fixture([1]);
		const existing = { id: 10, userIcon: "kept" };
		comments[0]?.starJsons([existing]);
		vi.mocked(comments[0]?.starJsons ?? vi.fn()).mockClear();
		await syncPullRequest(store, withStars({ 1: [star(10)] }));
		expect(comments[0]?.starJsons).not.toHaveBeenCalledWith(expect.anything());
		expect(comments[0]?.starJsons()).toEqual([existing]);
	});
	it("既にあるスターは画面の値を残し、増えた分だけ組み立てる", async () => {
		const { store, comments } = fixture([1]);
		const existing = { id: 10, userIcon: "kept" };
		comments[0]?.starJsons([existing]);
		await syncPullRequest(store, withStars({ 1: [star(10), star(11, 8)] }));
		expect(comments[0]?.starJsons()).toEqual([
			existing,
			expect.objectContaining({ id: 11, userId: 8 }),
		]);
	});
	it("編集中や送信中のコメントのスターは書き換えない", async () => {
		const { store, comments } = fixture([1, 2]);
		comments[0]?.mode(2);
		comments[1]?.inProcess(true);
		await syncPullRequest(store, withStars({ 1: [star(10)], 2: [star(11)] }));
		expect(comments.map((c) => c.starJsons())).toEqual([[], []]);
	});
});

describe("PR 本体の同期", () => {
	const updated = (at: string) => ({
		...probeOf(),
		pullRequest: { updated: at, stars: [] },
	});
	it("public API の更新日時が進んだときだけ本体を取り直して反映する", async () => {
		const { store, getPullRequest } = fixture();
		await syncPullRequest(store, updated(T0), undefined, () => false);
		expect(getPullRequest).not.toHaveBeenCalled();
		await syncPullRequest(store, updated(T1), undefined, () => false);
		expect(getPullRequest).toHaveBeenCalledWith("TEST", "repo", 1);
		expect(store.pullRequest()).toMatchObject({
			summary: "renamed",
			updated: T1,
		});
	});
	it("詳細エディタやフォームの操作中は本体を取り直さない", async () => {
		const { store, getPullRequest } = fixture();
		await syncPullRequest(store, updated(T1), undefined, () => true);
		expect(getPullRequest).not.toHaveBeenCalled();
		expect(store.pullRequest()).toMatchObject({ summary: "summary" });
	});
	it("取得中に自分の編集が保存された本体は古い取得結果で上書きしない", async () => {
		const { store, getPullRequest } = fixture();
		getPullRequest.mockImplementation(() => {
			store.pullRequest(rawDetail("2026-11-08T09:55:00Z", "saved locally"));
			return Promise.resolve(rawDetail(T1, "renamed"));
		});
		await syncPullRequest(store, updated(T1), undefined, () => false);
		expect(store.pullRequest()).toMatchObject({ summary: "saved locally" });
	});
	it("遷移後や不正な応答では本体を書き換えない", async () => {
		const { store, getPullRequest } = fixture();
		await syncPullRequest(
			store,
			updated(T1),
			() => false,
			() => false,
		);
		expect(getPullRequest).not.toHaveBeenCalled();
		getPullRequest.mockResolvedValue({ error: true });
		await syncPullRequest(store, updated(T1), undefined, () => false);
		expect(store.pullRequest()).toMatchObject({ summary: "summary" });
	});
	it("本体が未取得のページでは何もしない", async () => {
		const { store, getPullRequest } = fixture();
		store.pullRequest({});
		await syncPullRequest(store, updated(T1), undefined, () => false);
		expect(getPullRequest).not.toHaveBeenCalled();
	});
});

describe("内部エンドポイントの呼び出し", () => {
	it("public API に変化が無い tick ではページ側の関数を一切呼ばない", async () => {
		const f = fixture([1, 2]);
		const steady = {
			comments: [1, 2].map((id) => ({
				id,
				created: T0,
				updated: T0,
				stars: [],
			})),
			pullRequest: { updated: T0, stars: [] },
			complete: true,
		};
		await syncPullRequest(f.store, steady, undefined, () => false);
		await syncPullRequest(f.store, steady, undefined, () => false);
		expect(internalCalls(f)).toBe(0);
	});
});

describe("PR 本体の取得結果", () => {
	it("状態と担当者などを持つ本体を同じ更新として反映する", async () => {
		const { store, getPullRequest } = fixture();
		getPullRequest.mockResolvedValue({
			...rawDetail(T1),
			status: { id: 4, name: "Merged" },
			assigner: { id: 9 },
			issue: { id: 3 },
		});
		await syncPullRequest(
			store,
			{ ...probeOf(), pullRequest: { updated: T1, stars: [] } },
			undefined,
			() => false,
		);
		expect(store.pullRequest()).toMatchObject({
			status: { name: "Merged" },
			assigner: { id: 9 },
			issue: { id: 3 },
		});
	});
	it("検証に使わない項目も取得したまま本体に反映する", async () => {
		const { store, getPullRequest } = fixture();
		const fetched = {
			...rawDetail(T1),
			status: { id: 4, name: "Merged", color: "#a1a1a1" },
			mergeAt: T1,
		};
		getPullRequest.mockResolvedValue(fetched);
		await syncPullRequest(
			store,
			{ ...probeOf(), pullRequest: { updated: T1, stars: [] } },
			undefined,
			() => false,
		);
		expect(store.pullRequest()).toEqual(fetched);
	});
});
