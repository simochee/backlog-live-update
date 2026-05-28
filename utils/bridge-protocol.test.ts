import { describe, expect, it } from "vitest";
import {
	parseCommentMetaPatchList,
	parseIssueRef,
	parseStarMapPatch,
	parseStateResponse,
} from "./bridge-protocol";

describe("parseStateResponse", () => {
	it("found:true の payload を読む", () => {
		const detail = JSON.stringify({
			found: true,
			issueId: 42,
			minId: 7,
			recentIds: [1, 2, 7],
		});
		expect(parseStateResponse(detail)).toEqual({
			found: true,
			issueId: 42,
			minId: 7,
			recentIds: [1, 2, 7],
		});
	});

	it("recentIds 無しでも読める(後方互換)", () => {
		const detail = JSON.stringify({ found: true, issueId: 42, minId: 7 });
		expect(parseStateResponse(detail)).toEqual({
			found: true,
			issueId: 42,
			minId: 7,
		});
	});

	it("recentIds に number 以外が混ざっていれば捨てる", () => {
		const detail = JSON.stringify({
			found: true,
			recentIds: [1, "x", 3],
		});
		expect(parseStateResponse(detail)).toEqual({ found: true });
	});

	it("found:false の payload を読む", () => {
		expect(parseStateResponse(JSON.stringify({ found: false }))).toEqual({
			found: false,
		});
	});

	it.each([
		["非 string", 123],
		["壊れた JSON", "{not json"],
		["object でない JSON", JSON.stringify("oops")],
		["found 欠損", JSON.stringify({ issueId: 1 })],
	])("%s は found:false へフォールバック", (_label, detail) => {
		expect(parseStateResponse(detail)).toEqual({ found: false });
	});
});

describe("parseCommentMetaPatchList", () => {
	it("正常 payload を復元する", () => {
		const detail = JSON.stringify([
			{
				commentId: 1,
				notifications: [{ id: 10, alreadyRead: true }],
			},
			{ commentId: 2, notifications: [] },
		]);
		expect(parseCommentMetaPatchList(detail)).toEqual([
			{ commentId: 1, notifications: [{ id: 10, alreadyRead: true }] },
			{ commentId: 2, notifications: [] },
		]);
	});

	it("壊れた要素は捨てて残りを返す", () => {
		const detail = JSON.stringify([
			{ commentId: "not number", notifications: [] }, // 捨てる
			{
				commentId: 5,
				notifications: [
					{ id: 1, alreadyRead: true }, // 残す
					{ id: "x", alreadyRead: true }, // 捨てる(id 不正)
					{ id: 2 }, // 捨てる(alreadyRead 欠損)
					"junk", // 捨てる(object でない)
				],
			},
		]);
		expect(parseCommentMetaPatchList(detail)).toEqual([
			{ commentId: 5, notifications: [{ id: 1, alreadyRead: true }] },
		]);
	});

	it.each([
		["非 string", 123],
		["壊れた JSON", "{bad"],
		["object でない JSON", JSON.stringify(5)],
		["配列でない", JSON.stringify({ commentId: 1 })],
	])("%s は空配列", (_label, detail) => {
		expect(parseCommentMetaPatchList(detail)).toEqual([]);
	});
});

describe("parseStarMapPatch", () => {
	it("正常 payload を復元する", () => {
		const detail = JSON.stringify({
			byCommentId: {
				"100": [
					{
						id: 1,
						url: "u",
						userId: 2,
						userName: "Alice",
						userIcon: "ic",
					},
				],
				"200": [],
			},
		});
		expect(parseStarMapPatch(detail)).toEqual({
			byCommentId: {
				"100": [
					{
						id: 1,
						url: "u",
						userId: 2,
						userName: "Alice",
						userIcon: "ic",
					},
				],
				"200": [],
			},
		});
	});

	it("不正 star item は捨てる(他は残す)", () => {
		const detail = JSON.stringify({
			byCommentId: {
				"100": [
					{ id: 1, url: "u", userId: 2, userName: "A", userIcon: "ic" },
					{ id: "x", url: "u", userId: 2, userName: "A", userIcon: "ic" }, // id 非 number
					{ id: 3, url: 7, userId: 2, userName: "A", userIcon: "ic" }, // url 非 string
					"junk",
				],
			},
		});
		const got = parseStarMapPatch(detail);
		expect(got?.byCommentId["100"]).toHaveLength(1);
	});

	it.each([
		["非 string", 123],
		["object でない", JSON.stringify("oops")],
		["byCommentId 欠損", JSON.stringify({})],
	])("%s は null", (_label, detail) => {
		expect(parseStarMapPatch(detail)).toBeNull();
	});
});

describe("parseIssueRef", () => {
	it("issueKey / issueId を読む", () => {
		const detail = JSON.stringify({ issueKey: "PROJ-1", issueId: 42 });
		expect(parseIssueRef(detail)).toEqual({ issueKey: "PROJ-1", issueId: 42 });
	});

	it.each([
		["非 string", 123],
		["壊れた JSON", "{bad"],
		["issueKey 欠損", JSON.stringify({ issueId: 42 })],
		["issueId 非 number", JSON.stringify({ issueKey: "P-1", issueId: "42" })],
		["object でない JSON", JSON.stringify(5)],
	])("%s は null", (_label, detail) => {
		expect(parseIssueRef(detail)).toBeNull();
	});
});
