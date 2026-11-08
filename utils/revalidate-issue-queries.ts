import type { IssueRef } from "./bridge-protocol";
import type { QueryClientLike } from "./react-fiber";

// ページの queryKey は issueKey と issueId が階層内に混在するため、先頭要素だけでは判定できない。
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
