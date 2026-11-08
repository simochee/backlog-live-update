import { describe, expect, it } from "vite-plus/test";
import { buildCommentMetaPatches } from "./build-comment-meta-patches";

describe("buildCommentMetaPatches", () => {
	it("targetIds に含まれる comment のみ patch にする(値は resourceAlreadyRead から取る)", () => {
		const patches = buildCommentMetaPatches(
			[
				{ id: 1, notifications: [{ id: 10, resourceAlreadyRead: false }] },
				{ id: 2, notifications: [] },
				{ id: 3, notifications: [{ id: 30, resourceAlreadyRead: true }] }, // 画面に無い → 捨てる
			],
			new Set([1, 2]),
		);
		expect(patches).toEqual([
			{ commentId: 1, notifications: [{ id: 10, alreadyRead: false }] },
			{ commentId: 2, notifications: [] },
		]);
	});

	it("resourceAlreadyRead が true の通知は alreadyRead=true として patch に乗る", () => {
		const patches = buildCommentMetaPatches(
			[
				{
					id: 100,
					notifications: [
						{ id: 1, resourceAlreadyRead: true },
						{ id: 2, resourceAlreadyRead: false },
					],
				},
			],
			new Set([100]),
		);
		expect(patches).toEqual([
			{
				commentId: 100,
				notifications: [
					{ id: 1, alreadyRead: true },
					{ id: 2, alreadyRead: false },
				],
			},
		]);
	});

	it("notifications が null/undefined の comment は空配列扱い", () => {
		expect(
			buildCommentMetaPatches(
				[
					{ id: 1, notifications: null },
					{ id: 2, notifications: undefined },
				],
				new Set([1, 2]),
			),
		).toEqual([
			{ commentId: 1, notifications: [] },
			{ commentId: 2, notifications: [] },
		]);
	});

	it("targetIds が空なら空配列", () => {
		expect(
			buildCommentMetaPatches(
				[{ id: 1, notifications: [{ id: 10, resourceAlreadyRead: false }] }],
				new Set(),
			),
		).toEqual([]);
	});
});
