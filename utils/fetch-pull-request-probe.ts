import { type createClient, getPullRequestComments } from "backlog-js";
import type { PullRequestProbe } from "./bridge-protocol";

// public API の count 上限。新着の検知はこの窓の範囲に限る。
export const PROBE_COMMENT_COUNT = 100;

export interface PullRequestRef {
	projectKey: string;
	repoName: string;
	number: number;
}

// ページ側の内部エンドポイントを呼ぶかどうかの判断材料を、public API だけで集める。
export async function fetchPullRequestProbe(
	backlog: ReturnType<typeof createClient>,
	{ projectKey, repoName, number }: PullRequestRef,
): Promise<PullRequestProbe | null> {
	try {
		const comments = await getPullRequestComments(
			backlog,
			encodeURIComponent(projectKey),
			encodeURIComponent(repoName),
			number,
			{ count: PROBE_COMMENT_COUNT, order: "desc" },
		);
		return {
			comments: comments.map(({ id, created, updated }) => ({
				id,
				created,
				updated,
			})),
			complete: comments.length < PROBE_COMMENT_COUNT,
		};
	} catch {
		return null;
	}
}
