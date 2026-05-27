import type { IssueRef } from "./bridge-protocol";
import type { QueryClientLike } from "./react-fiber";

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
 * 当該課題を参照する query のみを predicate で一括 invalidate する。対象件数を返す
 * (0 なら invalidate せず no-op)。Backlog が当該 query を内部 API で再 fetch し、変化した
 * フィールドを自前で再 render する。
 */
export function revalidateIssueQueries(
	client: QueryClientLike,
	issue: IssueRef,
): number {
	const matches = (query: { queryKey: unknown }) =>
		queryKeyMatchesIssue(query.queryKey, issue);
	const count = client.getQueryCache().getAll().filter(matches).length;
	if (count > 0) client.invalidateQueries({ predicate: matches });
	return count;
}
