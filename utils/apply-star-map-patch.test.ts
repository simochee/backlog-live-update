import { describe, expect, it } from "vitest";
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
		expect(r.next["100"][0].userName).toBe("New");
	});
});
