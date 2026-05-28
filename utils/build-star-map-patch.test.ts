import { describe, expect, it } from "vitest";
import { buildStarMapPatch } from "./build-star-map-patch";

describe("buildStarMapPatch", () => {
	it("public API stars を fiber 形(presenter → userId/userName/userIcon)へ map する", () => {
		const patch = buildStarMapPatch(
			[
				{
					id: 100,
					stars: [
						{
							id: 1,
							url: "https://x/view/P-1#comment-100",
							presenter: { id: 42, name: "Alice" },
						},
					],
				},
			],
			new Set(["100"]),
		);
		expect(patch).toEqual({
			byCommentId: {
				"100": [
					{
						id: 1,
						url: "https://x/view/P-1#comment-100",
						userId: 42,
						userName: "Alice",
						userIcon: "NulabAccountIcon.action?userId=42&name=large",
					},
				],
			},
		});
	});

	it("targetIds に含まれない comment は patch に出さない", () => {
		const patch = buildStarMapPatch(
			[
				{ id: 1, stars: [] },
				{ id: 2, stars: [] },
			],
			new Set(["1"]),
		);
		expect(patch).toEqual({ byCommentId: { "1": [] } });
	});

	it("stars が null/undefined なら空配列で patch(全 unstar)", () => {
		const patch = buildStarMapPatch(
			[
				{ id: 1, stars: null },
				{ id: 2, stars: undefined },
			],
			new Set(["1", "2"]),
		);
		expect(patch).toEqual({ byCommentId: { "1": [], "2": [] } });
	});

	it("presenter が無い star は捨てる", () => {
		const patch = buildStarMapPatch(
			[
				{
					id: 100,
					stars: [
						{
							id: 1,
							url: "u",
							presenter: { id: 1, name: "ok" },
						},
						{ id: 2, url: "u", presenter: null },
						{ id: 3, url: "u", presenter: undefined },
					],
				},
			],
			new Set(["100"]),
		);
		expect(patch.byCommentId["100"]).toHaveLength(1);
		expect(patch.byCommentId["100"][0].id).toBe(1);
	});
});
