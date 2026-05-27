import { describe, expect, it } from "vitest";
import { issueKeyFromPath } from "./backlog";

describe("issueKeyFromPath", () => {
	it("課題詳細 URL から issueKey を取り出す", () => {
		expect(issueKeyFromPath("/view/PROJ-123")).toBe("PROJ-123");
		expect(issueKeyFromPath("/view/PLAY_GROUND-47")).toBe("PLAY_GROUND-47");
	});

	it("末尾に余分があっても先頭の issueKey を取る", () => {
		expect(issueKeyFromPath("/view/PROJ-123/comment")).toBe("PROJ-123");
	});

	it.each([
		["課題以外のパス", "/dashboard"],
		["小文字 projectKey", "/view/proj-1"],
		["数字を欠く", "/view/PROJ"],
		["ルート", "/"],
	])("%s は undefined", (_label, path) => {
		expect(issueKeyFromPath(path)).toBeUndefined();
	});
});
