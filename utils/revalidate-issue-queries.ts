import type { QueryClientLike } from "./react-fiber";

/** 対象課題を識別する値。 */
export interface IssueRef {
	issueKey: string;
	issueId: number;
}

/**
 * queryKey が当該課題を参照しているか判定する。
 *
 * Backlog の課題スコープ query は issueKey 文字列(`["issues","PLAY_GROUND-47"]`,
 * `["viewIssueParams","PLAY_GROUND-47"]`)と issueId 数値(`["issues",152881077]`,
 * `["GetInitialComments",{issueId:...}]`, `["ContactList","issue",152881077]` 等)が混在する
 * ため、key を deep scan し issueKey か issueId に厳密一致する要素があれば true とする。
 * projectId 等の別 id は一致しないので、グローバル query は誤 match しない。
 */
export function queryKeyMatchesIssue(key: unknown, issue: IssueRef): boolean {
	if (key === issue.issueKey || key === issue.issueId) return true;
	if (Array.isArray(key)) {
		return key.some((k) => queryKeyMatchesIssue(k, issue));
	}
	if (typeof key === "object" && key !== null) {
		return Object.values(key).some((v) => queryKeyMatchesIssue(v, issue));
	}
	return false;
}

/**
 * query cache を走査し、当該課題を参照する query のみ invalidate する。
 * invalidate した件数を返す(0 なら対象 query 無し)。Backlog が当該 query を内部 API で
 * 再 fetch し、変化したフィールドを自前で再 render する。
 */
export function revalidateIssueQueries(
	client: QueryClientLike,
	issue: IssueRef,
): number {
	let count = 0;
	for (const query of client.getQueryCache().getAll()) {
		if (queryKeyMatchesIssue(query.queryKey, issue)) {
			client.invalidateQueries({ queryKey: query.queryKey });
			count++;
		}
	}
	return count;
}
