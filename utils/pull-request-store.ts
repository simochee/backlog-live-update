import * as v from "valibot";
import type { ProbeStar, PullRequestProbe } from "./bridge-protocol";

interface Observable<T> {
	(): T;
	(value: T): unknown;
}

interface StarTarget {
	starJsons: Observable<unknown[]>;
}

export interface PullRequestComment extends StarTarget {
	id: number;
	flush: Observable<boolean>;
	content: string;
	updated: string;
	formattedContent: Observable<string>;
	observableNotifyResource: Observable<unknown>;
	mode: Observable<number>;
	inProcess: Observable<boolean>;
	filePath?: string | null;
}

export interface PullRequestStore extends StarTarget {
	pullRequest: Observable<unknown>;
	projectKey: string;
	repoName: string;
	number: number;
	pullRequestCommentArray: Observable<PullRequestComment[]>;
	asPullRequestCommentVM(raw: unknown): PullRequestComment;
	pushComment(comment: PullRequestComment): void;
	removeComment(comment: PullRequestComment): void;
	pullRequestCommentPathMap: {
		get(path: string): PullRequestComment[] | undefined;
	};
	pullRequestService: {
		getPullRequest(
			project: string,
			repo: string,
			number: number,
		): PromiseLike<unknown>;
		getPullRequestComment(
			project: string,
			repo: string,
			number: number,
			id: number,
		): PromiseLike<unknown>;
		getPullRequestComments(
			project: string,
			repo: string,
			number: number,
			from?: string,
		): PromiseLike<unknown>;
	};
}

const StoreSchema = v.object({
	starJsons: v.function(),
	pullRequest: v.function(),
	projectKey: v.string(),
	repoName: v.string(),
	number: v.number(),
	pullRequestCommentArray: v.function(),
	asPullRequestCommentVM: v.function(),
	pushComment: v.function(),
	removeComment: v.function(),
	pullRequestCommentPathMap: v.object({ get: v.function() }),
	pullRequestService: v.object({
		getPullRequestComments: v.function(),
		getPullRequestComment: v.function(),
		getPullRequest: v.function(),
	}),
});
const CommentSchema = v.object({
	starJsons: v.function(),
	id: v.number(),
	content: v.string(),
	updated: v.string(),
	flush: v.function(),
	formattedContent: v.function(),
	observableNotifyResource: v.function(),
	mode: v.function(),
	inProcess: v.function(),
});
const RawCommentsSchema = v.array(v.looseObject({ id: v.number() }));
const RawCommentSchema = v.looseObject({
	id: v.number(),
	content: v.string(),
	updated: v.string(),
	formattedContent: v.string(),
	notifyResource: v.unknown(),
});
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

async function appendNewComments(
	store: PullRequestStore,
	probe: PullRequestProbe,
	isActive: () => boolean,
): Promise<void> {
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
}

const isIdle = (comment: PullRequestComment) =>
	comment.mode() === 1 && !comment.inProcess();

// public API の窓より古いコメントは削除を判断できない。窓より新しい id は、取得後に
// 投稿されたものかもしれないため触らない。
function removeDeletedComments(
	store: PullRequestStore,
	probe: PullRequestProbe,
): void {
	const ids = probe.comments.map((c) => c.id);
	if (ids.length === 0) return;
	const newest = Math.max(...ids);
	const oldest = probe.complete ? -Infinity : Math.min(...ids);
	for (const comment of [...store.pullRequestCommentArray()]) {
		if (
			comment.id < oldest ||
			comment.id > newest ||
			ids.includes(comment.id) ||
			!isIdle(comment)
		)
			continue;
		store.removeComment(comment);
		if (!comment.filePath) continue;
		const sameFile = store.pullRequestCommentPathMap.get(comment.filePath);
		const index = sameFile?.indexOf(comment) ?? -1;
		if (sameFile && index >= 0) sameFile.splice(index, 1);
	}
}

const starIdsOf = (stars: readonly unknown[]) =>
	stars
		.map((star) => (star as { id?: unknown }).id)
		.sort()
		.join();

// 画面の star は public API の star から組み立てられるので、内部エンドポイントは呼ばない。
function reflectStarsOf(target: StarTarget, published: readonly ProbeStar[]) {
	const current = target.starJsons();
	if (starIdsOf(current) === starIdsOf(published)) return;
	target.starJsons(
		published.map(
			(star) =>
				current.find((known) => (known as { id?: unknown }).id === star.id) ?? {
					id: star.id,
					url: star.url,
					userId: star.userId,
					userName: star.userName,
					userIcon: `UserLargeIcon.action?iconId=${star.userId}`,
					comment: star.comment,
				},
		),
	);
}

function reflectStars(store: PullRequestStore, probe: PullRequestProbe): void {
	reflectStarsOf(store, probe.pullRequest.stars);
	for (const comment of store.pullRequestCommentArray()) {
		const published = probe.comments.find((c) => c.id === comment.id);
		if (published && isIdle(comment)) reflectStarsOf(comment, published.stars);
	}
}

function reflectEditedComments(
	store: PullRequestStore,
	probe: PullRequestProbe,
	isActive: () => boolean,
): Promise<unknown> {
	const edited = store
		.pullRequestCommentArray()
		.filter((comment) => {
			const published = probe.comments.find((c) => c.id === comment.id);
			return (
				published !== undefined &&
				isIdle(comment) &&
				Date.parse(published.updated) > Date.parse(comment.updated)
			);
		})
		.map((comment) => ({
			comment,
			content: comment.content,
			updated: comment.updated,
			formatted: comment.formattedContent(),
		}));
	return Promise.allSettled(
		edited.map(async (snapshot) => {
			const { comment } = snapshot;
			const raw = await store.pullRequestService.getPullRequestComment(
				store.projectKey,
				store.repoName,
				store.number,
				comment.id,
			);
			const result = v.safeParse(RawCommentSchema, raw);
			if (!isActive() || !result.success || result.output.id !== comment.id)
				return;
			// 通信中に編集や自分の保存が始まった・終わったコメントは、古い取得結果で上書きしない。
			if (
				!store.pullRequestCommentArray().includes(comment) ||
				!isIdle(comment) ||
				comment.content !== snapshot.content ||
				comment.updated !== snapshot.updated ||
				comment.formattedContent() !== snapshot.formatted
			)
				return;
			comment.content = result.output.content;
			comment.updated = result.output.updated;
			comment.formattedContent(result.output.formattedContent);
			comment.observableNotifyResource(result.output.notifyResource);
		}),
	);
}

// 内部エンドポイントは public API で変化を見つけたときだけ呼ぶ。
export function syncPullRequest(
	store: PullRequestStore,
	probe: PullRequestProbe,
	isActive: () => boolean = () => true,
	isDetailBusy: () => boolean = () => true,
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
		await appendNewComments(store, probe, isActive);
		if (!isActive()) return;
		removeDeletedComments(store, probe);
		reflectStars(store, probe);
		await reflectEditedComments(store, probe, isActive);
		await reflectDetail(store, probe, isActive, isDetailBusy);
	})();
	running.set(store, task);
	void task.finally(() => running.delete(store)).catch(() => {});
	return task;
}

const DetailSchema = v.looseObject({
	updated: v.string(),
	number: v.number(),
	summary: v.string(),
	description: v.string(),
	formattedDescription: v.string(),
	status: v.object({ id: v.number(), name: v.string() }),
	localized: v.looseObject({ created: v.string() }),
	createdUser: v.looseObject({ id: v.number() }),
	attachments: v.array(v.looseObject({ size: v.number() })),
	base: v.string(),
	branch: v.string(),
	assigner: v.nullable(v.looseObject({ id: v.number() })),
	issue: v.nullable(v.looseObject({ id: v.number() })),
	deleteBranchWithMerge: v.boolean(),
});

export function isPullRequestDetailBusy(
	ko: unknown,
	element: Element | null,
): boolean {
	if (!element || !v.is(v.object({ dataFor: v.function() }), ko)) return true;
	const root: unknown = ko.dataFor(element);
	if (
		!v.is(
			v.object({
				pullRequestDetailEditor: v.object({
					visible: v.function(),
					inUpdate: v.function(),
				}),
				pullRequestDetail: v.object({
					mergeFormVisible: v.function(),
					closeFormVisible: v.function(),
				}),
			}),
			root,
		)
	)
		return true;
	return !!(
		root.pullRequestDetailEditor.visible() ||
		root.pullRequestDetailEditor.inUpdate() ||
		root.pullRequestDetail.mergeFormVisible() ||
		root.pullRequestDetail.closeFormVisible()
	);
}

async function reflectDetail(
	store: PullRequestStore,
	probe: PullRequestProbe,
	isActive: () => boolean,
	isBusy: () => boolean,
): Promise<void> {
	if (!isActive() || isBusy()) return;
	const before = v.safeParse(DetailSchema, store.pullRequest());
	if (
		!before.success ||
		!(Date.parse(probe.pullRequest.updated) > Date.parse(before.output.updated))
	)
		return;
	const response = await store.pullRequestService.getPullRequest(
		store.projectKey,
		store.repoName,
		store.number,
	);
	if (!isActive() || isBusy()) return;
	const current = v.safeParse(DetailSchema, store.pullRequest());
	const next = v.safeParse(DetailSchema, response);
	// 通信中に自分の編集が保存された場合、古い取得結果で上書きしない。
	if (
		!current.success ||
		!next.success ||
		current.output.updated !== before.output.updated ||
		next.output.updated < current.output.updated
	)
		return;
	store.pullRequest(next.output);
}
