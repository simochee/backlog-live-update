import {
	type createClient,
	getGitRepository,
	getPullRequest,
	getPullRequestComments,
} from "backlog-js";
import type { ProbeStar, PullRequestProbe } from "./bridge-protocol";
import type { PushTarget } from "./detect-pull-request-push";

// public API の count 上限。新着の検知はこの窓の範囲に限る。
export const PROBE_COMMENT_COUNT = 100;

export interface PullRequestRef {
	projectKey: string;
	repoName: string;
	number: number;
}

interface PublicStar {
	id: number;
	url: string;
	comment?: string | null;
	presenter?: { id: number; name: string } | null;
}

function toProbeStars(
	stars: readonly PublicStar[] | null | undefined,
): ProbeStar[] {
	return (stars ?? []).flatMap(({ id, url, comment, presenter }) =>
		presenter
			? [
					{
						id,
						url,
						userId: presenter.id,
						userName: presenter.name,
						comment: comment ?? null,
					},
				]
			: [],
	);
}

export interface FetchedPullRequestProbe {
	probe: Omit<PullRequestProbe, "historyChanged">;
	// リポジトリ全体の最終 push 日時と PR のブランチ。ブランチ単位の先頭コミットは public API に無い。
	push: PushTarget;
}

// ページ側の内部エンドポイントを呼ぶかどうかの判断材料を、public API だけで集める。
export async function fetchPullRequestProbe(
	backlog: ReturnType<typeof createClient>,
	{ projectKey, repoName, number }: PullRequestRef,
): Promise<FetchedPullRequestProbe | null> {
	try {
		const project = encodeURIComponent(projectKey);
		const repoPath = encodeURIComponent(repoName);
		const [comments, pullRequest, repository] = await Promise.all([
			getPullRequestComments(backlog, project, repoPath, number, {
				count: PROBE_COMMENT_COUNT,
				order: "desc",
			}),
			getPullRequest(backlog, project, repoPath, number),
			getGitRepository(backlog, project, repoPath),
		]);
		return {
			probe: {
				comments: comments.map(({ id, created, updated, stars }) => ({
					id,
					created,
					updated,
					stars: toProbeStars(stars),
				})),
				pullRequest: {
					updated: pullRequest.updated,
					stars: toProbeStars(pullRequest.stars),
				},
				complete: comments.length < PROBE_COMMENT_COUNT,
			},
			push: {
				pushedAt: repository.pushedAt ?? null,
				repositoryId: pullRequest.repositoryId,
				branch: pullRequest.branch,
				base: pullRequest.base,
			},
		};
	} catch {
		return null;
	}
}
