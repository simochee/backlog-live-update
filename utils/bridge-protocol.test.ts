import { describe, expect, it } from "vite-plus/test";
import {
	parseCommentMetaPatchList,
	parseIssueRef,
	parsePullRequestProbe,
	parseStarMapPatch,
	parseStateResponse,
} from "./bridge-protocol";

describe("parseStateResponse", () => {
	it("found:true の payload を読む", () => {
		const detail = JSON.stringify({
			found: true,
			issueId: 42,
			recentIds: [1, 2, 7],
		});
		expect(parseStateResponse(detail)).toEqual({
			found: true,
			issueId: 42,
			recentIds: [1, 2, 7],
		});
	});

	it("recentIds 無しでも読める(後方互換)", () => {
		const detail = JSON.stringify({ found: true, issueId: 42 });
		expect(parseStateResponse(detail)).toEqual({
			found: true,
			issueId: 42,
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
			{ commentId: "not number", notifications: [] },
			{
				commentId: 5,
				notifications: [
					{ id: 1, alreadyRead: true },
					{ id: "x", alreadyRead: true },
					{ id: 2 },
					"junk",
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
					{ id: "x", url: "u", userId: 2, userName: "A", userIcon: "ic" },
					{ id: 3, url: 7, userId: 2, userName: "A", userIcon: "ic" },
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

describe("bridge payload の部分的な不正", () => {
	it("不正な optional field だけを省き、有効な field と false を保持する", () => {
		const result = parseStateResponse(
			JSON.stringify({
				found: false,
				issueId: "bad",
				recentIds: null,
				extra: true,
			}),
		);
		expect(result).toStrictEqual({ found: false });
		expect(result).not.toHaveProperty("issueId");
		expect(result).not.toHaveProperty("recentIds");
	});

	it("不正な found は他の field が有効でも全体を found:false にする", () => {
		expect(
			parseStateResponse(JSON.stringify({ found: 1, issueId: 42 })),
		).toStrictEqual({ found: false });
	});

	it("非配列の star entry を省き、不正要素だけの配列は空で保持する", () => {
		expect(
			parseStarMapPatch(
				JSON.stringify({
					byCommentId: {
						"100": null,
						"200": [null, { id: 1 }],
						"300": [],
					},
				}),
			),
		).toStrictEqual({ byCommentId: { "200": [], "300": [] } });
	});

	it("star map の配列コンテナも数値キーの map として扱う", () => {
		expect(
			parseStarMapPatch(JSON.stringify({ byCommentId: [[], null] })),
		).toStrictEqual({ byCommentId: { "0": [] } });
	});

	it("通知がすべて不正でも comment patch を空通知で保持し、非配列の通知は patch ごと捨てる", () => {
		expect(
			parseCommentMetaPatchList(
				JSON.stringify([
					{
						commentId: 1,
						notifications: [null, {}, { id: 1, alreadyRead: 0 }],
					},
					{ commentId: 2, notifications: null },
				]),
			),
		).toStrictEqual([{ commentId: 1, notifications: [] }]);
	});

	it("許可した field 以外を patch と issue 参照に持ち込まない", () => {
		expect(
			parseIssueRef(
				JSON.stringify({ issueKey: "P-1", issueId: 1, extra: true }),
			),
		).toStrictEqual({ issueKey: "P-1", issueId: 1 });
		expect(
			parseCommentMetaPatchList(
				JSON.stringify([
					{
						commentId: 1,
						extra: true,
						notifications: [{ id: 2, alreadyRead: false, extra: true }],
					},
				]),
			),
		).toStrictEqual([
			{ commentId: 1, notifications: [{ id: 2, alreadyRead: false }] },
		]);
	});

	it("壊れた JSON の star patch は null", () => {
		expect(parseStarMapPatch("{bad")).toBeNull();
	});
});

it("数字だけの comment key を保持し、それ以外の key を捨てる", () => {
	const result = parseStarMapPatch(
		JSON.stringify({
			byCommentId: {
				"0": [],
				"001": [],
				"12": [],
				"-1": [],
				"1.5": [],
				"1e2": [],
				"": [],
				x: [],
			},
		}),
	);
	expect(Object.keys(result?.byCommentId ?? {}).sort()).toStrictEqual([
		"0",
		"001",
		"12",
	]);
});

it("予約語の comment key を除外し、出力と Object.prototype の prototype を汚染しない", () => {
	const objectPrototype = Object.getOwnPropertyDescriptors(Object.prototype);
	const result = parseStarMapPatch(
		'{"byCommentId":{"__proto__":[],"constructor":[],"prototype":[]}}',
	);
	const byCommentId = result?.byCommentId ?? {};
	for (const key of ["__proto__", "constructor", "prototype"]) {
		expect(Object.hasOwn(byCommentId, key)).toBe(false);
	}
	expect(Object.getPrototypeOf(byCommentId)).toBe(Object.prototype);
	expect(
		Object.entries(Object.getOwnPropertyDescriptors(Object.prototype)),
	).toStrictEqual(Object.entries(objectPrototype));
	expect(Object.getPrototypeOf(Object.prototype)).toBeNull();
});

describe("parsePullRequestProbe", () => {
	it("public API の取得結果を JSON 文字列から復元する", () => {
		const probe = {
			comments: [
				{
					id: 1,
					created: "2026-11-08T09:44:08Z",
					updated: "2026-11-08T09:44:08Z",
				},
			],
			complete: true,
		};
		expect(parsePullRequestProbe(JSON.stringify(probe))).toEqual(probe);
	});
	it("文字列でない detail や壊れた JSON や形の違う値は null にする", () => {
		expect(parsePullRequestProbe({ comments: [] })).toBeNull();
		expect(parsePullRequestProbe("{")).toBeNull();
		expect(
			parsePullRequestProbe(JSON.stringify({ comments: [{ id: "1" }] })),
		).toBeNull();
		expect(parsePullRequestProbe(undefined)).toBeNull();
	});
});
