import { describe, expect, it, vi } from "vite-plus/test";
import {
	queryKeyMatchesIssue,
	revalidateIssueQueries,
} from "./revalidate-issue-queries";

// 実ページの queryKey 形状(Backlog 課題画面で確認したもの)を基にしたケース。
const issue = { issueKey: "PLAY_GROUND-47", issueId: 152881077 };

describe("queryKeyMatchesIssue", () => {
	it.each([
		["issueKey 持ち issues", ["issues", "PLAY_GROUND-47"]],
		["issueId 持ち issues", ["issues", 152881077]],
		["viewIssueParams(issueKey)", ["viewIssueParams", "PLAY_GROUND-47"]],
		[
			"GetInitialComments(object 内 issueId)",
			["GetInitialComments", { issueId: 152881077, limit: 20 }],
		],
		[
			"FormattedCustomFieldTextValue(object 内 issueId)",
			[
				"FormattedCustomFieldTextValue",
				{ projectId: 663394, issueId: 152881077 },
			],
		],
		["ContactList(末尾 issueId)", ["ContactList", "issue", 152881077]],
	])("%s は true", (_label, key) => {
		expect(queryKeyMatchesIssue(key, issue)).toBe(true);
	});

	it.each([
		["space", ["space"]],
		["messages", ["messages", "ja"]],
		["projectInfo(issueKey でなく projectKey)", ["projectInfo", "PLAY_GROUND"]],
		["issueFieldOptions2(projectId は非該当)", ["issueFieldOptions2", 663394]],
		["別 issueId", ["issues", 99999999]],
		["別 issueKey", ["issues", "PLAY_GROUND-1"]],
		["onboarding", ["onboarding", "/onboarding/admin/2?projectId=663394"]],
	])("%s は false", (_label, key) => {
		expect(queryKeyMatchesIssue(key, issue)).toBe(false);
	});
});

describe("revalidateIssueQueries", () => {
	it("当該課題を参照する query を predicate で一括 invalidate し件数を返す", () => {
		const invalidateQueries = vi.fn();
		const all = [
			{ queryKey: ["issues", "PLAY_GROUND-47"] },
			{ queryKey: ["issues", 152881077] },
			{ queryKey: ["GetInitialComments", { issueId: 152881077 }] },
			{ queryKey: ["space"] },
			{ queryKey: ["projectInfo", "PLAY_GROUND"] },
		];
		const client = {
			getQueryCache: () => ({ getAll: () => all }),
			invalidateQueries,
		};

		const count = revalidateIssueQueries(client, issue);

		expect(count).toBe(3);
		// N 回ではなく predicate 付き 1 call で TanStack に絞り込ませる。
		expect(invalidateQueries).toHaveBeenCalledTimes(1);
		const call = invalidateQueries.mock.calls.at(0);
		expect(call).toBeDefined();
		const predicate = call?.[0].predicate;
		expect(all.filter(predicate)).toEqual([
			{ queryKey: ["issues", "PLAY_GROUND-47"] },
			{ queryKey: ["issues", 152881077] },
			{ queryKey: ["GetInitialComments", { issueId: 152881077 }] },
		]);
	});

	it("該当無しなら invalidate せず 0 を返す", () => {
		const invalidateQueries = vi.fn();
		const client = {
			getQueryCache: () => ({
				getAll: () => [
					{ queryKey: ["space"] },
					{ queryKey: ["messages", "ja"] },
				],
			}),
			invalidateQueries,
		};
		expect(revalidateIssueQueries(client, issue)).toBe(0);
		expect(invalidateQueries).not.toHaveBeenCalled();
	});

	it("query cache が空なら 0 を返し invalidate しない", () => {
		const invalidateQueries = vi.fn();
		const client = {
			getQueryCache: () => ({ getAll: () => [] }),
			invalidateQueries,
		};
		expect(revalidateIssueQueries(client, issue)).toBe(0);
		expect(invalidateQueries).not.toHaveBeenCalled();
	});
});
