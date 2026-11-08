import { describe, expect, it } from "vite-plus/test";
import { applyStarMapPatch } from "./apply-star-map-patch";
import type { CommentStarItem, CommentStarMap } from "./react-fiber";

function star(id: number, userId = 1, userName = "U"): CommentStarItem {
	return {
		id,
		url: "https://x/view/P-1#comment-100",
		userId,
		userName,
		userIcon: `NulabAccountIcon.action?userId=${userId}&name=large`,
		comment: null,
	};
}

describe("applyStarMapPatch", () => {
	it("差分 entry のみ更新、未対象 entry は維持", () => {
		const current: CommentStarMap = {
			"100": [star(1)],
			"200": [star(2)],
		};
		const { next, changed } = applyStarMapPatch(current, {
			byCommentId: {
				"100": [star(1), star(3, 2, "B")],
			},
		});
		expect(changed).toBe(true);
		expect(next["100"]).toHaveLength(2);
		// patch 対象外
		expect(next["200"]).toBe(current["200"]);
	});

	it("空 patch は changed=false", () => {
		const current: CommentStarMap = { "100": [star(1)] };
		const r = applyStarMapPatch(current, { byCommentId: {} });
		expect(r.changed).toBe(false);
		expect(r.next).toBe(current);
	});

	it("順序違いだけは差分なし(changed=false)", () => {
		const current: CommentStarMap = { "100": [star(1), star(2)] };
		const r = applyStarMapPatch(current, {
			byCommentId: { "100": [star(2), star(1)] },
		});
		expect(r.changed).toBe(false);
		expect(r.next).toBe(current);
	});

	it("全 unstar(patch 空配列)で差し替え", () => {
		const current: CommentStarMap = { "100": [star(1), star(2)] };
		const r = applyStarMapPatch(current, {
			byCommentId: { "100": [] },
		});
		expect(r.changed).toBe(true);
		expect(r.next["100"]).toEqual([]);
	});

	it("新規 commentId entry を追加", () => {
		const current: CommentStarMap = { "100": [star(1)] };
		const r = applyStarMapPatch(current, {
			byCommentId: { "200": [star(5, 7, "X")] },
		});
		expect(r.changed).toBe(true);
		expect(r.next["100"]).toBe(current["100"]);
		expect(r.next["200"]).toHaveLength(1);
	});

	it("同 id でも userName 等が変われば差分", () => {
		const current: CommentStarMap = { "100": [star(1, 1, "Old")] };
		const r = applyStarMapPatch(current, {
			byCommentId: { "100": [star(1, 1, "New")] },
		});
		expect(r.changed).toBe(true);
		expect(r.next["100"]?.at(0)).toBeDefined();
		expect(r.next["100"]?.at(0)?.userName).toBe("New");
	});
});

it("parse を経ない patch でも数字以外の key を無視して plain object を保つ", () => {
	const objectPrototype = Object.entries(
		Object.getOwnPropertyDescriptors(Object.prototype),
	);
	const current: CommentStarMap = { "100": [star(1)] };
	const patch = {
		byCommentId: Object.fromEntries([
			["__proto__", [star(2)]],
			["constructor", [star(2)]],
			["prototype", [star(2)]],
			["-1", [star(2)]],
			["1.5", [star(2)]],
			["x", [star(2)]],
			["200", [star(3)]],
		]),
	};
	const result = applyStarMapPatch(current, patch);
	expect(result.changed).toBe(true);
	expect(Object.keys(result.next)).toStrictEqual(["100", "200"]);
	expect(result.next["100"]).toBe(current["100"]);
	expect(result.next["200"]).toStrictEqual([star(3)]);
	expect(Object.getPrototypeOf(result.next)).toBe(Object.prototype);
	expect(
		Object.entries(Object.getOwnPropertyDescriptors(Object.prototype)),
	).toStrictEqual(objectPrototype);
});

it("数字以外の key だけの patch は state を変更しない", () => {
	const current: CommentStarMap = { "100": [star(1)] };
	const result = applyStarMapPatch(current, {
		byCommentId: Object.fromEntries([
			["__proto__", [star(2)]],
			["constructor", []],
		]),
	});
	expect(result).toStrictEqual({ next: current, changed: false });
	expect(result.next).toBe(current);
});
