import * as v from "valibot";
import type { PullRequestProbe } from "./bridge-protocol";

interface Observable<T> {
	(): T;
	(value: T): unknown;
}

export interface PullRequestComment {
	id: number;
	flush: Observable<boolean>;
}

export interface PullRequestStore {
	projectKey: string;
	repoName: string;
	number: number;
	pullRequestCommentArray: Observable<PullRequestComment[]>;
	asPullRequestCommentVM(raw: unknown): PullRequestComment;
	pushComment(comment: PullRequestComment): void;
	pullRequestService: {
		getPullRequestComments(
			project: string,
			repo: string,
			number: number,
			from?: string,
		): PromiseLike<unknown>;
	};
}

const StoreSchema = v.object({
	projectKey: v.string(),
	repoName: v.string(),
	number: v.number(),
	pullRequestCommentArray: v.function(),
	asPullRequestCommentVM: v.function(),
	pushComment: v.function(),
	pullRequestService: v.object({ getPullRequestComments: v.function() }),
});
const CommentSchema = v.object({ id: v.number(), flush: v.function() });
const RawCommentsSchema = v.array(v.looseObject({ id: v.number() }));
const guarded = new WeakSet<PullRequestStore>();
const running = new WeakMap<PullRequestStore, Promise<void>>();

export function findPullRequestStore(
	ko: unknown,
	element: Element | null,
): PullRequestStore | undefined {
	if (!element || !v.is(v.object({ dataFor: v.function() }), ko)) return;
	const root: unknown = ko.dataFor(element);
	if (!v.is(v.object({ store: StoreSchema }), root)) return;
	const store = root.store as unknown as PullRequestStore;
	if (!v.is(v.array(CommentSchema), store.pullRequestCommentArray())) return;
	return store;
}

// from は秒精度の exclusive な下限なので、同じ秒の別コメントを落とさないよう 1 秒戻す。
function oneSecondBefore(created: string): string | undefined {
	const time = Date.parse(created);
	if (Number.isNaN(time)) return;
	return new Date(time - 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

// 内部エンドポイントは public API で変化を見つけたときだけ呼ぶ。
export function syncPullRequest(
	store: PullRequestStore,
	probe: PullRequestProbe,
	isActive: () => boolean = () => true,
): Promise<void> {
	const pending = running.get(store);
	if (pending) return pending;
	if (!guarded.has(store)) {
		const push = store.pushComment;
		// Backlog 自身の投稿後取得とも競合するため、拡張側の追記判定だけでは重複を防げない。
		store.pushComment = function (comment) {
			if (
				this.pullRequestCommentArray().some((known) => known.id === comment.id)
			)
				return;
			push.call(this, comment);
		};
		guarded.add(store);
	}
	const task = (async () => {
		const known = new Set(store.pullRequestCommentArray().map((c) => c.id));
		const added = probe.comments.filter((c) => !known.has(c.id));
		const from = added
			.map((c) => oneSecondBefore(c.created))
			.filter((created) => created !== undefined)
			.sort()[0];
		if (added.length === 0 || from === undefined) return;
		const raw = await store.pullRequestService.getPullRequestComments(
			store.projectKey,
			store.repoName,
			store.number,
			from,
		);
		if (!isActive()) return;
		const result = v.safeParse(RawCommentsSchema, raw);
		if (!result.success) return;
		for (const comment of result.output) {
			if (
				store.pullRequestCommentArray().some((known) => known.id === comment.id)
			)
				continue;
			const vm = store.asPullRequestCommentVM(comment);
			vm.flush(true);
			store.pushComment(vm);
		}
	})();
	running.set(store, task);
	void task.finally(() => running.delete(store)).catch(() => {});
	return task;
}
