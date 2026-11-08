import {
	type createClient,
	getPullRequest,
	getPullRequestComments,
} from "backlog-js";
import type { ProbeStar, PullRequestProbe } from "./bridge-protocol";

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

// ページ側の内部エンドポイントを呼ぶかどうかの判断材料を、public API だけで集める。
export async function fetchPullRequestProbe(
	backlog: ReturnType<typeof createClient>,
	{ projectKey, repoName, number }: PullRequestRef,
): Promise<PullRequestProbe | null> {
	try {
		const project = encodeURIComponent(projectKey);
		const repository = encodeURIComponent(repoName);
		const [comments, pullRequest] = await Promise.all([
			getPullRequestComments(backlog, project, repository, number, {
				count: PROBE_COMMENT_COUNT,
				order: "desc",
			}),
			getPullRequest(backlog, project, repository, number),
		]);
		return {
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
		};
	} catch {
		return null;
	}
}
